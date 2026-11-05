/** Lower-case, single-spaced text for matching names typed in different ways. */
export const norm = (s: string): string => s.trim().replace(/\s+/g, ' ').toLowerCase();

function pickSeparator(text: string): string {
  // Look at the first line outside quotes: Excel pastes use tabs, some locales save CSV with semicolons.
  let line = '';
  let quoted = false;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted && (ch === '\n' || ch === '\r')) break;
    else if (!quoted) line += ch;
  }
  if (line.includes('\t')) return '\t';
  const semis = line.split(';').length, commas = line.split(',').length;
  return semis > commas ? ';' : ',';
}

/**
 * Reads CSV, semicolon-separated or tab-separated text (as pasted from Excel or Google Sheets) into rows of
 * trimmed cells. Handles quoted cells with commas, line breaks and doubled quotes. Blank rows are kept as
 * empty arrays so row numbers match the spreadsheet; trailing blank rows are dropped.
 */
export function parseDelimited(text: string): string[][] {
  const src = text.replace(/^\uFEFF/, '');
  const sep = pickSeparator(src);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  const endCell = () => { row.push(cell.trim()); cell = ''; };
  const endRow = () => {
    endCell();
    rows.push(row.some(Boolean) ? row : []);
    row = [];
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && !cell.trim()) quoted = true;
    else if (ch === sep) endCell();
    else if (ch === '\r' || ch === '\n') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      endRow();
    } else cell += ch;
  }
  if (cell || row.length) endRow();
  while (rows.length && !rows[rows.length - 1].length) rows.pop();
  return rows;
}

/** True when a row has no text in any cell. */
export const isBlankRow = (row: string[]): boolean => !row.some((c) => c.trim());

const HEADER_CELL = /^(full )?(names?|(subject|teacher|class|room)(e?s)?( names?)?)$/;

/**
 * Turns pasted text into rows for "Paste a list": skips blank rows, a first row of column names
 * ("Name", "Teacher Names" ...) and names already in `existing` or repeated in the paste.
 */
export function pastedRows(text: string, existing: string[]): { rows: string[][]; skipped: number } {
  const all = parseDelimited(text).filter((r) => !isBlankRow(r) && r[0]);
  if (all.length && HEADER_CELL.test(norm(all[0][0]))) all.shift();
  const seen = new Set(existing.map(norm));
  const rows = all.filter((r) => !seen.has(norm(r[0])) && !!seen.add(norm(r[0])));
  return { rows, skipped: all.length - rows.length };
}
