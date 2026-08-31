// Parsing helpers for the "import dealers from a spreadsheet" flow.
//
// These are deliberately free of React and of the xlsx library so they can be
// tested directly. The caller hands us a matrix (array of row arrays, which is
// what XLSX.utils.sheet_to_json(ws, { header: 1 }) produces) and we work out
// which columns mean what and what each row is worth.

// Header aliases seen in the kind of sheet a shop actually keeps. Compared
// after lowercasing and stripping everything that isn't a letter or digit, so
// "Party Name", "party_name" and "PARTY NAME:" all collapse to "partyname".
const ALIASES = {
  name: ['name', 'dealer', 'dealername', 'party', 'partyname', 'shop', 'shopname', 'firm', 'firmname', 'customer', 'customername', 'account', 'accountname', 'client'],
  amount: ['pending', 'pendingamount', 'balance', 'balanceamount', 'closingbalance', 'outstanding', 'outstandingamount', 'due', 'dueamount', 'amount', 'bal', 'total', 'totaldue', 'remaining'],
  phone: ['phone', 'phoneno', 'phonenumber', 'mobile', 'mobileno', 'mobilenumber', 'contact', 'contactno', 'contactnumber', 'whatsapp', 'whatsappno', 'number'],
};

function key(v) {
  return String(v == null ? '' : v).toLowerCase().replace(/[^a-z0-9]/g, '');
}

// Rupee amounts arrive in a lot of shapes: a real number from Excel, "₹3,32,000"
// as text, "(1,200)" for a credit, "1.5L" written by hand. Returns null when the
// cell is empty or isn't a number at all, so the caller can tell "blank" from 0.
export function parseAmount(value) {
  if (value == null || value === '') return null;
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
  s = s.replace(/[,\s ]/g, '');

  if (!/^\d*\.?\d+$/.test(s)) return null;
  const n = parseFloat(s);
  if (!isFinite(n)) return null;
  return sign * n * multiplier;
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

// The header isn't always the first row — sheets often open with a title or a
// blank line. Scan the top of the file for the row that matches the most
// known column names.
export function findHeaderRow(matrix, limit = 12) {
  let best = { index: -1, score: 0, headers: [] };
  const end = Math.min(matrix.length, limit);
  for (let i = 0; i < end; i++) {
    const row = matrix[i] || [];
    const cols = detectColumns(row);
    let score = 0;
    if (cols.name >= 0) score += 2; // a name column is the one we can't do without
    if (cols.amount >= 0) score += 1;
    if (cols.phone >= 0) score += 1;
    if (score > best.score) best = { index: i, score, headers: row };
  }
  return best.index >= 0 ? best : { index: -1, score: 0, headers: [] };
}

// Returns the column index for each role, or -1 when nothing matched.
//
// A header can look like more than one thing — "Party Balance" contains both a
// name alias and an amount alias — so score every (column, role) pair and take
// the strongest ones first. An exact match always beats a partial one, and a
// longer partial beats a shorter one. Each column and each role is claimed at
// most once, so one column can never fill two roles.
export function detectColumns(headers) {
  const out = { name: -1, amount: -1, phone: -1 };
  const candidates = [];

  (headers || []).forEach((h, i) => {
    const k = key(h);
    if (!k) return;
    for (const role of ['name', 'amount', 'phone']) {
      let best = 0;
      for (const a of ALIASES[role]) {
        if (k === a) best = Math.max(best, 1000 + a.length);          // exact
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

// Turn the rows below the header into import candidates. Every row comes back,
// including the bad ones, each carrying its own error — the UI shows the whole
// sheet so nothing is dropped silently.
export function buildRows(matrix, headerIndex, mapping) {
  const rows = [];
  const seen = new Map(); // lowercased name -> first sheet row it appeared on

  for (let i = headerIndex + 1; i < matrix.length; i++) {
    const raw = matrix[i] || [];
    const nameCell = mapping.name >= 0 ? raw[mapping.name] : '';
    const name = String(nameCell == null ? '' : nameCell).trim();
    const amountCell = mapping.amount >= 0 ? raw[mapping.amount] : '';
    const phoneCell = mapping.phone >= 0 ? raw[mapping.phone] : '';

    // Skip rows that are entirely empty rather than reporting them as errors.
    const blank = raw.every((c) => c == null || String(c).trim() === '');
    if (blank) continue;

    const amount = parseAmount(amountCell);
    const row = {
      sheetRow: i + 1, // 1-based, matching what Excel shows in the row gutter
      name,
      phone: normalizePhone(phoneCell),
      amount: amount == null ? 0 : amount,
      error: '',
    };

    if (!name) {
      row.error = 'No dealer name';
    } else if (/^(total|grand total|sum|closing|opening)\b/i.test(name)) {
      // Shop sheets almost always end with a totals row; importing it as a
      // dealer would be wrong and is easy to miss in a long preview.
      row.error = 'Looks like a totals row';
    } else if (amountCell !== '' && amountCell != null && amount == null) {
      row.error = 'Could not read the amount "' + String(amountCell).trim() + '"';
    } else if (seen.has(name.toLowerCase())) {
      row.error = 'Same name as row ' + seen.get(name.toLowerCase());
    }

    if (name && !row.error) seen.set(name.toLowerCase(), row.sheetRow);
    rows.push(row);
  }
  return rows;
}
