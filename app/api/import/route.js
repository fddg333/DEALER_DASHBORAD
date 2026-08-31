import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseClient';

const MAX_ROWS = 2000;

// Bulk-create dealers from a spreadsheet, each with its outstanding balance as
// an opening entry. The sheet has no transaction history, so the balance is
// carried as a single "Opening balance" purchase — that keeps every existing
// calculation (totals, reminders, export) working without special-casing.
export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Could not read the request' }, { status: 400 });
  }

  const rows = Array.isArray(body.rows) ? body.rows : null;
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: 'No rows to import' }, { status: 400 });
  }
  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Too many rows (${rows.length}). The limit is ${MAX_ROWS}.` }, { status: 400 });
  }

  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(body.as_of_date || '')
    ? body.as_of_date
    : new Date().toISOString().slice(0, 10);
  const dueDate = /^\d{4}-\d{2}-\d{2}$/.test(body.due_date || '') ? body.due_date : null;

  // Normalise and reject anything unusable before touching the database.
  const clean = [];
  for (const r of rows) {
    const name = String(r && r.name != null ? r.name : '').trim();
    if (!name) continue;
    const amount = Number(r.amount);
    clean.push({
      name,
      phone: String(r && r.phone != null ? r.phone : '').trim(),
      amount: isFinite(amount) ? amount : 0,
    });
  }
  if (clean.length === 0) {
    return NextResponse.json({ error: 'None of the rows had a dealer name' }, { status: 400 });
  }

  const supabase = supabaseServer();

  const { data: existing, error: readErr } = await supabase.from('dealers').select('id, name');
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

  const taken = new Set((existing || []).map((d) => d.name.trim().toLowerCase()));

  // Names already in the dashboard are left alone — re-importing a sheet
  // should never silently double a dealer's balance.
  const skipped = [];
  const toCreate = [];
  const seen = new Set();
  for (const r of clean) {
    const k = r.name.toLowerCase();
    if (taken.has(k)) { skipped.push(r.name); continue; }
    if (seen.has(k)) { skipped.push(r.name); continue; } // duplicate within the sheet
    seen.add(k);
    toCreate.push(r);
  }

  if (toCreate.length === 0) {
    return NextResponse.json({ created: 0, skipped, openingEntries: 0, advances: 0 });
  }

  const { data: created, error: dealerErr } = await supabase
    .from('dealers')
    .insert(toCreate.map((r) => ({ name: r.name, phone: r.phone })))
    .select();
  if (dealerErr) return NextResponse.json({ error: dealerErr.message }, { status: 500 });

  const idByName = new Map((created || []).map((d) => [d.name.trim().toLowerCase(), d.id]));

  const purchases = [];
  const payments = [];
  for (const r of toCreate) {
    const dealer_id = idByName.get(r.name.toLowerCase());
    if (!dealer_id || !r.amount) continue;
    if (r.amount > 0) {
      purchases.push({
        dealer_id, product: 'Opening balance', qty: 1, rate: r.amount,
        date: asOf, due_date: dueDate,
      });
    } else {
      // A negative balance means the dealer is in credit with us.
      payments.push({ dealer_id, amount: Math.abs(r.amount), date: asOf, note: 'Opening advance' });
    }
  }

  // If the balances fail to land, remove the dealers we just made rather than
  // leaving a half-import that reads as "everyone has cleared their dues".
  async function rollback(message) {
    const ids = (created || []).map((d) => d.id);
    if (ids.length) await supabase.from('dealers').delete().in('id', ids);
    return NextResponse.json(
      { error: message + ' Nothing was imported — the part-created dealers were removed.' },
      { status: 500 }
    );
  }

  if (purchases.length) {
    const { error } = await supabase.from('purchases').insert(purchases);
    if (error) return rollback('Could not save the opening balances: ' + error.message + '.');
  }
  if (payments.length) {
    const { error } = await supabase.from('payments').insert(payments);
    if (error) return rollback('Could not save the opening advances: ' + error.message + '.');
  }

  return NextResponse.json({
    created: created ? created.length : 0,
    skipped,
    openingEntries: purchases.length,
    advances: payments.length,
  });
}
