'use client';
import { useEffect, useRef, useState } from 'react';

const s = {
  panel: { background: '#fff', border: '0.5px solid #e1ded4', borderRadius: 12, padding: '18px 20px', marginBottom: 20 },
  head: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' },
  title: { fontSize: 16, fontWeight: 600, margin: '0 0 3px' },
  sub: { color: '#8f8d84', fontSize: 12.5, margin: 0 },
  button: { background: '#1f1e1b', color: '#fff', border: 'none', cursor: 'pointer', padding: '8px 16px', fontWeight: 500, borderRadius: 6, fontSize: 13.5 },
  buttonSecondary: { background: '#fff', color: '#1f1e1b', border: '0.5px solid #c9c5b8', cursor: 'pointer', padding: '8px 16px', fontWeight: 500, borderRadius: 6, fontSize: 13.5 },
  disabled: { background: '#c9c5b8', color: '#fff', border: 'none', cursor: 'not-allowed', padding: '8px 16px', fontWeight: 500, borderRadius: 6, fontSize: 13.5 },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  field: { display: 'flex', flexDirection: 'column' },
  label: { fontSize: 12, color: '#8f8d84', marginBottom: 4 },
  input: { fontSize: 13, padding: '7px 9px', borderRadius: 6, border: '0.5px solid #c9c5b8', background: '#fff', color: '#1f1e1b' },
  err: { background: '#fcebeb', border: '0.5px solid #e6bcbc', color: '#a32d2d', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginTop: 12 },
  ok: { background: '#eaf3de', border: '0.5px solid #cfe0b8', color: '#3b6d11', borderRadius: 8, padding: '10px 12px', fontSize: 13, marginTop: 12 },
  warn: { background: '#fdf6e3', border: '0.5px solid #e8dcc0', color: '#8a6d1f', borderRadius: 8, padding: '9px 12px', fontSize: 12.5, marginTop: 10 },
  counts: { display: 'flex', gap: 18, flexWrap: 'wrap', margin: '14px 0 4px' },
  count: { fontSize: 12.5, color: '#6b6a63' },
  countNum: { fontSize: 19, fontWeight: 600, color: '#1f1e1b', display: 'block' },
  sheetBlock: { border: '0.5px solid #e1ded4', borderRadius: 8, marginTop: 12, overflow: 'hidden' },
  sheetHead: { background: '#faf9f6', padding: '8px 11px', borderBottom: '0.5px solid #e1ded4', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' },
  sheetName: { fontSize: 13, fontWeight: 600 },
  kindTag: { fontSize: 11, fontWeight: 500, padding: '1px 7px', borderRadius: 20, background: '#eef0e8', color: '#5d6b47', textTransform: 'capitalize' },
  tableWrap: { maxHeight: 260, overflow: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 12.5 },
  th: { position: 'sticky', top: 0, background: '#fff', textAlign: 'left', color: '#8f8d84', fontWeight: 500, fontSize: 11, padding: '6px 9px', borderBottom: '1px solid #e1ded4', whiteSpace: 'nowrap' },
  td: { padding: '6px 9px', borderBottom: '0.5px solid #efece4', whiteSpace: 'nowrap' },
  tdSkip: { padding: '6px 9px', borderBottom: '0.5px solid #efece4', color: '#a32d2d', whiteSpace: 'nowrap' },
  pillOk: { display: 'inline-block', padding: '1px 7px', borderRadius: 20, fontSize: 11, background: '#eaf3de', color: '#3b6d11' },
  pillSkip: { display: 'inline-block', padding: '1px 7px', borderRadius: 20, fontSize: 11, background: '#fcebeb', color: '#a32d2d' },
  more: { fontSize: 11.5, color: '#8f8d84', padding: '7px 9px' },
};

function fmt(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN');
}

function post(file, mode, asOf, due) {
  const fd = new FormData();
  fd.append('file', file);
  fd.append('mode', mode);
  fd.append('as_of_date', asOf);
  if (due) fd.append('due_date', due);
  return fetch('/api/import', { method: 'POST', body: fd });
}

// Renders the columns that matter for whichever kind of sheet this is.
function SheetTable({ sheet }) {
  const rows = sheet.preview || [];
  if (!rows.length) return <div style={s.more}>No rows on this sheet.</div>;

  const cols = sheet.kind === 'purchases'
    ? [['Row', 'sheetRow'], ['Dealer', 'name'], ['Product', 'product'], ['Qty', 'qty'], ['Rate', 'rate'], ['Date', 'date'], ['Due', 'due_date']]
    : sheet.kind === 'payments'
      ? [['Row', 'sheetRow'], ['Dealer', 'name'], ['Amount', 'amount'], ['Date', 'date'], ['Note', 'note']]
      : [['Row', 'sheetRow'], ['Dealer', 'name'], ['Phone', 'phone'], ['Pending', 'amount']];

  const money = new Set(['rate', 'amount']);

  return (
    <>
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              {cols.map(([label]) => <th key={label} style={s.th}>{label}</th>)}
              <th style={s.th}>Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.sheetRow}>
                {cols.map(([label, k]) => (
                  <td key={label} style={r.skip ? s.tdSkip : s.td}>
                    {r[k] == null || r[k] === '' ? '—' : money.has(k) ? fmt(r[k]) : String(r[k])}
                  </td>
                ))}
                <td style={s.td}>
                  <span style={r.skip ? s.pillSkip : s.pillOk}>{r.skip || 'Will import'}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sheet.total > rows.length && (
        <div style={s.more}>Showing the first {rows.length} of {sheet.total} rows. All of them import.</div>
      )}
    </>
  );
}

