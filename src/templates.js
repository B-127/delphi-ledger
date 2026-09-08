/**
 * Extraction templates.
 *
 * The base template covers the rows that every Sri Lankan bank's interim statement
 * carries under the same LKAS/SLFRS headings. Per-bank overrides exist for the ones
 * that differ, and a bank with no override uses the base.
 *
 * Templates are authored against real filings. The rows below are the model's own
 * row labels; the `any` lists are the wordings observed in published statements.
 * When a bank redesigns its statements, the fix belongs here and nowhere else.
 *
 * currentIndex / comparativeIndex are positions among the numeric cells on a line:
 * 0 is the current period, 1 the comparative. Where a bank prints four columns
 * (quarter and cumulative, each with a comparative), the override says so.
 */

export const BASE = {
  id: 'base',
  rows: [
    { field: 'cashInHand', any: ['cash in hand', 'cash and cash equivalents'] },
    { field: 'balancesWithCentralBank', any: ['balances with central bank', 'balance with central bank'] },
    { field: 'dueFromBanks', any: ['due from banks', 'placements with banks'] },
    { field: 'derivativeAssets', any: ['derivative financial instruments', 'derivative assets'], required: false },
    { field: 'loansAndAdvances', any: ['financial assets at amortised cost loans and receivables', 'loans and advances to customers', 'loans and receivables to other customers'] },
    { field: 'fvtplAssets', any: ['financial assets recognised through profit or loss', 'financial assets at fair value through profit or loss'], required: false },
    { field: 'fvociAssets', any: ['fair value through other comprehensive income'], required: false },
    { field: 'debtInstruments', any: ['amortised cost debt and other instruments', 'debt and other financial instruments'], required: false },
    { field: 'investmentInAssociates', any: ['investment in associates', 'investments in associates'], required: false },
    { field: 'propertyPlantEquipment', any: ['property plant', 'property, plant'] },
    { field: 'intangibleAssets', any: ['intangible assets'], required: false },
    { field: 'deferredTaxAsset', any: ['deferred tax asset'], required: false },
    { field: 'otherAssets', any: ['other assets'] },
    { field: 'totalAssets', any: ['total assets', 'total on balance sheet assets'] },

    { field: 'totalDeposits', any: ['due to depositors', 'total deposits', 'deposits from customers'] },
    { field: 'totalBorrowings', any: ['due to other borrowers', 'total borrowings', 'other borrowings'] },
    { field: 'derivativeLiabilities', any: ['derivative financial liabilities'], required: false },
    { field: 'currentTaxLiability', any: ['current tax liabilities', 'current taxation'], required: false },
    { field: 'otherLiabilities', any: ['other liabilities'] },
    { field: 'totalLiabilities', any: ['total liabilities', 'total on balance sheet liabilities'] },

    { field: 'statedCapital', any: ['stated capital'] },
    { field: 'statutoryReserve', any: ['statutory reserve'] },
    { field: 'retainedEarnings', any: ['retained earnings'] },
    { field: 'otherReserves', any: ['other reserves', 'total other reserves'], required: false },
    { field: 'shareholdersFunds', any: ['total shareholders funds', 'total equity', 'shareholders funds'] },

    { field: 'interestIncome', any: ['interest income', 'gross income'] },
    { field: 'interestExpense', any: ['interest expenses', 'interest expense'] },
    { field: 'netInterestIncome', any: ['net interest income'] },
    { field: 'feeIncome', any: ['net fee and commission income', 'fee and commission income'] },
    { field: 'impairment', any: ['impairment charge', 'impairment for loans', 'credit loss expense'] },
    { field: 'operatingExpenses', any: ['total operating expenses', 'operating expenses'] },
    { field: 'profitBeforeTax', any: ['profit before tax', 'profit before income tax'] },
    { field: 'profitAfterTax', any: ['profit for the period', 'profit after tax'] },
  ],
  subtotals: [
    {
      id: 'equity', name: 'Shareholders funds',
      printed: 'shareholdersFunds',
      components: ['statedCapital', 'statutoryReserve', 'retainedEarnings', 'otherReserves'],
    },
  ],
};

/**
 * Per-bank overrides. Only the differences: a bank absent from here uses BASE.
 * These are stubs pending authoring against real filings -- see README.
 */
export const OVERRIDES = {
  BOC: {
    note: 'Column order has been observed flipping between rows of the same table. '
        + 'The anchor test carries the identification here, not position.',
  },
  AMANA: {
    note: 'Islamic banking. Interest lines appear as profit-sharing equivalents; '
        + 'the interest fields need their own wordings.',
    rows: [
      { field: 'interestIncome', any: ['income from islamic banking', 'financing income'] },
      { field: 'interestExpense', any: ['profit paid to depositors', 'distribution to depositors'] },
    ],
  },
  HSBC: {
    note: 'Branch of a foreign bank. No stated capital or statutory reserve in the '
        + 'usual form; equity rows differ.',
  },
};

export function templateFor(code) {
  const o = OVERRIDES[code];
  if (!o || !o.rows) return { ...BASE, id: code, note: o?.note };
  const rows = BASE.rows.map((r) => o.rows.find((x) => x.field === r.field) || r);
  for (const r of o.rows) if (!rows.some((x) => x.field === r.field)) rows.push(r);
  return { ...BASE, id: code, rows, note: o.note };
}

/** Which banks still need a template authored against real filings. */
export function templateStatus(code) {
  return OVERRIDES[code]?.rows ? 'tailored' : (OVERRIDES[code] ? 'base, notes pending' : 'base');
}
