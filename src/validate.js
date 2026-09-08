/**
 * Validation. This is where accuracy actually comes from.
 *
 * The extractor is allowed to be wrong. These checks are not. Most are identities:
 * a sum that must reproduce a total the bank itself printed, or a derived quarter
 * that must equal a printed one. An identity does not care how a number was read --
 * regex, template, OCR or a person typing -- so a misread digit breaks the sum and
 * the write is stopped.
 *
 * Severity:
 *   blocking  the number is provably wrong. Nothing is written.
 *   confirm   the number may be right but is unusual. A person decides.
 */

export const TOLERANCE = 0.5;          // absolute, in the sheet's own units
export const REL_TOLERANCE = 1e-6;
export const CONTINUITY_LIMIT = 0.25;  // 25% QoQ movement asks for confirmation

function agrees(a, b) {
  if (a == null || b == null) return false;
  const d = Math.abs(a - b);
  return d <= TOLERANCE || d <= REL_TOLERANCE * Math.max(Math.abs(a), Math.abs(b));
}

const check = (id, name, status, detail, residual = null) =>
  ({ id, name, status, detail, residual });

/**
 * @param {object} ex   extraction result
 * @param {object} prev previous-quarter values from the workbook, keyed by field
 */
export function validate(ex, prev = {}) {
  const out = [];

  // 1. Balance sheet cross-foots.
  if (ex.totalAssets != null && ex.totalLiabilities != null && ex.equity != null) {
    const rhs = ex.totalLiabilities + ex.equity;
    out.push(agrees(ex.totalAssets, rhs)
      ? check('bs-foot', 'Balance sheet cross-foots', 'pass', 'assets equal liabilities plus equity', 0)
      : check('bs-foot', 'Balance sheet cross-foots', 'blocking',
          'assets do not equal liabilities plus equity', round(ex.totalAssets - rhs)));
  }

  // 2. Each printed subtotal is reproduced by its own components.
  for (const s of ex.subtotals || []) {
    const sum = s.components.reduce((a, b) => a + (b ?? 0), 0);
    out.push(agrees(sum, s.printed)
      ? check(`foot-${s.id}`, `${s.name} foots to printed total`, 'pass', null, 0)
      : check(`foot-${s.id}`, `${s.name} foots to printed total`, 'blocking',
          'components do not reproduce the printed total', round(sum - s.printed)));
  }

  // 3. A derived quarter must equal the printed quarter where both exist.
  //    Cumulative filings mean Q2 = half-year less Q1; if the bank also prints the
  //    quarter, the two must agree.
  let dq = 0, dqBad = 0;
  for (const d of ex.derivedQuarters || []) {
    if (d.printed == null || d.derived == null) continue;
    dq++;
    if (!agrees(d.derived, d.printed)) dqBad++;
  }
  if (dq) {
    out.push(dqBad === 0
      ? check('derived-q', 'Derived quarter matches printed quarter', 'pass', `${dq} of ${dq}`, 0)
      : check('derived-q', 'Derived quarter matches printed quarter', 'blocking',
          `${dq - dqBad} of ${dq} agree`, dqBad));
  }

  // 4. Comparatives must match what the model already holds for the prior period.
  //    This is the anchor test: it identifies rows independently of their labels,
  //    which is what saves you when a bank reorders or relabels its statement.
  let anchored = 0, drifted = [];
  for (const [field, priorFromReport] of Object.entries(ex.comparatives || {})) {
    if (prev[field] == null || priorFromReport == null) continue;
    anchored++;
    if (!agrees(priorFromReport, prev[field])) drifted.push(field);
  }
  if (anchored) {
    out.push(drifted.length === 0
      ? check('anchor', 'Comparatives match the model', 'pass', `${anchored} rows anchored`, 0)
      : check('anchor', 'Comparatives match the model', 'blocking',
          `${drifted.slice(0, 4).join(', ')}${drifted.length > 4 ? ` and ${drifted.length - 4} more` : ''}`,
          drifted.length));
  }

  // 5. Continuity. Not an identity -- a size rule. Large moves are often real, so
  //    this asks rather than blocks.
  for (const [field, value] of Object.entries(ex.values || {})) {
    const before = prev[field];
    if (before == null || value == null || before === 0) continue;
    const move = (value - before) / Math.abs(before);
    if (Math.abs(move) > CONTINUITY_LIMIT) {
      out.push(check(`cont-${field}`, `${label(field)} moves ${pct(move)} on the quarter`,
        'confirm', 'large but not impossible; confirm against the report', round(move * 100)));
    }
  }

  // 6. Nothing may be blank that the model expects.
  const missing = (ex.required || []).filter((f) => ex.values?.[f] == null);
  if (missing.length) {
    out.push(check('missing', 'Every required row was found', 'blocking',
      `${missing.slice(0, 5).join(', ')}${missing.length > 5 ? ` and ${missing.length - 5} more` : ''}`,
      missing.length));
  }

  // 7. OCR provenance is disclosed rather than hidden.
  if (ex.ocrUsed) {
    out.push(check('ocr', 'Figures were read by OCR', 'confirm',
      'no text layer in this PDF; the identity checks above still apply', null));
  }

  const blocking = out.filter((c) => c.status === 'blocking').length;
  const confirm = out.filter((c) => c.status === 'confirm').length;
  return {
    checks: out,
    blocking,
    confirm,
    verdict: blocking ? 'held' : confirm ? 'review' : 'clear',
  };
}

const round = (n) => Math.round(n * 1000) / 1000;
const pct = (x) => `${x > 0 ? '+' : ''}${Math.round(x * 100)}%`;
const label = (f) => f.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase());
