import { teachingPeriods, unitLengths } from '../model/defaults';
import type { Card, Id, Lesson, Project, Room, SchoolClass, Subject, Teacher } from '../model/types';

export type ViewKind = 'class' | 'teacher' | 'room';

/** A card resolved against the project's entities. */
export interface ResolvedCard {
  card: Card;
  lesson: Lesson;
  subject: Subject | undefined;
  teachers: Teacher[];
  classes: SchoolClass[];
  room: Room | undefined;
}

export interface CellEntry extends ResolvedCard {
  /** True only on the first period a (multi-period) card covers. */
  isStart: boolean;
}

/** `[day][teachingPeriod]`; breaks are not included. */
export type Grid = (CellEntry | null)[][];

const byId = <T extends { id: Id }>(items: T[]) => new Map(items.map((x) => [x.id, x]));
const pick = <T>(map: Map<Id, T>, ids: Id[]) => ids.flatMap((id) => (map.has(id) ? [map.get(id)!] : []));

/** Returns a function that resolves cards to their lesson/subject/teachers/classes/room (null if the lesson is gone). */
export function cardResolver(project: Project): (card: Card) => ResolvedCard | null {
  const lessons = byId(project.lessons), subjects = byId(project.subjects), teachers = byId(project.teachers);
  const classes = byId(project.classes), rooms = byId(project.rooms);
  return (card) => {
    const lesson = lessons.get(card.lessonId);
    if (!lesson) return null;
    return {
      card,
      lesson,
      subject: subjects.get(lesson.subjectId),
      teachers: pick(teachers, lesson.teacherIds),
      classes: pick(classes, lesson.classIds),
      room: card.roomId ? rooms.get(card.roomId) : undefined,
    };
  };
}

/** Number of consecutive teaching periods a card covers. */
export function cardLength(project: Project, card: Card): number {
  const lesson = project.lessons.find((l) => l.id === card.lessonId);
  return (lesson && unitLengths(lesson)[card.unit]) || Math.max(1, lesson?.length ?? 1);
}

export function cardBelongsTo(card: Card, lesson: Lesson, kind: ViewKind, entityId: Id): boolean {
  if (kind === 'class') return lesson.classIds.includes(entityId);
  if (kind === 'teacher') return lesson.teacherIds.includes(entityId);
  return card.roomId === entityId;
}

export function buildGrid(project: Project, kind: ViewKind, entityId: Id): Grid {
  const periods = teachingPeriods(project.school.periods).length;
  const grid: Grid = project.school.days.map(() => Array<CellEntry | null>(periods).fill(null));
  const resolve = cardResolver(project);
  for (const card of project.cards) {
    const r = resolve(card);
    if (!r || !cardBelongsTo(card, r.lesson, kind, entityId) || !grid[card.day]) continue;
    const len = cardLength(project, card);
    for (let p = card.period; p < Math.min(card.period + len, periods); p++) {
      grid[card.day][p] ??= { ...r, isStart: p === card.period };
    }
  }
  return grid;
}

const join = (xs: string[]) => xs.filter(Boolean).join('+');

/** Short cell text: what the viewer needs besides the entity being viewed. */
export function describeCell(entry: ResolvedCard | null, kind: ViewKind): string {
  if (!entry) return '';
  const subject = entry.subject?.code || entry.subject?.name || '?';
  const teachers = join(entry.teachers.map((t) => t.code || t.name));
  const classes = join(entry.classes.map((c) => c.name));
  const room = entry.room?.name ?? '';
  const parts = kind === 'class' ? [subject, teachers, room] : kind === 'teacher' ? [subject, classes, room] : [subject, classes, teachers];
  return parts.filter(Boolean).join(' · ');
}

/** Column label for a teaching period, e.g. "Period 1 (08:00-08:45)". */
export const periodLabel = (p: { name: string; start: string; end: string }) => `${p.name} (${p.start}-${p.end})`;
