import { targetQuarter, periodDescription, fmt, uploadName, periodMatches } from './quarter.js';
import { BANKS, ACTIVE, byCode, targetTabs } from './banks.js';
import { read, detectPeriod, applyTemplate } from './extract.js';
import { templateFor, templateStatus } from './templates.js';
import { validate } from './validate.js';
import { Workbook } from './workbook.js';

const T = targetQuarter();
const state = {
  workbooks: { model: null, loan: null },
  banks: new Map(),   // code -> { status, file, result, extraction }
};

// ---------------------------------------------------------------- quarter

function paintQuarter() {
  document.getElementById('q-label').textContent = T.short;
  document.getElementById('q-head').textContent = periodDescription(T);
  document.getElementById('q-detail').textContent =
    `Accounts have been available since ${fmt(T.releasedFrom)}.`;
  document.getElementById('q-next').textContent =
    `${T.next.short} ends ${fmt(T.next.periodEnd)} and is not filable until ${fmt(T.next.releasedFrom)}.`;
  document.getElementById('q-total').textContent = String(ACTIVE.length);
  document.getElementById('annual').hidden = !T.annualPass;
}

function paintCount() {
  const filed = [...state.banks.values()].filter((b) => b.status === 'filed').length;
  document.getElementById('q-filed').textContent = String(filed);
}

// ---------------------------------------------------------------- bank grid

function paintGrid() {
  const grid = document.getElementById('grid');
  grid.textContent = '';
  for (const bank of BANKS) {
    const s = state.banks.get(bank.code);
    const status = bank.inactive ? 'out' : (s?.status ?? 'empty');

    const el = document.createElement(bank.inactive ? 'div' : 'label');
    el.className = 'bank';
    el.dataset.state = status;
    if (!bank.inactive) el.tabIndex = 0;

    const top = document.createElement('div');
    top.className = 'bank-top';
    const code = document.createElement('span');
    code.className = 'bank-code';
    code.textContent = bank.code;
    top.append(code);
    el.append(top);

    const name = document.createElement('span');
    name.className = 'bank-name';
    name.textContent = bank.name;
    el.append(name);

    const st = document.createElement('span');
    st.className = 'bank-state';
    st.textContent = stateText(bank, s);
    el.append(st);

    if (!bank.inactive) {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.pdf';
      input.addEventListener('change', (e) => {
        const f = e.target.files?.[0];
        if (f) handleUpload(bank, f);
        e.target.value = '';
      });
      el.append(input);
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); }
      });
    }
    grid.append(el);
  }
  paintCount();
}

function stateText(bank, s) {
  if (bank.inactive) return 'out of scope';
  if (!s) return 'drop a PDF';
  if (s.status === 'working') return s.note ?? 'reading';
  if (s.status === 'filed') return uploadName(bank.code, T);
  if (s.status === 'held') return `${s.result.blocking} check${s.result.blocking === 1 ? '' : 's'} failed`;
  if (s.status === 'review') return `${s.result.confirm} to confirm`;
  return 'drop a PDF';
}

function setBank(code, patch) {
  state.banks.set(code, { ...(state.banks.get(code) ?? {}), ...patch });
  paintGrid();
}

// ---------------------------------------------------------------- upload

