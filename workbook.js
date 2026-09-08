/**
 * Workbook write path.
 *
 * An .xlsx/.xlsm is a zip of XML. This opens it, edits only the cells it is told to,
 * and rezips. Every part it does not touch stays byte-identical, which is why charts
 * (150 in the master), the VBA project and conditional formatting all survive.
 *
 * SheetJS and ExcelJS both discard macros, and SheetJS's community build discards
 * charts. Neither can be used here.
 *
 * Values are written as numbers. Headers are written as inline strings so that
 * sharedStrings.xml is never mutated -- a shared string is shared, and editing one
 * would silently change every other cell using it.
 */

import { unzipSync, zipSync, strToU8, strFromU8 } from './vendor/fflate.js';

const COL = (n) => {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = ((n - m) / 26) | 0; }
  return s;
};
const COLNUM = (s) => [...s].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);

export class Workbook {
  constructor(buf, filename) {
    this.filename = filename;
    this.files = unzipSync(new Uint8Array(buf));
    this.dirty = new Set();
    this._mapSheets();
  }

  _xml(path) { return strFromU8(this.files[path]); }
  _setXml(path, s) { this.files[path] = strToU8(s); this.dirty.add(path); }

  _mapSheets() {
    const wb = this._xml('xl/workbook.xml');
    const rels = this._xml('xl/_rels/workbook.xml.rels');
    const rid = {};
    for (const m of rels.matchAll(/Id="(rId\d+)"[^>]*Target="([^"]+)"/g)) rid[m[1]] = m[2];
    this.sheets = {};
    for (const m of wb.matchAll(/<sheet name="([^"]+)"[^>]*r:id="(rId\d+)"/g)) {
      const t = rid[m[2]];
      if (t) this.sheets[decodeXml(m[1])] = 'xl/' + t.replace(/^\/?(xl\/)?/, '');
    }
  }

  sheetNames() { return Object.keys(this.sheets); }

  /** Find the column whose row-1 header equals `label`. Null if absent. */
  findHeaderColumn(sheetName, label, headerRow = 1) {
    const xml = this._xml(this.sheets[sheetName]);
    const row = rowXml(xml, headerRow);
    if (!row) return null;
    for (const m of row.matchAll(/<c r="([A-Z]+)\d+"([^>]*)(?:\/>|>(.*?)<\/c>)/gs)) {
      const text = cellText(m[2], m[3] || '', this);
      if (text != null && String(text).trim() === label) return m[1];
    }
    return null;
  }

  /** Rightmost column that holds anything in the header row. */
  lastHeaderColumn(sheetName, headerRow = 1) {
    const xml = this._xml(this.sheets[sheetName]);
    const row = rowXml(xml, headerRow);
    if (!row) return null;
    let last = null;
    for (const m of row.matchAll(/<c r="([A-Z]+)\d+"/g)) last = m[1];
    return last;
  }

  /**
   * Write a numeric value. Refuses to overwrite a formula -- the model computes its
   * own derived rows, and a collection tool has no business replacing one with a
   * constant.
   */
  setNumber(sheetName, ref, value) {
    return this._setCell(sheetName, ref, `<v>${numToXml(value)}</v>`, null);
  }

  setText(sheetName, ref, text) {
    return this._setCell(sheetName, ref, `<is><t xml:space="preserve">${escapeXml(text)}</t></is>`, 'inlineStr');
  }

  _setCell(sheetName, ref, inner, type) {
    const path = this.sheets[sheetName];
    if (!path) throw new Error(`no sheet named ${sheetName}`);
    let xml = this._xml(path);
    const rowN = parseInt(ref.match(/\d+/)[0], 10);
    const colL = ref.match(/^[A-Z]+/)[0];

    const cellRe = new RegExp(`<c r="${ref}"([^>]*)(?:/>|>(.*?)</c>)`, 's');
    const existing = xml.match(cellRe);

    if (existing && /<f[\s>]/.test(existing[2] || '')) {
      throw new Error(`${sheetName}!${ref} holds a formula; refusing to overwrite it`);
    }

    const style = existing ? (existing[1].match(/\s s="\d+"/) || [''])[0] : '';
    const t = type ? ` t="${type}"` : '';
    const cell = `<c r="${ref}"${style}${t}>${inner}</c>`;

    if (existing) {
      xml = xml.replace(cellRe, cell);
    } else {
      xml = insertCell(xml, rowN, colL, cell);
    }
    this._setXml(path, xml);
    return true;
  }

  /** Excel recomputes everything on open, so no cached result can survive an edit. */
  setFullCalcOnLoad() {
    let wb = this._xml('xl/workbook.xml');
    if (/<calcPr[^>]*\/>/.test(wb)) {
      wb = wb.replace(/<calcPr[^>]*\/>/, '<calcPr calcId="191029" fullCalcOnLoad="1"/>');
    } else {
      wb = wb.replace('</workbook>', '<calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>');
    }
    this._setXml('xl/workbook.xml', wb);
  }

  toBlob() {
    const out = zipSync(this.files, { level: 6 });
    const mime = this.filename.endsWith('.xlsm')
      ? 'application/vnd.ms-excel.sheet.macroEnabled.12'
      : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    return new Blob([out], { type: mime });
  }
}

