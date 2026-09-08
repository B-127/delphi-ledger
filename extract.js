/**
 * Extraction.
 *
 * pdf.js gives text with x/y positions, so table structure is rebuilt by clustering
 * those positions rather than trusting reading order. Reading order is the thing that
 * breaks: BOC has been seen flipping column order between rows of the same table.
 *
 * No LLM runs here. Rows are found by label, then confirmed by the anchor test --
 * the comparative column in the report must match what the model already holds for
 * the prior quarter. A row that anchors has identified itself, whatever its label says.
 *
 * OCR is a fallback, not a dependency. It loads only when a PDF has no text layer.
 */

const PDFJS_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.min.mjs';
const PDFJS_WORKER = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.6.82/pdf.worker.min.mjs';
const TESSERACT_URL = 'https://cdnjs.cloudflare.com/ajax/libs/tesseract.js/5.1.1/tesseract.esm.min.js';

let pdfjs = null;
async function loadPdfjs() {
  if (!pdfjs) {
    pdfjs = await import(PDFJS_URL);
    pdfjs.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
  }
  return pdfjs;
}

const ROW_TOLERANCE = 2.5;   // points; items within this share a line

/** Text items grouped into lines, each line's items ordered left to right. */
export async function readLines(buf) {
  const lib = await loadPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages = [];
  let glyphs = 0;

  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    const items = content.items
      .filter((i) => i.str && i.str.trim())
      .map((i) => ({ text: i.str, x: i.transform[4], y: i.transform[5], w: i.width }));
    glyphs += items.reduce((a, i) => a + i.text.length, 0);

    const lines = [];
    for (const it of items) {
      const line = lines.find((l) => Math.abs(l.y - it.y) <= ROW_TOLERANCE);
      if (line) line.items.push(it);
      else lines.push({ y: it.y, items: [it] });
    }
    for (const l of lines) l.items.sort((a, b) => a.x - b.x);
    lines.sort((a, b) => b.y - a.y);
    pages.push({ page: p, lines });
  }
  return { pages, hasTextLayer: glyphs > 200, ocrUsed: false, numPages: doc.numPages };
}

/** Rasterise and OCR. Only called when readLines finds no usable text layer. */
export async function readLinesViaOcr(buf, onProgress = () => {}) {
  const lib = await loadPdfjs();
  const { createWorker } = await import(TESSERACT_URL);
  const doc = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
  const worker = await createWorker('eng');
  const pages = [];

  try {
    for (let p = 1; p <= doc.numPages; p++) {
      onProgress(p, doc.numPages);
      const page = await doc.getPage(p);
      const viewport = page.getViewport({ scale: 2.5 });
      const canvas = document.createElement('canvas');
      canvas.width = viewport.width; canvas.height = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
      const { data } = await worker.recognize(canvas, {}, { blocks: true });
      const lines = (data.blocks || []).flatMap((b) =>
        (b.paragraphs || []).flatMap((par) => (par.lines || []).map((l) => ({
          y: viewport.height - l.bbox.y0,
          items: (l.words || []).map((w) => ({
            text: w.text, x: w.bbox.x0, y: viewport.height - w.bbox.y0, w: w.bbox.x1 - w.bbox.x0,
            confidence: w.confidence,
          })),
        }))));
      pages.push({ page: p, lines });
      canvas.width = canvas.height = 0;
    }
  } finally {
    await worker.terminate();
  }
  return { pages, hasTextLayer: false, ocrUsed: true, numPages: doc.numPages };
}

export async function read(buf, onProgress) {
  const first = await readLines(buf);
  if (first.hasTextLayer) return first;
  return readLinesViaOcr(buf, onProgress);
}

// ------------------------------------------------------------------- parsing

const NUM = /^\(?-?[\d,]+(?:\.\d+)?\)?$/;

