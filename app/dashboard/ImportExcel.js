'use client';
import { useState } from 'react';
import { findHeaderRow, detectColumns, buildRows } from '@/lib/importSheet';

const s = {
  card: { background: '#fff', border: '0.5px solid #e1ded4', borderRadius: 12, padding: '18px 20px', marginBottom: 20 },
  title: { fontSize: 16, fontWeight: 600, margin: '0 0 4px' },
  sub: { color: '#8f8d84', fontSize: 12.5, margin: '0 0 14px' },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 },
  label: { fontSize: 12, color: '#8f8d84', display: 'block', marginBottom: 4 },
  field: { display: 'flex', flexDirection: 'column', minWidth: 140 },
  select: { fontSize: 13, padding: '7px 8px', borderRadius: 6, border: '0.5px solid #c9c5b8', background: '#fff', color: '#1f1e1b' },
  button: { background: '#1f1e1b', color: '#fff', border: 'none', cursor: 'pointer', padding: '8px 16px', fontWeight: 500, borderRadius: 6, fontSize: 13.5 },
  buttonSecondary: { background: '#fff', color: '#1f1e1b', border: '0.5px solid #c9c5b8', cursor: 'pointer', padding: '8px 16px', fontWeight: 500, borderRadius: 6, fontSize: 13.5 },
  disabled: { background: '#c9c5b8', color: '#fff', border: 'none', cursor: 'not-allowed', padding: '8px 16px', fontWeight: 500, borderRadius: 6, fontSize: 13.5 },
  err: { color: '#a32d2d', fontSize: 12.5, marginTop: 8 },
  ok: { background: '#eaf3de', border: '0.5px solid #cfe0b8', color: '#3b6d11', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginTop: 12 },
  warnBox: { background: '#fdf6e3', border: '0.5px solid #e8dcc0', color: '#8a6d1f', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, marginTop: 10 },
  tableWrap: { maxHeight: 320, overflow: 'auto', border: '0.5px solid #e1ded4', borderRadius: 8, marginTop: 12 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13 },
  th: { position: 'sticky', top: 0, background: '#faf9f6', textAlign: 'left', color: '#8f8d84', fontWeight: 500, fontSize: 11.5, padding: '7px 9px', borderBottom: '1px solid #e1ded4' },
  td: { padding: '7px 9px', borderBottom: '0.5px solid #efece4' },
  tdBad: { padding: '7px 9px', borderBottom: '0.5px solid #efece4', color: '#a32d2d' },
  counts: { fontSize: 12.5, color: '#6b6a63', marginTop: 10 },
  pill: (kind) => ({
    display: 'inline-block', padding: '1px 7px', borderRadius: 20, fontSize: 11, fontWeight: 500,
    background: kind === 'new' ? '#eaf3de' : kind === 'dup' ? '#f0eee7' : '#fcebeb',
    color: kind === 'new' ? '#3b6d11' : kind === 'dup' ? '#8f8d84' : '#a32d2d',
  }),
};

function fmt(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN');
}

const PREVIEW_LIMIT = 100;

