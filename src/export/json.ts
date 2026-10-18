import { DEFAULT_SETTINGS } from '../model/defaults';
import type { Project } from '../model/types';

export const exportProjectJson = (project: Project): string => JSON.stringify(project, null, 2);

type Obj = Record<string, unknown>;

const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function fail(msg: string): never {
  throw new Error(`Invalid project file: ${msg}`);
}

function list(parent: Obj, key: string, where: string, optional = false): Obj[] {
  const v = parent[key];
  if (v === undefined && optional) return [];
  if (!Array.isArray(v)) fail(`"${where}${key}" must be an array.`);
  v.forEach((item, i) => isObj(item) || fail(`${where}${key}[${i}] must be an object.`));
  return v as Obj[];
}

function requireStrings(items: Obj[], key: string, fields: string[]) {
  items.forEach((item, i) =>
    fields.forEach((f) => typeof item[f] === 'string' || fail(`${key}[${i}].${f} must be a string.`)),
  );
}

/** Parses and validates a project exported by `exportProjectJson`, filling defaults for optional data. */
export function parseProjectJson(text: string): Project {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch (e) {
    fail(`not valid JSON (${(e as Error).message}).`);
  }
  if (!isObj(data)) fail('expected a JSON object.');
  if (data.version !== 1) fail(`unsupported version ${JSON.stringify(data.version)} (expected 1).`);

  const school = data.school;
  if (!isObj(school)) fail('"school" is missing.');
  if (!Array.isArray(school.days) || !school.days.every((d) => typeof d === 'string')) fail('"school.days" must be a list of day names.');
  const periods = list(school, 'periods', 'school.');
  requireStrings(periods, 'school.periods', ['name', 'start', 'end']);
  periods.forEach((p) => (p.isBreak = p.isBreak === true));
  school.settings = { ...DEFAULT_SETTINGS, ...(isObj(school.settings) ? school.settings : {}) };
  if (typeof school.name !== 'string') school.name = 'My School';
  if (typeof school.academicYear !== 'string') school.academicYear = '';

  for (const key of ['subjects', 'teachers', 'classes', 'rooms']) {
    const items = list(data, key, '');
    requireStrings(items, key, ['id', 'name']);
    items.forEach((item) => (item.unavailable = Array.isArray(item.unavailable) ? item.unavailable : []));
  }

  const lessons = list(data, 'lessons', '');
  requireStrings(lessons, 'lessons', ['id', 'subjectId']);
  lessons.forEach((l, i) => {
    for (const k of ['classIds', 'teacherIds']) if (!Array.isArray(l[k])) fail(`lessons[${i}].${k} must be an array.`);
    l.roomIds = Array.isArray(l.roomIds) ? l.roomIds : [];
    l.periodsPerWeek = typeof l.periodsPerWeek === 'number' ? l.periodsPerWeek : 1;
    l.length = typeof l.length === 'number' ? l.length : 1;
    l.maxPerDay = typeof l.maxPerDay === 'number' ? l.maxPerDay : 1;
  });

  const cards = list(data, 'cards', '', true);
  requireStrings(cards, 'cards', ['id', 'lessonId']);
  cards.forEach((c, i) => {
    for (const k of ['unit', 'day', 'period']) if (typeof c[k] !== 'number') fail(`cards[${i}].${k} must be a number.`);
    c.locked = c.locked === true;
  });
  data.cards = cards;
  data.unplaced = list(data, 'unplaced', '', true);

  return data as unknown as Project;
}
