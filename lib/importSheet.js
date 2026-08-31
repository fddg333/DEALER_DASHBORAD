// Parsing and validation for the "import from Excel" flow.
//
// Deliberately free of React and of the xlsx library so it can be tested
// directly and reused on the server. Callers hand us a matrix per sheet (array
// of row arrays — what XLSX.utils.sheet_to_json(ws, { header: 1 }) produces)
// and we work out what each sheet is, which columns mean what, and which rows
// are safe to insert.
//
// Three sheet shapes are understood:
//   purchases  Dealer | Product | Qty | Rate | Date | Due date
//   payments   Dealer | Amount  | Date | Note
//   dealers    Dealer | Pending | Phone        (a balance list, no history)
// A workbook may hold any mix, including the three-sheet workbook this app
// exports itself.

// Header aliases seen in the kind of sheet a shop actually keeps. Compared
// after lowercasing and stripping everything that isn't a letter or digit, so
// "Party Name", "party_name" and "PARTY NAME:" all collapse to "partyname".
const ALIASES = {
  name: ['name', 'dealer', 'dealername', 'party', 'partyname', 'shop', 'shopname', 'firm', 'firmname', 'customer', 'customername', 'account', 'accountname', 'client'],
  amount: ['amount', 'pending', 'pendingamount', 'balance', 'balanceamount', 'closingbalance', 'outstanding', 'outstandingamount', 'due', 'dueamount', 'bal', 'total', 'totaldue', 'remaining', 'value', 'paid', 'received'],
  phone: ['phone', 'phoneno', 'phonenumber', 'mobile', 'mobileno', 'mobilenumber', 'contact', 'contactno', 'contactnumber', 'whatsapp', 'whatsappno'],
  product: ['product', 'item', 'itemname', 'goods', 'material', 'description', 'particulars', 'details', 'tile', 'productname'],
  qty: ['qty', 'quantity', 'nos', 'pcs', 'pieces', 'boxes', 'box', 'units', 'unit'],
  rate: ['rate', 'price', 'unitrate', 'unitprice', 'rateperunit'],
  date: ['date', 'billdate', 'invoicedate', 'purchasedate', 'paymentdate', 'entrydate', 'txndate', 'transactiondate'],
  due: ['duedate', 'paymentduedate', 'duedt', 'dueon'],
  note: ['note', 'notes', 'remark', 'remarks', 'reference', 'ref', 'mode', 'narration', 'comment', 'comments'],
};