export default function ImportExcel({ existingNames = [], onImported }) {
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState([]);        // [{ name, matrix }]
  const [sheetIdx, setSheetIdx] = useState(0);
  const [headerIdx, setHeaderIdx] = useState(0);
  const [mapping, setMapping] = useState({ name: -1, amount: -1, phone: -1 });
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  const taken = new Set(existingNames.map((n) => String(n).trim().toLowerCase()));

  function reset() {
    setSheets([]); setFileName(''); setResult(null); setError('');
    setMapping({ name: -1, amount: -1, phone: -1 }); setHeaderIdx(0); setSheetIdx(0);
  }

  async function onFile(e) {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // let the same file be picked again after a reset
    if (!file) return;
    setError(''); setResult(null); setBusy(true);
    try {
      const XLSX = await import('xlsx');
      const buf = await file.arrayBuffer();
      // raw:false renders dates and formatted numbers the way the sheet shows
      // them, which is what the amount parser is written against.
      const wb = XLSX.read(buf, { type: 'array', cellDates: true });
      const parsed = wb.SheetNames.map((name) => ({
        name,
        matrix: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, raw: false, defval: '' }),
      })).filter((sh) => sh.matrix.length > 0);

      if (parsed.length === 0) {
        setError('That file has no readable rows.');
        setBusy(false);
        return;
      }
      setFileName(file.name);
      setSheets(parsed);
      applySheet(parsed, 0);
    } catch (err) {
      setError('Could not read that file. It needs to be .xlsx, .xls or .csv.');
    } finally {
      setBusy(false);
    }
  }

  function applySheet(list, idx) {
    setSheetIdx(idx);
    const matrix = list[idx].matrix;
    const found = findHeaderRow(matrix);
    const hi = found.index >= 0 ? found.index : 0;
    setHeaderIdx(hi);
    setMapping(detectColumns(matrix[hi] || []));
  }

  const matrix = sheets.length ? sheets[sheetIdx].matrix : [];
  const headers = matrix[headerIdx] || [];
  const rows = sheets.length && mapping.name >= 0 ? buildRows(matrix, headerIdx, mapping) : [];

  const importable = rows.filter((r) => !r.error && !taken.has(r.name.toLowerCase()));
  const duplicates = rows.filter((r) => !r.error && taken.has(r.name.toLowerCase()));
  const bad = rows.filter((r) => r.error);
  const totalValue = importable.reduce((sum, r) => sum + r.amount, 0);

  function statusOf(r) {
    if (r.error) return { kind: 'bad', text: r.error };
    if (taken.has(r.name.toLowerCase())) return { kind: 'dup', text: 'Already in dashboard' };
    return { kind: 'new', text: 'Will import' };
  }

  async function runImport() {
    setBusy(true); setError(''); setResult(null);
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: importable.map((r) => ({ name: r.name, phone: r.phone, amount: r.amount })),
          as_of_date: asOf,
          due_date: dueDate || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || `Import failed (server returned ${res.status}).`);
        return;
      }
      setResult(data);
      setSheets([]); setFileName('');
      if (onImported) await onImported();
    } catch {
      setError('Could not reach the server. Nothing was imported.');
    } finally {
      setBusy(false);
    }
  }

  const colOptions = headers.map((h, i) => (
    <option key={i} value={i}>{String(h || '').trim() || `Column ${i + 1}`}</option>
  ));

  return (
    <div style={s.card}>
      <h2 style={s.title}>Import dealers from Excel</h2>
      <p style={s.sub}>
        A sheet of dealer names and their pending amounts. Each becomes a dealer with its
        balance recorded as an opening entry — you can add real purchases on top afterwards.
      </p>

      <div style={s.row}>
        <label style={s.buttonSecondary}>
          Choose file
          <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} style={{ display: 'none' }} />
        </label>
        {fileName && <span style={{ fontSize: 13, color: '#6b6a63' }}>{fileName}</span>}
        {sheets.length > 0 && (
          <button style={{ ...s.buttonSecondary, padding: '5px 10px', fontSize: 12 }} onClick={reset}>Clear</button>
        )}
      </div>

      {error && <div style={s.err}>{error}</div>}

      {result && (
        <div style={s.ok}>
          Imported {result.created} dealer{result.created === 1 ? '' : 's'}
          {result.openingEntries > 0 && ` with ${result.openingEntries} opening balance${result.openingEntries === 1 ? '' : 's'}`}
          {result.advances > 0 && `, ${result.advances} in credit`}.
          {result.skipped && result.skipped.length > 0 &&
            ` Skipped ${result.skipped.length} already in the dashboard: ${result.skipped.slice(0, 5).join(', ')}${result.skipped.length > 5 ? '…' : ''}.`}
        </div>
      )}

      {sheets.length > 0 && (
        <>
          <div style={s.row}>
            {sheets.length > 1 && (
              <div style={s.field}>
                <label style={s.label}>Sheet</label>
                <select style={s.select} value={sheetIdx} onChange={(e) => applySheet(sheets, Number(e.target.value))}>
                  {sheets.map((sh, i) => <option key={i} value={i}>{sh.name}</option>)}
                </select>
              </div>
            )}
            <div style={s.field}>
              <label style={s.label}>Header row</label>
              <select
                style={s.select}
                value={headerIdx}
                onChange={(e) => {
                  const hi = Number(e.target.value);
                  setHeaderIdx(hi);
                  setMapping(detectColumns(matrix[hi] || []));
                }}
              >
                {matrix.slice(0, 15).map((r, i) => (
                  <option key={i} value={i}>
                    Row {i + 1}: {r.slice(0, 3).map((c) => String(c || '').trim()).filter(Boolean).join(' | ').slice(0, 40) || '(empty)'}
                  </option>
                ))}
              </select>
            </div>
            <div style={s.field}>
              <label style={s.label}>Dealer name column</label>
              <select style={s.select} value={mapping.name} onChange={(e) => setMapping((m) => ({ ...m, name: Number(e.target.value) }))}>
                <option value={-1}>— pick a column —</option>
                {colOptions}
              </select>
            </div>
            <div style={s.field}>
              <label style={s.label}>Pending amount column</label>
              <select style={s.select} value={mapping.amount} onChange={(e) => setMapping((m) => ({ ...m, amount: Number(e.target.value) }))}>
                <option value={-1}>— none —</option>
                {colOptions}
              </select>
            </div>
            <div style={s.field}>
              <label style={s.label}>Phone column</label>
              <select style={s.select} value={mapping.phone} onChange={(e) => setMapping((m) => ({ ...m, phone: Number(e.target.value) }))}>
                <option value={-1}>— none —</option>
                {colOptions}
              </select>
            </div>
          </div>

          <div style={s.row}>
            <div style={s.field}>
              <label style={s.label}>Balances as of</label>
              <input type="date" style={s.select} value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </div>
            <div style={s.field}>
              <label style={s.label}>Payment due date (optional)</label>
              <input type="date" style={s.select} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div style={{ fontSize: 11.5, color: '#8f8d84', marginTop: -4 }}>
            Without a due date these balances never appear in payment reminders.
          </div>

          {mapping.name < 0 && (
            <div style={s.warnBox}>Pick the column holding dealer names to see a preview.</div>
          )}

          {mapping.name >= 0 && mapping.phone < 0 && (
            <div style={s.warnBox}>
              No phone column mapped. Imported dealers will have no number, so you can&apos;t send them
              WhatsApp reminders until you add one.
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div style={s.tableWrap}>
                <table style={s.table}>
                  <thead>
                    <tr>
                      <th style={s.th}>Row</th><th style={s.th}>Dealer</th>
                      <th style={s.th}>Phone</th><th style={s.th}>Pending</th><th style={s.th}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, PREVIEW_LIMIT).map((r) => {
                      const st = statusOf(r);
                      return (
                        <tr key={r.sheetRow}>
                          <td style={s.td}>{r.sheetRow}</td>
                          <td style={st.kind === 'bad' ? s.tdBad : s.td}>{r.name || <em>(blank)</em>}</td>
                          <td style={s.td}>{r.phone || '—'}</td>
                          <td style={s.td}>{r.amount ? fmt(r.amount) : '—'}</td>
                          <td style={s.td}><span style={s.pill(st.kind)}>{st.text}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {rows.length > PREVIEW_LIMIT && (
                <div style={s.counts}>Showing the first {PREVIEW_LIMIT} of {rows.length} rows. All of them import.</div>
              )}

              <div style={s.counts}>
                <strong>{importable.length}</strong> to import ({fmt(totalValue)} total)
                {duplicates.length > 0 && ` · ${duplicates.length} already in the dashboard, skipped`}
                {bad.length > 0 && ` · ${bad.length} skipped with problems`}
              </div>

              <div style={{ ...s.row, marginTop: 12, marginBottom: 0 }}>
                <button
                  style={busy || importable.length === 0 ? s.disabled : s.button}
                  disabled={busy || importable.length === 0}
                  onClick={runImport}
                >
                  {busy ? 'Importing…' : `Import ${importable.length} dealer${importable.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