// ---------------------------------------------------------------- xml helpers

function rowXml(xml, n) {
  const m = xml.match(new RegExp(`<row[^>]*\\br="${n}"[^>]*(?:/>|>(.*?)</row>)`, 's'));
  return m ? (m[1] || '') : null;
}

function insertCell(xml, rowN, colL, cell) {
  const rowRe = new RegExp(`(<row[^>]*\\br="${rowN}"[^>]*)(/>|>)(.*?)(</row>)`, 's');
  const rm = xml.match(rowRe);
  if (!rm) {
    const newRow = `<row r="${rowN}">${cell}</row>`;
    if (/<sheetData\s*\/>/.test(xml)) return xml.replace(/<sheetData\s*\/>/, `<sheetData>${newRow}</sheetData>`);
    // keep rows in order
    const rows = [...xml.matchAll(/<row[^>]*\br="(\d+)"/g)];
    const after = rows.filter((r) => +r[1] < rowN).pop();
    if (!after) return xml.replace('<sheetData>', `<sheetData>${newRow}`);
    const idx = xml.indexOf('</row>', after.index) + 6;
    return xml.slice(0, idx) + newRow + xml.slice(idx);
  }
  if (rm[2] === '/>') {
    return xml.replace(rowRe, `${rm[1]}>${cell}</row>`);
  }
  const body = rm[3];
  const target = COLNUM(colL);
  const cells = [...body.matchAll(/<c r="([A-Z]+)\d+"/g)];
  const after = cells.filter((c) => COLNUM(c[1]) < target).pop();
  let newBody;
  if (!after) newBody = cell + body;
  else {
    const end = closeOf(body, after.index);
    newBody = body.slice(0, end) + cell + body.slice(end);
  }
  return xml.replace(rowRe, `${rm[1]}>${newBody}</row>`);
}

function closeOf(body, start) {
  const selfClose = body.indexOf('/>', start);
  const open = body.indexOf('>', start);
  const full = body.indexOf('</c>', start);
  if (selfClose !== -1 && selfClose < open) return selfClose + 2;
  return full === -1 ? body.length : full + 4;
}

function cellText(attrs, inner, wbRef) {
  if (/t="inlineStr"/.test(attrs)) {
    const m = inner.match(/<t[^>]*>(.*?)<\/t>/s);
    return m ? decodeXml(m[1]) : null;
  }
  const v = inner.match(/<v>(.*?)<\/v>/s);
  if (!v) return null;
  if (/t="s"/.test(attrs)) return wbRef ? wbRef._sharedString(+v[1]) : null;
  return decodeXml(v[1]);
}

Workbook.prototype._sharedString = function (i) {
  if (!this._ss) {
    const path = 'xl/sharedStrings.xml';
    this._ss = [];
    if (this.files[path]) {
      const xml = strFromU8(this.files[path]);
      for (const m of xml.matchAll(/<si>(.*?)<\/si>/gs)) {
        this._ss.push(decodeXml([...m[1].matchAll(/<t[^>]*>(.*?)<\/t>/gs)].map((x) => x[1]).join('')));
      }
    }
  }
  return this._ss[i];
};

function numToXml(v) {
  if (typeof v !== 'number' || !isFinite(v)) throw new Error(`not a finite number: ${v}`);
  return String(v);
}
function escapeXml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function decodeXml(s) {
  return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

export { COL, COLNUM };
