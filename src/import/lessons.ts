import { newClass, newLesson, newRoom, newSubject, newTeacher, uniqueCode, unitLengths } from '../model/defaults';
import type { Id, Lesson, Project, Room, SchoolClass, Subject, Teacher } from '../model/types';
import { toCsv } from '../export/csv';
import { isBlankRow, norm } from './table';
import type { Sheet } from './xlsx';

export const LENGTH_LABELS = [
  { v: 1, label: 'Singles' },
  { v: 2, label: 'Doubles' },
  { v: 3, label: 'Triples' },
  { v: 4, label: 'Blocks of 4' },
];
const lengthLabel = (v: number) => LENGTH_LABELS.find((x) => x.v === v)?.label ?? String(v);

export const MAX_LESSONS_A_WEEK = 40;

type Column = 'teachers' | 'classes' | 'subject' | 'count' | 'length' | 'maxPerDay' | 'rooms';

/** Checked in this order, so "Max lessons a day" is read as "Most in a day" and not "Lessons a week". */
const COLUMN_PATTERNS: [Column, RegExp][] = [
  ['maxPerDay', /\b(most|max|maximum)\b|\b(a|per|in a) day\b/],
  ['length', /\b(arrange|arranged|length|double|doubles|block|blocks)\b/],
  ['rooms', /\brooms?\b/],
  ['teachers', /\bteachers?\b/],
  ['classes', /\b(class|classes|form|forms|section|sections|grade|grades)\b/],
  ['subject', /\bsubjects?\b/],
  ['count', /\b(lessons?|periods?)\b/],
];

const REQUIRED: [Column, string][] = [['teachers', 'Teacher'], ['classes', 'Class'], ['subject', 'Subject'], ['count', 'Lessons a week']];

/** Which column holds what, read from a header row such as "Teacher Names, Class Names, Subject Names, No. of Lessons". */
export function readHeader(row: string[]): Partial<Record<Column, number>> {
  const cols: Partial<Record<Column, number>> = {};
  row.forEach((cell, i) => {
    const h = cell.toLowerCase().replace(/[^a-z]+/g, ' ').trim();
    const hit = COLUMN_PATTERNS.find(([, re]) => re.test(h));
    if (hit && cols[hit[0]] === undefined) cols[hit[0]] = i;
  });
  return cols;
}

/** Splits "Ms Saba & Sir Kamal" or "1 + 3" into names, without repeats. */
export function splitNames(cell: string | undefined): string[] {
  const seen = new Set<string>();
  return (cell ?? '')
    .split(/\s*[&+,]\s*/)
    .map((s) => s.trim().replace(/\s+/g, ' '))
    .filter((s) => s && !seen.has(norm(s)) && seen.add(norm(s)));
}

function parseLength(cell: string): number | undefined {
  const t = cell.toLowerCase();
  if (/single/.test(t)) return 1;
  if (/double/.test(t)) return 2;
  if (/triple/.test(t)) return 3;
  const n = Number(/\d+/.exec(t)?.[0]);
  return n >= 1 && n <= 4 ? n : undefined;
}

const wholeNumber = (cell: string, min: number, max: number): number | undefined => {
  if (!/^\d+$/.test(cell.trim())) return undefined;
  const n = Number(cell);
  return n >= min && n <= max ? n : undefined;
};

export type RowStatus = 'new' | 'update' | 'same' | 'problem';

export interface ImportRow {
  /** Row number as shown in the spreadsheet. */
  row: number;
  teachers: string[];
  classes: string[];
  subject: string;
  count: string;
  status: RowStatus;
  /** Plain-words reason for a problem row, or what changes on an update. */
  note?: string;
  /** The lesson to add (new) or its updated version, keeping the existing id (update). */
  lesson?: Lesson;
}

export interface ImportPlan {
  sheetName: string;
  rows: ImportRow[];
  create: { teachers: Teacher[]; classes: SchoolClass[]; subjects: Subject[]; rooms: Room[] };
}