export function toNumber(s) {
  if (typeof s === 'number') return s;
  const t = String(s).trim().replace(/[\u2212\u2013\u2014]/g, '-');
  if (t === '-' || t === '' || t === '—') return 0;
  if (!NUM.test(t)) return null;
  const neg = t.startsWith('(') && t.endsWith(')');
  const n = parseFloat(t.replace(/[(),]/g, ''));
  if (!isFinite(n)) return null;
  return neg ? -n : n;
}

/** Split a line into its label and its numeric cells, keeping x positions. */
export function splitLine(line) {
  const label = [];
  const cells = [];
  for (const it of line.items) {
    const n = toNumber(it.text);
    if (n === null) {
      if (!cells.length) label.push(it.text);
    } else {
      cells.push({ value: n, x: it.x, confidence: it.confidence });
    }
  }
  return { label: label.join(' ').replace(/\s+/g, ' ').trim(), cells };
}

/** Find the reporting period stated in the document. */
export function detectPeriod(doc) {
  const text = doc.pages.flatMap((p) => p.lines.map((l) => l.items.map((i) => i.text).join(' ')))
    .join('\n');

  const monthQ = {
    march: 1, mar: 1, june: 2, jun: 2, september: 3, sep: 3, sept: 3, december: 4, dec: 4,
  };
  const m1 = text.match(/(?:as at|as of|period ended|quarter ended|three months ended|for the (?:three|six|nine|twelve) months ended)[^\n]{0,40}?(\d{1,2})?\s*(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)[^\n]{0,10}?(20\d\d)/i);
  if (m1) {
    const q = monthQ[m1[2].toLowerCase()];
    if (q) return { quarter: q, year: +m1[3], evidence: m1[0].trim().slice(0, 90) };
  }
  const m2 = text.match(/([1-4])\s*Q\s*(20\d\d)/i) || text.match(/Q\s*([1-4])\s*(20\d\d)/i);
  if (m2) return { quarter: +m2[1], year: +m2[2], evidence: m2[0] };
  return null;
}

/**
 * Apply a bank template. A template names the rows it wants and how to recognise
 * them; nothing here guesses.
 */
export function applyTemplate(doc, template, prev = {}) {
  const lines = doc.pages.flatMap((p) => p.lines).map(splitLine).filter((l) => l.cells.length);
  const values = {};
  const comparatives = {};
  const unmatched = [];

  for (const row of template.rows) {
    const candidates = lines.filter((l) => matches(l.label, row));
    if (!candidates.length) { unmatched.push(row.field); continue; }

    let chosen = candidates[0];
    if (candidates.length > 1 && prev[row.field] != null) {
      // anchor test: prefer the line whose comparative column matches the model
      const anchored = candidates.find((c) =>
        c.cells.some((cell) => Math.abs(cell.value - prev[row.field]) <= 0.5));
      if (anchored) chosen = anchored;
    }
    const cur = chosen.cells[row.currentIndex ?? 0];
    const cmp = chosen.cells[row.comparativeIndex ?? 1];
    if (cur) values[row.field] = row.scale ? cur.value * row.scale : cur.value;
    if (cmp) comparatives[row.field] = row.scale ? cmp.value * row.scale : cmp.value;
  }

  return {
    values,
    comparatives,
    unmatched,
    required: template.rows.filter((r) => r.required !== false).map((r) => r.field),
    subtotals: (template.subtotals || []).map((s) => ({
      id: s.id, name: s.name,
      printed: values[s.printed],
      components: s.components.map((c) => values[c]),
    })),
    derivedQuarters: [],
    ocrUsed: doc.ocrUsed,
    totalAssets: values.totalAssets,
    totalLiabilities: values.totalLiabilities,
    equity: values.shareholdersFunds,
  };
}

function matches(label, row) {
  const l = label.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (row.exact) return l === row.exact.toLowerCase();
  if (row.pattern) return new RegExp(row.pattern, 'i').test(l);
  return row.any.some((a) => l.includes(a.toLowerCase()));
}