async function handleUpload(bank, file) {
  if (!state.workbooks.model || !state.workbooks.loan) {
    setBank(bank.code, { status: 'held', result: { blocking: 1, confirm: 0, checks: [
      { id: 'no-wb', name: 'Workbooks are loaded', status: 'blocking',
        detail: 'Load the banking model and loan composition workbooks first.' },
    ] } });
    showReview(bank);
    return;
  }

  setBank(bank.code, { status: 'working', note: 'reading', file });
  try {
    const buf = await file.arrayBuffer();

    const doc = await read(buf, (p, n) =>
      setBank(bank.code, { status: 'working', note: `reading page ${p} of ${n}` }));

    if (doc.ocrUsed) setBank(bank.code, { status: 'working', note: 'read by OCR' });

    const period = detectPeriod(doc);
    const m = periodMatches(period, T);
    if (!m.ok) {
      setBank(bank.code, {
        status: 'held',
        result: { blocking: 1, confirm: 0, checks: [
          { id: 'period', name: 'Document covers the quarter being filed',
            status: 'blocking', detail: m.reason },
        ] },
      });
      showReview(bank);
      return;
    }

    const prev = priorValues(bank);
    const ex = applyTemplate(doc, templateFor(bank.code), prev);
    const result = validate(ex, prev);

    setBank(bank.code, {
      status: result.verdict === 'clear' ? 'filed' : result.verdict,
      result, extraction: ex, period, file,
    });

    if (result.verdict === 'clear') writeToWorkbooks(bank, ex);
    showReview(bank);
  } catch (err) {
    setBank(bank.code, { status: 'held', result: { blocking: 1, confirm: 0, checks: [
      { id: 'read', name: 'Document could be read', status: 'blocking', detail: String(err.message ?? err) },
    ] } });
    showReview(bank);
  }
  refreshActions();
}

/** Prior-quarter values from the model, used for the anchor and continuity tests. */
function priorValues(bank) {
  const wb = state.workbooks.model;
  if (!wb || !bank.modelFS) return {};
  try {
    const prevLabel = `${T.next.quarter === 1 ? 4 : T.quarter - 1}Q${T.quarter === 1 ? T.year - 1 : T.year}`;
    const col = wb.findHeaderColumn(bank.modelFS, prevLabel);
    return col ? { _column: col } : {};
  } catch { return {}; }
}

// ---------------------------------------------------------------- writing

function writeToWorkbooks(bank, ex) {
  const wb = state.workbooks.model;
  const target = wb.findHeaderColumn(bank.modelFS, T.label);
  if (!target) {
    // a new quarter starts a new column; the header is written first
    const last = wb.lastHeaderColumn(bank.modelFS);
    const next = nextColumn(last);
    wb.setText(bank.modelFS, `${next}1`, T.label);
  }
}

function nextColumn(letters) {
  if (!letters) return 'B';
  let n = [...letters].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) + 1;
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = ((n - m) / 26) | 0; }
  return s;
}

// ---------------------------------------------------------------- review

function showReview(bank) {
  const s = state.banks.get(bank.code);
  const sec = document.getElementById('review');
  const head = document.getElementById('review-head');
  const body = document.getElementById('review-body');
  body.textContent = '';

  if (!s?.result) { sec.hidden = true; return; }
  sec.hidden = false;
  head.textContent = s.status === 'filed'
    ? `${bank.name} — ${T.label} filed`
    : `${bank.name} — ${T.label} held for review`;

  for (const c of s.result.checks) {
    const row = document.createElement('div');
    row.className = `check ${c.status}`;
    const mark = document.createElement('span');
    mark.className = 'check-mark';
    mark.textContent = c.status === 'pass' ? '\u2713' : c.status === 'blocking' ? '\u2717' : '!';
    const text = document.createElement('div');
    text.append(document.createTextNode(c.name));
    if (c.detail) {
      const d = document.createElement('span');
      d.className = 'check-detail';
      d.textContent = c.detail;
      text.append(d);
    }
    const res = document.createElement('span');
    res.className = 'check-residual';
    res.textContent = c.residual == null ? '' : String(c.residual);
    row.append(mark, text, res);
    body.append(row);
  }

  const foot = document.createElement('p');
  foot.className = 'review-foot';
  foot.textContent = s.result.blocking
    ? 'Nothing has been written to the workbooks. A failed identity means one of the figures behind it is wrong, so the sum does not close.'
    : s.result.confirm
      ? 'These figures are unusual rather than provably wrong. Check them against the report before accepting.'
      : `Written to ${targetTabs(bank).map((t) => t.tab).join(', ')}.`;
  body.append(foot);

  if (s.result.confirm && !s.result.blocking) {
    const actions = document.createElement('div');
    actions.className = 'review-actions';
    const accept = document.createElement('button');
    accept.className = 'primary';
    accept.textContent = 'Accept and file';
    accept.addEventListener('click', () => {
      writeToWorkbooks(bank, s.extraction);
      setBank(bank.code, { status: 'filed' });
      showReview(bank);
      refreshActions();
    });
    const reject = document.createElement('button');
    reject.className = 'ghost';
    reject.textContent = 'Discard this upload';
    reject.addEventListener('click', () => {
      state.banks.delete(bank.code);
      paintGrid();
      document.getElementById('review').hidden = true;
    });
    actions.append(accept, reject);
    body.append(actions);
  }
}

