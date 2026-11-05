import { parseDelimited } from './table';

/**
 * A small reader for Excel workbooks (.xlsx), with no dependency: an .xlsx file is a ZIP of XML files.
 * Reads cell text only (no formatting or formulas), which is all the lessons import needs.
 */

export interface Sheet {
  name: string;
  rows: string[][];
}

const NOT_EXCEL = "This file isn't an Excel workbook or a CSV file. In Excel, choose File, Save As, and pick Excel Workbook (.xlsx) or CSV UTF-8.";
const OLD_EXCEL = 'This is an older Excel file (.xls). In Excel, choose File, Save As, and pick Excel Workbook (.xlsx), then try again.';
const DAMAGED = "This Excel file is damaged and can't be read. Open it in Excel, save it again, and try once more.";
const OLD_BROWSER = 'This browser is too old to open Excel files. Update the browser, or in Excel save the sheet as CSV UTF-8, or copy the cells and paste them below.';

/** Whether this browser can unpack Excel files (Chrome 103+, Safari 16.4+, Firefox 113+). */
export function canReadXlsx(): boolean {
  try {
    return typeof DecompressionStream === 'function' && !!new DecompressionStream('deflate-raw');
  } catch {
    return false;
  }
}

const startsWith = (b: Uint8Array, sig: number[]) => sig.every((x, i) => b[i] === x);
export const isZip = (b: Uint8Array): boolean => startsWith(b, [0x50, 0x4b, 0x03, 0x04]);
export const isOldExcel = (b: Uint8Array): boolean => startsWith(b, [0xd0, 0xcf, 0x11, 0xe0]);

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Lists the files in a ZIP and returns a function that reads one as text. */
function openZip(bytes: Uint8Array): { names: string[]; text: (name: string) => Promise<string | undefined> } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error(DAMAGED);
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  const utf8 = new TextDecoder();
  const entries = new Map<string, { method: number; size: number; offset: number }>();
  for (let i = 0; i < count; i++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== 0x02014b50) throw new Error(DAMAGED);
    const nameLen = view.getUint16(p + 28, true);
    const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    entries.set(name, { method: view.getUint16(p + 10, true), size: view.getUint32(p + 20, true), offset: view.getUint32(p + 42, true) });
    p += 46 + nameLen + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
  }
  return {
    names: [...entries.keys()],
    async text(name) {
      const e = entries.get(name);
      if (!e) return undefined;
      if (view.getUint32(e.offset, true) !== 0x04034b50) throw new Error(DAMAGED);
      const start = e.offset + 30 + view.getUint16(e.offset + 26, true) + view.getUint16(e.offset + 28, true);
      const raw = bytes.subarray(start, start + e.size);
      if (e.method === 0) return utf8.decode(raw);
      if (e.method !== 8) throw new Error(DAMAGED);
      if (!canReadXlsx()) throw new Error(OLD_BROWSER);
      try {
        return utf8.decode(await inflateRaw(raw));
      } catch {
        throw new Error(DAMAGED);
      }
    },
  };
}

const ENTITIES: Record<string, string> = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };

/** Decodes XML entities and Excel's `_x000D_` escapes. */
export function xmlText(s: string): string {
  return s
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) => {
      if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1)));
      return ENTITIES[e] ?? m;
    })
    .replace(/_x([0-9a-f]{4})_/gi, (_, h: string) => String.fromCharCode(parseInt(h, 16)));
}

const attr = (attrs: string, name: string): string | undefined =>
  new RegExp(`(?:^|\\s)${name}="([^"]*)"`).exec(attrs)?.[1];

/** All the text runs inside one shared string or inline string, ignoring phonetic guides. */
const runsText = (xml: string): string =>
  xmlText(
    [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => m[1]).join(''),
  );

/** "B" -> 1, "AA" -> 26. */
export function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? '';
  let n = 0;
  for (const ch of letters) n = n * 26 + ch.charCodeAt(0) - 64;
  return n - 1;
}