function key(v) {
  return String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Rupee amounts arrive in a lot of shapes: a real number from Excel, "₹3,32,000"
// as text, "(1,200)" for a credit, "1.5L" written by hand. Returns null when the
// cell is empty or isn't a number at all, so the caller can tell "blank" from 0.
export function parseAmount(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return null;
  if (typeof value === 'number') return isFinite(value) ? value : null;

  let s = String(value).trim();
  if (!s || s === '-' || s === '—' || key(s) === 'nil') return null;

  let sign = 1;
  // Accountants write credits in parentheses.
  if (/^\(.*\)$/.test(s)) { sign = -1; s = s.slice(1, -1); }
  if (/^-/.test(s)) { sign = -1; s = s.slice(1); }

  // Lakh / crore suffixes, which people do write by hand.
  let multiplier = 1;
  const suffix = s.match(/(lakhs?|lacs?|l|crores?|crs?|cr|k)\s*$/i);
  if (suffix) {
    const u = suffix[1].toLowerCase();
    if (u === 'k') multiplier = 1000;
    else if (u.startsWith('c')) multiplier = 10000000;
    else multiplier = 100000;
    s = s.slice(0, suffix.index);
  }

  // Strip a currency prefix, then digit grouping and spaces (including the
  // non-breaking kind Excel emits). Indian grouping is 3,32,000 rather than
  // 332,000, so we can't assume commas fall every three digits — drop them all.
  s = s.replace(/^(?:₹|rs\.?|inr)\s*/i, '');
  s = s.replace(/[,\s ]/g, '');

  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  return sign * n * multiplier;
}

function iso(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null; // e.g. 31 Feb
  return dt.toISOString().slice(0, 10);
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

// Returns a yyyy-mm-dd string, or null. Day-first is assumed for ambiguous
// numeric dates (11/06/2026 is 11 June), which is the Indian convention and
// matches how these sheets are written.
export function parseDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) {
    if (isNaN(value.getTime())) return null;
    return iso(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === 'number') {
    // Excel serial date: days since 1899-12-30.
    if (!isFinite(value) || value <= 0 || value > 2958465) return null;
    const dt = new Date(Math.round((value - 25569) * 86400000));
    return isNaN(dt.getTime()) ? null : dt.toISOString().slice(0, 10);
  }

  const s = String(value).trim();
  if (!s) return null;

  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);           // 2026-08-31
  if (m) return iso(+m[1], +m[2], +m[3]);

  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);             // 31/08/2026
  if (m) {
    let [, a, b, y] = m;
    let year = +y;
    if (year < 100) year += year < 70 ? 2000 : 1900;
    // Day-first unless that's impossible and month-first works.
    if (+a > 12 || +b <= 12) return iso(year, +b, +a);
    return iso(year, +a, +b);
  }

  m = s.match(/^(\d{1,2})[-\s]([A-Za-z]{3,})[-\s](\d{2,4})$/);        // 14-Jun-2026
  if (m) {
    const mi = MONTHS.indexOf(m[2].slice(0, 3).toLowerCase());
    if (mi < 0) return null;
    let year = +m[3];
    if (year < 100) year += year < 70 ? 2000 : 1900;
    return iso(year, mi + 1, +m[1]);
  }

  m = s.match(/^([A-Za-z]{3,})[-\s](\d{1,2}),?[-\s](\d{2,4})$/);      // Jun 14, 2026
  if (m) {
    const mi = MONTHS.indexOf(m[1].slice(0, 3).toLowerCase());
    if (mi < 0) return null;
    let year = +m[3];
    if (year < 100) year += year < 70 ? 2000 : 1900;
    return iso(year, mi + 1, +m[2]);
  }
  return null;
}

// wa.me needs a country code. A bare 10-digit Indian mobile would silently
// produce a dead link, which is worse than no phone at all.
export function normalizePhone(value) {
  if (value == null || value === '') return '';
  let s = String(value).trim();
  // Excel loves turning phone numbers into 9.8250041e9.
  if (typeof value === 'number') s = value.toFixed(0);

  const plus = s.trim().startsWith('+');
  let digits = s.replace(/\D/g, '');
  if (!digits) return '';

  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10) return '91' + digits;              // bare Indian mobile
  if (digits.length === 11 && digits.startsWith('0')) return '91' + digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits;
  if (plus || digits.length > 10) return digits;               // already has a country code
  return digits;
}

const ALL_ROLES = Object.keys(ALIASES);

// Returns the column index for each requested role, or -1 when nothing matched.
//
// A header can look like more than one thing — "Party Balance" contains both a
// name alias and an amount alias — so score every (column, role) pair and take
// the strongest first. An exact match always beats a partial one, and a longer
// partial beats a shorter one. Each column and each role is claimed at most
// once, so one column can never fill two roles.
export function detectColumns(headers, roles = ['name', 'amount', 'phone']) {
  const out = {};
  for (const r of roles) out[r] = -1;
  const candidates = [];

  (headers || []).forEach((h, i) => {
    const k = key(h);
    if (!k) return;
    for (const role of roles) {
      let best = 0;
      for (const a of ALIASES[role] || []) {
        if (k === a) best = Math.max(best, 1000 + a.length);                     // exact
        else if (a.length > 3 && k.includes(a)) best = Math.max(best, a.length); // partial
      }
      if (best) candidates.push({ col: i, role, score: best });
    }
  });

  candidates.sort((a, b) => b.score - a.score || a.col - b.col);
  const usedCols = new Set();
  for (const c of candidates) {
    if (out[c.role] !== -1 || usedCols.has(c.col)) continue;
    out[c.role] = c.col;
    usedCols.add(c.col);
  }
  return out;
}