const sameSet = (a: Id[], b: Id[]) => a.length === b.length && a.every((x) => b.includes(x));
const lessonKey = (classIds: Id[], subjectId: Id, teacherIds: Id[]) =>
  `${[...classIds].sort().join(',')}|${subjectId}|${[...teacherIds].sort().join(',')}`;

/** Fewest "most in a day" that lets every piece of the lesson fit in the school week. */
function neededPerDay(project: Project, l: Pick<Lesson, 'periodsPerWeek' | 'length'>): number {
  return Math.max(1, Math.ceil(unitLengths(l).length / Math.max(1, project.school.days.length)));
}

function findHeader(sheets: Sheet[]): { sheet: Sheet; at: number; cols: Partial<Record<Column, number>> } {
  let best: { sheet: Sheet; cols: Partial<Record<Column, number>> } | undefined;
  for (const sheet of sheets) {
    for (let at = 0; at < Math.min(sheet.rows.length, 10); at++) {
      const cols = readHeader(sheet.rows[at]);
      const found = REQUIRED.filter(([c]) => cols[c] !== undefined).length;
      if (found === REQUIRED.length) return { sheet, at, cols };
      if (found >= 2 && (!best || found > REQUIRED.filter(([c]) => best!.cols[c] !== undefined).length)) best = { sheet, cols };
    }
  }
  if (best) {
    const missing = REQUIRED.filter(([c]) => best!.cols[c] === undefined).map(([, label]) => label);
    throw new Error(`The sheet has no "${missing.join('" or "')}" column. Add it next to the others, or download the template to see the columns needed.`);
  }
  throw new Error('No column names found. The first row should name the columns: Teacher, Class, Subject and Lessons a week. Download the template to see an example.');
}

/**
 * Works out what importing these rows would do, without changing the project: which lessons are new, which
 * update an existing lesson (same classes, subject and teachers), which rows have a problem, and which
 * teachers, classes, subjects and rooms need to be added.
 */