function numberText(v: string): string {
  const n = Number(v);
  if (!Number.isFinite(n) || v.trim() === '') return v;
  return Math.abs(n - Math.round(n)) < 1e-9 ? String(Math.round(n)) : String(Number(n.toPrecision(15)));
}

function sheetRows(xml: string, shared: string[]): string[][] {
  const rows: string[][] = [];
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const r = Number(attr(rm[1], 'r')) || rows.length + 1;
    const cells: string[] = [];
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = attr(cm[1], 'r');
      const col = ref ? columnIndex(ref) : cells.length;
      const type = attr(cm[1], 't');
      const body = cm[2] ?? '';
      const v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let text = '';
      if (type === 'inlineStr') text = runsText(body);
      else if (v === undefined) text = '';
      else if (type === 's') text = shared[Number(v)] ?? '';
      else if (type === 'b') text = v === '1' ? 'TRUE' : 'FALSE';
      else if (type === 'str' || type === 'e') text = xmlText(v);
      else text = numberText(xmlText(v));
      while (cells.length < col) cells.push('');
      cells[col] = text.trim();
    }
    while (rows.length < r - 1) rows.push([]);
    rows[r - 1] = cells.some(Boolean) ? cells : [];
  }
  while (rows.length && !rows[rows.length - 1].length) rows.pop();
  return rows;
}

/** Turns a relationship target such as "worksheets/sheet1.xml" or "/xl/worksheets/sheet1.xml" into a ZIP path. */
const sheetPath = (target: string) => (target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`);

/** Reads every sheet of an .xlsx workbook, in the order the tabs appear in Excel. */
export async function readXlsx(data: ArrayBuffer | Uint8Array): Promise<Sheet[]> {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (isOldExcel(bytes)) throw new Error(OLD_EXCEL);
  if (!isZip(bytes)) throw new Error(NOT_EXCEL);
  const zip = openZip(bytes);
  const workbook = await zip.text('xl/workbook.xml');
  if (workbook === undefined) throw new Error(NOT_EXCEL);

  const sharedXml = (await zip.text('xl/sharedStrings.xml')) ?? '';
  const shared = [...sharedXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\s*\/>/g)].map((m) => runsText(m[1] ?? ''));

  const rels = new Map<string, string>();
  for (const m of ((await zip.text('xl/_rels/workbook.xml.rels')) ?? '').matchAll(/<Relationship\b([^>]*)\/?>/g)) {
    const id = attr(m[1], 'Id'), target = attr(m[1], 'Target');
    if (id && target) rels.set(id, sheetPath(target));
  }

  const listed = [...workbook.matchAll(/<sheet\b([^>]*)\/?>/g)].map((m) => ({
    name: xmlText(attr(m[1], 'name') ?? ''),
    path: rels.get(attr(m[1], 'r:id') ?? '') ?? '',
  }));
  const found = listed.filter((s) => zip.names.includes(s.path));
  const sheets = found.length
    ? found
    : zip.names
      .filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
      .sort((a, b) => Number(/\d+/.exec(a)?.[0]) - Number(/\d+/.exec(b)?.[0]))
      .map((path, i) => ({ name: `Sheet${i + 1}`, path }));
  if (!sheets.length) throw new Error(NOT_EXCEL);

  const out: Sheet[] = [];
  for (const s of sheets) out.push({ name: s.name, rows: sheetRows((await zip.text(s.path)) ?? '', shared) });
  return out;
}

/**
 * Reads a file chosen by the user: an Excel workbook, or CSV/text (UTF-8, falling back to Windows-1252
 * for CSVs saved by older Excel). Returns one sheet per workbook tab, or a single sheet for text.
 */
export async function readTableFile(data: ArrayBuffer, fileName: string): Promise<Sheet[]> {
  const bytes = new Uint8Array(data);
  if (isZip(bytes) || isOldExcel(bytes)) return readXlsx(bytes);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  if (/^\s*</.test(text.replace(/^﻿/, '')) || bytes.subarray(0, 512).includes(0)) throw new Error(NOT_EXCEL);
  return [{ name: fileName, rows: parseDelimited(text) }];
}
