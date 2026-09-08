/**
 * Reporting calendar. Playbook R9 and R10.
 *
 * R9  Interim accounts are published 45 days after a quarter ends, so the quarter
 *     you can file is never the quarter you are in. The target is the most recent
 *     quarter whose end date plus 45 days has already passed -- not simply
 *     "this quarter minus one", which is wrong for the 45 days after each quarter end.
 *
 * R10 At Q4 the annual columns are updated too, from the audited annuals. Once a
 *     year, and the easiest step in the process to forget.
 */

export const LAG_DAYS = 45;

const QUARTER_END = { 1: [2, 31], 2: [5, 30], 3: [8, 30], 4: [11, 31] };
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'];

export function quarterEnd(year, q) {
  const [m, d] = QUARTER_END[q];
  return new Date(Date.UTC(year, m, d));
}

export function releaseDate(year, q) {
  const e = quarterEnd(year, q);
  return new Date(e.getTime() + LAG_DAYS * 86400000);
}

function quarterOf(date) {
  return Math.floor(date.getUTCMonth() / 3) + 1;
}

/** The quarter currently being filed, and the one still awaiting release. */
export function targetQuarter(today = new Date()) {
  const t = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  let best = null;
  for (const year of [t.getUTCFullYear(), t.getUTCFullYear() - 1]) {
    for (const q of [1, 2, 3, 4]) {
      if (releaseDate(year, q) <= t) {
        const end = quarterEnd(year, q);
        if (!best || end > best.end) best = { end, q, year };
      }
    }
  }
  if (!best) throw new Error('no released quarter found');

  const nq = best.q === 4 ? 1 : best.q + 1;
  const ny = best.q === 4 ? best.year + 1 : best.year;

  return {
    quarter: best.q,
    year: best.year,
    label: `${best.q}Q${best.year}`,          // header form in the model
    short: `${best.q}Q${String(best.year).slice(-2)}`, // filename form
    periodEnd: best.end,
    releasedFrom: releaseDate(best.year, best.q),
    annualPass: best.q === 4,                  // R10
    calendarQuarter: quarterOf(t),
    next: {
      quarter: nq,
      year: ny,
      label: `${nq}Q${ny}`,
      short: `${nq}Q${String(ny).slice(-2)}`,
      periodEnd: quarterEnd(ny, nq),
      releasedFrom: releaseDate(ny, nq),
    },
  };
}

export function periodDescription(t) {
  const e = t.periodEnd;
  const first = MONTHS[(t.quarter - 1) * 3];
  const last = MONTHS[(t.quarter - 1) * 3 + 2];
  return `${first} to ${last} ${t.year}, ended ${fmt(e)}`;
}

export function fmt(d) {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)} ${d.getUTCFullYear()}`;
}

/** Filename the tool renames an upload to: "SAMP - 2Q26.pdf" */
export function uploadName(bankCode, t, ext = 'pdf') {
  return `${bankCode} - ${t.short}.${ext}`;
}

/** Does a period found inside a PDF match what we are allowed to file? */
export function periodMatches(found, t) {
  if (!found) return { ok: false, reason: 'no reporting period found in the document' };
  if (found.year === t.year && found.quarter === t.quarter) return { ok: true };
  return {
    ok: false,
    reason: `document covers ${found.quarter}Q${found.year}, but ${t.label} is the quarter being filed`,
  };
}
