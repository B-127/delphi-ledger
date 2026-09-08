/**
 * Bank registry. Tab names are the originals -- the renaming proposal was dropped,
 * so nothing here should be "tidied" to match a convention. If a tab name looks
 * inconsistent (loan tab "pb", model tab "AMANA"), that is the workbook talking.
 */

export const BANKS = [
  { code: 'COMB', name: 'Commercial Bank',            modelFS: 'C-FS',   modelF: 'C-F',   loan: 'COMB (BANK)' },
  { code: 'HNB',  name: 'Hatton National Bank',       modelFS: 'H-FS',   modelF: 'H-F',   loan: 'HNB (Bank)' },
  { code: 'SAMP', name: 'Sampath Bank',               modelFS: 'S-FS',   modelF: 'S-F',   loan: 'SAMP (Bank)' },
  { code: 'NDB',  name: 'National Development Bank',  modelFS: 'N-FS',   modelF: 'N-F',   loan: 'NDB (Bank)' },
  { code: 'NTB',  name: 'Nations Trust Bank',         modelFS: 'NT-FS',  modelF: 'NT-F',  loan: 'NTB (Bank)' },
  { code: 'DFCC', name: 'DFCC Bank',                  modelFS: 'D-FS',   modelF: 'D-F',   loan: 'DFCC (Bank)' },
  { code: 'SEYB', name: 'Seylan Bank',                modelFS: 'SEY-FS', modelF: 'SEY-F', loan: 'SEYB (Bank)' },
  { code: 'PABC', name: 'Pan Asia Banking',           modelFS: 'PA-FS',  modelF: 'PA-F',  loan: 'PABC (Bank)' },
  { code: 'UB',   name: 'Union Bank',                 modelFS: 'U-FS',   modelF: 'U-F',   loan: 'UB (Bank)' },
  { code: 'BOC',  name: 'Bank of Ceylon',             modelFS: 'BOC-FS', modelF: null,    loan: 'BOC (Bank)' },
  { code: 'PB',   name: "People's Bank",              modelFS: 'PB-FS',  modelF: null,    loan: 'pb' },
  { code: 'AMANA', name: 'Amana Bank',                modelFS: 'AMANA',  modelF: null,    loan: 'AMANA (Bank)' },
  { code: 'HSBC', name: 'HSBC Sri Lanka',             modelFS: 'HSBC',   modelF: null,    loan: null },
  { code: 'NSB',  name: 'National Savings Bank',      modelFS: 'NSB-FS', modelF: null,    loan: null,
    inactive: 'Out of scope. The tab has not been updated since 4Q2013.' },
];

export const ACTIVE = BANKS.filter((b) => !b.inactive);

export function byCode(code) {
  return BANKS.find((b) => b.code === code);
}

/** Which tabs a bank writes to, for the audit trail. */
export function targetTabs(bank) {
  const t = [];
  if (bank.modelFS) t.push({ workbook: 'model', tab: bank.modelFS });
  if (bank.modelF) t.push({ workbook: 'model', tab: bank.modelF });
  if (bank.loan) t.push({ workbook: 'loan', tab: bank.loan });
  return t;
}
