'use client';
import { useEffect, useRef, useState } from 'react';
import ImportExcel from './ImportExcel';

const styles = {
  wrap: { maxWidth: 1000, margin: '0 auto', padding: '24px 16px 64px' },
  topBar: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  h1: { fontSize: 22, fontWeight: 600, margin: 0 },
  sub: { color: '#6b6a63', fontSize: 14, margin: '0 0 24px' },
  metrics: { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 },
  metric: { background: '#fff', border: '0.5px solid #e1ded4', borderRadius: 12, padding: 16 },
  metricLabel: { fontSize: 12, color: '#8f8d84', marginBottom: 6 },
  metricValue: { fontSize: 22, fontWeight: 600 },
  card: { background: '#fff', border: '0.5px solid #e1ded4', borderRadius: 12, padding: '18px 20px', marginBottom: 20 },
  cardTitle: { fontSize: 16, fontWeight: 600, margin: '0 0 14px' },
  row: { display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 },
  input: { flex: 1, minWidth: 110, fontSize: 13.5, padding: '8px 10px', borderRadius: 6, border: '0.5px solid #c9c5b8', background: '#fff' },
  button: { background: '#1f1e1b', color: '#fff', border: 'none', cursor: 'pointer', padding: '8px 16px', fontWeight: 500, borderRadius: 6, fontSize: 13.5 },
  buttonSecondary: { background: '#fff', color: '#1f1e1b', border: '0.5px solid #c9c5b8', cursor: 'pointer', padding: '8px 16px', fontWeight: 500, borderRadius: 6, fontSize: 13.5 },
  buttonSmall: { padding: '5px 10px', fontSize: 12 },
  err: { color: '#a32d2d', fontSize: 12, marginTop: -4, marginBottom: 6 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: 13.5 },
  th: { textAlign: 'left', color: '#8f8d84', fontWeight: 500, fontSize: 12, padding: '6px 8px', borderBottom: '1px solid #e1ded4' },
  td: { padding: 8, borderBottom: '0.5px solid #e1ded4', verticalAlign: 'top' },
  pill: (pending) => ({
    display: 'inline-block', padding: '2px 8px', borderRadius: 20, fontSize: 11.5, fontWeight: 500,
    background: pending ? '#fcebeb' : '#eaf3de', color: pending ? '#a32d2d' : '#3b6d11',
  }),
  dealerHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' },
  dealerName: { fontWeight: 600, fontSize: 15 },
  sectionTitle: { fontSize: 12, color: '#8f8d84', margin: '10px 0 6px', textTransform: 'uppercase', letterSpacing: '0.03em' },
  empty: { color: '#8f8d84', fontSize: 13, padding: '16px 0', textAlign: 'center' },
  reminderGroup: { marginBottom: 18 },
  reminderGroupTitle: (color) => ({ fontSize: 13, fontWeight: 600, color, margin: '0 0 8px', display: 'flex', alignItems: 'center', gap: 6 }),
  reminderRow: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', border: '0.5px solid #e1ded4', borderRadius: 8, marginBottom: 8, background: '#fafaf7' },
  reminderName: { fontWeight: 600, fontSize: 14 },
  reminderMeta: { color: '#8f8d84', fontSize: 12, marginTop: 2 },
  waButton: { background: '#25D366', color: '#fff', border: 'none', cursor: 'pointer', padding: '7px 14px', fontWeight: 500, borderRadius: 6, fontSize: 12.5, display: 'flex', alignItems: 'center', gap: 6 },
  waButtonDisabled: { background: '#c9c5b8', color: '#fff', cursor: 'not-allowed', padding: '7px 14px', fontWeight: 500, borderRadius: 6, fontSize: 12.5, border: 'none' },
  sortTh: { textAlign: 'left', color: '#8f8d84', fontWeight: 500, fontSize: 12, padding: '6px 8px', borderBottom: '1px solid #e1ded4', cursor: 'pointer', userSelect: 'none' },
  banner: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', background: '#fcebeb', border: '0.5px solid #e6bcbc', color: '#a32d2d', borderRadius: 10, padding: '10px 14px', fontSize: 13.5, marginBottom: 16 },
};

function fmt(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN');
}

