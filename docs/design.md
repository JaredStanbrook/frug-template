# Study Hub — design notes

Working notes for the visual design, kept so each pass builds on the last
instead of starting over. Written following the `frontend-design` skill.

## Brief

- **Subject:** one university student's own study space — timetable, notes,
  flashcards, marks. Private by default, a few things shared.
- **Audience:** the student, daily, often on a phone; occasionally a visitor
  reading a shared note.
- **Primary job:** answer "what should I do now?" the moment the app opens,
  then make it pleasant to stay and work.
- **Client direction:** fun, cosy, simple; _soft vintage, a bit flowery_.
  Light and dark both required (the template's token system).

## Pass 1 (rejected): "Pressed flowers on parchment"

Cream parchment, sepia ink, dusty rose, Fraunces display, Nunito body, Caveat
handwriting. A sprig on every page header, floral dividers, stitched empty
states, a blossom on the progress bar, washi tape, index cards.

**Why it was rejected** — measured against the defaults the skill lists:

- Cream background + high-contrast serif display + warm rose accent is the
  first and most common generated look. "Vintage" did not require cream.
- Three typefaces, one of them handwriting: the skill asks for one or two,
  clearly distinct.
- Template chrome everywhere: a label above every page title, ALL-CAPS stat
  labels, `A · B` meta strings, `→` on links.
- The SaaS-card kit: every item in an identical rounded card with the same
  lifted shadow and a hover lift.
- Scattered motion: a fade-in on every page, a lift on every card.
- Too many accessories. The flowers were everywhere, so none of them were
  the point.

## Pass 2: "The herbarium exercise book"

A school exercise book that has been used to press flowers in. The paper is
the pale green-grey of old exercise-book and ledger stock, not cream; the ink
is Prussian blue, the colour of fountain-pen ink; the flowers supply every
colour that is not ink or paper. Vintage comes from the materials (ink, ruled
paper, tape, pressed specimens), not from a sepia filter.

### Colour

| Name            | Light     | Dark      | Role                                 |
| --------------- | --------- | --------- | ------------------------------------ |
| Eau-de-nil page | `#E8EDE3` | `#15202F` | Page background (dark: night garden) |
| Leaf paper      | `#F5F7F0` | `#1C2839` | Panels and anything "on the page"    |
| Prussian ink    | `#22324D` | `#E4E8DC` | Text                                 |
| Madder rose     | `#A34F66` | `#E89AAC` | The one action colour, focus, links  |
| Olive leaf      | `#65774A` | `#A9BB86` | Progress, "done", secondary fills    |
| Marigold        | `#D8A23C` | `#E7BE66` | "Soon" and warnings                  |

Subject colours are the flowers in the garden: rose, olive, cornflower,
marigold, heather — `chart-1…5`.

### Type

- **Display — Yeseva One.** A soft, high-contrast Didone with ball terminals
  and curly italics built into the romans; it reads as a 1900s seed-catalogue
  or botanical-plate title. Headlines only, never below 21px.
- **Text — Alegreya Sans.** A humanist sans drawn from calligraphy, so it sits
  with the display face instead of against it. All UI and body text.
- No third face. Handwriting is gone; the flashcard answer is set in the
  display face instead.

Scale (Bringhurst's classic 6–72 series, in px): 12 · 14 · 16 · 18 · 21 · 24 ·
36 · 48 · 60. Body 16/1.55. Card and section headings 21–24 (display). Page
titles 36 on phones, 48 on desktop. The Today greeting 48 / 60.

### Layout

Left-aligned throughout, like writing in a book. Page title flush left with
one plain sentence under it; actions on the right. No labels above titles, no
divider under them — whitespace does that job.

```
┌ masthead (leaf paper, scalloped hem) ───────────────────────────────┐
│ ✿ Study Hub   Today  Subjects  Planner  …                   ☼  (MC) │
╰‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿‿╯

 TODAY (the one bold moment)
 Wednesday 30 September, week 9 of Semester 2       ❀  ✿
 Good evening, Maya.                                  \ | /   star jasmine,
 One session left today, and one thing is overdue.     \|/    drawn in
                                                       ─┴─    once
 Today's study ──────────────────────  This week
 ○ 11:00–12:00  Stats lecture catch-up  3 of 5 sessions done, 3 hours
                                        ▬▬▬▬▬▬▬▬▬▬▬▭▭▭▭
 Coming up ─────────────────────────
 Mon 28 Sep   Enzyme kinetics problem set    2 days overdue
 Thu 1 Oct    Cardiac output lab report       tomorrow
```

Surfaces are flat leaf-paper panels with a hairline rule and a small (8px)
radius — pages, not cards. Radius follows hierarchy: pills for buttons and
chips, 8px for paper, round for the tick. Shadows only on things that float
(menus, toasts) and on taped-down notes.

### Principles

1. **The flowers are the voice, everything else is a quiet exercise book.**
   One growing star jasmine vine on Today is the memorable thing. Elsewhere a flower
   appears only where it means something: a subject's flower is its colour, a
   wreath marks an empty page, tape holds a note down.
2. **Paper and ink, not cards and shadows.** Ruled lines where writing
   happens (notes, flashcards); hairlines between list rows.
3. **Say it as a sentence.** Sentence case, no eyebrows, no all caps, no
   middle-dot strings, no arrows on links.
4. **Motion answers the person.** The jasmine growing in on Today is
   the single unprompted moment, and it is skipped under reduced motion.

### Review against the brief

- _Soft vintage_ — exercise-book paper, fountain-pen ink, Didone titling,
  scalloped masthead: vintage through materials. ✔
- _A bit flowery_ — "a bit" argues for restraint: one jasmine vine, pressed
  subject flowers, a faint pattern in the paper. ✔
- _Fun, cosy, simple_ — the greeting and jasmine carry the warmth; the rest is
  calm. ✔
- _Not a default_ — worked through "a cosy vintage study app" from scratch
  and landed on cream + serif + rose again, which is why the paper went green
  and the ink went blue. ✔

## Pass log

- **Pass 2** — built as above. Screenshots checked light/dark at 390 and 1280.
  Critique fixes made during the pass:
  - The bouquet's bloom animation sets CSS `transform`, which replaced the SVG
    `transform` attribute and piled every flower at the origin. Position and
    animation now live on separate `<g>` elements (`Placed`).
  - Alegreya Sans has a small x-height: root size raised to 17px and `text-xs`
    to 13px.
  - "3 / 5 sessions" was the big-number-small-label default; it is now a
    sentence with a progress bar.
  - "Coming up" lost its square icon tiles and became a dated ledger:
    assignments and exams in one list, the date in the margin.
  - Subject cards showed the subject colour twice (side bar and pressed
    flower), and the flower spun on hover. The bar and the spin went.
- **Next time:** the flashcard study screen could carry more of the
  exercise-book feel (a perforation between question and answer), and the
  planner week could read more like a diary page.
- **Pass 3 — star jasmine.** At the client's request the bouquet became a
  climbing star jasmine vine: the stem draws in, opposite leaf pairs unfurl as
  the tip passes them, tendrils curl, and the pinwheel flowers open last with a
  quarter-turn. Leaf positions come from the vine's own Bézier curve, and each
  part's `--at` (0 root → 1 tip) drives its delay, so growth reads as one
  motion. Petals needed a white in both modes, so `blossom` joined the tokens.
- **Pass 4 — spring.** Bigger and wilder at the client's request: two stems
  twine up together, a runner trails across the top, a low shoot sprawls, and
  leaves, tendrils and 11 flower clusters are placed by a seeded generator
  (same vine every render, so nothing shifts between requests). A few loose
  petals drift down once after flowering. Timing moved from a fraction of one
  stem to absolute seconds (`--t`), so stems can start at different moments.
  On phones and tablets the vine is a banner above the greeting; from `lg` it
  climbs behind the right-hand side with the text above it. Checked at 390,
  768, 1024, 1280 and 1440 with no horizontal overflow.
