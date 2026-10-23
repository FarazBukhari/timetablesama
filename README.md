# TimetableSama

A **free, open, browser-only school timetable generator**. It brings back the workflow of the
free TimetableMaster generator, which now sits behind a paywall (10-day Pro trial, paid exports;
see [`docs/RESEARCH.md`](docs/RESEARCH.md)). There are no accounts, no plan limits and no server,
and every export is free.

**Use it online at [timetablesama.pages.dev](https://timetablesama.pages.dev).** There is nothing
to install, and your timetables stay in your browser. New to it? Read the
[step-by-step guide](https://timetablesama.pages.dev/guide/).

## Features

- **School & bell schedule:** working days (Mon–Fri, Mon–Sat, Sun–Thu or a custom cycle),
  periods with times, and breaks. A quick builder makes "7 × 45 min with break and lunch" in one
  click.
- **Data entry:** subjects (code and colour), teachers, classes (class teacher, home room) and
  rooms (type, capacity). Each has inline editing and bulk paste from a spreadsheet.
- **Lessons:** subject × class(es) × teacher(s), periods per week, singles, doubles, triples or
  blocks of 4, allowed rooms, and max per day. One click can create the same lesson for many
  classes, or a joint lesson taught to several classes together.
- **Availability:** click or drag on a grid to block times for teachers, classes, rooms or subjects.
- **Pre-check:** before generating, it flags overloaded teachers, classes and rooms and lessons
  that can never fit.
- **Generator:** runs in a Web Worker. Hard constraints are never broken: no double-booking,
  availability is respected, doubles don't cross breaks, there's a per-day lesson limit, the max
  teacher periods per day is respected (strict or preferred), and locked cards stay put. Soft
  goals are weighted: no gaps for classes, few gaps for teachers, subjects spread across the
  week, a cap on consecutive periods, and optionally the same period each day. Any lesson that
  can't be placed comes with a plain-English reason.
- **Timetable editor:** class, teacher and room views plus an all-classes overview. You can drag
  and drop, or tap a lesson and then tap a box (works on phones). Boxes turn green (free), amber
  (taken: swap the two lessons or move the other one to Unscheduled) or red (not allowed). Lessons
  you move by hand lock automatically (can be switched off); "Fix to this slot" pins a lesson so
  nothing moves it. Clear unlocked lessons, or clear all except fixed ones. Clashes are
  highlighted, and undo and redo are supported (Ctrl+Z).
- **Exports:** Excel (`.xls`, one sheet per class, teacher and room), CSV (all lessons or the
  current grid), print/PDF (one view, or every class or teacher on its own page), and a JSON
  project file for backup and sharing.
- **Reports:** teacher workload (per day, gaps, longest run) and class coverage
  (scheduled vs required).
- **Multiple projects:** keep several schools or drafts in the same browser. Create from the
  sample or blank, import a backup, then open, rename, duplicate or delete from the Start page or
  the sidebar switcher.
- **Saving you can see:** projects autosave in the browser and the sidebar shows the save status
  and when the last backup was made. A red banner appears if the browser blocks or runs out of
  storage. Once a timetable is generated, a reminder suggests downloading a backup file until one
  is made. If storage isn't working, closing the tab asks you to confirm first.
- **Designed for teachers:** a welcome page you can try without signing up (shuffle a real example
  week), and a step-by-step workspace with large text, plain words and a "Next step" bar. Light
  and dark themes, and it works on phones. See [`docs/DESIGN.md`](docs/DESIGN.md).

## Run it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # solver + exporter unit tests
npm run build      # static site in dist/ — host anywhere (GitHub Pages, Netlify, S3…)
```

Click **Load sample school** on the start page to see a complete six-class school generated in
about a second.

## Project layout

```
src/model/    types, defaults, sample school
src/solver/   generator engine (pure TS), feasibility check, clash validator, Web Worker
src/export/   grid builder, CSV, Excel (SpreadsheetML), JSON import/export
src/ui/       React app: store (projects, autosave, undo), persistence, pages, components
docs/         research notes, spec, decisions, design notes
src/landing/  welcome page; public/pictures/ openly licensed archival pictures
guide/        user guide page at /guide/ (styles and script in src/guide/, practice file in public/guide/)
```

## How the generator works

1. Lessons expand into **units**. For example, 5 periods as doubles becomes 2 + 2 + 1.
2. Locked cards are placed first, then the most-constrained units go greedily to their
   lowest-cost free slot.
3. **Conflict-directed repair:** an unplaced unit takes its least-conflicting slot and the
   blockers are ejected and re-queued. A tabu list and ejection weights prevent cycling, and the
   best state found is kept.
4. **Hill-climbing** on soft constraints until it stalls or hits the time limit.
5. Results are deterministic for a given seed. **Shuffle & generate** tries a new seed.

## Notes

This is an independent implementation. REA (`rea-agents`) was used only to observe the original
app's behaviour (its entity model, settings and views). No code, text or assets were copied.
See [`docs/RESEARCH.md`](docs/RESEARCH.md).
