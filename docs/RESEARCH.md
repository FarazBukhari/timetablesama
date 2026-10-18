# Research — TimetableMaster (October 2026)

## Is it still free?

**No.** The free tier is gone.

- The homepage and `/pricing` now describe a paid platform with three plans: **Pro**, **Max** and
  **Enterprise**. The only free option is a **10-day Pro trial** with no credit card required. When
  the trial ends, the account is locked until the school subscribes.
- PDF and Excel export are paid-only, even during the trial.
- Older marketing pages (`/make-timetable-online-free`, `/school-timetable-generator-online`) have
  been rewritten to say "paid … with a 10-day free trial".
- Third-party listings still show the old free tier. Capterra lists a **"Basic Plan — Free
  Forever"** for small institutions: **10 timetable generations**, basic layouts, and **up to 50
  teachers**. TimetableMaster's own older SEO copy said the free version allowed **up to 50 teachers
  and 50 classes**. Capterra gives the paid plan as starting at about US$40 (flat rate).

Sources:
- https://www.timetablemaster.com/
- https://www.timetablemaster.com/pricing
- https://www.timetablemaster.com/make-timetable-online-free
- https://www.timetablemaster.com/school-timetable-generator-online
- https://www.capterra.com/p/10031391/TimetableMaster/
- https://www.g2.com/products/timetablemaster/pricing

## Workflow of the free generator (what we reproduce)

1. **School details:** working days, periods per day, period times, and breaks (the "bell schedule").
2. **Data entry:** subjects, teachers, classes and rooms. Bulk import is supported.
3. **Lessons / workload:** assign a subject to a class with a teacher, set lessons per week, and
   allow single or multi-period (double) lessons.
4. **Constraints:** teacher and class availability (time off), room preferences, preferred slots,
   breaks.
5. **Generate:** the generator places every lesson and reports what couldn't be placed and why.
   You can then adjust by hand with drag and drop, and locked lessons survive regeneration.
6. **Views and exports:** class, teacher and room timetables, printable output, and Excel/CSV.

## Reverse engineering with REA (behaviour only)

Tool: `rea-agents@6.5.0` (`npm i -g rea-agents`). We used `rea list-browser-targets` and
`rea analyze-web-bundle` against `app.timetablemaster.com` in headless Chromium over CDP, then
did keyword analysis of the captured main bundle in the scratchpad. **No code was copied.**

Findings:

- **Stack:** a Vite + React SPA with a REST backend (auth, invites, payments). Routes include
  org-level classes, courses and spaces, `/timetables/:id`, and public read-only sample timetables.
  Generation happens server-side.
- **Domain model:** bell schedule (period configurations plus breaks), classes (with a class
  teacher), teachers (with a short "mnemonic"), subjects (with codes and subject rules such as
  "subject unavailable" slots), spaces/rooms (with space types and room groups), and lessons.
  Each lesson expands into **lesson units**, the individually placed cards. A unit can be
  **locked**, and lessons can be **multi-period**.
- **Solver settings:** max teacher periods per day and max consecutive periods, each with a
  soft-constraint *weight*; "enable period consistency" (same period on different days); "avoid
  breaks inside multi-period lessons"; "room can change between lessons"; and a max execution time.
- **Pre-generation feasibility analysis:** for each teacher, class, and teacher+class /
  subject+class combination, it compares assigned periods with available periods (bell schedule
  minus time off) and lists overloads before you generate.
- **Reports:** teacher workload, class summary, period usage per teacher.
- **Exports:** PDF (rendered from HTML via a canvas-based library) and Excel.