// `file` is owned by the dashboard, so the trigger button can sit in the top bar
// next to Export while this panel renders in the page body.
export default function ImportExcel({ file, onClose, onBusy, onImported }) {
  const [preview, setPreview] = useState(null);
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState('');      // '', 'parsing', 'importing'
  const [error, setError] = useState('');
  const [done, setDone] = useState(null);
  const seenFile = useRef(null);

  function setStage(stage) {
    setBusy(stage);
    if (onBusy) onBusy(stage === 'parsing');
  }

  function reset() {
    seenFile.current = null;
    setPreview(null); setError(''); setDone(null); setStage('');
    if (onClose) onClose();
  }

  // Parse whenever the dashboard hands us a new file.
  useEffect(() => {
    if (!file || seenFile.current === file) return;
    seenFile.current = file;
    let cancelled = false;
    (async () => {
      setError(''); setDone(null); setPreview(null); setStage('parsing');
      try {
        const res = await post(file, 'preview', asOf, dueDate);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) setError(data.error || `Could not read that file (server returned ${res.status}).`);
        else setPreview(data);
      } catch {
        if (!cancelled) setError('Could not reach the server.');
      } finally {
        if (!cancelled) setStage('');
      }
    })();
    return () => { cancelled = true; };
    // asOf/dueDate are read at call time; changing them re-previews via reparse().
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // The dates are applied server-side at parse time, so re-preview when they change.
  async function reparse(nextAsOf, nextDue) {
    if (!file) return;
    setStage('parsing');
    try {
      const res = await post(file, 'preview', nextAsOf, nextDue);
      const data = await res.json().catch(() => ({}));
      if (res.ok) setPreview(data);
    } catch {
      setError('Could not reach the server.');
    } finally {
      setStage('');
    }
  }

  async function confirmImport() {
    if (!file) return;
    setStage('importing'); setError('');
    try {
      const res = await post(file, 'commit', asOf, dueDate);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setError(data.error || `Import failed (server returned ${res.status}).`); return; }
      setDone(data.created);
      setPreview(null);
      seenFile.current = null;
      if (onClose) onClose();
      if (onImported) await onImported();
    } catch {
      setError('Could not reach the server. Nothing was imported.');
    } finally {
      setStage('');
    }
  }

  const totals = preview
    ? {
      dealers: preview.dealers.toCreate,
      matched: preview.dealers.existing,
      purchases: preview.purchases,
      payments: preview.payments,
      opening: preview.openingBalances,
      skipped: preview.skipped.length,
    }
    : null;
  const nothingToDo = totals && totals.purchases + totals.payments + totals.opening + totals.dealers === 0;

  return (
    <>
      {busy === 'parsing' && !preview && (
        <div style={s.panel}><div style={s.sub}>Reading the file…</div></div>
      )}

      {done && (
        <div style={s.panel}>
          <div style={s.ok}>
            Imported {done.dealers} new dealer{done.dealers === 1 ? '' : 's'}
            {done.matchedDealers > 0 && ` (${done.matchedDealers} matched an existing dealer)`}
            {done.purchases > 0 && `, ${done.purchases} purchase${done.purchases === 1 ? '' : 's'}`}
            {done.payments > 0 && `, ${done.payments} payment${done.payments === 1 ? '' : 's'}`}
            {done.phonesFilled > 0 && `, filled in ${done.phonesFilled} missing phone number${done.phonesFilled === 1 ? '' : 's'}`}.
          </div>
          <div style={{ marginTop: 10 }}>
            <button style={s.buttonSecondary} onClick={reset}>Done</button>
          </div>
        </div>
      )}

      {error && !preview && (
        <div style={s.panel}>
          <div style={s.err}>{error}</div>
          <div style={{ marginTop: 10 }}>
            <button style={s.buttonSecondary} onClick={reset}>Close</button>
          </div>
        </div>
      )}

      {preview && (
        <div style={s.panel}>
          <div style={s.head}>
            <div>
              <h2 style={s.title}>Review before importing</h2>
              <p style={s.sub}>{file ? file.name : ''} — nothing has been written yet.</p>
            </div>
            <button style={s.buttonSecondary} onClick={reset}>Cancel</button>
          </div>

          <div style={s.counts}>
            <div style={s.count}><span style={s.countNum}>{totals.dealers}</span>new dealers</div>
            {totals.matched > 0 && <div style={s.count}><span style={s.countNum}>{totals.matched}</span>existing matched</div>}
            {totals.purchases > 0 && <div style={s.count}><span style={s.countNum}>{totals.purchases}</span>purchases</div>}
            {totals.payments > 0 && <div style={s.count}><span style={s.countNum}>{totals.payments}</span>payments</div>}
            {totals.opening > 0 && <div style={s.count}><span style={s.countNum}>{totals.opening}</span>opening balances</div>}
            {totals.skipped > 0 && <div style={s.count}><span style={{ ...s.countNum, color: '#a32d2d' }}>{totals.skipped}</span>rows skipped</div>}
          </div>

          <div style={{ ...s.row, marginTop: 12 }}>
            <div style={s.field}>
              <label style={s.label}>Date for rows with none</label>
              <input
                type="date" style={s.input} value={asOf}
                onChange={(e) => { setAsOf(e.target.value); reparse(e.target.value, dueDate); }}
              />
            </div>
            <div style={s.field}>
              <label style={s.label}>Default payment due date (optional)</label>
              <input
                type="date" style={s.input} value={dueDate}
                onChange={(e) => { setDueDate(e.target.value); reparse(asOf, e.target.value); }}
              />
            </div>
          </div>

          {preview.sheets.some((sh) => sh.balancesIgnored) && (
            <div style={s.warn}>
              This file has both a summary sheet and transaction sheets. The summary&apos;s balances are
              ignored so they aren&apos;t counted twice — the dealer names and phone numbers on it are still used.
            </div>
          )}
          {totals.skipped > 0 && (
            <div style={s.warn}>
              {totals.skipped} row{totals.skipped === 1 ? '' : 's'} will be skipped. Each is marked below with the reason.
            </div>
          )}

          {preview.sheets.map((sh) => (
            <div key={sh.sheet} style={s.sheetBlock}>
              <div style={s.sheetHead}>
                <div>
                  <span style={s.sheetName}>{sh.sheet}</span>{' '}
                  <span style={s.kindTag}>{sh.kind === 'unknown' ? 'not recognised' : sh.kind}</span>
                </div>
                <span style={{ fontSize: 11.5, color: '#8f8d84' }}>
                  {sh.reason
                    ? sh.reason
                    : `${sh.ready} of ${sh.total} rows ready${sh.headerRow ? ` · header on row ${sh.headerRow}` : ''}`}
                </span>
              </div>
              {sh.kind !== 'unknown' && <SheetTable sheet={sh} />}
            </div>
          ))}

          {error && <div style={s.err}>{error}</div>}

          <div style={{ ...s.row, marginTop: 14 }}>
            <button
              style={busy || nothingToDo ? s.disabled : s.button}
              disabled={!!busy || nothingToDo}
              onClick={confirmImport}
            >
              {busy === 'importing' ? 'Importing…' : nothingToDo ? 'Nothing to import' : 'Confirm import'}
            </button>
            <button style={s.buttonSecondary} onClick={reset} disabled={!!busy}>Cancel</button>
          </div>
        </div>
      )}
    </>
  );
}
