import { uid } from '../model/defaults';
import type { Card, Project, UnplacedUnit } from '../model/types';
import { buildContext, type Context, type Unit } from './context';
import { explainUnplaced } from './explain';
import { mulberry32 } from './rng';

export interface GenerateProgress {
  phase: 'construct' | 'repair' | 'optimize' | 'done';
  placed: number;
  total: number;
  bestUnplaced: number;
  softCost: number;
  iteration: number;
  elapsedMs: number;
}

export interface GenerateOptions {
  timeLimitMs?: number;
  seed?: number;
  /** Hard cap on repair iterations (useful for tests). */
  maxIterations?: number;
  onProgress?: (p: GenerateProgress) => void;
  now?: () => number;
}

export interface GenerateResult {
  cards: Card[];
  unplaced: UnplacedUnit[];
  softCost: number;
  iterations: number;
  elapsedMs: number;
}

const EMPTY = -1;
const CONFLICT_COST = 1000;

/** Mutable timetable state with occupancy grids indexed by resource and position. */
export class State {
  pos: Int32Array;
  room: Int32Array;
  teacherAt: Int32Array[];
  classAt: Int32Array[];
  roomAt: Int32Array[];
  lessonDay: Int32Array[];
  teacherDay: Int32Array[];

  constructor(readonly ctx: Context) {
    const { N, D, units, project } = ctx;
    const grid = (n: number) => Array.from({ length: n }, () => new Int32Array(N).fill(EMPTY));
    this.pos = new Int32Array(units.length).fill(EMPTY);
    this.room = new Int32Array(units.length).fill(EMPTY);
    this.teacherAt = grid(project.teachers.length);
    this.classAt = grid(project.classes.length);
    this.roomAt = grid(project.rooms.length);
    this.lessonDay = project.lessons.map(() => new Int32Array(D));
    this.teacherDay = project.teachers.map(() => new Int32Array(D));
  }

  place(u: Unit, start: number, room: number) {
    const day = Math.floor(start / this.ctx.P);
    for (let i = 0; i < u.length; i++) {
      const p = start + i;
      for (const t of u.teachers) this.teacherAt[t][p] = u.idx;
      for (const c of u.classes) this.classAt[c][p] = u.idx;
      if (room >= 0) this.roomAt[room][p] = u.idx;
    }
    for (const t of u.teachers) this.teacherDay[t][day] += u.length;
    this.lessonDay[u.lessonIdx][day]++;
    this.pos[u.idx] = start;
    this.room[u.idx] = room;
  }

  remove(u: Unit) {
    const start = this.pos[u.idx];
    if (start < 0) return;
    const room = this.room[u.idx];
    const day = Math.floor(start / this.ctx.P);
    for (let i = 0; i < u.length; i++) {
      const p = start + i;
      for (const t of u.teachers) if (this.teacherAt[t][p] === u.idx) this.teacherAt[t][p] = EMPTY;
      for (const c of u.classes) if (this.classAt[c][p] === u.idx) this.classAt[c][p] = EMPTY;
      if (room >= 0 && this.roomAt[room][p] === u.idx) this.roomAt[room][p] = EMPTY;
    }
    for (const t of u.teachers) this.teacherDay[t][day] -= u.length;
    this.lessonDay[u.lessonIdx][day]--;
    this.pos[u.idx] = EMPTY;
    this.room[u.idx] = EMPTY;
  }

  snapshot() {
    return { pos: this.pos.slice(), room: this.room.slice() };
  }
}

/** Units that must be ejected to put `u` at `start` (excluding room), or null if a locked unit blocks it. */
function conflictsAt(s: State, u: Unit, start: number, out: Set<number>): boolean {
  const { ctx } = s;
  const { units, P } = ctx;
  for (let i = 0; i < u.length; i++) {
    const p = start + i;
    for (const t of u.teachers) {
      const v = s.teacherAt[t][p];
      if (v !== EMPTY && v !== u.idx) out.add(v);
    }
    for (const c of u.classes) {
      const v = s.classAt[c][p];
      if (v !== EMPTY && v !== u.idx) out.add(v);
    }
  }
  const day = Math.floor(start / P);
  // Same lesson already at its daily limit: eject one sibling on that day.
  const siblings = ctx.unitsByLesson[u.lessonIdx];
  let sameDay = 0;
  let firstSibling = -1;
  for (const v of siblings) {
    if (v === u.idx || s.pos[v] < 0 || Math.floor(s.pos[v] / P) !== day) continue;
    sameDay++;
    if (!out.has(v) && (firstSibling < 0 || units[firstSibling].locked)) firstSibling = v;
  }
  if (sameDay >= u.maxPerDay && firstSibling >= 0) out.add(firstSibling);
  // Hard per-day teacher load.
  if (ctx.project.school.settings.maxTeacherPeriodsPerDayMode === 'hard') {
    for (const t of u.teachers) {
      const max = ctx.teacherMaxPerDay[t];
      if (max <= 0) continue;
      let load = s.teacherDay[t][day] + u.length;
      if (s.pos[u.idx] >= 0 && Math.floor(s.pos[u.idx] / P) === day && u.teachers.includes(t)) load -= u.length;
      for (const v of out) {
        const vu = units[v];
        if (vu.teachers.includes(t) && Math.floor(s.pos[v] / P) === day) load -= vu.length;
      }
      for (let p = day * P; p < (day + 1) * P && load > max; p++) {
        const v = s.teacherAt[t][p];
        if (v !== EMPTY && v !== u.idx && !out.has(v) && !units[v].locked) {
          out.add(v);
          load -= units[v].length;
        }
      }
      if (load > max) return false;
    }
  }
  for (const v of out) if (units[v].locked) return false;
  return true;
}

