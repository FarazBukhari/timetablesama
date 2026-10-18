import { uid, unitLengths } from '../model/defaults';
import type { Card, Project } from '../model/types';
import { checkMove, findViolations, suggestRoom, type Violation } from './validate';

/** What is being moved: a placed card, or an unscheduled lesson unit from the tray. */
export type MoveSource = { type: 'card'; cardId: string } | { type: 'unit'; lessonId: string; unit: number };

export interface MovePlan {
  /** free: can go straight there. occupied: other lessons are in the way. blocked: a rule forbids it. */
  status: 'free' | 'occupied' | 'blocked';
  roomId?: string;
  violations: Violation[];
  /** Lessons that would have to make room. */
  blockers: Card[];
  /** Moving the blockers to Unscheduled makes the move valid. */
  canBump: boolean;
  /** Exactly one lesson is in the way and the two can trade places. */
  canSwap: boolean;
  /** Why the move is not possible, in plain words. */
  reason?: string;
}

export type MoveMode = 'place' | 'bump' | 'swap';

const TMP = '__moving__';

/** The project with the moving thing present as a card, and that card's id. */
function withSource(project: Project, src: MoveSource): { p: Project; cardId: string } {
  if (src.type === 'card') return { p: project, cardId: src.cardId };
  const tmp: Card = { id: TMP, lessonId: src.lessonId, unit: src.unit, day: -1, period: -1, locked: false };
  return { p: { ...project, cards: [...project.cards, tmp] }, cardId: TMP };
}

const at = (p: Project, cardId: string, day: number, period: number, roomId?: string): Project => ({
  ...p,
  cards: p.cards.map((c) => (c.id === cardId ? { ...c, day, period, roomId } : c)),
});

/** Works out what happens if `src` is dropped at (day, period). */
export function planMove(project: Project, src: MoveSource, day: number, period: number): MovePlan {
  const { p, cardId } = withSource(project, src);
  const moving = p.cards.find((c) => c.id === cardId);
  if (!moving) return { status: 'blocked', violations: [], blockers: [], canBump: false, canSwap: false, reason: 'Lesson not found.' };
  if (moving.fixed) {
    return { status: 'blocked', violations: [], blockers: [], canBump: false, canSwap: false, reason: 'This lesson is fixed to its slot. Unfix it first.' };
  }
  const roomId = suggestRoom(p, cardId, day, period);
  const violations = checkMove(p, cardId, day, period, roomId ?? '');
  if (!violations.length) return { status: 'free', roomId, violations, blockers: [], canBump: false, canSwap: false };

  const blockerIds = new Set(violations.flatMap((v) => v.cardIds).filter((id) => id !== cardId));
  const blockers = p.cards.filter((c) => blockerIds.has(c.id));
  if (!blockers.length) {
    return { status: 'blocked', roomId, violations, blockers, canBump: false, canSwap: false, reason: violations[0].message };
  }
  if (blockers.some((b) => b.fixed)) {
    return {
      status: 'blocked', roomId, violations, blockers, canBump: false, canSwap: false,
      reason: 'A lesson fixed to that slot is in the way.',
    };
  }

  // Bump: take the blockers out, then the move must be valid on its own.
  const without = { ...p, cards: p.cards.filter((c) => !blockerIds.has(c.id)) };
  const bumpRoom = suggestRoom(without, cardId, day, period);
  const canBump = checkMove(without, cardId, day, period, bumpRoom ?? '').length === 0;

  // Swap: one lesson in the way, which goes to where the moving lesson came from.
  let canSwap = false;
  if (src.type === 'card' && blockers.length === 1 && moving.day >= 0) {
    const other = blockers[0];
    let q = at(p, cardId, day, period, moving.roomId);
    q = at(q, other.id, moving.day, moving.period, other.roomId);
    const roomA = suggestRoom(q, cardId, day, period);
    const roomB = suggestRoom(q, other.id, moving.day, moving.period);
    q = at(at(q, cardId, day, period, roomA), other.id, moving.day, moving.period, roomB);
    canSwap = !findViolations(q).some((v) => v.cardIds.includes(cardId) || v.cardIds.includes(other.id) || !v.cardIds.length);
  }

  return {
    status: 'occupied', roomId: canBump ? bumpRoom : roomId, violations, blockers, canBump, canSwap,
    reason: canBump || canSwap ? undefined : violations[0].message,
  };
}

