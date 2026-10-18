import { describe, expect, it } from 'vitest';
import { newLesson, unitLengths } from '../model/defaults';
import { sampleProject } from '../model/sample';
import { slotKey, type Project } from '../model/types';
import { generate } from './engine';
import { checkFeasibility } from './feasibility';
import { checkMove, findViolations } from './validate';

const run = (p: Project, ms = 1500) => {
  const res = generate(p, { timeLimitMs: ms, seed: 7 });
  return { res, project: { ...p, cards: res.cards, unplaced: res.unplaced } };
};

describe('unitLengths', () => {
  it('splits periods into units with a shorter remainder', () => {
    expect(unitLengths({ periodsPerWeek: 5, length: 2 })).toEqual([2, 2, 1]);
    expect(unitLengths({ periodsPerWeek: 4, length: 1 })).toEqual([1, 1, 1, 1]);
    expect(unitLengths({ periodsPerWeek: 0, length: 2 })).toEqual([]);
  });
});

describe('generate', () => {
  it('places every lesson of the sample school without hard violations', () => {
    const { res, project } = run(sampleProject(), 3000);
    const expected = sampleProject().lessons.reduce((n, l) => n + unitLengths(l).length, 0);
    expect(res.unplaced).toEqual([]);
    expect(res.cards).toHaveLength(expected);
    expect(findViolations(project)).toEqual([]);
  });

  it('is deterministic for a given seed when bounded by iterations', () => {
    const p = sampleProject();
    const a = generate(p, { seed: 3, maxIterations: 200, timeLimitMs: 60_000 });
    const b = generate(p, { seed: 3, maxIterations: 200, timeLimitMs: 60_000 });
    expect(a.cards.map((c) => [c.lessonId, c.unit, c.day, c.period, c.roomId])).toEqual(
      b.cards.map((c) => [c.lessonId, c.unit, c.day, c.period, c.roomId]),
    );
  });

  it('respects teacher unavailability and never splits doubles across breaks', () => {
    const { project } = run(sampleProject());
    const hist = project.teachers.find((t) => t.name === 'Hannah Price')!;
    const histLessons = new Set(project.lessons.filter((l) => l.teacherIds.includes(hist.id)).map((l) => l.id));
    expect(project.cards.filter((c) => histLessons.has(c.lessonId)).every((c) => c.day !== 4)).toBe(true);
    // Sample bell schedule has breaks after teaching periods 2 and 4 (indices 1 and 3).
    const doubles = project.cards.filter((c) => {
      const l = project.lessons.find((x) => x.id === c.lessonId)!;
      return unitLengths(l)[c.unit] === 2;
    });
    expect(doubles.length).toBeGreaterThan(0);
    expect(doubles.every((c) => c.period !== 1 && c.period !== 3 && c.period !== 6)).toBe(true);
  });

  it('keeps locked cards in place', () => {
    const base = run(sampleProject()).project;
    const target = base.cards[0];
    const locked = { ...base, cards: base.cards.map((c) => (c.id === target.id ? { ...c, locked: true } : c)) };
    const again = generate(locked, { timeLimitMs: 1000, seed: 99 });
    const kept = again.cards.find((c) => c.id === target.id)!;
    expect([kept.day, kept.period, kept.roomId, kept.locked]).toEqual([target.day, target.period, target.roomId, true]);
  });

  it('reports a reason for lessons that cannot fit', () => {
    const p = sampleProject();
    const cls = p.classes[0];
    // 40 extra periods for a class that only has 35 slots in the week.
    p.lessons.push(newLesson({ classIds: [cls.id], subjectId: p.subjects[0].id, teacherIds: [p.teachers[0].id], periodsPerWeek: 10, maxPerDay: 2 }));
    const { res, project } = run(p, 800);
    expect(res.unplaced.length).toBeGreaterThan(0);
    expect(res.unplaced[0].reason).toMatch(/taken|slot/);
    expect(findViolations(project)).toEqual([]);
  });

  it('explains impossible availability', () => {
    const p = sampleProject();
    const t = p.teachers[0];
    t.unavailable = Array.from({ length: 5 }, (_, d) => Array.from({ length: 7 }, (_, q) => slotKey(d, q))).flat();
    const { res } = run(p, 300);
    expect(res.unplaced.some((u) => /unavailable/.test(u.reason))).toBe(true);
  });
});

describe('feasibility', () => {
  it('passes the sample school with no errors', () => {
    const report = checkFeasibility(sampleProject());
    expect(report.issues.filter((i) => i.severity === 'error')).toEqual([]);
    // 28 periods per class plus 3 joint PE lessons of 2 periods each.
    expect(report.totalPeriods).toBe(6 * 28 + 3 * 2);
  });

  it('flags overloaded classes', () => {
    const p = sampleProject();
    p.lessons.push(newLesson({ classIds: [p.classes[0].id], subjectId: p.subjects[0].id, teacherIds: [p.teachers[1].id], periodsPerWeek: 10, maxPerDay: 2 }));
    const report = checkFeasibility(p);
    expect(report.issues.some((i) => i.scope === 'Class 6A' && i.severity === 'error')).toBe(true);
  });
});

describe('checkMove', () => {
  it('rejects moving a card onto a busy class slot and accepts a free one', () => {
    const { project } = run(sampleProject());
    const cls = project.classes[0];
    const classCards = project.cards.filter((c) => project.lessons.find((l) => l.id === c.lessonId)!.classIds.includes(cls.id));
    const single = classCards.find((c) => unitLengths(project.lessons.find((l) => l.id === c.lessonId)!)[c.unit] === 1)!;
    const other = classCards.find((c) => c.id !== single.id && (c.day !== single.day || c.period !== single.period))!;
    expect(checkMove(project, single.id, other.day, other.period).length).toBeGreaterThan(0);
    expect(checkMove(project, single.id, single.day, single.period)).toEqual([]);
  });
});