/** Picks the room with the fewest occupants for the block; returns [room, occupantSet]. */
function pickRoom(s: State, u: Unit, start: number, rooms: number[], out: Set<number>): number {
  if (!rooms.length) return EMPTY;
  let best = rooms[0];
  let bestCount = Infinity;
  for (const r of rooms) {
    let count = 0;
    let locked = false;
    for (let i = 0; i < u.length; i++) {
      const v = s.roomAt[r][start + i];
      if (v !== EMPTY && v !== u.idx && !out.has(v)) {
        count++;
        if (s.ctx.units[v].locked) locked = true;
      }
    }
    if (locked) continue;
    if (count < bestCount) {
      bestCount = count;
      best = r;
      if (count === 0) break;
    }
  }
  if (bestCount === Infinity) return -2;
  for (let i = 0; i < u.length; i++) {
    const v = s.roomAt[best][start + i];
    if (v !== EMPTY && v !== u.idx) out.add(v);
  }
  return best;
}

// ---------- soft constraints ----------

function rowCost(at: Int32Array, day: number, P: number, gapW: number, maxConsec: number, consecW: number): number {
  let first = -1;
  let last = -1;
  let busy = 0;
  let run = 0;
  let overflow = 0;
  for (let p = 0; p < P; p++) {
    if (at[day * P + p] !== EMPTY) {
      if (first < 0) first = p;
      last = p;
      busy++;
      run++;
      if (maxConsec > 0 && run > maxConsec) overflow++;
    } else run = 0;
  }
  if (first < 0) return 0;
  const gaps = last - first + 1 - busy;
  return gaps * gapW + overflow * consecW;
}

export class SoftScorer {
  constructor(readonly s: State) {}

  teacherDay(t: number, day: number): number {
    const { ctx } = this.s;
    const st = ctx.project.school.settings;
    let cost = rowCost(this.s.teacherAt[t], day, ctx.P, st.teacherGapWeight, st.maxConsecutivePeriods, st.maxConsecutiveWeight);
    if (st.maxTeacherPeriodsPerDayMode === 'soft') {
      const max = ctx.teacherMaxPerDay[t];
      if (max > 0) cost += Math.max(0, this.s.teacherDay[t][day] - max) * 10;
    }
    return cost;
  }

  classDay(c: number, day: number): number {
    const { ctx } = this.s;
    return rowCost(this.s.classAt[c], day, ctx.P, ctx.project.school.settings.classGapWeight, 0, 0);
  }

  lesson(li: number): number {
    const { ctx } = this.s;
    const st = ctx.project.school.settings;
    const days = this.s.lessonDay[li];
    let cost = 0;
    for (let d = 0; d < ctx.D; d++) {
      if (days[d] > 1) cost += (days[d] - 1) * st.spreadWeight;
      if (d > 0 && days[d] > 0 && days[d - 1] > 0) cost += st.spreadWeight / 3;
    }
    if (st.periodConsistency) {
      const periods = new Set<number>();
      for (const v of ctx.unitsByLesson[li]) if (this.s.pos[v] >= 0) periods.add(this.s.pos[v] % ctx.P);
      if (periods.size > 1) cost += (periods.size - 1) * st.periodConsistencyWeight;
    }
    return cost;
  }

  /** Soft cost over everything touched by the given units on the given days. */
  local(us: Unit[], days: number[]): number {
    const tSeen = new Set<number>();
    const cSeen = new Set<number>();
    const lSeen = new Set<number>();
    let cost = 0;
    for (const u of us) {
      for (const t of u.teachers) tSeen.add(t);
      for (const c of u.classes) cSeen.add(c);
      lSeen.add(u.lessonIdx);
    }
    const dSet = new Set(days.filter((d) => d >= 0));
    for (const d of dSet) {
      for (const t of tSeen) cost += this.teacherDay(t, d);
      for (const c of cSeen) cost += this.classDay(c, d);
    }
    for (const l of lSeen) cost += this.lesson(l);
    return cost;
  }

