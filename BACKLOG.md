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

## B-8 · Child lookups scan every entity, so the board is O(n²)

**Noticed:** M7, measuring rather than guessing. **Severity:** none at real size; recorded so
it never has to be diagnosed.

`childPlans` and `childTasks` each scan the whole `plans` / `tasks` map, and the selectors
call them once per card and once per progress count. Measured:

| Size | buildBoard | buildSweep | export |
|---|---|---|---|
| 150 tasks (realistic) | 6 ms | <1 ms | 1 ms |
| 4,000 tasks (100× intended) | 206 ms | 234 ms | 5 ms |

At the size this app is *for* it is invisible, and adding an index now would put
indirection through the most heavily tested code in the project to solve a problem nobody
has.

Re-measured at M8 across four sizes: growth is ~4x per doubling of the document, i.e.
quadratic, as expected. `test/scale.test.ts` no longer asserts a wall-clock budget it could
fail on — the remaining `< 10 s` is a hang detector with four orders of magnitude of slack,
not a performance target. The original `< 500 ms` had roughly 2x headroom on this laptop and
would have gone red on a shared CI runner, which gates the Pages deploy. A ratio-based version was no better:
sub-millisecond baselines produced a 24x outlier from JIT warm-up alone. The test now
catches a hang and asserts the shape of the output instead, and performance stays a thing
we measure deliberately rather than a thing CI guesses at.

**Fixed would mean:** build a parent → children index once at the top of `buildBoard` and
`buildSweep` and pass it down, rather than scanning per call. Do it if typing or ticking
ever feels sticky — that is the symptom, and this is the cause.

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

---

## B-9 · The Rule of 3 is the layout wrapping, and nothing more

**Noticed:** M8, by the principle audit. **Severity:** minor, and deliberately parked.