// Some failures stall rather than reject — a sleeping database, a phone that
// wandered off the wifi. Without a deadline the request never settles and the
// screen sits on "Loading…" forever.
function withDeadline(ms) {
  if (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) return AbortSignal.timeout(ms);
  const c = new AbortController();
  setTimeout(() => c.abort(), ms);
  return c.signal;
}

function isTimeout(e) {
  return e && (e.name === 'TimeoutError' || e.name === 'AbortError');
}

function totals(d) {
  const purchased = (d.purchases || []).reduce((s, p) => s + p.qty * p.rate, 0);
  const paid = (d.payments || []).reduce((s, p) => s + p.amount, 0);
  return { purchased, paid, pending: purchased - paid };
}

function daysBetween(dateStr) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = new Date(dateStr); due.setHours(0, 0, 0, 0);
  return Math.round((due - today) / (1000 * 60 * 60 * 24));
}

// Payments aren't tied to individual purchases, so settle them oldest-bill-first
// and report the earliest due date among the bills the payments don't cover.
// Using the earliest due date outright would age the balance against a bill the
// dealer already cleared, and that number goes into the WhatsApp reminder.
function nextDueDate(d) {
  const bills = [...(d.purchases || [])].sort(
    (a, b) => (a.date || '').localeCompare(b.date || '') || (a.created_at || '').localeCompare(b.created_at || '')
  );
  let credit = (d.payments || []).reduce((s, p) => s + p.amount, 0);
  const unsettled = [];
  for (const b of bills) {
    const amount = b.qty * b.rate;
    if (credit >= amount) {
      credit -= amount; // this bill is fully paid off
      continue;
    }
    credit = 0; // partially paid at most; the rest of the bills are open
    if (b.due_date) unsettled.push(b.due_date);
  }
  return unsettled.length ? unsettled.sort()[0] : null;
}

function reminderStatus(d) {
  const t = totals(d);
  if (t.pending <= 0) return null;
  const due = nextDueDate(d);
  if (!due) return null;
  const days = daysBetween(due);
  if (days < 0) return { bucket: 'overdue', days: Math.abs(days), due, pending: t.pending };
  if (days <= 7) return { bucket: 'week', days, due, pending: t.pending };
  return { bucket: 'upcoming', days, due, pending: t.pending };
}

function waMessage(dealer, status) {
  const amt = fmt(status.pending);
  let timing;
  if (status.bucket === 'overdue') timing = `was due ${status.days} day${status.days === 1 ? '' : 's'} ago (${status.due})`;
  else if (status.bucket === 'week') timing = status.days === 0 ? 'is due today' : `is due in ${status.days} day${status.days === 1 ? '' : 's'} (${status.due})`;
  else timing = `is due on ${status.due}`;
  return `Hi ${dealer.name}, this is a reminder from BM Tiles that a payment of ${amt} ${timing}. Please arrange payment at your earliest convenience. Thank you!`;
}

