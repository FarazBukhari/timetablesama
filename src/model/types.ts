export type Id = string;

/** "day:period" where period is a teaching-period index (breaks excluded). */
export type SlotKey = string;

export const slotKey = (day: number, period: number): SlotKey => `${day}:${period}`;

export interface Period {
  id: Id;
  name: string;
  start: string; // "08:00"
  end: string; // "08:45"
  isBreak: boolean;
}

export type ConstraintMode = 'off' | 'soft' | 'hard';

export interface SolverSettings {
  /** Max teaching periods per teacher per day (0 = no limit). */
  maxTeacherPeriodsPerDay: number;
  maxTeacherPeriodsPerDayMode: ConstraintMode;
  /** Max consecutive teaching periods for a teacher without a free period (0 = no limit). */
  maxConsecutivePeriods: number;
  maxConsecutiveWeight: number;
  classGapWeight: number;
  teacherGapWeight: number;
  spreadWeight: number;
  avoidBreaksInMultiPeriod: boolean;
  periodConsistency: boolean;
  periodConsistencyWeight: number;
  timeLimitSec: number;
  seed: number;
  /** Lock lessons automatically when they are moved by hand. */
  autoLockMoves: boolean;
}

export interface School {
  name: string;
  academicYear: string;
  days: string[];
  periods: Period[];
  settings: SolverSettings;
}

export interface Subject {
  id: Id;
  name: string;
  code: string;
  color: string;
  unavailable: SlotKey[];
}

export interface Teacher {
  id: Id;
  name: string;
  code: string;
  email?: string;
  /** Overrides the global max periods per day when > 0. */
  maxPerDay?: number;
  unavailable: SlotKey[];
}

export interface SchoolClass {
  id: Id;
  name: string;
  classTeacherId?: Id;
  homeRoomId?: Id;
  students?: number;
  unavailable: SlotKey[];
}

export interface Room {
  id: Id;
  name: string;
  type: string;
  capacity?: number;
  unavailable: SlotKey[];
}

export interface Lesson {
  id: Id;
  classIds: Id[];
  subjectId: Id;
  teacherIds: Id[];
  periodsPerWeek: number;
  /** Consecutive periods per placed unit (1 = single, 2 = double ...). */
  length: number;
  /** Allowed rooms; empty = class home room if set, otherwise no room needed. */
  roomIds: Id[];
  /** Max units of this lesson on the same day. */
  maxPerDay: number;
}

/** One placed lesson unit. */
export interface Card {
  id: Id;
  lessonId: Id;
  unit: number;
  day: number;
  period: number; // teaching-period index of the first period
  roomId?: Id;
  /** Kept in place when the timetable is created again. */
  locked: boolean;
  /** Pinned to this slot: never moved, and not released by "Unlock all". */
  fixed?: boolean;
}

export interface UnplacedUnit {
  lessonId: Id;
  unit: number;
  length: number;
  reason: string;
}

export interface Project {
  version: 1;
  school: School;
  subjects: Subject[];
  teachers: Teacher[];
  classes: SchoolClass[];
  rooms: Room[];
  lessons: Lesson[];
  cards: Card[];
  unplaced: UnplacedUnit[];
  generatedAt?: string;
}

export type EntityKind = 'teacher' | 'class' | 'room' | 'subject';
