import { describe, expect, it } from 'vitest';
import { sampleProject } from '../model/sample';
import type { Project } from '../model/types';
import { generate } from './engine';
import { applyMove, clearCards, planMove } from './moves';
import { findViolations } from './validate';

const solved = (): Project => {
  const p = sampleProject();
  const r = generate(p, { timeLimitMs: 1500, seed: 7 });
  return { ...p, cards: r.cards, unplaced: r.unplaced };
};

/** First card with a free slot elsewhere, and that slot. */
function freeMove(p: Project) {
  for (const c of p.cards) {
    for (let d = 0; d < p.school.days.length; d++) {
      for (let q = 0; q < 7; q++) {
        if (d === c.day && q === c.period) continue;
        if (planMove(p, { type: 'card', cardId: c.id }, d, q).status === 'free') return { card: c, d, q };
      }
    }
  }
  throw new Error('no free move found');
}

/** A card and another slot occupied by exactly one lesson that it can swap with. */
function swapMove(p: Project) {
  for (const c of p.cards) {
    for (const o of p.cards) {
      if (o.id === c.id) continue;
      const plan = planMove(p, { type: 'card', cardId: c.id }, o.day, o.period);
      if (plan.canSwap) return { card: c, other: o, plan };
    }
  }
  throw new Error('no swap found');
}

describe('planMove / applyMove', () => {
  it('places into a free slot and auto-locks the moved lesson', () => {
    const p = solved();
    const { card, d, q } = freeMove(p);
    const next = applyMove(p, { type: 'card', cardId: card.id }, d, q, 'place', true);
    const moved = next.cards.find((c) => c.id === card.id)!;
    expect([moved.day, moved.period, moved.locked]).toEqual([d, q, true]);
    expect(findViolations(next)).toEqual([]);
  });

  it('does not lock when auto-lock is off', () => {
    const p = solved();
    const { card, d, q } = freeMove(p);
    const next = applyMove(p, { type: 'card', cardId: card.id }, d, q, 'place', false);
    expect(next.cards.find((c) => c.id === card.id)!.locked).toBe(false);
  });

  it('reports an occupied slot and can bump the lesson in the way to Unscheduled', () => {
    const p = solved();
    // Move a unit of a lesson onto another class-mate's slot; find any bumpable target.
    for (const c of p.cards) {
      for (const o of p.cards) {
        if (o.id === c.id) continue;
        const plan = planMove(p, { type: 'card', cardId: c.id }, o.day, o.period);
        if (plan.status === 'occupied' && plan.canBump) {
          const next = applyMove(p, { type: 'card', cardId: c.id }, o.day, o.period, 'bump', true);
          const moved = next.cards.find((x) => x.id === c.id)!;
          expect([moved.day, moved.period]).toEqual([o.day, o.period]);
          for (const b of plan.blockers) {
            expect(next.cards.some((x) => x.id === b.id)).toBe(false);
            expect(next.unplaced.some((u) => u.lessonId === b.lessonId && u.unit === b.unit)).toBe(true);
          }
          expect(findViolations(next)).toEqual([]);
          return;
        }
      }
    }
    throw new Error('no bumpable move found');
  });

  it('swaps two lessons when both fit in each other’s slot', () => {
    const p = solved();
    const { card, other } = swapMove(p);
    const next = applyMove(p, { type: 'card', cardId: card.id }, other.day, other.period, 'swap', true);
    const a = next.cards.find((x) => x.id === card.id)!;
    const b = next.cards.find((x) => x.id === other.id)!;
    expect([a.day, a.period, b.day, b.period]).toEqual([other.day, other.period, card.day, card.period]);
    expect(a.locked && b.locked).toBe(true);
    expect(findViolations(next)).toEqual([]);
  });

  it('never moves or bumps a fixed lesson', () => {
    const p = solved();
    const { card, other } = swapMove(p);
    const fixedOther = { ...p, cards: p.cards.map((c) => (c.id === other.id ? { ...c, fixed: true } : c)) };
    const plan = planMove(fixedOther, { type: 'card', cardId: card.id }, other.day, other.period);
    expect(plan.canBump || plan.canSwap).toBe(false);
    const fixedSelf = { ...p, cards: p.cards.map((c) => (c.id === card.id ? { ...c, fixed: true } : c)) };
    expect(planMove(fixedSelf, { type: 'card', cardId: card.id }, other.day, other.period).reason).toMatch(/fixed/);
  });

  it('places an unscheduled unit from the tray', () => {
    const p = solved();
    const { card, d, q } = freeMove(p);
    const tray = { ...p, cards: p.cards.filter((c) => c.id !== card.id) };
    const next = applyMove(tray, { type: 'unit', lessonId: card.lessonId, unit: card.unit }, d, q, 'place', true);
    expect(next.cards.length).toBe(p.cards.length);
    expect(findViolations(next)).toEqual([]);
  });
});

describe('clearCards and fixed lessons in the solver', () => {
  it('clear unlocked keeps locked and fixed; clear all keeps only fixed', () => {
    const p = solved();
    const [a, b] = p.cards;
    const marked = { ...p, cards: p.cards.map((c) => (c.id === a.id ? { ...c, locked: true } : c.id === b.id ? { ...c, fixed: true } : c)) };
    const unlockedCleared = clearCards(marked, true);
    expect(unlockedCleared.cards.map((c) => c.id).sort()).toEqual([a.id, b.id].sort());
    const allCleared = clearCards(marked, false);
    expect(allCleared.cards.map((c) => c.id)).toEqual([b.id]);
    expect(allCleared.unplaced.length).toBe(p.cards.length - 1);
  });

  it('keeps a fixed lesson in its slot when the timetable is created again', () => {
    const p = solved();
    const f = p.cards[5];
    const marked = { ...p, cards: p.cards.map((c) => (c.id === f.id ? { ...c, fixed: true, locked: false } : c)) };
    const again = generate(marked, { timeLimitMs: 800, seed: 99 });
    const kept = again.cards.find((c) => c.id === f.id)!;
    expect([kept.day, kept.period, kept.fixed]).toEqual([f.day, f.period, true]);
  });
});