function waLink(dealer, status) {
  const phone = (dealer.phone || '').replace(/[^0-9]/g, '');
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(waMessage(dealer, status))}`;
}

export default function Dashboard() {
  const [dealers, setDealers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openIds, setOpenIds] = useState({});
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [dealerErr, setDealerErr] = useState('');
  const [formState, setFormState] = useState({}); // per-dealer purchase/payment form inputs
  const [errs, setErrs] = useState({});
  const [sortKey, setSortKey] = useState('pending');
  const [sortDir, setSortDir] = useState('desc');
  const [error, setError] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [importBusy, setImportBusy] = useState(false);
  const importInputRef = useRef(null);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/dealers', { signal: withDeadline(20000) });
      if (!res.ok) throw new Error('Server returned ' + res.status);
      const data = await res.json();
      setDealers(data.dealers || []);
      setError('');
    } catch (e) {
      setError(isTimeout(e)
        ? 'The server took too long to respond. Tap Retry.'
        : 'Could not load dealers. Check your connection and tap Retry.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  // Mutations used to fail silently — the screen just wouldn't change. Returns
  // false so callers can keep the form filled in instead of wiping the input.
  async function send(url, options) {
    try {
      const res = await fetch(url, { ...options, signal: withDeadline(20000) });
      if (res.ok) {
        setError('');
        return true;
      }
      const body = await res.json().catch(() => ({}));
      setError(body.error || 'That did not save (server returned ' + res.status + ').');
      return false;
    } catch (e) {
      setError(isTimeout(e)
        ? 'The server took too long to respond — nothing was saved. Try again.'
        : 'Could not reach the server. Check your connection and try again.');
      return false;
    }
  }

  async function addDealer() {
    const name = newName.trim();
    if (!name) {
      setDealerErr('Enter a dealer name.');
      return;
    }
    setDealerErr('');
    const ok = await send('/api/dealers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone: newPhone.trim() }),
    });
    if (!ok) return;
    setNewName(''); setNewPhone('');
    await load();
  }

  // Deleting a dealer cascades every purchase and payment, with no undo, so make
  // the person type the name rather than accepting a stray tap.
  async function removeDealer(d) {
    const t = totals(d);
    const entries = (d.purchases || []).length + (d.payments || []).length;
    const typed = window.prompt(
      'Delete ' + d.name + ' and all ' + entries + ' ' + (entries === 1 ? 'entry' : 'entries') +
      ' (' + fmt(t.purchased) + ' billed, ' + fmt(t.paid) + ' collected)?\n' +
      'This cannot be undone.\n\nType the dealer name to confirm:'
    );
    if (typed === null) return;
    if (typed.trim().toLowerCase() !== d.name.trim().toLowerCase()) {
      setError('That name did not match — ' + d.name + ' was not deleted.');
      return;
    }
    if (!(await send('/api/dealers/' + d.id, { method: 'DELETE' }))) return;
    await load();
  }

  function setField(dealerId, key, value) {
    setFormState((s) => ({ ...s, [dealerId]: { ...s[dealerId], [key]: value } }));
  }

  async function addPurchase(dealerId) {
    const f = formState[dealerId] || {};
    const qty = Number(f.qty);
    const rate = Number(f.rate);
    const product = (f.product || '').trim();
    if (!product || !qty || qty <= 0 || isNaN(rate) || rate < 0) {
      setErrs((e) => ({ ...e, [dealerId + '-p']: 'Enter product, quantity and rate.' }));
      return;
    }
    setErrs((e) => ({ ...e, [dealerId + '-p']: '' }));
    const ok = await send('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealer_id: dealerId, product, qty, rate, date: f.pdate, due_date: f.duedate }),
    });
    if (!ok) return; // keep what they typed so it isn't lost
    setFormState((s) => ({ ...s, [dealerId]: { ...s[dealerId], product: '', qty: '', rate: '', pdate: '', duedate: '' } }));
    await load();
    setOpenIds((o) => ({ ...o, [dealerId]: true }));
  }

  async function removePurchase(p) {
    if (!window.confirm('Remove ' + p.product + ' (' + fmt(p.qty * p.rate) + ')? This cannot be undone.')) return;
    if (!(await send('/api/purchases/' + p.id, { method: 'DELETE' }))) return;
    await load();
  }

  async function addPayment(dealerId) {
    const f = formState[dealerId] || {};
    const amount = Number(f.amount);
    if (isNaN(amount) || amount <= 0) {
      setErrs((e) => ({ ...e, [dealerId + '-pay']: 'Enter a valid amount.' }));
      return;
    }
    setErrs((e) => ({ ...e, [dealerId + '-pay']: '' }));
    const ok = await send('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealer_id: dealerId, amount, date: f.paydate, note: f.note }),
    });
    if (!ok) return; // keep what they typed so it isn't lost
    setFormState((s) => ({ ...s, [dealerId]: { ...s[dealerId], amount: '', paydate: '', note: '' } }));
    await load();
    setOpenIds((o) => ({ ...o, [dealerId]: true }));
  }

  async function removePayment(p) {
    if (!window.confirm('Remove the ' + fmt(p.amount) + ' payment dated ' + p.date + '? This cannot be undone.')) return;
    if (!(await send('/api/payments/' + p.id, { method: 'DELETE' }))) return;
    await load();
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' }).catch(() => {});
    window.location.href = '/login';
  }

  function toggleSort(key) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  }

  async function exportToExcel() {
    const XLSX = await import('xlsx');

    const summaryRows = dealers.map((d) => {
      const t = totals(d);
      return {
        'Dealer': d.name,
        'Phone': d.phone || '',
        'Total Billed': t.purchased,
        'Total Paid': t.paid,
        'Pending': t.pending,
      };
    });

    const purchaseRows = [];
    dealers.forEach((d) => {
      (d.purchases || []).forEach((p) => {
        purchaseRows.push({
          'Dealer': d.name,
          'Product': p.product,
          'Qty': p.qty,
          'Rate': p.rate,
          'Amount': p.qty * p.rate,
          'Purchase Date': p.date,
          'Due Date': p.due_date || '',
        });
      });
    });

    const paymentRows = [];
    dealers.forEach((d) => {
      (d.payments || []).forEach((p) => {
        paymentRows.push({
          'Dealer': d.name,
          'Amount': p.amount,
          'Date': p.date,
          'Note': p.note || '',
        });
      });
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(summaryRows), 'Dealers Summary');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(purchaseRows), 'Purchases');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(paymentRows), 'Payments');

    const dateStr = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `bm-tiles-dealer-data-${dateStr}.xlsx`);
  }

  const metricTotals = dealers.reduce((acc, d) => {
    const t = totals(d);
    acc.purchased += t.purchased; acc.paid += t.paid; acc.pending += t.pending;
    return acc;
  }, { purchased: 0, paid: 0, pending: 0 });

  return (
    <div style={styles.wrap}>
      <div style={styles.topBar}>
        <h1 style={styles.h1}>BM Tiles — dealer dashboard</h1>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={styles.buttonSecondary} onClick={exportToExcel} disabled={loading || dealers.length === 0}>
            Export to Excel
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={(e) => {
              const f = e.target.files && e.target.files[0];
              e.target.value = ''; // let the same file be picked again
              if (f) setImportFile(f);
            }}
          />
          <button
            style={styles.buttonSecondary}
            onClick={() => importInputRef.current && importInputRef.current.click()}
            disabled={importBusy}
          >
            {importBusy ? 'Reading…' : 'Import from Excel'}
          </button>
          <button style={styles.buttonSecondary} onClick={logout}>Log out</button>
        </div>
      </div>
      <p style={styles.sub}>Track dealer purchases and pending payments in one place.</p>

      {error && (
        <div style={styles.banner}>
          <span>{error}</span>
          <button style={{ ...styles.buttonSecondary, ...styles.buttonSmall }} onClick={load}>Retry</button>
        </div>
      )}

      <div style={styles.metrics}>
        <div style={styles.metric}><div style={styles.metricLabel}>Total dealers</div><div style={styles.metricValue}>{dealers.length}</div></div>
        <div style={styles.metric}><div style={styles.metricLabel}>Total billed</div><div style={styles.metricValue}>{fmt(metricTotals.purchased)}</div></div>
        <div style={styles.metric}><div style={{ ...styles.metricLabel }}>Total collected</div><div style={{ ...styles.metricValue, color: '#3b6d11' }}>{fmt(metricTotals.paid)}</div></div>
        <div style={styles.metric}><div style={styles.metricLabel}>Total pending</div><div style={{ ...styles.metricValue, color: '#a32d2d' }}>{fmt(metricTotals.pending)}</div></div>
      </div>

      <div style={styles.card}>
        <h2 style={styles.cardTitle}>Add dealer</h2>
        <div style={styles.row}>
          <input style={styles.input} placeholder="Dealer / shop name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input style={styles.input} placeholder="Phone (optional)" value={newPhone} onChange={(e) => setNewPhone(e.target.value)} />
          <button style={styles.button} onClick={addDealer}>Add dealer</button>
        </div>
        {dealerErr && <div style={styles.err}>{dealerErr}</div>}
      </div>

      <ImportExcel
        file={importFile}
        onBusy={setImportBusy}
        onClose={() => setImportFile(null)}
        onImported={load}
      />

      {(() => {
        const withStatus = dealers
          .map((d) => ({ dealer: d, status: reminderStatus(d) }))
          .filter((x) => x.status);
        const overdue = withStatus.filter((x) => x.status.bucket === 'overdue').sort((a, b) => b.status.days - a.status.days);
        const week = withStatus.filter((x) => x.status.bucket === 'week').sort((a, b) => a.status.days - b.status.days);
        const upcoming = withStatus.filter((x) => x.status.bucket === 'upcoming').sort((a, b) => a.status.days - b.status.days);

        if (!loading && withStatus.length === 0) return null;

        const renderGroup = (title, color, items, describeDay) => {
          if (!items.length) return null;
          return (
            <div style={styles.reminderGroup}>
              <div style={styles.reminderGroupTitle(color)}>{title} ({items.length})</div>
              {items.map(({ dealer, status }) => {
                const link = waLink(dealer, status);
                return (
                  <div key={dealer.id} style={styles.reminderRow}>
                    <div>
                      <div style={styles.reminderName}>{dealer.name}</div>
                      <div style={styles.reminderMeta}>{fmt(status.pending)} pending · {describeDay(status)}</div>
                    </div>
                    {link ? (
                      <a href={link} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>
                        <button style={styles.waButton}>Send WhatsApp</button>
                      </a>
                    ) : (
                      <button style={styles.waButtonDisabled} disabled title="Add a phone number for this dealer">No phone</button>
                    )}
                  </div>
                );
              })}
            </div>
          );
        };

        return (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Payment reminders</h2>
            {renderGroup('Overdue', '#a32d2d', overdue, (s) => `${s.days} day${s.days === 1 ? '' : 's'} overdue`)}
            {renderGroup('Due this week', '#b8860b', week, (s) => s.days === 0 ? 'due today' : `due in ${s.days} day${s.days === 1 ? '' : 's'}`)}
            {renderGroup('Upcoming', '#6b6a63', upcoming, (s) => `due ${s.due}`)}
          </div>
        );
      })()}

      {(() => {
        if (loading || dealers.length === 0) return null;
        const rows = dealers.map((d) => ({ dealer: d, ...totals(d) }));
        const sorted = [...rows].sort((a, b) => {
          let av, bv;
          if (sortKey === 'name') { av = a.dealer.name.toLowerCase(); bv = b.dealer.name.toLowerCase(); }
          else { av = a[sortKey]; bv = b[sortKey]; }
          if (av < bv) return sortDir === 'asc' ? -1 : 1;
          if (av > bv) return sortDir === 'asc' ? 1 : -1;
          return 0;
        });
        const arrow = (key) => (sortKey === key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '');
        return (
          <div style={styles.card}>
            <h2 style={styles.cardTitle}>Party-wise summary</h2>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.sortTh} onClick={() => toggleSort('name')}>Dealer{arrow('name')}</th>
                  <th style={styles.sortTh} onClick={() => toggleSort('purchased')}>Total billed{arrow('purchased')}</th>
                  <th style={styles.sortTh} onClick={() => toggleSort('paid')}>Total collected{arrow('paid')}</th>
                  <th style={styles.sortTh} onClick={() => toggleSort('pending')}>Pending{arrow('pending')}</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map(({ dealer, purchased, paid, pending }) => (
                  <tr key={dealer.id}>
                    <td style={styles.td}>{dealer.name}</td>
                    <td style={styles.td}>{fmt(purchased)}</td>
                    <td style={{ ...styles.td, color: '#3b6d11' }}>{fmt(paid)}</td>
                    <td style={{ ...styles.td, color: pending > 0 ? '#a32d2d' : '#3b6d11' }}>{fmt(pending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ fontSize: 11.5, color: '#8f8d84', marginTop: 8 }}>Tap a column header to sort.</div>
          </div>
        );
      })()}

      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button style={{ ...styles.buttonSecondary, ...styles.buttonSmall }} onClick={load}>Refresh</button>
        </div>
        <h2 style={styles.cardTitle}>Dealers</h2>

        {loading && <div style={styles.empty}>Loading…</div>}
        {!loading && !error && dealers.length === 0 && <div style={styles.empty}>No dealers yet. Add one above to get started.</div>}
        {!loading && error && dealers.length === 0 && <div style={styles.empty}>Nothing loaded — see the message above.</div>}

        {!loading && dealers.map((d) => {
          const t = totals(d);
          const open = !!openIds[d.id];
          const f = formState[d.id] || {};
          return (
            <div key={d.id} style={{ ...styles.card, marginBottom: 12 }}>
              <div style={styles.dealerHeader} onClick={() => setOpenIds((o) => ({ ...o, [d.id]: !o[d.id] }))}>
                <div>
                  <span style={styles.dealerName}>{d.name}</span>
                  {d.phone && <span style={{ color: '#8f8d84', fontSize: 12.5, marginLeft: 8 }}>{d.phone}</span>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={styles.pill(t.pending > 0)}>{t.pending > 0 ? fmt(t.pending) + ' pending' : 'clear'}</span>
                  <button
                    style={{ ...styles.buttonSecondary, ...styles.buttonSmall }}
                    onClick={(e) => { e.stopPropagation(); removeDealer(d); }}
                  >
                    Delete
                  </button>
                </div>
              </div>

              {open && (
                <div style={{ marginTop: 12 }}>
                  <div style={styles.sectionTitle}>Purchases</div>
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={styles.th}>Product</th><th style={styles.th}>Qty</th>
                        <th style={styles.th}>Rate</th><th style={styles.th}>Amount</th>
                        <th style={styles.th}>Date</th><th style={styles.th}>Due</th><th style={styles.th}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(d.purchases || []).length === 0 && (
                        <tr><td colSpan={7} style={styles.empty}>No purchases logged</td></tr>
                      )}
                      {(d.purchases || []).map((p) => (
                        <tr key={p.id}>
                          <td style={styles.td}>{p.product}</td>
                          <td style={styles.td}>{p.qty}</td>
                          <td style={styles.td}>{fmt(p.rate)}</td>
                          <td style={styles.td}>{fmt(p.qty * p.rate)}</td>
                          <td style={styles.td}>{p.date}</td>
                          <td style={styles.td}>{p.due_date || '—'}</td>
                          <td style={styles.td}>
                            <button style={{ ...styles.buttonSecondary, ...styles.buttonSmall }} onClick={() => removePurchase(p)}>Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ ...styles.row, marginTop: 10 }}>
                    <input style={{ ...styles.input }} placeholder="Product (e.g. Zara White basin)" value={f.product || ''} onChange={(e) => setField(d.id, 'product', e.target.value)} />
                    <input style={{ ...styles.input, maxWidth: 80 }} type="number" min="1" placeholder="Qty" value={f.qty || ''} onChange={(e) => setField(d.id, 'qty', e.target.value)} />
                    <input style={{ ...styles.input, maxWidth: 100 }} type="number" min="0" placeholder="Rate ₹" value={f.rate || ''} onChange={(e) => setField(d.id, 'rate', e.target.value)} />
                    <input style={{ ...styles.input, maxWidth: 150 }} type="date" value={f.pdate || ''} onChange={(e) => setField(d.id, 'pdate', e.target.value)} title="Purchase date" />
                    <input style={{ ...styles.input, maxWidth: 150 }} type="date" value={f.duedate || ''} onChange={(e) => setField(d.id, 'duedate', e.target.value)} title="Payment due date" />
                    <button style={styles.button} onClick={() => addPurchase(d.id)}>Add purchase</button>
                  </div>
                  <div style={{ fontSize: 11.5, color: '#8f8d84', marginTop: -4, marginBottom: 6 }}>Second date field is the payment due date, used for reminders.</div>
                  {errs[d.id + '-p'] && <div style={styles.err}>{errs[d.id + '-p']}</div>}

                  <div style={styles.sectionTitle}>Payments</div>
                  <table style={styles.table}>
                    <thead>
                      <tr><th style={styles.th}>Amount</th><th style={styles.th}>Date</th><th style={styles.th}>Note</th><th style={styles.th}></th></tr>
                    </thead>
                    <tbody>
                      {(d.payments || []).length === 0 && (
                        <tr><td colSpan={4} style={styles.empty}>No payments logged</td></tr>
                      )}
                      {(d.payments || []).map((p) => (
                        <tr key={p.id}>
                          <td style={styles.td}>{fmt(p.amount)}</td>
                          <td style={styles.td}>{p.date}</td>
                          <td style={styles.td}>{p.note}</td>
                          <td style={styles.td}>
                            <button style={{ ...styles.buttonSecondary, ...styles.buttonSmall }} onClick={() => removePayment(p)}>Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ ...styles.row, marginTop: 10 }}>
                    <input style={{ ...styles.input, maxWidth: 120 }} type="number" min="0" placeholder="Amount ₹" value={f.amount || ''} onChange={(e) => setField(d.id, 'amount', e.target.value)} />
                    <input style={{ ...styles.input, maxWidth: 150 }} type="date" value={f.paydate || ''} onChange={(e) => setField(d.id, 'paydate', e.target.value)} />
                    <input style={styles.input} placeholder="Note (optional)" value={f.note || ''} onChange={(e) => setField(d.id, 'note', e.target.value)} />
                    <button style={styles.button} onClick={() => addPayment(d.id)}>Log payment</button>
                  </div>
                  {errs[d.id + '-pay'] && <div style={styles.err}>{errs[d.id + '-pay']}</div>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