// ---------------------------------------------------------------- workbooks

async function loadWorkbook(kind, file) {
  const buf = await file.arrayBuffer();
  state.workbooks[kind] = new Workbook(buf, file.name);
  const slot = document.getElementById(`wb-${kind}`).closest('.wb-slot');
  slot.dataset.loaded = 'yes';
  document.getElementById(`wb-${kind}-state`).textContent =
    `${file.name} · ${state.workbooks[kind].sheetNames().length} tabs`;
  refreshActions();
}

function refreshActions() {
  const ready = state.workbooks.model && state.workbooks.loan;
  const filed = [...state.banks.values()].some((b) => b.status === 'filed');
  document.getElementById('save').disabled = !(ready && filed);
  document.getElementById('manifest').disabled = !filed;
}

function saveWorkbooks() {
  for (const kind of ['model', 'loan']) {
    const wb = state.workbooks[kind];
    if (!wb) continue;
    wb.setFullCalcOnLoad();
    download(wb.toBlob(), wb.filename);
  }
}

function saveManifest() {
  const entries = [];
  for (const [code, s] of state.banks) {
    if (s.status !== 'filed' || !s.file) continue;
    const bank = byCode(code);
    download(s.file, uploadName(code, T));
    entries.push({
      bank: code, name: bank.name, quarter: T.label,
      sourceFile: s.file.name, storedAs: uploadName(code, T),
      bytes: s.file.size, readBy: s.extraction?.ocrUsed ? 'ocr' : 'text layer',
      template: templateStatus(code),
      tabs: targetTabs(bank).map((t) => `${t.workbook}:${t.tab}`),
      checks: s.result?.checks.map((c) => ({ id: c.id, status: c.status, residual: c.residual })),
      filedAt: new Date().toISOString(),
    });
  }
  const manifest = { quarter: T.label, periodEnd: T.periodEnd.toISOString().slice(0, 10),
    releasedFrom: T.releasedFrom.toISOString().slice(0, 10), entries };
  download(new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' }),
    `manifest - ${T.short}.json`);
}

function download(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ---------------------------------------------------------------- theme

function initTheme() {
  const btn = document.getElementById('theme');
  const stored = localStorage.getItem('theme');
  const dark = stored ? stored === 'dark'
    : matchMedia('(prefers-color-scheme: dark)').matches;
  apply(dark);
  btn.addEventListener('click', () =>
    apply(document.documentElement.dataset.theme !== 'dark'));

  function apply(isDark) {
    document.documentElement.dataset.theme = isDark ? 'dark' : 'light';
    btn.textContent = isDark ? 'Light' : 'Dark';
    btn.setAttribute('aria-label', `Switch to ${isDark ? 'light' : 'dark'} theme`);
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
  }
}

// ---------------------------------------------------------------- start

paintQuarter();
paintGrid();
initTheme();
document.getElementById('wb-model').addEventListener('change', (e) =>
  e.target.files[0] && loadWorkbook('model', e.target.files[0]));
document.getElementById('wb-loan').addEventListener('change', (e) =>
  e.target.files[0] && loadWorkbook('loan', e.target.files[0]));
document.getElementById('save').addEventListener('click', saveWorkbooks);
document.getElementById('manifest').addEventListener('click', saveManifest);
