import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { supabaseServer } from '@/lib/supabaseClient';
import { planWorkbook } from '@/lib/importSheet';

// Parsing a workbook and holding it in memory needs the Node runtime.
export const runtime = 'nodejs';

const MAX_BYTES = 4 * 1024 * 1024; // Vercel caps a serverless request body at ~4.5MB
const MAX_ROWS = 5000;

// POST /api/import   multipart/form-data
//   file  the .xlsx / .xls / .csv workbook
//   mode  "preview" (default) parses and validates without writing
//         "commit"  parses, validates and inserts
//
// Preview and commit both parse the uploaded file, so the client uploads it
// twice. That keeps the server the single source of truth for what gets
// written — a preview token would mean trusting rows the client sends back,
// and serverless instances are too short-lived to cache the parse anyway.
export async function POST(req) {
  let form;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Send the file as multipart/form-data' }, { status: 400 });
  }

  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return NextResponse.json({ error: 'No file was uploaded' }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: `That file is ${(file.size / 1048576).toFixed(1)}MB. The limit is ${MAX_BYTES / 1048576}MB.` },
      { status: 413 }
    );
  }

  const commit = String(form.get('mode') || 'preview') === 'commit';
  const asOf = /^\d{4}-\d{2}-\d{2}$/.test(form.get('as_of_date') || '')
    ? form.get('as_of_date')
    : new Date().toISOString().slice(0, 10);
  const defaultDue = /^\d{4}-\d{2}-\d{2}$/.test(form.get('due_date') || '') ? form.get('due_date') : null;

  // ---- parse -------------------------------------------------------------
  let sheets;
  try {
    const buf = Buffer.from(await file.arrayBuffer());
    // cellDates gives real Date objects; raw keeps numbers as numbers. Text
    // cells stay text, which is what the amount parser expects.
    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true });
    sheets = wb.SheetNames.map((name) => ({
      name,
      matrix: XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, blankrows: false, raw: true, defval: '' }),
    })).filter((sh) => sh.matrix.length > 0);
  } catch {
    return NextResponse.json({ error: 'Could not read that file. It needs to be .xlsx, .xls or .csv.' }, { status: 400 });
  }
  if (!sheets || sheets.length === 0) {
    return NextResponse.json({ error: 'That file has no readable rows' }, { status: 400 });
  }

  const { plan } = planWorkbook(sheets, asOf);

  const totalRows = plan.reduce((n, p) => n + p.rows.length, 0);
  if (totalRows > MAX_ROWS) {
    return NextResponse.json({ error: `That file has ${totalRows} rows. The limit is ${MAX_ROWS}.` }, { status: 400 });
  }

  // ---- match against dealers we already have -----------------------------
  const supabase = supabaseServer();
  const { data: existing, error: readErr } = await supabase.from('dealers').select('id, name, phone');
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 });

  // Case-insensitive match, so re-importing the same sheet reuses the dealer
  // rather than creating a second one with the same name.
  const byName = new Map();
  for (const d of existing || []) byName.set(d.name.trim().toLowerCase(), d);

  const skipped = [];           // { sheet, row, name, reason }
  const note = (sheet, r, reason) => skipped.push({ sheet, row: r.sheetRow, name: r.name || '', reason });

  // Every dealer name the file refers to, and whether we already have it.
  const wanted = new Map();     // lowercased -> { name, phone, existingId }
  for (const p of plan) {
    for (const r of p.rows) {
      if (r.skip || !r.name) continue;
      const k = r.name.toLowerCase();
      if (!wanted.has(k)) {
        const hit = byName.get(k);
        wanted.set(k, { name: r.name, phone: r.phone || '', existingId: hit ? hit.id : null, existingPhone: hit ? hit.phone : '' });
      } else if (r.phone && !wanted.get(k).phone) {
        wanted.get(k).phone = r.phone;
      }
    }
  }

  const toCreate = [...wanted.values()].filter((w) => !w.existingId);
  const matched = [...wanted.values()].filter((w) => w.existingId);

  // An opening balance for a dealer we already track would double-count, since
  // their balance already comes from the rows we hold. Drop those, keep the
  // dealer's other rows.
  for (const p of plan) {
    if (p.kind !== 'dealers') continue;
    for (const r of p.rows) {
      if (r.skip || !r.name) continue;
      const w = wanted.get(r.name.toLowerCase());
      if (w && w.existingId && r.amount) {
        r.skip = 'Already in the dashboard — opening balance not re-applied';
      }
    }
  }

  // Dealers are matched by name, but the rows underneath them are not, so
  // re-importing the same file would otherwise double every purchase and
  // payment. Compare each incoming row against what the matched dealers
  // already have and drop exact repeats. The preview lists every one of these
  // with its reason, so a genuine same-day repeat can still be spotted.
  const matchedIds = matched.map((w) => w.existingId);
  if (matchedIds.length) {
    const idToName = new Map(matched.map((w) => [w.existingId, w.name.toLowerCase()]));
    const [pRes, yRes] = await Promise.all([
      supabase.from('purchases').select('dealer_id, product, qty, rate, date').in('dealer_id', matchedIds),
      supabase.from('payments').select('dealer_id, amount, date, note').in('dealer_id', matchedIds),
    ]);
    if (pRes.error) return NextResponse.json({ error: pRes.error.message }, { status: 500 });
    if (yRes.error) return NextResponse.json({ error: yRes.error.message }, { status: 500 });

    const txt = (v) => String(v == null ? '' : v).trim().toLowerCase();
    const pKey = (name, date, product, qty, rate) => [name, date, txt(product), Number(qty), Number(rate)].join('|');
    const yKey = (name, date, amount, note) => [name, date, Number(amount), txt(note)].join('|');

    const havePurchases = new Set(
      (pRes.data || []).map((r) => pKey(idToName.get(r.dealer_id), r.date, r.product, r.qty, r.rate))
    );
    const havePayments = new Set(
      (yRes.data || []).map((r) => yKey(idToName.get(r.dealer_id), r.date, r.amount, r.note))
    );

    for (const p of plan) {
      for (const r of p.rows) {
        if (r.skip || !r.name) continue;
        const k = r.name.toLowerCase();
        if (p.kind === 'purchases' && havePurchases.has(pKey(k, r.date || asOf, r.product, r.qty, r.rate))) {
          r.skip = 'Identical purchase already recorded on ' + (r.date || asOf);
        } else if (p.kind === 'payments' && havePayments.has(yKey(k, r.date || asOf, r.amount, r.note))) {
          r.skip = 'Identical payment already recorded on ' + (r.date || asOf);
        }
      }
    }
  }

  const summary = {
    mode: commit ? 'commit' : 'preview',
    sheets: plan.map((p) => ({
      sheet: p.sheet,
      kind: p.kind,
      headerRow: p.headerRow || null,
      reason: p.reason || null,
      balancesIgnored: !!p.balancesIgnored,
      total: p.rows.length,
      ready: p.rows.filter((r) => !r.skip).length,
      skipped: p.rows.filter((r) => r.skip).length,
      preview: p.rows.slice(0, 200),
    })),
    dealers: { existing: matched.length, toCreate: toCreate.length },
    purchases: 0,
    payments: 0,
    openingBalances: 0,
    skipped: [],
    created: null,
  };

  for (const p of plan) {
    const ready = p.rows.filter((r) => !r.skip);
    if (p.kind === 'purchases') summary.purchases += ready.length;
    else if (p.kind === 'payments') summary.payments += ready.length;
    else if (p.kind === 'dealers') summary.openingBalances += ready.filter((r) => r.amount).length;
    for (const r of p.rows) if (r.skip) note(p.sheet, r, r.skip);
  }
  summary.skipped = skipped;

  if (!commit) return NextResponse.json(summary);

  // ---- write -------------------------------------------------------------
  if (wanted.size === 0) {
    return NextResponse.json({ ...summary, error: 'Nothing in that file could be imported' }, { status: 400 });
  }

  let createdDealers = [];
  if (toCreate.length) {
    const { data, error } = await supabase
      .from('dealers')
      .insert(toCreate.map((w) => ({ name: w.name, phone: w.phone })))
      .select();
    if (error) return NextResponse.json({ error: 'Could not create dealers: ' + error.message }, { status: 500 });
    createdDealers = data || [];
  }

  const idFor = new Map();
  for (const d of createdDealers) idFor.set(d.name.trim().toLowerCase(), d.id);
  for (const w of matched) idFor.set(w.name.toLowerCase(), w.existingId);

  // Fill in a phone number for a dealer we already had but had no number for —
  // without it the WhatsApp reminders can't reach them.
  const phoneFixes = matched.filter((w) => w.phone && !String(w.existingPhone || '').trim());
  for (const w of phoneFixes) {
    await supabase.from('dealers').update({ phone: w.phone }).eq('id', w.existingId);
  }

  const purchases = [];
  const payments = [];
  for (const p of plan) {
    for (const r of p.rows) {
      if (r.skip || !r.name) continue;
      const dealer_id = idFor.get(r.name.toLowerCase());
      if (!dealer_id) continue;

      if (p.kind === 'purchases') {
        purchases.push({
          dealer_id, product: r.product, qty: r.qty, rate: r.rate,
          date: r.date || asOf, due_date: r.due_date || defaultDue,
        });
      } else if (p.kind === 'payments') {
        payments.push({ dealer_id, amount: r.amount, date: r.date || asOf, note: r.note || '' });
      } else if (p.kind === 'dealers' && r.amount) {
        // A balance list has no history, so carry the figure as one opening
        // entry. A negative balance means the dealer is in credit with us.
        if (r.amount > 0) {
          purchases.push({
            dealer_id, product: 'Opening balance', qty: 1, rate: r.amount,
            date: asOf, due_date: defaultDue,
          });
        } else {
          payments.push({ dealer_id, amount: Math.abs(r.amount), date: asOf, note: 'Opening advance' });
        }
      }
    }
  }

  // If the rows fail to land, remove the dealers this import created. A
  // half-import that leaves new dealers at zero reads as "everyone has paid".
  async function rollback(message) {
    const ids = createdDealers.map((d) => d.id);
    if (ids.length) await supabase.from('dealers').delete().in('id', ids);
    return NextResponse.json(
      { error: message + (ids.length ? ' The dealers this import created were removed.' : '') },
      { status: 500 }
    );
  }

  if (purchases.length) {
    const { error } = await supabase.from('purchases').insert(purchases);
    if (error) return rollback('Could not save purchases: ' + error.message + '.');
  }
  if (payments.length) {
    const { error } = await supabase.from('payments').insert(payments);
    if (error) return rollback('Could not save payments: ' + error.message + '.');
  }

  return NextResponse.json({
    ...summary,
    created: {
      dealers: createdDealers.length,
      matchedDealers: matched.length,
      purchases: purchases.length,
      payments: payments.length,
      phonesFilled: phoneFixes.length,
    },
  });
}
