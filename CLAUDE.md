# TimetableSama — notes for Claude

- **Branch names:** never create or push branches with a `claude/` prefix. Use `feature/<topic>`
  or `fix/<topic>`; `main` is the default branch and is deployed to Vercel on every push.
- Before pushing, run `npm run typecheck`, `npm test` and `npm run build`.
- The `/orchestrator` skill (`.claude/skills/orchestrator/SKILL.md`) describes the full workflow.
