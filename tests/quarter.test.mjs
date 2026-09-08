import { targetQuarter, uploadName, periodMatches, fmt } from '../src/quarter.js';

let pass = 0, fail = 0;
function eq(actual, expected, name) {
  if (actual === expected) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}\n        expected ${expected}\n        actual   ${actual}`); }
}

const on = (s) => targetQuarter(new Date(s + 'T00:00:00Z'));

console.log('R9 - target quarter derivation');
eq(on('2026-09-05').label, '2Q2026', 'today (5 Sep 2026) files 2Q2026');
eq(on('2026-07-10').label, '1Q2026', '10 Jul 2026 still files 1Q2026 - Q2 not released');
eq(on('2026-08-13').label, '1Q2026', '13 Aug 2026, day before release, still 1Q2026');
eq(on('2026-08-14').label, '2Q2026', '14 Aug 2026, release day, flips to 2Q2026');
eq(on('2026-05-14').label, '4Q2025', '14 May 2026, day before Q1 release');
eq(on('2026-05-15').label, '1Q2026', '15 May 2026, Q1 becomes filable');
eq(on('2026-01-20').label, '3Q2025', '20 Jan 2026 crosses the year boundary back to 3Q2025');
eq(on('2026-02-14').label, '4Q2025', '14 Feb 2026, Q4 of the prior year becomes filable');

console.log('\n  the naive rule would be wrong here');
const july = on('2026-07-10');
eq(july.calendarQuarter, 3, 'calendar quarter is Q3');
eq(july.label, '1Q2026', 'but the filable quarter is Q1, not Q2 - two behind, not one');

console.log('\nR10 - annual pass at Q4');
eq(on('2026-02-14').annualPass, true, '4Q triggers the annual column pass');
eq(on('2026-09-05').annualPass, false, '2Q does not');
eq(on('2026-05-15').annualPass, false, '1Q does not');

console.log('\nnext quarter and release dates');
const t = on('2026-09-05');
eq(t.next.label, '3Q2026', 'next quarter is 3Q2026');
eq(fmt(t.next.periodEnd), '30 Sep 2026', '3Q2026 ends 30 Sep 2026');
eq(fmt(t.next.releasedFrom), '14 Nov 2026', '3Q2026 released from 14 Nov 2026');
eq(fmt(t.releasedFrom), '14 Aug 2026', '2Q2026 released from 14 Aug 2026');

console.log('\nfilenames');
eq(uploadName('SAMP', t), 'SAMP - 2Q26.pdf', 'SAMP upload renamed');
eq(uploadName('COMB', on('2026-02-14')), 'COMB - 4Q25.pdf', 'Q4 filename uses the prior year');

console.log('\nperiod matching');
eq(periodMatches({ quarter: 2, year: 2026 }, t).ok, true, 'matching document accepted');
eq(periodMatches({ quarter: 1, year: 2026 }, t).ok, false, 'wrong quarter rejected');
eq(periodMatches(null, t).ok, false, 'undetectable period rejected');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
