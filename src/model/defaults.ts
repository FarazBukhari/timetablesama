import type { Lesson, Period, Project, Room, School, SchoolClass, SolverSettings, Subject, Teacher } from './types';

let counter = 0;
export function uid(prefix = 'id'): string {
  counter = (counter + 1) % 1e6;
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}${counter.toString(36)}`;
}

/** Muted print-ink colours for subjects, readable as tints on paper. */
export const PALETTE = [
  '#4f7396', '#6f9460', '#c3873f', '#b05a4b', '#3f8584', '#a0688a', '#8a7a3a', '#5d6f8c',
  '#c06f52', '#7f9b3f', '#7a5f4a', '#4e8a6a', '#b48a2c', '#8a5a6e', '#5f8aa6', '#9b6b3c',
];

export const DEFAULT_SETTINGS: SolverSettings = {
  maxTeacherPeriodsPerDay: 6,
  maxTeacherPeriodsPerDayMode: 'hard',
  maxConsecutivePeriods: 4,
  maxConsecutiveWeight: 5,
  classGapWeight: 20,
  teacherGapWeight: 2,
  spreadWeight: 6,
  avoidBreaksInMultiPeriod: true,
  periodConsistency: false,
  periodConsistencyWeight: 1,
  timeLimitSec: 10,
  seed: 1,
  autoLockMoves: true,
};

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function addMinutes(t: string, mins: number): string {
  const [h, m] = t.split(':').map(Number);
  const total = h * 60 + m + mins;
  return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

/** Builds a bell schedule of `count` lessons with breaks after the given lesson numbers. */
export function buildBellSchedule(
  count: number,
  start = '08:00',
  lessonMins = 45,
  breaks: { after: number; mins: number; name: string }[] = [],
): Period[] {
  const out: Period[] = [];
  let t = start;
  for (let i = 1; i <= count; i++) {
    const end = addMinutes(t, lessonMins);
    out.push({ id: uid('p'), name: `Period ${i}`, start: t, end, isBreak: false });
    t = end;
    const br = breaks.find((b) => b.after === i);
    if (br && i < count) {
      const bEnd = addMinutes(t, br.mins);
      out.push({ id: uid('p'), name: br.name, start: t, end: bEnd, isBreak: true });
      t = bEnd;
    }
  }
  return out;
}

export function defaultSchool(): School {
  return {
    name: 'My School',
    academicYear: `${new Date().getFullYear()}–${new Date().getFullYear() + 1}`,
    days: WEEKDAYS.slice(0, 5),
    periods: buildBellSchedule(7, '08:00', 45, [
      { after: 2, mins: 15, name: 'Short break' },
      { after: 4, mins: 30, name: 'Lunch' },
    ]),
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function emptyProject(): Project {
  return {
    version: 1,
    school: defaultSchool(),
    subjects: [],
    teachers: [],
    classes: [],
    rooms: [],
    lessons: [],
    cards: [],
    unplaced: [],
  };
}

export function newLesson(partial: Partial<Lesson> = {}): Lesson {
  return {
    id: uid('l'),
    classIds: [],
    subjectId: '',
    teacherIds: [],
    periodsPerWeek: 1,
    length: 1,
    roomIds: [],
    maxPerDay: 1,
    ...partial,
  };
}

export const newSubject = (name: string, code?: string, index = 0): Subject => ({
  id: uid('s'), name, code: code || initials(name), color: PALETTE[index % PALETTE.length], unavailable: [],
});

export const newTeacher = (name: string, code?: string, email?: string): Teacher => ({
  id: uid('t'), name, code: code || initials(name), email: email || undefined, unavailable: [],
});

export const newClass = (name: string, students?: string): SchoolClass => ({
  id: uid('c'), name, students: students ? Number(students) || undefined : undefined, unavailable: [],
});

export const newRoom = (name: string, type?: string, capacity?: string): Room => ({
  id: uid('r'), name, type: type || 'Classroom', capacity: capacity ? Number(capacity) || undefined : undefined, unavailable: [],
});

/** Lengths of the placeable units a lesson expands into, e.g. 5 periods as doubles -> [2,2,1]. */
export function unitLengths(lesson: Pick<Lesson, 'periodsPerWeek' | 'length'>): number[] {
  const len = Math.max(1, Math.floor(lesson.length) || 1);
  const total = Math.max(0, Math.floor(lesson.periodsPerWeek) || 0);
  const out: number[] = [];
  for (let i = 0; i < Math.floor(total / len); i++) out.push(len);
  if (total % len) out.push(total % len);
  return out;
}

/** Teaching periods only (breaks removed), with whether a break follows each. */
export function teachingPeriods(periods: Period[]): { period: Period; breakAfter: boolean }[] {
  const out: { period: Period; breakAfter: boolean }[] = [];
  periods.forEach((p) => {
    if (p.isBreak) {
      if (out.length) out[out.length - 1].breakAfter = true;
    } else out.push({ period: p, breakAfter: false });
  });
  return out;
}

/** `code`, or `code` plus the first number that makes it unique among `taken` (compared ignoring case). */
export function uniqueCode(code: string, taken: Iterable<string>): string {
  const used = new Set([...taken].map((c) => c.toUpperCase()));
  if (!code || !used.has(code.toUpperCase())) return code;
  let n = 2;
  while (used.has(`${code}${n}`.toUpperCase())) n++;
  return `${code}${n}`;
}

const HONORIFIC = /^(mr|mrs|ms|miss|mx|dr|sir|madam|prof)\.?$/i;

/** Short code from a name: "Amina Rahman" -> "AR", "Urdu" -> "URD". Titles such as "Ms" or "Sir" are skipped. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const named = words.filter((w) => !HONORIFIC.test(w));
  const parts = named.length ? named : words;
  if (!parts.length) return '';
  if (parts.length === 1) return parts[0].slice(0, 3).toUpperCase();
  return parts.map((p) => p[0]).join('').slice(0, 4).toUpperCase();
}