/** Applies a move. Moved lessons are locked when `autoLock` is on. Returns the new project. */
export function applyMove(project: Project, src: MoveSource, day: number, period: number, mode: MoveMode, autoLock: boolean): Project {
  const plan = planMove(project, src, day, period);
  const lessons = new Map(project.lessons.map((l) => [l.id, l]));
  const lengthOf = (c: Card) => {
    const l = lessons.get(c.lessonId);
    return l ? unitLengths(l)[c.unit] ?? l.length : 1;
  };
  let cards = project.cards;
  let unplaced = project.unplaced;

  if (mode === 'bump' && plan.canBump) {
    const out = new Set(plan.blockers.map((b) => b.id));
    unplaced = [
      ...unplaced,
      ...plan.blockers.map((b) => ({ lessonId: b.lessonId, unit: b.unit, length: lengthOf(b), reason: 'Moved out by hand to make room.' })),
    ];
    cards = cards.filter((c) => !out.has(c.id));
  } else if (mode === 'swap' && plan.canSwap && src.type === 'card') {
    const moving = cards.find((c) => c.id === src.cardId)!;
    const other = plan.blockers[0];
    let q: Project = { ...project, cards };
    q = at(at(q, moving.id, day, period, moving.roomId), other.id, moving.day, moving.period, other.roomId);
    const roomA = suggestRoom(q, moving.id, day, period);
    const roomB = suggestRoom(q, other.id, moving.day, moving.period);
    cards = q.cards.map((c) =>
      c.id === moving.id ? { ...c, roomId: roomA, locked: c.locked || autoLock }
        : c.id === other.id ? { ...c, roomId: roomB, locked: c.locked || autoLock } : c);
    return { ...project, cards, unplaced };
  } else if (mode !== 'place' || plan.status !== 'free') {
    return project;
  }

  // Re-plan on the cleared board to get the right room, then place.
  const base: Project = { ...project, cards, unplaced };
  const roomId = mode === 'bump' ? planMove(base, src, day, period).roomId : plan.roomId;
  if (src.type === 'card') {
    cards = cards.map((c) => (c.id === src.cardId ? { ...c, day, period, roomId, locked: c.locked || autoLock } : c));
  } else {
    cards = [...cards, { id: uid('k'), lessonId: src.lessonId, unit: src.unit, day, period, roomId, locked: autoLock }];
    unplaced = unplaced.filter((u) => !(u.lessonId === src.lessonId && u.unit === src.unit));
  }
  return { ...project, cards, unplaced };
}

/** Removes lessons from the timetable back to Unscheduled. `keepLocked` keeps locked ones too; fixed ones always stay. */
export function clearCards(project: Project, keepLocked: boolean): Project {
  const keep = (c: Card) => !!c.fixed || (keepLocked && c.locked);
  const lessons = new Map(project.lessons.map((l) => [l.id, l]));
  const removed = project.cards.filter((c) => !keep(c));
  return {
    ...project,
    cards: project.cards.filter(keep).map((c) => (keepLocked ? c : { ...c, locked: false })),
    unplaced: [
      ...project.unplaced.filter((u) => !removed.some((c) => c.lessonId === u.lessonId && c.unit === u.unit)),
      ...removed.map((c) => {
        const l = lessons.get(c.lessonId);
        return { lessonId: c.lessonId, unit: c.unit, length: l ? unitLengths(l)[c.unit] ?? 1 : 1, reason: 'Cleared by hand.' };
      }),
    ],
  };
}
