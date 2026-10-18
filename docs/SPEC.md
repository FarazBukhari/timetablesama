# TimetableSama — Specification

A free, fully client-side school timetable generator that covers the workflow of
TimetableMaster's old free tier, with no plan limits, no account, and free exports.

## Entities (`src/model/types.ts`)

| Entity | Fields |
|---|---|
| School | name, `days[]` (labels), `periods[]` bell schedule (`name`, `start`, `end`, `isBreak`), solver settings |
| Subject | name, short code, colour, unavailable slots |
| Teacher | name, short code, unavailable slots, optional max periods/day |
| Class | name, optional class teacher, optional home room, unavailable slots |
| Room | name, type (e.g. Lab, Gym), capacity, unavailable slots |
| Lesson | class ids (more than one means a joint lesson), subject, teacher ids, periods per week, unit length (1–4 consecutive periods), allowed room ids, max units per day |
| Card | one placed *lesson unit*: lesson id, unit index, day, teaching-period index, room id, locked |

A **slot** is `(day, teaching period)`. Break rows in the bell schedule are never schedulable.
A lesson with `periodsPerWeek = 5` and `length = 2` expands to units `[2, 2, 1]`.

## Constraints

Hard constraints, never violated in output:
- No teacher, class or room is double-booked.
- Teacher, class, subject and room unavailable slots are respected.
- A multi-period unit stays within one day and, when "avoid breaks inside multi-period lessons"
  is on, never spans a break.
- A lesson places at most `maxPerDay` units on the same day.
- Locked cards stay exactly where they are.
- The teacher's max periods per day is respected when its mode is `hard`.

Soft constraints (weighted penalties, tunable in Settings):
- Teacher max periods per day (when its mode is `soft`).
- Max consecutive teaching periods for a teacher.
- Gaps (idle periods) in a class's day, which carry a high weight by default.
- Gaps in a teacher's day.
- Spreading a lesson's units over different days, avoiding adjacent days where possible.
- Period consistency: the same lesson at the same period across days (optional).

## Generator (`src/solver/`)

It is pure TypeScript, deterministic per seed, and runs in a Web Worker with progress events.

1. Expand lessons into units, then pre-place locked cards.
2. Greedily place the most-constrained units first (fewest feasible positions × largest length).
3. Repair with conflict-directed ejection: put an unplaced unit at its least-conflicting position,
   eject the blockers (never locked ones), and use a tabu list to avoid cycling. Keep the best
   state found.
4. Improve soft constraints with hill-climbing moves and swaps until the time limit.
5. Report every unplaced unit with a human-readable reason (no valid slot because of
   availability, or which teachers, classes or rooms keep blocking it).

## Pre-generation feasibility check

For each teacher, class and room type, it compares required periods with available periods
(bell schedule minus unavailability) and flags overloads and impossible lessons (unit length longer
than any contiguous block, no allowed rooms, and so on) before generating.

## UI

The sidebar workflow is: **School → Subjects → Teachers → Classes → Rooms → Lessons →
Availability → Generate → Timetable → Reports**.
- Each data page has a table with inline editing, add, delete, and bulk add (paste one per line).
- Availability: pick a teacher, class, subject or room, then click or drag over grid cells to toggle
  unavailable.
- Generate: feasibility report, settings, a Generate button with progress, and a results summary.
- Timetable: view by class, teacher or room, or an overview of all classes. Cards can be dragged
  and dropped (rejected if a hard constraint would break), locked or unlocked, and removed. An
  "unscheduled" tray lists the unplaced units.
- Reports: teacher workload (periods per day and per week) and a class summary.

## Export and persistence

- Autosaves to `localStorage`. JSON project export and import.
- CSV export (all cards, plus a per-entity grid), Excel `.xls` (SpreadsheetML, one sheet per
  class/teacher/room), and print/PDF through print stylesheets.
- A sample school can be loaded in one click.

## Acceptance

- `npm run typecheck`, `npm test` and `npm run build` pass.
- The sample school generates with 100% placement and zero hard-constraint violations.
- Drag and drop refuses moves that would clash.
