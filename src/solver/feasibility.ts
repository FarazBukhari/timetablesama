import type { Project } from '../model/types';
import { buildContext } from './context';

export type Severity = 'error' | 'warning';

export interface FeasibilityIssue {
  severity: Severity;
  scope: string;
  message: string;
}

export interface FeasibilityReport {
  issues: FeasibilityIssue[];
  totalUnits: number;
  totalPeriods: number;
  slotsPerWeek: number;
}

/**
 * Pre-generation sanity check: compares the periods each teacher, class and room group needs
 * with the periods they actually have available, and flags lessons that can never be placed.
 */
export function checkFeasibility(project: Project): FeasibilityReport {
  const ctx = buildContext(project, []);
  const { D, P, N, units } = ctx;
  const issues: FeasibilityIssue[] = [];
  const err = (scope: string, message: string) => issues.push({ severity: 'error', scope, message });
  const warn = (scope: string, message: string) => issues.push({ severity: 'warning', scope, message });

  if (!D) err('School', 'No school days configured.');
  if (!P) err('School', 'The bell schedule has no teaching periods.');

  project.lessons.forEach((l) => {
    const subject = project.subjects.find((s) => s.id === l.subjectId);
    const label = `${subject?.name ?? 'Lesson'} (${l.classIds.map((c) => project.classes.find((x) => x.id === c)?.name ?? '?').join('+') || 'no class'})`;
    if (!subject) err(label, 'Lesson has no subject.');
    if (!l.classIds.length) err(label, 'Lesson has no class.');
    if (!l.teacherIds.length) warn(label, 'Lesson has no teacher.');
    if (l.periodsPerWeek <= 0) warn(label, 'Lesson has 0 periods per week and will be skipped.');
    const n = Math.ceil(l.periodsPerWeek / Math.max(1, l.length));
    if (n > D * Math.max(1, l.maxPerDay))
      err(label, `${n} units need more days than available (${D} days × max ${l.maxPerDay}/day).`);
  });
  const seen = new Set<string>();
  for (const u of units) {
    if (u.valid.length || seen.has(u.lessonId)) continue;
    seen.add(u.lessonId);
    const l = project.lessons[u.lessonIdx];
    const subject = project.subjects.find((s) => s.id === l.subjectId);
    err(subject?.name ?? 'Lesson', `A ${u.length}-period unit has no valid slot (check availability, breaks and allowed rooms).`);
  }

  const demand = (pred: (u: (typeof units)[number]) => boolean) =>
    units.reduce((n, u) => n + (pred(u) ? u.length : 0), 0);
  const free = (mask: Uint8Array) => N - mask.reduce((a, b) => a + b, 0);

  project.teachers.forEach((t, i) => {
    const need = demand((u) => u.teachers.includes(i));
    const have = free(ctx.teacherUnavail[i]);
    const max = ctx.teacherMaxPerDay[i];
    const capByDay = max > 0 && project.school.settings.maxTeacherPeriodsPerDayMode === 'hard' ? Math.min(have, max * D) : have;
    if (need > capByDay) err(`Teacher ${t.name}`, `Needs ${need} periods but only ${capByDay} are available.`);
    else if (need > capByDay * 0.9 && need > 0) warn(`Teacher ${t.name}`, `Very tight: ${need} of ${capByDay} available periods used.`);
  });
  project.classes.forEach((c, i) => {
    const need = demand((u) => u.classes.includes(i));
    const have = free(ctx.classUnavail[i]);
    if (need > have) err(`Class ${c.name}`, `Needs ${need} periods but only ${have} are available.`);
    else if (need === 0) warn(`Class ${c.name}`, 'Has no lessons.');
  });
  project.rooms.forEach((r, i) => {
    const need = demand((u) => u.rooms.length === 1 && u.rooms[0] === i);
    const have = free(ctx.roomUnavail[i]);
    if (need > have) err(`Room ${r.name}`, `Lessons restricted to this room need ${need} periods but only ${have} are available.`);
  });
  // Pairs of teacher+class that share lessons must fit into the slots both are free.
  const pairNeed = new Map<string, number>();
  for (const u of units)
    for (const t of u.teachers) for (const c of u.classes) pairNeed.set(`${t}:${c}`, (pairNeed.get(`${t}:${c}`) ?? 0) + u.length);
  for (const [key, need] of pairNeed) {
    const [t, c] = key.split(':').map(Number);
    let both = 0;
    for (let p = 0; p < N; p++) if (!ctx.teacherUnavail[t][p] && !ctx.classUnavail[c][p]) both++;
    if (need > both)
      err(`${project.teachers[t].name} + ${project.classes[c].name}`, `Need ${need} shared periods but are both free in only ${both}.`);
  }

  return {
    issues: issues.sort((a, b) => (a.severity === b.severity ? 0 : a.severity === 'error' ? -1 : 1)),
    totalUnits: units.length,
    totalPeriods: units.reduce((n, u) => n + u.length, 0),
    slotsPerWeek: N,
  };
}
