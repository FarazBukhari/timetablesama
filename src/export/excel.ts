import { teachingPeriods } from '../model/defaults';
import type { Project } from '../model/types';
import { CARD_COLUMNS, cardRows, type CellValue } from './csv';
import { buildGrid, describeCell, periodLabel, type ViewKind } from './grid';

/** Escapes text for XML content/attributes; drops characters XML 1.0 forbids and keeps line breaks. */
export const xmlEscape = (s: string): string =>
  s
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F￾￿]/g, '')
    .replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!)
    .replace(/\r?\n/g, '&#10;');

/** Returns a sanitizer that yields valid, unique (case-insensitive) Excel sheet names of at most 31 chars. */
export function sheetNamer(): (name: string) => string {
  const used = new Set<string>();
  return (raw) => {
    const base = raw.replace(/[:\\/?*[\]]/g, '-').replace(/\s+/g, ' ').trim().replace(/^'+|'+$/g, '') || 'Sheet';
    for (let i = 1; ; i++) {
      const suffix = i === 1 ? '' : ` (${i})`;
      const name = base.slice(0, 31 - suffix.length).trimEnd() + suffix;
      if (!used.has(name.toLowerCase())) {
        used.add(name.toLowerCase());
        return name;
      }
    }
  };
}

interface XCell { value: CellValue; header?: boolean; mergeAcross?: number; index?: number }

const cellXml = ({ value, header, mergeAcross, index }: XCell) =>
  `<Cell${index ? ` ss:Index="${index}"` : ''}${mergeAcross ? ` ss:MergeAcross="${mergeAcross}"` : ''}${header ? ' ss:StyleID="hdr"' : ''}>` +
  (value === '' ? '' : `<Data ss:Type="${typeof value === 'number' ? 'Number' : 'String'}">${xmlEscape(String(value))}</Data>`) +
  '</Cell>';

const worksheetXml = (name: string, rows: XCell[][], widths: number[]) =>
  `<Worksheet ss:Name="${xmlEscape(name)}"><Table>` +
  widths.map((w) => `<Column ss:Width="${w}"/>`).join('') +
  rows.map((r) => `<Row>${r.map(cellXml).join('')}</Row>`).join('') +
  `</Table><WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel"><FreezePanes/><FrozenNoSplit/>` +
  `<SplitHorizontal>1</SplitHorizontal><TopRowBottomPane>1</TopRowBottomPane></WorksheetOptions></Worksheet>`;

/** Grid sheet rows: days as rows, teaching periods as columns; multi-period cards are merged across. */
function gridSheetRows(project: Project, kind: ViewKind, entityId: string): XCell[][] {
  const periods = teachingPeriods(project.school.periods);
  const header: XCell[] = [{ value: '', header: true }, ...periods.map((t) => ({ value: periodLabel(t.period), header: true }))];
  const body = buildGrid(project, kind, entityId).map((row, d) => {
    const cells: XCell[] = [{ value: project.school.days[d], header: true }];
    let skipped = false;
    row.forEach((entry, p) => {
      if (entry && !entry.isStart && row[p - 1]?.card.id === entry.card.id) {
        skipped = true;
        return;
      }
      let span = 0;
      if (entry) while (row[p + span + 1]?.card.id === entry.card.id && !row[p + span + 1]!.isStart) span++;
      cells.push({ value: describeCell(entry, kind), mergeAcross: span, index: skipped ? p + 2 : undefined });
      skipped = false;
    });
    return cells;
  });
  return [header, ...body];
}

/** Full workbook as SpreadsheetML 2003 (opens in Excel/LibreOffice as .xls). */
export function projectToExcelXml(project: Project): string {
  const name = sheetNamer();
  const gridWidths = [80, ...teachingPeriods(project.school.periods).map(() => 140)];
  const sheets = [
    worksheetXml(name('All Lessons'), [
      CARD_COLUMNS.map((value) => ({ value, header: true })),
      ...cardRows(project).map((r) => r.map((value) => ({ value }))),
    ], [80, 50, 50, 50, 90, 130, 80, 160, 110, 50, 50]),
    ...(
      [
        ['class', 'Class', project.classes],
        ['teacher', 'Teacher', project.teachers],
        ['room', 'Room', project.rooms],
      ] as const
    ).flatMap(([kind, prefix, items]) =>
      items.map((e) => worksheetXml(name(`${prefix} ${e.name}`), gridSheetRows(project, kind, e.id), gridWidths)),
    ),
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:o="urn:schemas-microsoft-com:office:office"' +
      ' xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"' +
      ' xmlns:html="http://www.w3.org/TR/REC-html40">',
    `<DocumentProperties xmlns="urn:schemas-microsoft-com:office:office"><Title>${xmlEscape(project.school.name)}</Title></DocumentProperties>`,
    '<Styles><Style ss:ID="Default" ss:Name="Normal"><Alignment ss:Vertical="Top" ss:WrapText="1"/></Style>' +
      '<Style ss:ID="hdr"><Font ss:Bold="1"/><Interior ss:Color="#E5E7EB" ss:Pattern="Solid"/></Style></Styles>',
    ...sheets,
    '</Workbook>',
  ].join('\n');
}
