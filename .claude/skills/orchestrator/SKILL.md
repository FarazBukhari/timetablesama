---
name: orchestrator
description: Drive the TimetableSama project end to end — research, reverse-engineering (via REA), spec, parallel build, verification and shipping. Use when asked to "orchestrate", continue building the timetable generator, add a major feature, or re-run the research → build → verify loop for this repo.
---

# Orchestrator — TimetableSama

TimetableSama is an original, free, client-side school timetable generator modelled on the
workflow of the free tier that TimetableMaster used to offer (that product is now paid-only:
a 10-day Pro trial, exports behind a paywall). We clone the **workflow and capabilities**, never
their code, assets, copy or branding.

Run the phases below in order. Do not ask the user questions — pick sensible defaults, record
them in `docs/DECISIONS.md`, and keep going.

## Phase 0 — Context

1. Read `README.md`, `docs/RESEARCH.md`, `docs/SPEC.md`, `docs/DECISIONS.md` if they exist.
2. `git status` / `git log --oneline -15` to see where the last run stopped.
3. Make a task list (TaskCreate) with one task per remaining phase.

## Phase 1 — Research (skip if `docs/RESEARCH.md` is current)

- WebFetch the target's home, `/pricing`, `/features`, and generator landing pages.
- WebSearch third-party listings (Capterra, G2) for historical free-tier limits.
- Record: paywall status, the historical free-tier limits, the setup workflow, inputs,
  constraints, views and exports. Cite every source URL in `docs/RESEARCH.md`.

## Phase 2 — Reverse engineering with REA

REA (`morluto/rea`, npm `rea-agents`) is installed globally: `npm i -g rea-agents`, check with
`rea doctor`. Static JS/web analysis needs no native engine.

Typical flow (all paths absolute, outputs into the session scratchpad, never into the repo):

```bash
chromium --headless=new --remote-debugging-port=9222 --no-sandbox about:blank &
rea list-browser-targets http://127.0.0.1:9222
rea analyze-web-bundle http://127.0.0.1:9222 <targetId> --observation-ms 5000 --format json > $SCRATCH/bundle.json
rea capture-browser-scenario '{...}'          # record a page scenario
rea export-web-scripts $SCRATCH/capture.json $SCRATCH/scripts
rea analyze-javascript-application $SCRATCH/scripts --json
```

Extract **behaviour only** — entity model, field names/semantics, constraint types, generator
flow, view types, export formats. Summarise findings in prose in `docs/RESEARCH.md`.
Never copy minified code, strings, images or styles from the target into this repo.

## Phase 3 — Spec

Update `docs/SPEC.md`: entities, constraints (hard vs soft), solver approach, views, exports,
persistence, acceptance criteria. Keep it the single source of truth for the build.

## Phase 4 — Build (parallelise)

Stack: Vite + React + TypeScript, Vitest, zero backend, `localStorage` persistence, solver in a
Web Worker. Layout:

- `src/model/` — types, defaults, validation, sample data
- `src/solver/` — pure TS generator (no DOM); must be unit-testable in Node
- `src/ui/` — setup wizard pages, timetable views, drag & drop editor
- `src/export/` — CSV, Excel (SpreadsheetML), print/PDF, JSON project import/export

Independent slices (solver, data-entry UI, timetable views, exporters) can be delegated to
parallel subagents (Agent tool, `isolation: "worktree"` when they touch overlapping files).
Give each agent the relevant SPEC section and the shared types file path; merge afterwards.

## Phase 5 — Verify

Run all of these; fix failures before moving on:

```bash
npm run typecheck
npm test            # vitest: solver hard constraints, exporters, model validation
npm run build
```

Then smoke-test the real UI with Playwright against `npm run preview` (Chromium is at
`/opt/pw-browsers`): load sample school → Generate → every lesson placed or explained, no
teacher/class/room clash, views render, CSV/Excel/JSON download. Save screenshots to the
scratchpad, not the repo.

## Phase 6 — Ship

- Update `README.md` (features, how to run, how it differs from the original).
- Commit on a `feature/<topic>` branch (never a `claude/` prefix), push it, then merge into
  `main`. Pushing `main` triggers the Vercel production deploy.
- Do not open a PR unless the user asks.

## Guardrails

- Original implementation and original name/branding only — no impersonation of TimetableMaster.
- Keep the solver deterministic for a given seed so tests are stable.
- Hard constraints are never violated in output; anything unplaceable is listed with a reason.
