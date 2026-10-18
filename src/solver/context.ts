import { teachingPeriods, unitLengths } from '../model/defaults';
import { slotKey, type Card, type Lesson, type Project } from '../model/types';

export interface Unit {
  idx: number;
  lessonIdx: number;
  lessonId: string;
  unit: number;
  length: number;
  teachers: number[];
  classes: number[];
  subject: number;
  /** Candidate room indices; empty = no room needed. */
  rooms: number[];
  maxPerDay: number;
  /** Placement kept from a locked or fixed card. */
  locked?: { pos: number; room: number; cardId: string; locked: boolean; fixed: boolean };
  /** Valid start positions (day * P + period) after static checks. */
  valid: number[];
  /** Rooms usable at each valid start position (parallel to `valid`). */
  validRooms: number[][];
}

/** Indexed, integer-only view of a project used by the solver and validators. */
export interface Context {
  project: Project;
  D: number;
  P: number;
  N: number; // D * P
  breakAfter: boolean[];
  teacherIndex: Map<string, number>;
  classIndex: Map<string, number>;
  roomIndex: Map<string, number>;
  subjectIndex: Map<string, number>;
  lessonIndex: Map<string, number>;
  teacherUnavail: Uint8Array[];
  classUnavail: Uint8Array[];
  roomUnavail: Uint8Array[];
  subjectUnavail: Uint8Array[];
  teacherMaxPerDay: number[];
  units: Unit[];
  unitsByLesson: number[][];
}

function unavailMask(keys: string[] | undefined, D: number, P: number): Uint8Array {
  const m = new Uint8Array(D * P);
  for (const k of keys ?? []) {
    const [d, p] = k.split(':').map(Number);
    if (d >= 0 && d < D && p >= 0 && p < P) m[d * P + p] = 1;
  }
  return m;
}

const indexOf = <T extends { id: string }>(xs: T[]) => new Map(xs.map((x, i) => [x.id, i]));

export function lessonRooms(project: Project, lesson: Lesson): string[] {
  if (lesson.roomIds.length) return lesson.roomIds;
  if (lesson.classIds.length === 1) {
    const home = project.classes.find((c) => c.id === lesson.classIds[0])?.homeRoomId;
    if (home) return [home];
  }
  return [];
}

/** True if a block of `len` periods starting at `p` stays inside the day and (optionally) avoids breaks. */
export function blockFits(breakAfter: boolean[], P: number, p: number, len: number, avoidBreaks: boolean): boolean {
  if (p < 0 || p + len > P) return false;
  if (avoidBreaks) for (let i = p; i < p + len - 1; i++) if (breakAfter[i]) return false;
  return true;
}

export function buildContext(project: Project, lockedCards: Card[] = project.cards.filter((c) => c.locked || c.fixed)): Context {
  const { school } = project;
  const tp = teachingPeriods(school.periods);
  const D = school.days.length;
  const P = tp.length;
  const N = D * P;
  const breakAfter = tp.map((t) => t.breakAfter);
  const teacherIndex = indexOf(project.teachers);
  const classIndex = indexOf(project.classes);
  const roomIndex = indexOf(project.rooms);
  const subjectIndex = indexOf(project.subjects);
  const lessonIndex = indexOf(project.lessons);

  const ctx: Context = {
    project, D, P, N, breakAfter, teacherIndex, classIndex, roomIndex, subjectIndex, lessonIndex,
    teacherUnavail: project.teachers.map((t) => unavailMask(t.unavailable, D, P)),
    classUnavail: project.classes.map((c) => unavailMask(c.unavailable, D, P)),
    roomUnavail: project.rooms.map((r) => unavailMask(r.unavailable, D, P)),
    subjectUnavail: project.subjects.map((s) => unavailMask(s.unavailable, D, P)),
    teacherMaxPerDay: project.teachers.map((t) =>
      t.maxPerDay && t.maxPerDay > 0 ? t.maxPerDay : school.settings.maxTeacherPeriodsPerDay,
    ),
    units: [],
    unitsByLesson: project.lessons.map(() => []),
  };

  const lockedByUnit = new Map(lockedCards.map((c) => [`${c.lessonId}#${c.unit}`, c]));

  project.lessons.forEach((lesson, li) => {
    const teachers = lesson.teacherIds.map((id) => teacherIndex.get(id)).filter((x): x is number => x !== undefined);
    const classes = lesson.classIds.map((id) => classIndex.get(id)).filter((x): x is number => x !== undefined);
    const rooms = lessonRooms(project, lesson)
      .map((id) => roomIndex.get(id))
      .filter((x): x is number => x !== undefined);
    const subject = subjectIndex.get(lesson.subjectId) ?? -1;
    unitLengths(lesson).forEach((length, u) => {
      const unit: Unit = {
        idx: ctx.units.length, lessonIdx: li, lessonId: lesson.id, unit: u, length,
        teachers, classes, subject, rooms, maxPerDay: Math.max(1, lesson.maxPerDay || 1),
        valid: [], validRooms: [],
      };
      const lc = lockedByUnit.get(`${lesson.id}#${u}`);
      if (lc && lc.day < D && lc.period < P) {
        unit.locked = {
          pos: lc.day * P + lc.period,
          room: lc.roomId !== undefined ? roomIndex.get(lc.roomId) ?? -1 : -1,
          cardId: lc.id,
          locked: lc.locked,
          fixed: !!lc.fixed,
        };
      }
      computeValid(ctx, unit);
      ctx.unitsByLesson[li].push(unit.idx);
      ctx.units.push(unit);
    });
  });
  return ctx;
}

/** Rooms of `unit` free of static unavailability across a block, or null if the block is statically invalid. */
export function staticRoomsAt(ctx: Context, unit: Unit, day: number, p: number): number[] | null {
  const { P } = ctx;
  if (!blockFits(ctx.breakAfter, P, p, unit.length, ctx.project.school.settings.avoidBreaksInMultiPeriod)) return null;
  for (let i = p; i < p + unit.length; i++) {
    const pos = day * P + i;
    if (unit.teachers.some((t) => ctx.teacherUnavail[t][pos])) return null;
    if (unit.classes.some((c) => ctx.classUnavail[c][pos])) return null;
    if (unit.subject >= 0 && ctx.subjectUnavail[unit.subject][pos]) return null;
  }
  if (!unit.rooms.length) return [];
  const rooms = unit.rooms.filter((r) => {
    for (let i = p; i < p + unit.length; i++) if (ctx.roomUnavail[r][day * P + i]) return false;
    return true;
  });
  return rooms.length ? rooms : null;
}

function computeValid(ctx: Context, unit: Unit) {
  for (let d = 0; d < ctx.D; d++) {
    for (let p = 0; p < ctx.P; p++) {
      const rooms = staticRoomsAt(ctx, unit, d, p);
      if (rooms) {
        unit.valid.push(d * ctx.P + p);
        unit.validRooms.push(rooms);
      }
    }
  }
}

export function keyOf(ctx: Context, pos: number) {
  return slotKey(Math.floor(pos / ctx.P), pos % ctx.P);
}
