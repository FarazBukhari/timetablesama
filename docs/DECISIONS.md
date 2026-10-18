# Decisions

- **Name:** "TimetableSama", matching the repo name. It uses its own branding and does not
  reuse TimetableMaster names, copy or assets.
- **No backend.** Everything runs in the browser, so it's free to host anywhere (static) and has
  no accounts. The original generates on a server; ours uses a Web Worker.
- **No plan limits.** The old free tier capped schools at 50 teachers, 50 classes and 10
  generations. We don't impose any caps.
- **Exports are free:** CSV, Excel (SpreadsheetML, no dependency), JSON, and print/PDF.
- **Stack:** Vite, React 18, TypeScript and Vitest. Plain CSS with design tokens and no UI kit,
  to keep the bundle small.
- **Solver:** greedy construction, then conflict-directed ejection with a tabu list, then
  hill-climbing on soft constraints. It's deterministic per seed so tests are stable.
- **Unit splitting:** periods per week ÷ length gives full units, and any remainder becomes one
  shorter unit.
