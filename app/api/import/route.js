import { NextResponse } from 'next/server';
import { supabaseServer } from '@/lib/supabaseClient';

// Normalize a dealer name for matching: trim, collapse inner spaces, lowercase.
function norm(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

function validDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s);
  if (isNaN(d.getTime())) return null;
  return s;
}

export async function POST(req) {
  let body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Could not read the uploaded data.' }, { status: 400 });
  }

  const inDealers = Array.isArray(body.dealers) ? body.dealers : [];
  const inPurchases = Array.isArray(body.purchases) ? body.purchases : [];
  const inPayments = Array.isArray(body.payments) ? body.payments : [];

  const supabase = supabaseServer();

  // Existing dealers, so a re-import updates rather than duplicates.
  const { data: existing, error: exErr } = await supabase.from('dealers').select('id, name, phone');
  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 });

  const byName = new Map();
  (existing || []).forEach((d) => byName.set(norm(d.name), d));

  const skipped = [];
  let dealersCreated = 0;
  let dealersUpdated = 0;

  // ---- Dealers ----
  for (const row of inDealers) {
    const name = String(row.name || '').trim().replace(/\s+/g, ' ');
    const phone = String(row.phone || '').trim();
    if (!name) {
      skipped.push({ sheet: 'Dealers', row: row._row, reason: 'Dealer name is blank' });
      continue;
    }
    const key = norm(name);
    const found = byName.get(key);
    if (found) {
      // Only fill in a phone if we have one and the existing record lacks it.
      if (phone && !found.phone) {
        const { error } = await supabase.from('dealers').update({ phone }).eq('id', found.id);
        if (error) {
          skipped.push({ sheet: 'Dealers', row: row._row, reason: `Could not update: ${error.message}` });
          continue;
        }
        found.phone = phone;
        dealersUpdated++;
      }
      continue;
    }
    const { data, error } = await supabase.from('dealers').insert({ name, phone }).select().single();
    if (error) {
      skipped.push({ sheet: 'Dealers', row: row._row, reason: `Could not add: ${error.message}` });
      continue;
    }
    byName.set(key, data);
    dealersCreated++;
  }

  // ---- Purchases ----
  const purchaseRows = [];
  for (const row of inPurchases) {
    const dealer = byName.get(norm(row.dealer));
    if (!dealer) {
      skipped.push({ sheet: 'Purchases', row: row._row, reason: `No dealer named "${row.dealer}"` });
      continue;
    }
    const product = String(row.product || '').trim();
    const qty = Number(row.qty);
    const rate = Number(row.rate);
    if (!product) {
      skipped.push({ sheet: 'Purchases', row: row._row, reason: 'Product is blank' });
      continue;
    }
    if (!isFinite(qty) || qty <= 0) {
      skipped.push({ sheet: 'Purchases', row: row._row, reason: 'Qty must be a number above 0' });
      continue;
    }
    if (!isFinite(rate) || rate < 0) {
      skipped.push({ sheet: 'Purchases', row: row._row, reason: 'Rate must be a number' });
      continue;
    }
    const date = validDate(row.date);
    if (!date) {
      skipped.push({ sheet: 'Purchases', row: row._row, reason: 'Purchase Date must be YYYY-MM-DD' });
      continue;
    }
    const due = row.due_date ? validDate(row.due_date) : null;
    if (row.due_date && !due) {
      skipped.push({ sheet: 'Purchases', row: row._row, reason: 'Due Date must be YYYY-MM-DD' });
      continue;
    }
    purchaseRows.push({ dealer_id: dealer.id, product, qty, rate, date, due_date: due });
  }

  // ---- Payments ----
  const paymentRows = [];
  for (const row of inPayments) {
    const dealer = byName.get(norm(row.dealer));
    if (!dealer) {
      skipped.push({ sheet: 'Payments', row: row._row, reason: `No dealer named "${row.dealer}"` });
      continue;
    }
    const amount = Number(row.amount);
    if (!isFinite(amount) || amount <= 0) {
      skipped.push({ sheet: 'Payments', row: row._row, reason: 'Amount must be a number above 0' });
      continue;
    }
    const date = validDate(row.date);
    if (!date) {
      skipped.push({ sheet: 'Payments', row: row._row, reason: 'Payment Date must be YYYY-MM-DD' });
      continue;
    }
    paymentRows.push({ dealer_id: dealer.id, amount, date, note: String(row.note || '').trim() });
  }

  let purchasesAdded = 0;
  if (purchaseRows.length) {
    const { data, error } = await supabase.from('purchases').insert(purchaseRows).select('id');
    if (error) return NextResponse.json({ error: `Purchases failed: ${error.message}` }, { status: 500 });
    purchasesAdded = (data || []).length;
  }

  let paymentsAdded = 0;
  if (paymentRows.length) {
    const { data, error } = await supabase.from('payments').insert(paymentRows).select('id');
    if (error) return NextResponse.json({ error: `Payments failed: ${error.message}` }, { status: 500 });
    paymentsAdded = (data || []).length;
  }

  return NextResponse.json({
    dealersCreated,
    dealersUpdated,
    purchasesAdded,
    paymentsAdded,
    skipped,
  });
}