export function planLessonImport(project: Project, sheets: Sheet[]): ImportPlan {
  const { sheet, at, cols } = findHeader(sheets);
  const create: ImportPlan['create'] = { teachers: [], classes: [], subjects: [], rooms: [] };

  /**
   * Name (and short code) -> id. A name or code shared by several existing items goes in `clash` instead,
   * so a row naming it is skipped rather than quietly given to one of them.
   */
  const lookup = <T extends { id: Id; name: string; code?: string }>(items: T[], what: string, hasCodes: boolean) => {
    const ids = new Map<string, Id>();
    const clash = new Map<string, string>();
    const tally = (keys: string[]) => keys.reduce((m, k) => m.set(k, (m.get(k) ?? 0) + 1), new Map<string, number>());
    const names = tally(items.map((x) => norm(x.name)));
    const codes = tally(items.filter((x) => x.code).map((x) => norm(x.code!)));
    const fix = hasCodes ? 'Rename one, or use their short code.' : 'Rename one.';
    items.forEach((x) => {
      const k = x.code ? norm(x.code) : '';
      if (!k || names.has(k)) return;
      if (codes.get(k)! > 1) clash.set(k, `There are ${codes.get(k)} ${what} with the short code "${x.code}". Give each its own code.`);
      else ids.set(k, x.id);
    });
    items.forEach((x) => {
      const k = norm(x.name);
      if (names.get(k)! > 1) {
        ids.delete(k);
        clash.set(k, `There are ${names.get(k)} ${what} called "${x.name}". ${fix}`);
      } else ids.set(k, x.id);
    });
    return { ids, clash };
  };
  const teachers = lookup(project.teachers, 'teachers', true), classes = lookup(project.classes, 'classes', false);
  const subjects = lookup(project.subjects, 'subjects', true), rooms = lookup(project.rooms, 'rooms', false);
  const teacherIds = teachers.ids, classIds = classes.ids, subjectIds = subjects.ids, roomIds = rooms.ids;
  const teacherCodes = project.teachers.map((t) => t.code), subjectCodes = project.subjects.map((s) => s.code);

  const resolve = (map: Map<string, Id>, name: string, make: () => { id: Id }) => {
    const hit = map.get(norm(name));
    if (hit) return hit;
    const id = make().id;
    map.set(norm(name), id);
    return id;
  };
  const teacher = (name: string) => resolve(teacherIds, name, () => {
    const t = newTeacher(name);
    t.code = uniqueCode(t.code, teacherCodes);
    teacherCodes.push(t.code);
    create.teachers.push(t);
    return t;
  });
  const schoolClass = (name: string) => resolve(classIds, name, () => {
    const c = newClass(name);
    create.classes.push(c);
    return c;
  });
  const subject = (name: string) => resolve(subjectIds, name, () => {
    const s = newSubject(name, undefined, project.subjects.length + create.subjects.length);
    s.code = uniqueCode(s.code, subjectCodes);
    subjectCodes.push(s.code);
    create.subjects.push(s);
    return s;
  });
  const room = (name: string) => resolve(roomIds, name, () => {
    const r = newRoom(name);
    create.rooms.push(r);
    return r;
  });

  const existing = new Map(project.lessons.map((l) => [lessonKey(l.classIds, l.subjectId, l.teacherIds), l]));
  const seen = new Map<string, number>();
  const rows: ImportRow[] = [];

  sheet.rows.forEach((cells, i) => {
    if (i <= at || isBlankRow(cells)) return;
    const cell = (c: Column) => (cols[c] === undefined ? '' : (cells[cols[c]!] ?? '').trim());
    const row: ImportRow = {
      row: i + 1,
      teachers: splitNames(cell('teachers')),
      classes: splitNames(cell('classes')),
      subject: cell('subject').replace(/\s+/g, ' '),
      count: cell('count'),
      status: 'problem',
    };
    rows.push(row);

    const count = wholeNumber(row.count, 1, MAX_LESSONS_A_WEEK);
    const lengthCell = cell('length'), maxCell = cell('maxPerDay');
    const length = lengthCell ? parseLength(lengthCell) : undefined;
    const maxPerDay = maxCell ? wholeNumber(maxCell, 1, 10) : undefined;
    if (!row.subject) row.note = 'No subject.';
    else if (!row.classes.length) row.note = 'No class.';
    else if (count === undefined) row.note = `Lessons a week must be a whole number from 1 to ${MAX_LESSONS_A_WEEK}.`;
    else if (lengthCell && length === undefined) row.note = 'Arrange as must be Singles, Doubles, Triples or Blocks of 4.';
    else if (maxCell && maxPerDay === undefined) row.note = 'Most in a day must be a whole number from 1 to 10.';
    const roomNames = splitNames(cell('rooms'));
    // Checked before any name is resolved, so a skipped row adds nothing.
    row.note ??= ([[row.teachers, teachers], [row.classes, classes], [[row.subject], subjects], [roomNames, rooms]] as const)
      .flatMap(([names, found]) => names.map((n) => found.clash.get(norm(n))))
      .find(Boolean);
    if (row.note || count === undefined) return;

    const lessonClassIds = row.classes.map(schoolClass);
    const subjectId = subject(row.subject);
    const lessonTeacherIds = row.teachers.map(teacher);
    const lessonRoomIds = roomNames.map(room);

    const key = lessonKey(lessonClassIds, subjectId, lessonTeacherIds);
    const first = seen.get(key);
    if (first !== undefined) {
      row.note = `Same lesson as row ${first}.`;
      return;
    }
    seen.set(key, row.row);

    const old = existing.get(key);
    if (!old) {
      const l = newLesson({
        classIds: lessonClassIds, subjectId, teacherIds: lessonTeacherIds, roomIds: lessonRoomIds,
        periodsPerWeek: count, length: length ?? 1,
      });
      l.maxPerDay = maxPerDay ?? neededPerDay(project, l);
      row.status = 'new';
      row.lesson = l;
      return;
    }

    const next: Lesson = {
      ...old,
      periodsPerWeek: count,
      length: length ?? old.length,
      roomIds: roomNames.length ? lessonRoomIds : old.roomIds,
    };
    next.maxPerDay = maxPerDay ?? Math.max(old.maxPerDay, neededPerDay(project, next));
    const changes = [
      next.periodsPerWeek !== old.periodsPerWeek && `Lessons a week from ${old.periodsPerWeek} to ${next.periodsPerWeek}`,
      next.length !== old.length && `Arrange as from ${lengthLabel(old.length)} to ${lengthLabel(next.length)}`,
      next.maxPerDay !== old.maxPerDay && `Most in a day from ${old.maxPerDay} to ${next.maxPerDay}`,
      !sameSet(next.roomIds, old.roomIds) && 'Rooms change',
    ].filter((x): x is string => !!x);
    row.status = changes.length ? 'update' : 'same';
    row.note = changes.length ? `${changes.join('. ')}.` : undefined;
    row.lesson = changes.length ? next : undefined;
  });

  if (!rows.length) throw new Error('The sheet has column names but no lessons under them.');
  // New classes in order ("1, 2, … 10" rather than the order they first appear in the sheet).
  create.classes.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  return { sheetName: sheet.name, rows, create };
}