// The header isn't always the first row — sheets often open with a title or a
// blank line. Scan the top of the file for the row matching the most columns.
export function findHeaderRow(matrix, limit = 12) {
  let best = { index: -1, score: 0, headers: [] };
  const end = Math.min(matrix.length, limit);
  for (let i = 0; i < end; i++) {
    const row = matrix[i] || [];
    const cols = detectColumns(row, ALL_ROLES);
    let score = 0;
    if (cols.name >= 0) score += 3; // the one column we can't do without
    for (const r of ALL_ROLES) if (r !== 'name' && cols[r] >= 0) score += 1;
    if (score > best.score) best = { index: i, score, headers: row };
  }
  return best.index >= 0 ? best : { index: -1, score: 0, headers: [] };
}

// What kind of sheet is this? The sheet's own name is a strong hint (this app
// exports "Purchases" / "Payments" / "Dealers Summary"), but the headers decide
// when the name is unhelpful.
export function classifySheet(sheetName, headers) {
  const cols = detectColumns(headers, ALL_ROLES);
  const n = key(sheetName);

  const hasProduct = cols.product >= 0;
  const hasQtyOrRate = cols.qty >= 0 || cols.rate >= 0;
  const hasAmount = cols.amount >= 0;

  if (cols.name < 0) return 'unknown';

  // Header evidence first — a sheet named "Sheet1" is common.
  if (hasProduct && hasQtyOrRate) return 'purchases';
  if (n.includes('purchase') || n.includes('bill') || n.includes('sale')) {
    if (hasProduct || hasQtyOrRate) return 'purchases';
  }
  if (n.includes('payment') || n.includes('receipt') || n.includes('collection')) {
    if (hasAmount) return 'payments';
  }
  if (hasAmount && cols.note >= 0 && !hasProduct) return 'payments';
  if (hasAmount) return 'dealers';
  if (cols.phone >= 0) return 'dealers'; // a plain contact list
  return 'unknown';
}

function isTotalsRow(name) {
  return /^(total|grand\s*total|sum|closing|opening\s*bal|balance\s*c\/?f|net)\b/i.test(name);
}

function cell(raw, idx) {
  return idx >= 0 ? raw[idx] : '';
}

function blankRow(raw) {
  return raw.every((c) => c == null || (!(c instanceof Date) && String(c).trim() === ''));
}

function dealerName(raw, idx) {
  const v = cell(raw, idx);
  return String(v == null ? '' : v).trim();
}

// Each builder returns every row it saw, valid or not, with `skip` set to the
// reason when the row can't be imported. Nothing is dropped silently — the
// preview shows the whole sheet so the user can see what was rejected and why.

export function buildDealerRows(matrix, headerIndex, mapping) {
  const rows = [];
  const seen = new Map();
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const raw = matrix[i] || [];
    if (blankRow(raw)) continue;
    const name = dealerName(raw, mapping.name);
    const amountCell = cell(raw, mapping.amount);
    const amount = parseAmount(amountCell);
    const row = {
      sheetRow: i + 1,
      name,
      phone: normalizePhone(cell(raw, mapping.phone)),
      amount: amount == null ? 0 : amount,
      skip: '',
    };
    if (!name) row.skip = 'No dealer name';
    else if (isTotalsRow(name)) row.skip = 'Looks like a totals row';
    else if (amountCell !== '' && amountCell != null && amount == null) {
      row.skip = 'Could not read the amount "' + String(amountCell).trim() + '"';
    } else if (seen.has(name.toLowerCase())) {
      row.skip = 'Same dealer as row ' + seen.get(name.toLowerCase());
    }
    if (name && !row.skip) seen.set(name.toLowerCase(), row.sheetRow);
    rows.push(row);
  }
  return rows;
}

