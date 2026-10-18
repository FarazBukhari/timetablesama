import { teachingPeriods, unitLengths } from '../model/defaults';
import type { Card, Project } from '../model/types';
import { blockFits, lessonRooms } from './context';

export interface Violation {
  cardIds: string[];
  message: string;
}

interface Occ {
  card: Card;
  label: string;
}

const has = (keys: string[] | undefined, k: string) => !!keys && keys.includes(k);

/** All hard-constraint violations in the project's current cards. */
export function findViolations(project: Project, cards: Card[] = project.cards): Violation[] {
  const { school } = project;
  const tp = teachingPeriods(school.periods);
  const P = tp.length;
  const breakAfter = tp.map((t) => t.breakAfter);
  const lessons = new Map(project.lessons.map((l) => [l.id, l]));
  const name = <T extends { id: string; name: string }>(xs: T[]) => new Map(xs.map((x) => [x.id, x]));
  const teachers = name(project.teachers);
  const classes = name(project.classes);
  const rooms = name(project.rooms);
  const subjects = new Map(project.subjects.map((s) => [s.id, s]));
  const out: Violation[] = [];
  const occ = new Map<string, Occ>();
  const perDay = new Map<string, Card[]>();
  const teacherLoad = new Map<string, number>();

  const claim = (res: string, label: string, card: Card, slot: string) => {
    const key = `${res}@${slot}`;
    const prev = occ.get(key);
    if (prev && prev.card.id !== card.id) out.push({ cardIds: [prev.card.id, card.id], message: `${label} is double-booked on ${slot}` });
    else occ.set(key, { card, label });
  };

  for (const card of cards) {
    const lesson = lessons.get(card.lessonId);
    if (!lesson) {
      out.push({ cardIds: [card.id], message: 'Card refers to a deleted lesson' });
      continue;
    }
    const len = unitLengths(lesson)[card.unit] ?? lesson.length;
    const where = `${school.days[card.day] ?? `day ${card.day}`} P${card.period + 1}`;
    if (card.day < 0 || card.day >= school.days.length || !blockFits(breakAfter, P, card.period, len, school.settings.avoidBreaksInMultiPeriod)) {
      out.push({ cardIds: [card.id], message: `Card at ${where} does not fit the bell schedule` });
      continue;
    }
    const dayKey = `${lesson.id}@${card.day}`;
    perDay.set(dayKey, [...(perDay.get(dayKey) ?? []), card]);
    const allowedRooms = lessonRooms(project, lesson);
    if (allowedRooms.length && (!card.roomId || !allowedRooms.includes(card.roomId)))
      out.push({ cardIds: [card.id], message: `Card at ${where} is not in an allowed room` });

    for (let i = 0; i < len; i++) {
      const slot = `${card.day}:${card.period + i}`;
      const slotLabel = `${school.days[card.day]} P${card.period + i + 1}`;
      for (const t of lesson.teacherIds) {
        const teacher = teachers.get(t);
        claim(`t:${t}`, `Teacher ${teacher?.name ?? t}`, card, slotLabel);
        if (has(teacher?.unavailable, slot)) out.push({ cardIds: [card.id], message: `Teacher ${teacher!.name} is unavailable on ${slotLabel}` });
      }
      for (const c of lesson.classIds) {
        const cls = classes.get(c);
        claim(`c:${c}`, `Class ${cls?.name ?? c}`, card, slotLabel);
        if (has(cls?.unavailable, slot)) out.push({ cardIds: [card.id], message: `Class ${cls!.name} is unavailable on ${slotLabel}` });
      }
      if (card.roomId) {
        const room = rooms.get(card.roomId);
        claim(`r:${card.roomId}`, `Room ${room?.name ?? card.roomId}`, card, slotLabel);
        if (has(room?.unavailable, slot)) out.push({ cardIds: [card.id], message: `Room ${room!.name} is unavailable on ${slotLabel}` });
      }
      if (has(subjects.get(lesson.subjectId)?.unavailable, slot))
        out.push({ cardIds: [card.id], message: `${subjects.get(lesson.subjectId)!.name} is not allowed on ${slotLabel}` });
    }
    for (const t of lesson.teacherIds) teacherLoad.set(`${t}@${card.day}`, (teacherLoad.get(`${t}@${card.day}`) ?? 0) + len);
  }

  for (const [key, cs] of perDay) {
    const lesson = lessons.get(key.split('@')[0])!;
    if (cs.length > Math.max(1, lesson.maxPerDay))
      out.push({ cardIds: cs.map((c) => c.id), message: `${subjects.get(lesson.subjectId)?.name ?? 'Lesson'} appears ${cs.length}× on ${school.days[cs[0].day]} (max ${lesson.maxPerDay})` });
  }
  if (school.settings.maxTeacherPeriodsPerDayMode === 'hard') {
    for (const [key, load] of teacherLoad) {
      const [t, day] = key.split('@');
      const teacher = teachers.get(t);
      const max = teacher?.maxPerDay && teacher.maxPerDay > 0 ? teacher.maxPerDay : school.settings.maxTeacherPeriodsPerDay;
      if (max > 0 && load > max)
        out.push({ cardIds: [], message: `Teacher ${teacher?.name ?? t} teaches ${load} periods on ${school.days[+day]} (max ${max})` });
    }
  }
  return out;
}

/** Violations a move would introduce that involve the moved card (empty = move allowed). */
export function checkMove(project: Project, cardId: string, day: number, period: number, roomId?: string): Violation[] {
  const card = project.cards.find((c) => c.id === cardId);
  if (!card) return [{ cardIds: [cardId], message: 'Card not found' }];
  const moved: Card = { ...card, day, period, roomId: roomId === undefined ? card.roomId : roomId || undefined };
  const cards = project.cards.map((c) => (c.id === cardId ? moved : c));
  const lesson = project.lessons.find((l) => l.id === card.lessonId);
  const touched = new Set([...(lesson?.teacherIds ?? [])].map((t) => project.teachers.find((x) => x.id === t)?.name));
  return findViolations(project, cards).filter(
    (v) => v.cardIds.includes(cardId) || (!v.cardIds.length && [...touched].some((n) => n && v.message.includes(n))),
  );
}

/** Best room for a card at a new slot: keep current if free, else first free allowed room. */
export function suggestRoom(project: Project, cardId: string, day: number, period: number): string | undefined {
  const card = project.cards.find((c) => c.id === cardId);
  const lesson = card && project.lessons.find((l) => l.id === card.lessonId);
  if (!card || !lesson) return undefined;
  const allowed = lessonRooms(project, lesson);
  if (!allowed.length) return undefined;
  const len = unitLengths(lesson)[card.unit] ?? lesson.length;
  const lessons = new Map(project.lessons.map((l) => [l.id, l]));
  const busy = (roomId: string) =>
    project.cards.some((c) => {
      if (c.id === cardId || c.roomId !== roomId || c.day !== day) return false;
      const l = lessons.get(c.lessonId);
      const cl = l ? unitLengths(l)[c.unit] ?? l.length : 1;
      return c.period < period + len && period < c.period + cl;
    });
  const ordered = card.roomId && allowed.includes(card.roomId) ? [card.roomId, ...allowed.filter((r) => r !== card.roomId)] : allowed;
  return ordered.find((r) => !busy(r)) ?? ordered[0];
}
