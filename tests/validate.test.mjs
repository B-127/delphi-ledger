import { validate, CONTINUITY_LIMIT } from '../src/validate.js';

let pass = 0, fail = 0;
function eq(actual, expected, name) {
  if (actual === expected) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}\n        expected ${expected}\n        actual   ${actual}`); }
}
const find = (r, id) => r.checks.find((c) => c.id === id);

console.log('balance sheet identity');
let r = validate({ totalAssets: 1000, totalLiabilities: 800, equity: 200 });
eq(find(r, 'bs-foot').status, 'pass', 'assets equal liabilities plus equity');
eq(r.verdict, 'clear', 'nothing to review');

r = validate({ totalAssets: 1000, totalLiabilities: 800, equity: 190 });
eq(find(r, 'bs-foot').status, 'blocking', 'a 10 gap blocks the write');
eq(find(r, 'bs-foot').residual, 10, 'residual is reported, not hidden');
eq(r.verdict, 'held', 'verdict is held');

console.log('\nsubtotals reproduce printed totals');
r = validate({ subtotals: [{ id: 'eq', name: 'Equity', printed: 300, components: [100, 150, 50] }] });
eq(find(r, 'foot-eq').status, 'pass', 'components foot to the printed total');

r = validate({ subtotals: [{ id: 'eq', name: 'Equity', printed: 300, components: [100, 150, 30] }] });
eq(find(r, 'foot-eq').status, 'blocking', 'a short component blocks');
eq(find(r, 'foot-eq').residual, -20, 'residual signed toward the shortfall');

console.log('\na misread digit is caught by arithmetic, not judgement');
r = validate({ subtotals: [{ id: 'l', name: 'Loan book', printed: 2402884, components: [1493776, 909108] }] });
eq(find(r, 'foot-l').status, 'pass', 'correct figures foot');
r = validate({ subtotals: [{ id: 'l', name: 'Loan book', printed: 2402884, components: [1498776, 909108] }] });
eq(find(r, 'foot-l').status, 'blocking', 'a 3 read as an 8 breaks the sum');

console.log('\nanchor test against the model');
r = validate({ comparatives: { loansAndAdvances: 2341009 } }, { loansAndAdvances: 2341009 });
eq(find(r, 'anchor').status, 'pass', 'comparative matches the prior quarter in the model');
r = validate({ comparatives: { loansAndAdvances: 2341009 } }, { loansAndAdvances: 2286571 });
eq(find(r, 'anchor').status, 'blocking', 'a mismatch means the row was misidentified');

console.log('\nderived quarter against printed quarter');
r = validate({ derivedQuarters: [{ derived: 500, printed: 500 }, { derived: 300, printed: 300 }] });
eq(find(r, 'derived-q').status, 'pass', 'both agree');
r = validate({ derivedQuarters: [{ derived: 500, printed: 500 }, { derived: 300, printed: 280 }] });
eq(find(r, 'derived-q').status, 'blocking', 'one disagreement is enough to hold');

console.log('\ncontinuity asks rather than blocks');
r = validate({ values: { impairment: 148 } }, { impairment: 100 });
eq(find(r, 'cont-impairment').status, 'confirm', 'a 48% move asks for confirmation');
eq(r.verdict, 'review', 'review, not held');
eq(r.blocking, 0, 'nothing blocking');
r = validate({ values: { impairment: 110 } }, { impairment: 100 });
eq(find(r, 'cont-impairment'), undefined, 'a 10% move passes silently');

console.log('\nmissing rows and OCR provenance');
r = validate({ required: ['totalAssets', 'totalDeposits'], values: { totalAssets: 5 } });
eq(find(r, 'missing').status, 'blocking', 'a required row that was not found blocks');
r = validate({ ocrUsed: true });
eq(find(r, 'ocr').status, 'confirm', 'OCR is disclosed, not hidden');

console.log('\nthresholds');
eq(CONTINUITY_LIMIT, 0.25, 'continuity limit is 25%');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
