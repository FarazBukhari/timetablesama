# TimetableSama — notes for Claude

- **Branch names:** never create or push branches with a `claude/` prefix. Use `feature/<topic>`
  or `fix/<topic>`; `main` is the default branch and is deployed to Vercel on every push.
- Before pushing, run `npm run typecheck`, `npm test` and `npm run build`.
- The `/orchestrator` skill (`.claude/skills/orchestrator/SKILL.md`) describes the full workflow.
- Design: follow `docs/DESIGN.md`. Use `.claude/skills/taste-skill` for the landing page (run its
  `lint.mjs` and `inspect.mjs`; as root, set `CHROME_PATH` to a wrapper that adds `--no-sandbox`) and
  `.claude/skills/redesign-skill` for workspace screens. Keep words instead of symbols, 44px targets
  and 17px text: the users are teachers, not technicians.
