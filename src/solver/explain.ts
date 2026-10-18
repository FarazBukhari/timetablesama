import { blockFits, type Unit } from './context';
import type { State } from './engine';

const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;

/** Human-readable reason why a unit could not be placed in the final state. */
export function explainUnplaced(s: State, u: Unit): string {
  const { ctx } = s;
  const { project, D, P } = ctx;
  const avoid = project.school.settings.avoidBreaksInMultiPeriod;

  if (!u.teachers.length && !u.classes.length) return 'Lesson has no class or teacher assigned.';
  if (u.subject < 0) return 'Lesson has no subject.';

  if (!u.valid.length) {
    let fits = 0;
    const blockers = new Map<string, number>();
    const bump = (k: string) => blockers.set(k, (blockers.get(k) ?? 0) + 1);
    for (let d = 0; d < D; d++) {
      for (let p = 0; p < P; p++) {
        if (!blockFits(ctx.breakAfter, P, p, u.length, avoid)) continue;
        fits++;
        for (let i = p; i < p + u.length; i++) {
          const pos = d * P + i;
          u.teachers.forEach((t) => ctx.teacherUnavail[t][pos] && bump(`teacher ${project.teachers[t].name} is unavailable`));
          u.classes.forEach((c) => ctx.classUnavail[c][pos] && bump(`class ${project.classes[c].name} is unavailable`));
          if (ctx.subjectUnavail[u.subject][pos]) bump(`${project.subjects[u.subject].name} is not allowed`);
          if (u.rooms.length && u.rooms.every((r) => ctx.roomUnavail[r][pos])) bump('no allowed room is available');
        }
      }
    }
    if (!fits) {
      return u.length > 1
        ? `A block of ${u.length} consecutive periods does not fit in the school day${avoid ? ' without crossing a break' : ''}.`
        : 'The bell schedule has no teaching periods.';
    }
    const top = [...blockers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(([k]) => k);
    return `No valid slot: ${top.join('; ') || 'availability rules exclude every slot'}.`;
  }

  // Valid slots exist, but all are occupied in the final timetable: tally who blocks them.
  const busy = new Map<string, number>();
  const bump = (k: string) => busy.set(k, (busy.get(k) ?? 0) + 1);
  let dailyLimit = 0;
  for (let k = 0; k < u.valid.length; k++) {
    const start = u.valid[k];
    const day = Math.floor(start / P);
    const hit = new Set<string>();
    for (let i = 0; i < u.length; i++) {
      const pos = start + i;
      u.teachers.forEach((t) => s.teacherAt[t][pos] >= 0 && hit.add(`teacher ${project.teachers[t].name}`));
      u.classes.forEach((c) => s.classAt[c][pos] >= 0 && hit.add(`class ${project.classes[c].name}`));
    }
    if (u.validRooms[k].length && u.validRooms[k].every((r) => {
      for (let i = 0; i < u.length; i++) if (s.roomAt[r][start + i] >= 0) return true;
      return false;
    })) hit.add(u.validRooms[k].length === 1 ? `room ${project.rooms[u.validRooms[k][0]].name}` : 'all allowed rooms');
    if (s.lessonDay[u.lessonIdx][day] >= u.maxPerDay) dailyLimit++;
    hit.forEach(bump);
  }
  const top = [...busy.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
  const parts = top.map(([k, n]) => `${k} busy in ${plural(n, 'slot')}`);
  if (dailyLimit) parts.push(`daily limit for this lesson reached on ${plural(Math.round(dailyLimit / P), 'day')}`);
  return `All ${plural(u.valid.length, 'possible slot')} are taken: ${parts.join(', ') || 'too many lessons compete for the same time'}. Try freeing availability, adding rooms, or reducing periods.`;
}
