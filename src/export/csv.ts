import { teachingPeriods } from '../model/defaults';
import type { Id, Project } from '../model/types';
import { buildGrid, cardLength, cardResolver, describeCell, periodLabel, type ViewKind } from './grid';

export type CellValue = string | number;

export const CARD_COLUMNS = ['Day', 'Start', 'End', 'Period', 'Class', 'Subject', 'Subject Code', 'Teacher', 'Room', 'Length', 'Locked'];

/** One row per card (sorted by day, period, class), matching CARD_COLUMNS. */
export function cardRows(project: Project): CellValue[][] {
  const periods = teachingPeriods(project.school.periods).map((t) => t.period);
  const resolve = cardResolver(project);
  return [...project.cards]
    .sort((a, b) => a.day - b.day || a.period - b.period)
    .flatMap((card) => {
      const r = resolve(card);
      if (!r) return [];
      const len = cardLength(project, card);
      const last = card.period + len - 1;
      return [[
        project.school.days[card.day] ?? `Day ${card.day + 1}`,
        periods[card.period]?.start ?? '',
        periods[Math.min(last, periods.length - 1)]?.end ?? '',
        len > 1 ? `${card.period + 1}-${last + 1}` : String(card.period + 1),
        r.classes.map((c) => c.name).join(' + '),
        r.subject?.name ?? '',
        r.subject?.code ?? '',
        r.teachers.map((t) => t.name).join(' + '),
        r.room?.name ?? '',
        len,
        card.locked ? 'Yes' : 'No',
      ]];
    });
}

export const csvEscape = (v: CellValue): string => {
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export const toCsv = (rows: CellValue[][]): string => rows.map((r) => r.map(csvEscape).join(',')).join('\r\n');

export const cardsToCsv = (project: Project): string => toCsv([CARD_COLUMNS, ...cardRows(project)]);

/** Grid rows (header + one row per day) for one class/teacher/room timetable. */
export function gridRows(project: Project, kind: ViewKind, entityId: Id): string[][] {
  const header = ['', ...teachingPeriods(project.school.periods).map((t) => periodLabel(t.period))];
  const grid = buildGrid(project, kind, entityId);
  return [header, ...grid.map((row, d) => [project.school.days[d], ...row.map((e) => describeCell(e, kind))])];
}

export const gridToCsv = (project: Project, kind: ViewKind, entityId: Id): string => toCsv(gridRows(project, kind, entityId));
