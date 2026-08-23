'use client';
import { useEffect, useState } from 'react';

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
};

function fmt(n) {
  return '₹' + Number(n || 0).toLocaleString('en-IN');
}

function totals(d) {
  const purchased = (d.purchases || []).reduce((s, p) => s + p.qty * p.rate, 0);
  const paid = (d.payments || []).reduce((s, p) => s + p.amount, 0);
  return { purchased, paid, pending: purchased - paid };
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

  async function load() {
    setLoading(true);
    const res = await fetch('/api/dealers');
    const data = await res.json();
    setDealers(data.dealers || []);
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function addDealer() {
    const name = newName.trim();
    if (!name) {
      setDealerErr('Enter a dealer name.');
      return;
    }
    setDealerErr('');
    const res = await fetch('/api/dealers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, phone: newPhone.trim() }),
    });
    if (res.ok) {
      setNewName(''); setNewPhone('');
      await load();
    }
  }

  async function removeDealer(id) {
    await fetch('/api/dealers/' + id, { method: 'DELETE' });
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
    await fetch('/api/purchases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealer_id: dealerId, product, qty, rate, date: f.pdate }),
    });
    setFormState((s) => ({ ...s, [dealerId]: { ...s[dealerId], product: '', qty: '', rate: '', pdate: '' } }));
    await load();
    setOpenIds((o) => ({ ...o, [dealerId]: true }));
  }

  async function removePurchase(id) {
    await fetch('/api/purchases/' + id, { method: 'DELETE' });
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
    await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dealer_id: dealerId, amount, date: f.paydate, note: f.note }),
    });
    setFormState((s) => ({ ...s, [dealerId]: { ...s[dealerId], amount: '', paydate: '', note: '' } }));
    await load();
    setOpenIds((o) => ({ ...o, [dealerId]: true }));
  }

  async function removePayment(id) {
    await fetch('/api/payments/' + id, { method: 'DELETE' });
    await load();
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    window.location.href = '/login';
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
        <button style={styles.buttonSecondary} onClick={logout}>Log out</button>
      </div>
      <p style={styles.sub}>Track dealer purchases and pending payments in one place.</p>

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

      <div style={styles.card}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
          <button style={{ ...styles.buttonSecondary, ...styles.buttonSmall }} onClick={load}>Refresh</button>
        </div>
        <h2 style={styles.cardTitle}>Dealers</h2>

        {loading && <div style={styles.empty}>Loading…</div>}
        {!loading && dealers.length === 0 && <div style={styles.empty}>No dealers yet. Add one above to get started.</div>}

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
                    onClick={(e) => { e.stopPropagation(); removeDealer(d.id); }}
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
                        <th style={styles.th}>Date</th><th style={styles.th}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {(d.purchases || []).length === 0 && (
                        <tr><td colSpan={6} style={styles.empty}>No purchases logged</td></tr>
                      )}
                      {(d.purchases || []).map((p) => (
                        <tr key={p.id}>
                          <td style={styles.td}>{p.product}</td>
                          <td style={styles.td}>{p.qty}</td>
                          <td style={styles.td}>{fmt(p.rate)}</td>
                          <td style={styles.td}>{fmt(p.qty * p.rate)}</td>
                          <td style={styles.td}>{p.date}</td>
                          <td style={styles.td}>
                            <button style={{ ...styles.buttonSecondary, ...styles.buttonSmall }} onClick={() => removePurchase(p.id)}>Remove</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div style={{ ...styles.row, marginTop: 10 }}>
                    <input style={{ ...styles.input }} placeholder="Product (e.g. Zara White basin)" value={f.product || ''} onChange={(e) => setField(d.id, 'product', e.target.value)} />
                    <input style={{ ...styles.input, maxWidth: 80 }} type="number" min="1" placeholder="Qty" value={f.qty || ''} onChange={(e) => setField(d.id, 'qty', e.target.value)} />
                    <input style={{ ...styles.input, maxWidth: 100 }} type="number" min="0" placeholder="Rate ₹" value={f.rate || ''} onChange={(e) => setField(d.id, 'rate', e.target.value)} />
                    <input style={{ ...styles.input, maxWidth: 150 }} type="date" value={f.pdate || ''} onChange={(e) => setField(d.id, 'pdate', e.target.value)} />
                    <button style={styles.button} onClick={() => addPurchase(d.id)}>Add purchase</button>
                  </div>
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
                            <button style={{ ...styles.buttonSecondary, ...styles.buttonSmall }} onClick={() => removePayment(p.id)}>Remove</button>
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