export function buildPurchaseRows(matrix, headerIndex, mapping, fallbackDate) {
  const rows = [];
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const raw = matrix[i] || [];
    if (blankRow(raw)) continue;

    const name = dealerName(raw, mapping.name);
    const product = String(cell(raw, mapping.product) ?? '').trim();
    const qtyCell = cell(raw, mapping.qty);
    const rateCell = cell(raw, mapping.rate);
    const amountCell = cell(raw, mapping.amount);

    let qty = parseAmount(qtyCell);
    let rate = parseAmount(rateCell);
    const amount = parseAmount(amountCell);

    // Sheets often carry Amount instead of (or as well as) Rate. If we have a
    // total and a quantity we can recover the rate; with neither qty nor rate,
    // treat the whole amount as a single unit so the balance still lands.
    if (rate == null && amount != null) {
      if (qty != null && qty !== 0) rate = amount / qty;
      else { qty = 1; rate = amount; }
    }
    if (qty == null && rate != null && amount != null && rate !== 0) qty = amount / rate;
    if (qty == null) qty = 1;

    const row = {
      sheetRow: i + 1,
      name,
      product: product || 'Purchase',
      qty,
      rate: rate == null ? null : rate,
      date: parseDate(cell(raw, mapping.date)) || fallbackDate,
      due_date: parseDate(cell(raw, mapping.due)),
      skip: '',
    };

    if (!name) row.skip = 'No dealer name';
    else if (isTotalsRow(name) || isTotalsRow(product)) row.skip = 'Looks like a totals row';
    else if (row.rate == null) row.skip = 'No rate or amount on this row';
    else if (!(row.qty > 0)) row.skip = 'Quantity must be more than zero';
    else if (row.rate < 0) row.skip = 'Rate cannot be negative';
    rows.push(row);
  }
  return rows;
}

export function buildPaymentRows(matrix, headerIndex, mapping, fallbackDate) {
  const rows = [];
  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const raw = matrix[i] || [];
    if (blankRow(raw)) continue;

    const name = dealerName(raw, mapping.name);
    const amountCell = cell(raw, mapping.amount);
    const amount = parseAmount(amountCell);
    const row = {
      sheetRow: i + 1,
      name,
      amount: amount == null ? null : amount,
      date: parseDate(cell(raw, mapping.date)) || fallbackDate,
      note: String(cell(raw, mapping.note) ?? '').trim(),
      skip: '',
    };

    if (!name) row.skip = 'No dealer name';
    else if (isTotalsRow(name)) row.skip = 'Looks like a totals row';
    else if (amount == null) {
      row.skip = amountCell === '' || amountCell == null
        ? 'No payment amount'
        : 'Could not read the amount "' + String(amountCell).trim() + '"';
    } else if (!(amount > 0)) row.skip = 'Payment must be more than zero';
    rows.push(row);
  }
  return rows;
}

// Turn a whole workbook into an import plan. `sheets` is [{ name, matrix }].
// Returns one entry per sheet plus the deduplicated set of dealer names the
// import will touch.
export function planWorkbook(sheets, fallbackDate) {
  const today = fallbackDate || new Date().toISOString().slice(0, 10);
  const plan = [];

  for (const sh of sheets) {
    const matrix = sh.matrix || [];
    const found = findHeaderRow(matrix);
    if (found.index < 0) {
      plan.push({ sheet: sh.name, kind: 'unknown', reason: 'No recognisable header row', rows: [] });
      continue;
    }
    const headers = matrix[found.index] || [];
    const kind = classifySheet(sh.name, headers);
    const base = { sheet: sh.name, kind, headerRow: found.index + 1, headers };

    if (kind === 'purchases') {
      const mapping = detectColumns(headers, ['name', 'product', 'qty', 'rate', 'amount', 'date', 'due']);
      plan.push({ ...base, mapping, rows: buildPurchaseRows(matrix, found.index, mapping, today) });
    } else if (kind === 'payments') {
      const mapping = detectColumns(headers, ['name', 'amount', 'date', 'note']);
      plan.push({ ...base, mapping, rows: buildPaymentRows(matrix, found.index, mapping, today) });
    } else if (kind === 'dealers') {
      const mapping = detectColumns(headers, ['name', 'amount', 'phone']);
      plan.push({ ...base, mapping, rows: buildDealerRows(matrix, found.index, mapping) });
    } else {
      plan.push({ ...base, reason: 'Could not tell what this sheet holds', rows: [] });
    }
  }

  // A workbook that carries transactions AND a summary sheet (the shape this
  // app exports) would double-count if both were imported: the summary's
  // pending figure is derived from the very rows on the other sheets. Keep the
  // summary for names and phone numbers, drop its balances.
  const hasTransactions = plan.some((p) => (p.kind === 'purchases' || p.kind === 'payments') && p.rows.some((r) => !r.skip));
  if (hasTransactions) {
    for (const p of plan) {
      if (p.kind !== 'dealers') continue;
      p.balancesIgnored = true;
      for (const r of p.rows) if (!r.skip) r.amount = 0;
    }
  }

  return { plan, hasTransactions };
}
