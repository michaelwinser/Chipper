# Chipper

A single-user planning and execution app built on one framework: **Swimlanes → Goals → Plans → Tasks**.

- A **Goal** is an outcome.
- A **Task** is something you can just do — no further planning, rarely more than a day.
- A **Plan** is the bridge: the deliberate work of breaking a Goal into Tasks.
- A **Swimlane** is an area of life or work.

It answers two questions and deliberately little else: *what do I want to work on right now?* and *I have some time — what should I do?* It does not gamify, nag, count what you didn't finish, or tell you that you are behind.

Working name. Structure is SGPT; the app is Chipper.

## Contents

| Path | What it is |
|---|---|
| `PRD.md` | Product requirements. Principles, concepts, the one view, 30-odd numbered use cases (UC-####) written as `Pre / Do / Then / Never`. The `Never` clauses are the product principles made testable. |
| `mocks/*.dc.html` | Ten screen mockups, one artboard per file. Source, hand-editable. |
| `mocks/canvas.json` | Canvas layout: artboard positions, titles, annotations. |

### Viewing the mockups

The files in `mocks/` are the source. A rendered pan/zoom canvas of them lives at
<https://claude.ai/code/artifact/d763ffb0-a7f3-403b-9d3d-b8ddf05387aa> — a view of these files, not a second copy to edit.
It is regenerated from the `.dc.html` sources with the `design` skill; `mocks/chipper-mockups.html` is that generated
bundle (2.5 MB, editor plus artboard sources), and is gitignored.

## Status

PRD and mockups are settled. Design doc next: data model and JSON schema, view state, and the localStorage → Firestore migration path.

v1 is a static single-page app with state in browser `localStorage`, hostable on GitHub Pages or run locally, desktop only, with JSON export/import as the durability story. Later: Cloud Run + Firestore. The data model is designed so that migration is a persistence swap rather than a rewrite.