/** Applies a plan from `planLessonImport`: adds the new names and lessons and updates the matching lessons. */
export function applyLessonImport(project: Project, plan: ImportPlan): Project {
  const added = plan.rows.filter((r) => r.status === 'new' && r.lesson).map((r) => r.lesson!);
  const updated = new Map(plan.rows.filter((r) => r.status === 'update' && r.lesson).map((r) => [r.lesson!.id, r.lesson!]));
  // Changing how a lesson splits into pieces makes its placed pieces out of date, as on the Lessons page.
  const resplit = new Set(
    project.lessons
      .filter((l) => {
        const u = updated.get(l.id);
        return u && (u.periodsPerWeek !== l.periodsPerWeek || u.length !== l.length);
      })
      .map((l) => l.id),
  );
  return {
    ...project,
    teachers: [...project.teachers, ...plan.create.teachers],
    classes: [...project.classes, ...plan.create.classes],
    subjects: [...project.subjects, ...plan.create.subjects],
    rooms: [...project.rooms, ...plan.create.rooms],
    lessons: [...project.lessons.map((l) => updated.get(l.id) ?? l), ...added],
    cards: resplit.size ? project.cards.filter((c) => !resplit.has(c.lessonId)) : project.cards,
    unplaced: resplit.size ? project.unplaced.filter((u) => !resplit.has(u.lessonId)) : project.unplaced,
  };
}

export const TEMPLATE_COLUMNS = ['Teachers', 'Classes', 'Subject', 'Lessons a week', 'Arrange as', 'Most in a day', 'Rooms'];

/** The import template as CSV: the column names, then every current lesson, so it can be edited and imported again. */
export function lessonsTemplateCsv(project: Project): string {
  const names = <T extends { id: Id; name: string }>(items: T[], ids: Id[]) =>
    ids.map((id) => items.find((x) => x.id === id)?.name).filter(Boolean).join(' & ');
  return toCsv([
    TEMPLATE_COLUMNS,
    ...project.lessons.map((l) => [
      names(project.teachers, l.teacherIds),
      names(project.classes, l.classIds),
      project.subjects.find((s) => s.id === l.subjectId)?.name ?? '',
      l.periodsPerWeek,
      lengthLabel(l.length),
      l.maxPerDay,
      names(project.rooms, l.roomIds),
    ]),
  ]);
}
