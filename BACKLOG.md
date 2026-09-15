# Chipper — Backlog

Small things noticed while using the app: defects, rough edges and decisions left open.
Distinct from `ROADMAP.md`, which is the planned work. Nothing here blocks a milestone;
each entry says what "fixed" would mean so it can be picked up cold.

---

## B-1 · Editing is a short single-line box everywhere

**Noticed:** M3, editing an item in The Pile.
**Severity:** minor — it works, it just feels wrong for longer text.

`EditableText` is one component used for every rename in the app: swimlane names, goal
titles, plan and task titles, and now pile items. It is a single-line `<input>` sized for
short titles. Pile items are often sentences, so the field is narrower than the text it
holds and you end up editing through a letterbox.

The fix is not Pile-specific. The real question is whether the editing experience should
vary by what is being edited — a two-word lane name, a task title, a captured sentence —
or whether one field should simply grow to fit its content. Worth deciding once, because
it changes every surface at the same time.

**Fixed would mean:** the field is at least as wide as the text it replaced, wraps rather
than scrolls for anything sentence-length, and behaves identically wherever it appears.

---

## B-6 · Pieces added in the break-down dialog cannot be edited

**Noticed:** M4, breaking a task down. **Severity:** minor, but it is the signature move.

Once a piece is added with Enter it becomes a static row. A typo can only be fixed by
making the plan and then renaming the task on the board — which works, but means leaving
the dialog knowing something in it is wrong.

**Fixed would mean:** each piece is an `EditableText` row like every other title in the
app, and can be removed. Relates to [B-1](#b-1--editing-is-a-short-single-line-box-everywhere):
whatever the editing field becomes, this should use it.

---

## B-7 · The S/M/L control in the break-down dialog applies to the next piece, not a chosen one

**Noticed:** M4. **Severity:** minor. **Related:** B-6, and probably fixed together.

The size buttons set the size the *next* piece will get. That reads as though they apply
to something already on screen, and there is no way to tell which. Compounded by B-6:
having picked the wrong size you cannot go back and change it.

**Fixed would mean:** each piece carries its own size control on its own row, and the
composer row carries the size for the piece being typed. The current shared "pending size"
disappears. Worth doing at the same time as B-6, since both are the same row redesign.

---

## B-2 · UC-1070 says a completed Pile item is "recorded as done", and there is nowhere to record it

**Noticed:** M3, implementing the Pile.
**Severity:** spec gap — needs a decision, not a fix.

PRD §5.5 says done items belong to structure rather than the backlog, and UC-1070 says
completing a Pile item "removes it from The Pile and is recorded as done". But a Pile item
has no goal, no plan and no swimlane, so there is nothing for a completion to attach to.

Current behaviour: the "Done" action simply removes the item. Nothing is recorded.

**The decision:** either that is correct and UC-1070's wording should change, or completing
a Pile item should ask which swimlane it belonged to — which makes a two-second gesture
into a two-step one, for an idea the user has already finished with.

---

## B-3 · Sending something to the Pile is refused when it has structure under it — RESOLVED at M5

**Noticed:** M3. **Resolved:** M5. **Outcome:** it stays as it is, deliberately.

The Pile holds a line of text, so sending a goal with plans and tasks beneath it would
destroy them — and §5.5's promise that the Pile is guilt-free and reversible cannot be true
if it does. Currently refused with a message pointing at Archive.

Archive landed at M5 and is the right exit for structured work: it keeps the plans, the
tasks and the finished work, and it is reversible. The Pile is for ideas. So the refusal
stands and the message is now a signpost rather than an apology — the delete dialog offers
Archive directly, and lane deletion offers to archive a whole lane's goals at once.

---

## B-4 · Swimlanes reorder with ↑↓ buttons rather than dragging

**Noticed:** M1. **Severity:** minor.

Reordering lanes uses small arrow buttons on the lane header. UC-2012 says "drag a lane by
its name". Dragging is the natural gesture and the arrows are a stand-in chosen to keep M1
small.

**Fixed would mean:** dragging the lane name reorders, with the arrows kept or dropped as
the drag implementation makes sensible. Keyboard users need whatever replaces them to stay
reachable.

---

## B-5 · The app is light-only

**Noticed:** M0. **Severity:** minor, but it gets more expensive the longer it waits.

`tokens.css` declares `color-scheme: light` and one palette. Every colour is already a
token, so a dark theme is a second block of token values rather than a rewrite — but only
while every component keeps taking its colours from tokens. Each hard-coded colour that
creeps in makes it harder.

**Fixed would mean:** tokens redefined under `prefers-color-scheme: dark`, cherry and sage
re-checked for contrast against a dark ground, and a test that no component stylesheet
contains a literal colour outside `tokens.css`.