UC-2080 says a swimlane holding more goals than it is laid out for "renders in a way that
makes the crowding visible". Today that is the layout doing it: cards are a fixed 296px,
the lane wraps, and a fourth goal pushes it onto a second row (PRD §5.7 — "lanes wrap onto
second rows, and the page stops fitting on one screen"). `layout.goalsPerLane` is the
number those widths were chosen around.

M8 tried to add a signal on top and got it backwards. A `.crowded` rule narrowed cards to
244px and the gap to 8px, so four crowded goals came to 1000px where four uncrowded ones
came to 1226px — at exactly the count where the strain should first show, the crowding
signal bought back 226px and delayed the wrap by a goal or two. It was also binary: a lane
of four and a lane of nine rendered identically. Degrading the cards to bare titles instead
was considered and rejected, because `Everything.dc.html` — the one artboard that draws all
four of Work's goals — draws them with full task lists on the starred ones, and
`test/board.test.ts` pins that.

A caveat the code does not state: the wrap is a function of viewport width and of FOCUS,
not of `goalsPerLane`. In Priorities focus a lane draws one card per starred thing, so a
lane holding ten goals with two stars shows two cards and "8 more in Work" and never wraps
at any count. UC-2080's `Then` is observable in Everything focus, below roughly 1320px.

**Fixed would mean:** a signal that scales with how far past the number the lane is, costs
the user something real rather than buying back room, and does not contradict the
artboards. That is a design question, not a coding one — and it wants real use first, which
is what D1 said in the first place ("revisit a hard cap once real data exists").
`test/ui/crowding.test.ts` pins the current behaviour, including that a crowded lane's
cards are never narrower than a calm one's.

---

## B-10 · Nothing can be moved to a different parent

**Noticed:** M8, by the lifecycle review. **Severity:** major — this is the largest gap in
the product.

There is no reparenting mutation. A task filed under the wrong goal, a plan under the wrong
goal, a goal in the wrong swimlane: none can be relocated. Every workaround destroys data.
Delete-and-retype loses `done`, `doneAt`, `size`, `deadline`, `createdAt` and the star.
Send-to-Pile-then-promote loses size, done state, deadline, notes and tags, and lands the
result as a *loose task in a swimlane* — `Pile.svelte` only ever passes a `swimlaneId`, so
it cannot go back inside a goal even though `promotePileItem` accepts any parent.

The only reparenting that exists is incidental: `deletePlan`'s promote-children, and
`changeLevel` with an explicit parent — which requires changing what the thing *is*.

**Fixed would mean:** a `moveEntity { ref, parent, at }` mutation with the same guards
`changeLevel` grew at M8 (no cycles, no destination inside an archived goal), a UI route
from each row, and the same non-destructive promise the ladder makes. Deferred out of M8
because M8 is a corrective milestone and this is a feature.

---

## B-11 · The ladder runs in three of its six directions

**Noticed:** M8, by the lifecycle review. **Severity:** moderate.

PRD §7 says promotion works "either direction", and `reduce.ts` supports every case. The UI
does not:

| | offered | reducer supports |
|---|---|---|
| task → plan | only through the break-down dialog | yes, plainly |
| task → goal | loose tasks only (`Chip`) | yes, for nested tasks too — UC-2058's sub-case says so explicitly |
| plan → goal | yes (`PlanRow`) | yes |
| goal → plan | yes, with a picker (M8) | yes |
| plan → task | **no route** | yes, when empty |
| goal → task | **no route** | yes, when empty |

**Fixed would mean:** each direction reachable from the row that has it, and UC-2058's
sub-case — "a Task under a Plan can do this too and is detached from that Plan" — actually
available.

---

## B-12 · `notes` exists everywhere, is promised to the user, and can never be filled in

**Noticed:** M8, by the lifecycle review. **Severity:** moderate, and slightly embarrassing.

`Goal`, `Plan` and `Task` all carry `notes`. `setNotes` is a mutation with a reducer case
and a place in `MUTATION_KINDS`. `changeLevel` carries notes across the ladder.
`BreakDownDialog` tells the user "Its notes, deadline and star come with it."

There is no command, no action, and no UI. The field is always `''`. The one place the word
appears in `src/ui/` is that sentence promising a field the user has no way to write.

**Fixed would mean:** an editor on the opened card and in the break-down dialog — or, if
notes are not wanted in v1, the field and its mutation come out and the dialog stops
mentioning them. Either is honest; the current state is not.

---

## B-13 · Deadlines on plans and tasks are readable, unwritable and invisible

**Noticed:** M8, by the lifecycle review. **Severity:** moderate.

PRD §7 lists "optional deadlines on Goals, Plans, **Tasks**" as v1 scope. `setDeadline`
accepts any non-swimlane ref, and `buildSweep` reads plan and task deadlines into the
"Coming up" band. But `DeadlineField` is used in exactly one place — `GoalCard` — and
neither `PlanRowModel` nor `TaskRowModel` has a deadline field at all.

So a deadline on a plan or task, arriving by import or carried by `changeLevel` from a
dated goal, surfaces only in "Coming up" and can be neither seen on the board nor cleared.

**Fixed would mean:** a deadline on the row models, a field on the rows, and the same
clearing affordance goals have.

---

## B-14 · Lane colour can be set once and never changed

**Noticed:** M8, by the lifecycle review. **Severity:** minor.

`setSwimlaneColor` has a mutation, a reducer case and a conformance test. It has no command
and no UI. Colour is assigned by `nextLaneColor` on creation and is then permanent —
including after a lane is deleted, when the modulo hands the same colour to a new one.

**Fixed would mean:** the lane header offers the palette. The mutation is already there.

---

## B-15 · The Pile's "Done" destroys an item with no confirmation

**Noticed:** M8, by the lifecycle review. **Severity:** moderate.

Every other destructive path in the app goes through `RemoveDialog` and states its cost.
The Pile's per-item "Done" goes straight to `deletePileItem` — permanent, no dialog, no
restore, and the label reads as completion rather than deletion. B-2 records the
"nothing is recorded" half of UC-1070; this is the other half.

**Fixed would mean:** whatever UC-1070's "recorded as done" turns out to be, plus a label
that says what the button does.

---

## B-16 · View state is never pruned when what it points at goes

**Noticed:** M8, by the lifecycle review. **Severity:** minor, but visible.

Two cases, both harmless to the document and both visible to the user:

- `lens.expanded` keeps the id of a goal that has been deleted, archived or demoted.
  `buildBoard` simply does not match it, but `Board.svelte` renders "close N open" from
  `expanded.length` — so the app offers to close a card that is not on screen.
- `session.pileFilter` survives page changes and is never reset. Promote or delete the last
  item carrying a tag and `Pile.svelte` hides the whole tag row, stranding the page on
  "Nothing tagged #x" with no control to clear it.

**Fixed would mean:** `expanded` filtered against the goals that exist when the board is
built, and the tag row shown whenever a filter is active whether or not anything matches.

---

## B-17 · An archived goal is stranded when no swimlane exists

**Noticed:** M8, by the edge-state review. **Severity:** minor.

`Archive.svelte` routes a goal whose lane is gone to a swimlane picker. With every lane
deleted the picker iterates an empty list, so the user gets a "Put it in" row containing
only **cancel** — no explanation, and the fix (go to the board and make a lane) is never
stated. `Pile.svelte` has the identical dead end for "Make a goal" with zero lanes.

**Fixed would mean:** both pickers say what is missing and offer to create a lane.
