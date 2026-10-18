# Design

The redesign was made with two installed skills: **taste-skill** (`.claude/skills/taste-skill`) for the
landing page, and its companion **redesign-skill** (`.claude/skills/redesign-skill`) for the workspace
screens. taste-skill says it is not meant for app screens. Both are MIT-licensed, from
github.com/Leonxlnx/taste-skill.

## Audience
Teachers and school office staff who may not be confident with computers. That means:
- Text at 17px or larger, buttons and fields at least 44px tall, and fields with visible edges.
- Words instead of symbols: "Delete", "Up", "Lock in place", "Free / Off".
- A numbered list of steps in the sidebar, and a "Next step" bar at the bottom of every page.
- Plain introductions on each page that say what to do there.

## Direction (landing)
- Drawn with `draw.mjs` (sector education, tone warm, product UI available). From the three
  directions dealt, **The page is the object** was chosen (seed 1381939724). The printed weekly
  timetable on the staffroom noticeboard is an object every teacher already reads.
- **Idea:** the noticeboard timetable becomes the paper the page is built from. The hero is a stack
  of school-office folders; the front folder holds a real class timetable.
- **The live thing:** *Shuffle the week* runs the real generator on the example school in a Web
  Worker and redraws class 7A's sheet.
- **Type:** Hanken Grotesk at 400 and 500 weights only, self-hosted with `@fontsource`, so no
  third-party request. The landing page uses exactly five sizes.
- **Colour:** slate, sage and blush fields on paper, with deep olive as the one accent. The old
  indigo was removed.
- **Motion:**
  - Sections fade and rise into view in stagger, only when motion is allowed.
  - Hovering one of the three sheet names in "Ready to pin up" switches the preview (240ms
    crossfade).
  - Lessons settle into place when the week is shuffled.
  - The 1924 classroom picture drifts slowly.
  - Every control gives press and hover feedback.
  - All of it is turned off under `prefers-reduced-motion`.

## Gate results
- `lint.mjs src/landing`: 0 FAIL, 0 WARN.
- `inspect.mjs` at 1440, 768 and 390px: 0 FAIL, 2 WARN. Both are left on purpose:
  - **no-footage:** the only openly licensed clip near the subject was a 25 MB news video of
    identifiable children on a first school day. It isn't about timetables and is too heavy for
    school networks. The archival films found were 10–25 minutes long.
  - **side-scroll:** the "What you type in" row is the dealt *drag row of moments*. It scrolls
    sideways on purpose, with Back and Forward buttons and a progress bar to show it.
- There were three look-and-fix rounds. Fixed along the way:
  - Folder tab text that was nearly invisible.
  - A clipped "Never double-booked" card.
  - Subject names shown twice on the sample sheet.
  - A footer stamp that rendered at full height.
  - Cramped previews on phones.
  - Seven type sizes, reduced to five.

## Pictures (all openly licensed, credited in the landing page footer)
| File | Credit |
| --- | --- |
| `public/pictures/classroom-1924.jpg` | "Teacher at blackboard" (1924), public domain, Wikimedia Commons |
| `public/pictures/timetable-1914.jpg` | "What one school did and how it did it", Grace Wyman (1914), no known copyright restrictions, Wikimedia Commons |
| `public/pictures/timetable-handwritten.jpg` | "School timetable" by Supercarwaar, CC BY-SA 3.0, Wikimedia Commons |
| `public/pictures/timetable-1890s.jpg` | "Gladman Small Timetable", J. F. Gladman, public domain, Wikimedia Commons |
| `public/pictures/teacher-cabinet-card.jpg` | "Teacher with Two Students near Chalkboard", Frank Woodward (1893), CC0, The Met |

All five are shown in greyscale and blended into the paper colour behind them, like a two-colour
print. The how-it-works row also shows fragments of the real interface, built in HTML. No picture
stands in for the product.

## Sample content to know about
The landing page's sheets come from the example school in `src/model/sample.ts`. Its names,
classes and rooms are invented. The figures "150 lessons" and "0.3 seconds" in the how-it-works
fragment describe that example school.