  total(): number {
    const { ctx } = this.s;
    let cost = 0;
    for (let d = 0; d < ctx.D; d++) {
      for (let t = 0; t < ctx.project.teachers.length; t++) cost += this.teacherDay(t, d);
      for (let c = 0; c < ctx.project.classes.length; c++) cost += this.classDay(c, d);
    }
    for (let l = 0; l < ctx.project.lessons.length; l++) cost += this.lesson(l);
    return cost;
  }
}

// ---------- main entry ----------

export function generate(project: Project, opts: GenerateOptions = {}): GenerateResult {
  const now = opts.now ?? (() => (typeof performance !== 'undefined' ? performance.now() : Date.now()));
  const t0 = now();
  const settings = project.school.settings;
  const timeLimit = opts.timeLimitMs ?? settings.timeLimitSec * 1000;
  const rng = mulberry32(opts.seed ?? settings.seed);
  const ctx = buildContext(project);
  const { units, P } = ctx;
  const s = new State(ctx);
  const scorer = new SoftScorer(s);
  const elapsed = () => now() - t0;
  let iteration = 0;

  const report = (phase: GenerateProgress['phase'], bestUnplaced: number) => {
    if (!opts.onProgress) return;
    let placed = 0;
    for (let i = 0; i < units.length; i++) if (s.pos[i] >= 0) placed++;
    opts.onProgress({
      phase, placed, total: units.length, bestUnplaced, softCost: phase === 'construct' ? 0 : scorer.total(),
      iteration, elapsedMs: elapsed(),
    });
  };

  // 1. Locked units go first, exactly where the user put them.
  const lockedClash = new Set<number>();
  for (const u of units) {
    if (!u.locked) continue;
    const { pos, room } = u.locked;
    const conf = new Set<number>();
    if ((pos % P) + u.length > P || !conflictsAt(s, u, pos, conf)) {
      lockedClash.add(u.idx);
      continue;
    }
    if (room >= 0) for (let i = 0; i < u.length; i++) if (s.roomAt[room][pos + i] !== EMPTY) conf.add(s.roomAt[room][pos + i]);
    if (conf.size) lockedClash.add(u.idx);
    else s.place(u, pos, room);
  }
  const free = units.filter((u) => !u.locked);

  // 2. Greedy construction, most constrained first.
  const order = free
    .map((u) => ({ u, key: u.valid.length / (u.length * (u.teachers.length + u.classes.length + 1)) + rng() * 1e-3 }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.u);

  const tryBestFree = (u: Unit): boolean => {
    let best = -1;
    let bestRoom = EMPTY;
    let bestCost = Infinity;
    const conf = new Set<number>();
    for (let k = 0; k < u.valid.length; k++) {
      const start = u.valid[k];
      conf.clear();
      if (!conflictsAt(s, u, start, conf) || conf.size) continue;
      const room = pickRoom(s, u, start, u.validRooms[k], conf);
      if (room === -2 || conf.size) continue;
      const day = Math.floor(start / P);
      const before = scorer.local([u], [day]);
      s.place(u, start, room);
      const cost = scorer.local([u], [day]) - before + rng() * 0.5;
      s.remove(u);
      if (cost < bestCost) {
        bestCost = cost;
        best = start;
        bestRoom = room;
      }
    }
    if (best < 0) return false;
    s.place(u, best, bestRoom);
    return true;
  };

  for (const u of order) tryBestFree(u);
  const unplacedCount = () => free.reduce((n, u) => n + (s.pos[u.idx] < 0 ? u.length : 0), 0);
  let best = s.snapshot();
  let bestUnplaced = unplacedCount();
  report('construct', bestUnplaced);

  // 3. Conflict-directed repair with ejection + tabu.
  const ejections = new Float64Array(units.length);
  const tabu = new Map<number, number>(); // unit*N+pos -> iteration until which it's tabu
  const tenure = 10;
  const maxIter = opts.maxIterations ?? Infinity;
  const repairBudget = timeLimit * 0.7;
  let lastReport = elapsed();
  while (bestUnplaced > 0 && iteration < maxIter && elapsed() < repairBudget) {
    iteration++;
    const pending = free.filter((u) => s.pos[u.idx] < 0 && u.valid.length);
    if (!pending.length) break;
    // Prefer the hardest pending units, with randomness to escape cycles.
    pending.sort((a, b) => a.valid.length - b.valid.length);
    const u = pending[Math.floor(Math.pow(rng(), 2) * pending.length)];

    let choice = -1;
    let choiceRoom = EMPTY;
    let choiceConf: number[] = [];
    let choiceCost = Infinity;
    const conf = new Set<number>();
    for (let k = 0; k < u.valid.length; k++) {
      const start = u.valid[k];
      conf.clear();
      if (!conflictsAt(s, u, start, conf)) continue;
      const room = pickRoom(s, u, start, u.validRooms[k], conf);
      if (room === -2) continue;
      let cost = 0;
      for (const v of conf) cost += CONFLICT_COST * units[v].length * (1 + ejections[v] * 0.2);
      if ((tabu.get(u.idx * ctx.N + start) ?? 0) > iteration) cost += CONFLICT_COST * 50;
      cost += rng() * CONFLICT_COST * 0.9;
      if (cost < choiceCost) {
        choiceCost = cost;
        choice = start;
        choiceRoom = room;
        choiceConf = [...conf];
      }
    }
    if (choice < 0) continue;
    for (const v of choiceConf) {
      tabu.set(v * ctx.N + s.pos[v], iteration + tenure + Math.floor(rng() * tenure));
      ejections[v]++;
      s.remove(units[v]);
    }
    s.place(u, choice, choiceRoom);
    // Ejected units get an immediate chance to land somewhere free.
    for (const v of choiceConf) tryBestFree(units[v]);

    const cur = unplacedCount();
    if (cur < bestUnplaced) {
      bestUnplaced = cur;
      best = s.snapshot();
    }
    if (elapsed() - lastReport > 150) {
      lastReport = elapsed();
      report('repair', bestUnplaced);
    }
  }

  // Restore best state found.
  for (const u of free) s.remove(u);
  for (const u of free) if (best.pos[u.idx] >= 0) s.place(u, best.pos[u.idx], best.room[u.idx]);

  // 4. Soft-constraint optimisation: hill climbing with sideways moves.
  const movable = free.filter((u) => s.pos[u.idx] >= 0);
  const conf = new Set<number>();
  let optIter = 0;
  let stall = 0;
  let current = scorer.total();
  while (movable.length && current > 0 && stall < 40_000 && elapsed() < timeLimit && optIter < (opts.maxIterations ?? Infinity) * 20) {
    optIter++;
    stall++;
    const u = movable[Math.floor(rng() * movable.length)];
    const k = Math.floor(rng() * u.valid.length);
    const start = u.valid[k];
    const oldStart = s.pos[u.idx];
    const oldRoom = s.room[u.idx];
    if (start === oldStart) continue;
    const days = [Math.floor(oldStart / P), Math.floor(start / P)];
    const before = scorer.local([u], days);
    s.remove(u);
    conf.clear();
    const room = conflictsAt(s, u, start, conf) && !conf.size ? pickRoom(s, u, start, u.validRooms[k], conf) : -2;
    if (room === -2 || conf.size) {
      s.place(u, oldStart, oldRoom);
      continue;
    }
    s.place(u, start, room);
    const after = scorer.local([u], days);
    if (after > before) {
      s.remove(u);
      s.place(u, oldStart, oldRoom);
    } else if (after < before) {
      current += after - before;
      stall = 0;
    }
    if (elapsed() - lastReport > 250) {
      lastReport = elapsed();
      report('optimize', bestUnplaced);
    }
  }

  // 5. Build output.
  const existing = new Map(project.cards.map((c) => [`${c.lessonId}#${c.unit}`, c]));
  const cards: Card[] = [];
  const unplaced: UnplacedUnit[] = [];
  for (const u of units) {
    const start = s.pos[u.idx];
    if (start < 0) {
      unplaced.push({
        lessonId: u.lessonId, unit: u.unit, length: u.length,
        reason: lockedClash.has(u.idx) ? 'Locked card clashes with another locked card or does not fit the day.' : explainUnplaced(s, u),
      });
      continue;
    }
    const room = s.room[u.idx];
    cards.push({
      id: u.locked?.cardId ?? existing.get(`${u.lessonId}#${u.unit}`)?.id ?? uid('k'),
      lessonId: u.lessonId,
      unit: u.unit,
      day: Math.floor(start / P),
      period: start % P,
      roomId: room >= 0 ? project.rooms[room].id : undefined,
      locked: u.locked?.locked ?? false,
      ...(u.locked?.fixed ? { fixed: true } : {}),
    });
  }
  const softCost = scorer.total();
  report('done', unplaced.reduce((n, x) => n + x.length, 0));
  return { cards, unplaced, softCost, iterations: iteration + optIter, elapsedMs: elapsed() };
}

export { conflictsAt as _conflictsAt };
