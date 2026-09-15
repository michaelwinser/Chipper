# Chipper — Product Requirements Document

**Status:** Draft v1
**Date:** 2026-09-14
**Author:** Michael W. (with Claude)
**Working name:** Chipper (alt: Chip). Structure is Swimlanes → Goals → Plans → Tasks.

---

## 1. Summary

Chipper is a single-user planning and execution app built on one framework: **Goals, Plans, Tasks**, organized into **Swimlanes**.

- A **Goal** is an outcome.
- A **Task** is something you can just do — no further planning, no sub-tracking. Rarely more than a day.
- A **Plan** is the bridge: the deliberate work of breaking a Goal into Tasks. A Plan contains Tasks and sub-Plans.
- A **Swimlane** is an area of life or work (Work, Family, Fun, a specific project).

The app exists to answer two questions well:

1. **"What do I want to work on this week?"** — the planning ritual.
2. **"I have some time right now. What should I work on?"** — the execution moment.

Everything else is in service of those two, or cut.

## 2. Problem

Existing task managers fail in three related ways:

- **They manage you.** Streaks, badges, nags, red overdue counts. The user ends up working for the app.
- **They don't show you your load.** Nothing tells you that you've taken on too much — until you're underwater.
- **They don't contextualize work.** A flat list treats "clean the kitchen counters" and "write a PRD" as the same kind of thing, so the user can't match work to the time and headspace actually available.

The result is avoidance. Big outcomes get deferred in favor of small legible ones, and the list becomes a monument to things not done.

## 3. Product principles

These are the tie-breakers. When a feature conflicts with one of these, the feature loses.

1. **The app works for the user, not the reverse.** No streaks, no scores, no guilt, no nagging. The app never scolds.
2. **Calm over dense.** Prefer clicking into a Swimlane or Goal over rendering everything at once. Whitespace is a feature. The user should be able to look at it while overwhelmed and feel less so, not more.
3. **Structure is optional until it's useful.** Nothing requires a due date. Nothing requires a Goal. A Task can be captured in two seconds and filed later, or never.
4. **Breaking down is the core move.** The primary act of planning is deciding a Task is too big and turning it into a Plan. This must be a one-click, non-destructive operation — including mid-execution.
5. **Pick the date.** (Iron Triangle: Features / Resources / Date — always pick Date.) Scope is subjective; people are not fungible. The app expresses this through **time boxing**: work is sized, and when the box is spent the user decides — good enough, a bit more time, or break it down.
6. **Priorities are a filter, not a promise.** Choosing what matters this week is how the user makes a large structure small. Priorities expire; unfinished priorities carry no debt.
7. **The Pile is guilt-free.** There is always somewhere to put an idea that isn't a commitment.

## 4. Users

- **v1: Michael only.** Single user, single device (desktop), no accounts, no sharing.
- **Near term:** friends and mentees, still single-user-per-instance.
- **Later, explicitly out of scope now:** tracking work of people who report to him (multi-user, assignment, visibility).

## 5. Core concepts

### 5.1 Swimlane
A top-level area of life or work. Examples: Work, Family, Fun, Health, "Kitchen Reno", "Stuff".

- Contains Goals, and may contain Tasks directly (homeless tasks live in a Swimlane — "Stuff" is a legitimate Swimlane).
- A Goal belongs to exactly one Swimlane. Cross-cutting goals are either assigned to one lane or duplicated by name in each lane.
- Layout and defaults are optimized for **3 active Goals per Swimlane** (Rule of 3), and for a handful of Swimlanes. Soft guidance in v1, not enforced (see D1).

### 5.2 Goal
An outcome. "Catch up on invoicing." "Get the house ready to sell."

- Optional deadline. Many Goals are open-ended or ongoing.
- Contains Plans and/or Tasks directly (a Task may sit under a Goal with no Plan in between).
- Progress is derived and displayed honestly — count of tasks done vs. open, not a falsely precise percentage.

### 5.3 Plan
The bridge between a Goal and doable work.

- Contains Tasks and sub-Plans. **Soft limit of 3 levels of Plan nesting** — deeper means the Goal has metastasized into a real project and should be simplified or partly moved to The Pile. Guided visually, not blocked (see D5).
- Optional deadline. Plans with dates are how a workback schedule gets expressed (see §8.3).
- Created either up-front ("break this Goal down") or reactively ("this Task is bigger than I thought — make it a Plan").

### 5.4 Task
Something the user can just execute. No sub-tracking, no time entry, no start/stop.

- **Size:** Small / Medium / Large, as a hint at time box, not an estimate:
  - **S** ≈ 15 minutes
  - **M** ≈ 1–2 hours
  - **L** ≈ half a day to a day
- **State: done or not done.** That's the whole lifecycle.
- Optional deadline or "work date" — never required.
- Lives under a Plan, a Goal, or directly in a Swimlane.
- Can be **promoted to a Plan** at any time, including after work has started. Promotion preserves the task's title, notes and links, and becomes the Plan's identity.

### 5.5 The Pile
A single **global**, unorganized, no-guilt backlog of ideas and future goals.

- Explicitly not crowding the main view. You go to The Pile; it never comes to you.
- Items are free text, optionally hashtagged (`#work`, `#house`) — hashtags may foreshadow future Swimlanes.
- Items can be promoted out of The Pile into a Swimlane as a Goal, Plan or Task.
- Moving something **to** The Pile is a legitimate, blameless outcome for anything, at any time.
- Completing something while it's in The Pile removes it from The Pile (done items belong to structure, not to the backlog).

### 5.6 Priority
A **star** placed on a Goal, a Plan, or a Task, meaning "this is what I want to work on this period."

- **The star has a level, and the level is the commitment.** Starring a Goal puts all its open Tasks in play. Starring a Plan puts that Plan's open Tasks in play and nothing else in the Goal. Starring a Task puts exactly that Task in play. A tighter star is a smaller promise.
- There is exactly one active set: **current priorities**. No separate week/today horizons — the user re-sets them whenever they feel like it, weekly or daily.
- **Priorities do not persist by default.** Setting a new set clears the old one (with per-item "keep" offered during the sweep). Nothing unfinished is marked late, flagged, or carried forward automatically. Unfinished may simply mean "good enough" or "no longer wanted."
- Clearing is always an explicit user action. The app never changes state while the user isn't looking.

### 5.7 The view

There is **one view**, not a set of screens. The Swimlane view is the home screen, the planning surface and the "what should I do now" surface at once. Two controls change what it shows; neither navigates anywhere.

- **Focus toggle — Priorities / Everything.** In *Priorities*, starred things get room and everything else folds into one faint line per Swimlane ("2 more in Work"). In *Everything*, the unstarred work returns as quiet outlined cards. Going looking for work is one click, not a different place.
- **Size lens — Any / S / M / L.** A filter over the same view: Tasks that don't fit the time available fall away, nothing moves. This is what answers "I have fifteen minutes."

**The card is always the Goal; the star decides what's inside it.** The Goal is the context that explains why a Task is worth doing, so it is always the frame:

| Starred | Card header | Card body |
|---|---|---|
| Goal | full ink, star beside it | its open Tasks, remainder folded to one line |
| Plan | quiet (context, not commitment) | the Plan and its open Tasks; other Plans fold to a line |
| Task | quiet | that Task with its star; siblings fold to a line |
| Task inside a Plan | quiet | Goal → Plan → the Task; siblings fold at both levels |
| Loose Task in a Swimlane | — | no Goal above it, so no card — it stays a chip |

A Swimlane with nothing starred shows a single line at rest ("1 goal, nothing prioritised right now"). It still exists; it just isn't asking for anything.

**Overload is a layout consequence, not a warning.** The app has a fixed amount of room and gives it to whatever is starred. Star four things and each one shows the Tasks you'd actually do next. Star thirteen and there is no room left for Task lists — cards degrade to bare titles, lanes wrap onto second rows, and the page stops fitting on one screen. The app never counts priorities at the user or objects. The calm simply disappears, which is the honest signal. This is the whole of v1's load detection (§8.2).

### 5.8 Lifecycle — how things come into and go out of existence

#### Creating
- **Swimlane:** "+ Swimlane" at the foot of the board. Infrequent, so it sits at the bottom of the thing it affects rather than in a settings screen.
- **Goal:** three one-step routes — "+ Add a goal" at the end of any lane; quick capture with a Swimlane destination and the "as a goal" toggle; or promotion out of The Pile (UC-1040).
- **Plan / Task:** from the Goal or Plan they belong to, or by capture.

#### The ladder
Anything can change what it is, in either direction, without losing itself:

| Move | Meaning |
|---|---|
| Task → Plan | "this is too big" — the signature move (UC-2050) |
| Plan → Goal | "this isn't a step toward something — it *is* the outcome" |
| Task → Goal | the same, from one rung lower; a shortcut, less common |
| Goal → Plan | the inverse — this turned out to be part of a bigger goal |

One mechanism, not four. Title, notes, deadline, star and children all carry over; nothing is deleted and nothing is retyped.

#### The four exits
In the order you will want them:

| Exit | When | What happens |
|---|---|---|
| **Done** | it's finished | stays under its Goal as progress (§5.4) |
| **Send to the Pile** | not now | leaves the board, no guilt, reversible (UC-1060) |
| **Archive** | it's over — finished, or abandoned wholesale | leaves the board, stays readable, restorable |
| **Delete** | it was a mistake or a duplicate | actually destroys; always says what goes |

**Archive** applies to **Goals only**; their Plans and Tasks go with them. A Task you don't want is done, piled, or deleted — a fourth state on a thing whose virtue is having two would be a regression. An archived Goal carries a date and nothing else: **no "abandoned" marker, no "incomplete" badge, no count of what was left**. Archiving an unfinished Goal must feel identical to archiving a finished one.

#### Cascade rules
- **Deleting a Goal** destroys its Plans and Tasks, completed ones included. The confirmation states the counts and **offers Archive beside it** — the destructive path always presents the non-destructive one.
- **Deleting a Plan** promotes its Tasks up to the Plan's parent rather than destroying them. Breaking down is reversible; un-breaking-down should not cost you the work. "Delete its tasks too" exists but is not the default.
- **Deleting a Swimlane** requires a destination for anything inside it — another Swimlane, or **Archive**. There is no silent cascade. *(Revised at M5: this originally said "or The Pile". Piling a Goal destroys its Plans and Tasks, which contradicts §5.5's promise that the Pile is guilt-free and reversible — the Pile holds a line of text. Archive keeps everything and can be undone, and the restore rule below already anticipates a Goal whose Swimlane is gone. Loose Tasks still become Pile items, which loses only their size.)*
- **Archiving** removes any priority stars pointing into the Goal. Restoring does not bring them back; priorities are a current choice, not history (§5.6).
- **Restoring** puts a Goal back in its Swimlane. If that Swimlane is gone, restore asks which one.

## 6. Primary flows

### 6.1 Plan the week (the ritual)
The user opens the Swimlane view, browses Goals and Plans, and stars a small number of things for the week. Last week's stars are cleared (with a one-click "keep this one" while clearing). Zoom into a Swimlane or Goal to break down anything that isn't yet actionable.

**Success:** finishing this in 10–15 minutes and feeling like the week has a shape.

### 6.2 Re-set priorities mid-stream
The same flow as 6.1, at any cadence the user likes — Sunday, every morning, or Wednesday afternoon when the week turned. There is no separate "day plan" object.

### 6.3 Work from the view (the money moment)
"I have 40 minutes." **There is no separate picker.** The user is already looking at the view: starred work is showing its next Tasks in context, and the size lens narrows to what fits. If nothing appeals, the focus toggle widens to Everything and the user cherry-picks by feel. Marking done is one click, in place.

This is deliberately the *same* surface as planning. A mode switch between "planning" and "doing" is the thing that makes a tool feel like a second job.

### 6.4 Capture (ad hoc, all day)
A global quick-capture (keyboard shortcut) that takes a line of text and drops it into The Pile by default, or into a chosen Swimlane. Two seconds, no required fields, never interrupts with a form.

### 6.5 Break it down
From any Task: **"This is too big."** → the Task becomes a Plan, and the user adds child Tasks. From any Goal: add a Plan, add Tasks. This is the app's signature interaction and should feel good.

### 6.6 Time box and decide
A Task's size is its declared box. The app does **not** run a timer or track that work has started. When the user comes back, they choose: **done** (good enough), **leave it open** (a bit more time), or **break it down** (it was bigger than it looked). The app never prompts this unasked.

## 7. In scope for v1

| # | Capability |
|---|---|
| 1 | Create/edit/delete Swimlanes, Goals, Plans (nested), Tasks |
| 2 | Task sizing S/M/L; done/not-done |
| 3 | Optional deadlines on Goals, Plans, Tasks |
| 4 | The ladder: Task ↔ Plan ↔ Goal in either direction, non-destructive |
| 5 | Swimlane browser: calm overview, drill into a Swimlane or Goal |
| 6 | Star priorities (Goal/Plan/Task) into a single current set; explicit "set new priorities" sweep with per-item keep |
| 7 | The one view: focus toggle (Priorities / Everything), size lens (Any/S/M/L), per-swimlane collapse, card-renders-by-star-level, complete in place |
| 8 | Quick capture → The Pile or a Swimlane |
| 9 | The Pile: global list, hashtags, promote out, send to |
| 10 | Done work discoverable under its Goal/Plan (progress visible, celebratory not accusatory) |
| 10a | "Coming up" deadline band on the Set-priorities view only (see §8.2) |
| 10b | Lifecycle: create a Goal from the board or from capture; archive and restore Goals; delete with stated cascade |
| 11 | JSON export / import (full state, human-readable) |
| 12 | Local persistence (browser localStorage), single page app, works offline / from file:// or GitHub Pages |

## 8. Out of scope for v1

### 8.1 Explicitly not doing
- **Any calendar integration.** Not read, not write. The user consults the app when their calendar shows free time. Scheduling tasks far in advance produces the "working for the app" feeling.
- **Time tracking, timers, start/stop, actual-vs-estimate.** The user knows what they're working on.
- **Time estimates in minutes.** S/M/L only.
- **Gamification of any kind.** No streaks, badges, points, velocity, completion rates.
- **Overdue shaming.** No red counts, no "you missed 14 tasks", no daily digest email.
- **Recurring tasks** (revisit after v1 — likely needed for things like weekly invoicing).
- **Mobile / cross-device sync.** Desktop browser only; localStorage means one machine. Accepted risk, mitigated by JSON export.
- **Multi-user, sharing, assignment, comments.**
- **Resource allocation, dependencies, Gantt, critical path.** This is not a project management tool.

### 8.2 Deferred but designed-for
- **Workback schedules (v2).** A workback is expressed as a Plan (or chain of sub-Plans) with deadlines spread across available weeks — e.g. Goal "Catch up on invoicing" with a sub-Plan per past month, one per week. v1 stores deadlines on Goals and Plans so this data exists; v1 just doesn't visualize the spread.
- **Deadlines, and the one sanctioned nudge (in v1, narrowly).** The app raises a date on its own in exactly one place: the **"Coming up"** band at the top of the Set-priorities view, listing dated items with how far out they are and what's left, each starrable on the spot. Setting priorities is the moment the user has *asked* to think ahead, so a nudge there is help rather than nagging. Nowhere else — not the main view, not a badge, not a notification — does a deadline come to the user.
- **A cross-swimlane "next N weeks" view.** The historical 7×7 grid (weeks × deliverables) solved the "am I overloaded across everything?" problem on a whiteboard/spreadsheet. It's a *planning* view, not a *do it now* view, and it's deferred until the underlying data proves it's needed. Notably: the user's own read is that this should **not** be mapped literally onto the app.
- **Rot handling.** v1 captures the metadata (created date, last touched, deadline, done date) so that later we can surface staleness *helpfully* — "this Plan hasn't moved in 3 weeks, still want it?" — rather than punitively. No surfacing in v1.
- **Load / overload detection.** v1 is deliberately **visual only**, via the layout mechanic in §5.7: the room each priority gets shrinks as the user stars more, until the view stops fitting on a screen. No thresholds, no counts shown back to the user, no capacity math, no calendar-aware free-hours calculation.

## 9. Success criteria

1. **The daily bar:** the user opens it every day to prioritize tasks for the day or week from a structure of Goals, Plans and Tasks. If that's all it ever does, it's a success.
2. **The weekly ritual happens** at least three weeks out of four, and takes under 15 minutes.
3. **The Picker gets used** — i.e. "I have some time, what should I work on?" is answered by the app rather than by memory or by the loudest inbox.
4. **Big outcomes move.** Over a month, Goals that previously sat untouched show completed Tasks against them.
5. **Negative signal to watch for:** the user feels obligated to the app, or starts avoiding opening it. That's a principle violation, not a usage problem.

## 10. Resolved decisions

| # | Question | Decision |
|---|---|---|
| D1 | Rule of 3 — enforce or nudge? | **Soft visual to start.** The forcing function is attractive — it is the most direct anti-overwhelm lever — but enforcing it too early throws the user into "now I have to do planning" at the wrong moment. Optimize layout and defaults for 3; revisit a hard cap once real data exists. |
| D2 | Day vs. week priority horizons | **Neither. There is one set: "current priorities."** No week/today distinction. The user revisits whenever they want — weekly, daily, mid-afternoon. Simpler model, fewer states, no implied schedule. |
| D3 | Do Plans have sizes? | **No.** S/M/L is a Task-only concept. |
| D4 | Clearing priorities | **Explicit, but convenient and encouraged.** The app never clears stars on its own. A prominent, low-friction "set new priorities" action clears the current set with per-item "keep" available during the sweep. |
| D5 | Nesting depth of Plans | **Soft limit of 3 levels, same philosophy as the Rule of 3.** If a Goal needs more than 3 levels of Plans it has metastasized into a real project — the right response is to break it down, simplify, or move parts to The Pile. Guided visually, not blocked. |

| D6 | Is the picker a separate screen? | **No — it is the main view.** A mode switch between planning and doing is what makes a tool feel like work. One view, with a focus toggle and a size lens over it. Dropping the separate Picker also removed the priorities sidebar, which was competing with the view for the same job. |
| D7 | How does a Plan- or Task-level star render? | **The card is always the Goal; the star renders where the user put it** (§5.7). The Goal title goes quiet when the commitment is below it. Unstarred siblings fold to one faint line at every level. |
| D8 | Where can a deadline reach the user? | **Only in "Coming up" on the Set-priorities view.** That is the moment the user has asked to look ahead. Everywhere else, dates are shown when looked at, never raised. |
| D9 | Keep the size lens if it goes unused? | **Ship it, then find out.** It is four chips over an existing view — cheap to build, cheap to delete, and it cannot be evaluated in the abstract. |

| D10 | Do completed Goals leave the Swimlane view? | **Yes — via Archive, and only when the user says so** (§5.8). The app never archives anything on its own; a Goal with every Task done sits there looking finished until you decide it's over. Archive covers the abandoned case identically, with no marker distinguishing the two. |
| D11 | Does deleting a Plan delete its Tasks? | **No — they move up to the Plan's parent.** Breaking down is reversible, so un-breaking-down should not destroy work. Deleting the Tasks too is available and explicit. |
| D13 | Where do a deleted Swimlane's contents go? | **Another Swimlane, or Archive — not the Pile.** Decided at M5 while implementing it. Sending structured work to the Pile destroys everything beneath it, so the Pile cannot be both the destination for a whole Swimlane and the guilt-free, reversible place §5.5 promises. Archive is the exit for structured work; the Pile is for ideas. |
| D12 | Is Goal creation its own flow? | **No — it is the ladder plus two shortcuts.** Promotion already exists for Task → Plan and Pile → anything; Goal creation is the same mechanism one rung up, plus an in-lane "+ Add a goal" and an "as a goal" toggle on capture. |

### Still open

1. **Recurring work:** weekly invoicing and similar patterns have no v1 answer. Watch whether the Plan-with-dated-sub-Plans pattern is sufficient.
2. **Staleness surfacing:** metadata is captured in v1; the helpful (non-punitive) presentation is undesigned.
3. **Archive browsing at scale:** a flat reverse-chronological list is the v1 answer. If the Archive becomes something you search rather than glance at, it needs more.
4. **An archived Goal whose Swimlane was deleted** keeps pointing at the lane it came from, and the Archive shows it as having no lane until a restore places it. The alternative — reassigning it to some surviving lane — would silently rewrite history for work that is already over. Recorded here because it is the one place a reference is deliberately allowed to dangle (`DESIGN.md` §3.3).
5. **Completing a Pile item records nothing** (`BACKLOG.md` B-2). UC-1070 says it is "recorded as done", but a Pile item has no structure to record against.

## 11. Use cases

Numbered for traceability: each use case is the source of one e2e test and at least one mock screen. Format: **Pre** (starting state) → **Do** (user actions) → **Then** (observable result) → **Never** (principle guard the test should also assert).

### UC-1xxx — Capture and The Pile

**UC-1010 — Quick capture to The Pile**
Pre: app open, any view. Do: press the capture shortcut, type "look into a new dentist", press Enter. Then: item exists in The Pile; the current view is unchanged and the user is back where they were. Never: a form with required fields; a forced Swimlane choice.

**UC-1020 — Quick capture into a Swimlane**
Pre: Swimlanes "Work" and "Family" exist. Do: capture "book flights", choose Family. Then: a Task appears directly under Family with no Goal, no size, not done.

**UC-1030 — Capture with hashtags**
Pre: none. Do: capture "#house replace the gutters". Then: item in The Pile carrying tag `house`; The Pile can be filtered by that tag.

**UC-1040 — Promote a Pile item to a Goal**
Pre: Pile contains "get the house ready to sell". Do: promote → choose Swimlane "House" → type Goal. Then: Goal exists in House; the item is gone from The Pile; no data lost from the original text.

**UC-1050 — Promote a Pile item to a Task**
Pre: Pile contains "look into a new dentist". Do: promote → Swimlane "Health" → Task, size S. Then: Task exists in Health, size S, not done, no Goal.

**UC-1060 — Send anything to The Pile**
Pre: Goal "Learn Spanish" in Swimlane Fun, currently prioritized. Do: send to Pile. Then: item leaves the Swimlane view, appears in The Pile, and loses priority status. Never: a confirmation that implies failure, an "abandoned" badge, or any count of things given up.

**UC-1070 — Completing a Pile item**
Pre: Pile contains "look into a new dentist". Do: mark done from The Pile. Then: the item leaves The Pile and is recorded as done. The Pile holds only open, unorganized ideas.

### UC-2xxx — Structure

**UC-2010 — Create a Swimlane**
Do: use "+ Swimlane" at the foot of the board. Then: it appears as a lane, empty, with an obvious affordance to add a first Goal. Never: a settings screen, a modal wizard, or a required colour choice.

**UC-2011 — Rename a Swimlane**
Do: click the lane name and type. Then: it renames in place, immediately, with no save button. Everything in it is unaffected.

**UC-2012 — Reorder Swimlanes**
Do: drag a lane by its name. Then: the order persists. Order is the user's, never computed from activity or counts.

**UC-2013 — Delete an empty Swimlane**
Pre: Swimlane "Fun" with nothing in it. Do: delete. Then: one confirmation, it is gone.

**UC-2014 — Delete a Swimlane that has contents**
Pre: Swimlane "Work" with 4 Goals and 2 loose Tasks. Do: delete. Then: the app **requires a destination** — move everything to another Swimlane, or archive its Goals whole and keep its loose Tasks as ideas in The Pile — before anything is removed. The dialog states what is inside. Never: a silent cascade; an offer to delete the contents as the default; a plain "delete everything" for a Swimlane that holds anything.

**UC-2025 — Create a Goal from the board**
Pre: Swimlane "Health" visible. Do: "+ Add a goal" at the end of the lane, type a title, Enter. Then: the Goal exists in that lane with no Plans, no Tasks and no deadline, and the absence of all three is not flagged as incomplete. Never: leaving the board to do it.

**UC-2026 — Capture straight into a Goal**
Do: capture "get the house ready to sell", choose Swimlane "House", toggle to **as a goal**, Enter. Then: a Goal is created in that lane rather than a Task. The toggle appears only once a Swimlane destination is chosen — The Pile has no such distinction.

**UC-2020 — Create a Goal in a Swimlane**
Pre: Swimlane "Work". Do: add Goal "Catch up on invoicing", no deadline. Then: Goal appears under Work with zero Plans and zero Tasks; the absence of a deadline is not flagged as incomplete.

**UC-2030 — Add a Task directly to a Goal**
Pre: Goal "Catch up on invoicing". Do: add Task "find the missing March receipts", size M. Then: Task sits under the Goal with no intervening Plan.

**UC-2040 — Add a Plan to a Goal, with Tasks**
Pre: Goal "Catch up on invoicing". Do: add Plan "Invoice one past month per week", then add 4 Tasks. Then: Goal shows 1 Plan containing 4 open Tasks; Goal progress reads 0 of 4 (or equivalent honest count).

**UC-2050 — Break a Task down (promote Task → Plan)** *(signature interaction)*
Pre: Task "write the PRD" (size L) under Goal "Ship Chipper". Do: "this is too big" → the Task becomes a Plan of the same name → add Tasks "interview", "draft", "review". Then: the Plan retains the original title, notes and links; its 3 Tasks are open; nothing was deleted; the item's place in the hierarchy is unchanged. Sub-case: this works identically for a Task that is currently prioritized (priority transfers to the new Plan) and for one worked on earlier.

**UC-2057 — Promote a Plan to a Goal**
Pre: Plan "Clear the back wall" under Goal "Sort out the garage". Do: "this isn't part of something bigger". Then: it becomes a Goal in the same Swimlane, keeping its title, notes, deadline, star and every child Task and sub-Plan. Its former parent Goal loses it and its counts update. Nothing is retyped and nothing is deleted.

**UC-2058 — Promote a Task to a Goal**
Pre: loose Task "Sort out the garage" in Swimlane Family. Do: promote to Goal. Then: it becomes an empty Goal in that Swimlane carrying its title, notes, deadline and star. Sub-case: a Task under a Plan can do this too and is detached from that Plan.

**UC-2059 — Demote a Goal to a Plan**
Pre: Goal "Book the flights" that turns out to be part of "Plan the December trip". Do: demote, choosing the target Goal. Then: it becomes a Plan under that Goal with all its children intact, and leaves the lane as a top-level item.

**UC-2060 — Nest a sub-Plan**
Pre: Plan "Invoice one past month per week". Do: add sub-Plan "March". Then: nesting renders legibly at depth 2.

**UC-2070 — Nesting depth guidance**
Pre: a chain of 3 nested Plans. Do: attempt to add a 4th level. Then: the action succeeds but the UI surfaces gentle guidance suggesting simplifying or moving part to The Pile. Never: a hard block or an error.

**UC-2080 — Rule-of-3 guidance**
Pre: Swimlane "Work" with 3 active Goals. Do: add a 4th. Then: it is created; the Swimlane renders in a way that makes the crowding visible. Never: a warning dialog, a red state, or a refusal.

**UC-2090 — Set an optional deadline**
Pre: Goal "Get the house ready to sell". Do: set deadline 2026-11-30. Then: the date is shown on the Goal; open Tasks under it acquire no due dates of their own.

**UC-2100 — Rename anything**
Do: click the title of a Swimlane, Goal, Plan or Task and type. Then: inline, immediate, no save button, no dialog.

**UC-2105 — Delete a Goal**
Pre: Goal "Rewrite the onboarding docs" with 2 Plans, 9 Tasks, 3 of them done. Do: delete. Then: the confirmation states exactly what goes — "2 plans and 9 tasks, including 3 you've completed" — and **offers Archive beside it as an equal choice**. Confirming destroys all of it. Never: a delete path that does not show the archive alternative.

**UC-2106 — Delete a Plan**
Pre: Plan "Build the prototype" with 5 Tasks. Do: delete. Then: **the Tasks move up to the Plan's parent**, keeping their sizes, stars and done state; only the Plan is destroyed. "Delete its tasks too" is offered but is not the default.

**UC-2130 — Archive a Goal**
Pre: Goal "Catch up on invoicing", 6 of 7 Tasks done. Do: archive. Then: it leaves the board with its Plans and Tasks, any priority stars pointing into it are cleared, and it is readable in the Archive carrying a date. Sub-case: archiving a Goal with **nothing** done produces an identical result — same copy, same styling, no marker distinguishing abandoned from finished. Never: an "incomplete" badge, a completion percentage, or a count of what was left undone.

**UC-2131 — The Archive**
Do: open the Archive. Then: archived Goals, most recent first, each showing its Swimlane, its title and the date archived. Never: a tally of abandoned work, a "you archived 9 goals this year" summary, or sorting that ranks finished above unfinished.

**UC-2132 — Restore from the Archive**
Do: restore a Goal. Then: it returns to its Swimlane with its Plans and Tasks and done history intact, and **unstarred** — priorities are a current choice, not history. Sub-case: if its Swimlane no longer exists, restore asks which one to put it in rather than failing or inventing one.

### UC-3xxx — Prioritizing

**UC-3010 — Star a Task as a current priority**
Pre: Task "find the missing March receipts". Do: star it. Then: it joins the current priority set and appears in the Picker.

**UC-3020 — Star a Goal**
Pre: Goal "Catch up on invoicing" with 4 open Tasks across a Plan. Do: star the Goal. Then: the Goal is in the current set and all 4 open Tasks are in play without being individually starred. Its card shows the Goal title in full ink with the star beside it, its open Tasks listed, and any remainder folded to one line.

**UC-3021 — Star a Plan inside an unstarred Goal**
Pre: Goal "Ship Chipper v1" (unstarred) containing Plans "Build the prototype" and two others. Do: star the Plan. Then: the card header is the **Goal**, rendered quiet and without a star; the starred Plan appears with its open Tasks nested under it; the other Plans collapse to "2 other plans in this goal". Only the starred Plan's Tasks are in play.

**UC-3022 — Star a Task inside a Plan inside a Goal**
Pre: Goal "Sort out the garage" → Plan "Clear the back wall" → Task "Hire the skip". Do: star the Task. Then: the card shows Goal (quiet) → Plan → that one Task with its star; siblings fold to a faint line **at both levels**. Exactly one Task is in play.

**UC-3023 — Star a loose Task in a Swimlane**
Pre: Task "Fix the back gate" directly under Stuff. Do: star it. Then: it renders as a chip with a star, not a card — there is no Goal above it to frame it.

**UC-3030 — Set new priorities (the sweep)**
Pre: 6 current priorities, 2 of them completed during the period. Do: invoke "set new priorities" → keep one of the unfinished items → confirm. Then: the kept item stays starred, the other unfinished stars clear, and the user is placed in a browse state to choose new ones. Never: any tally of what wasn't finished, any "overdue" or "missed" label, any carry-forward that happened without the user choosing it.

**UC-3040 — Priorities never clear themselves**
Pre: priorities set, app closed over a week boundary. Do: reopen. Then: the same priorities are present, unchanged and unannotated. Never: a "new week" state change that happened while the user was away.

**UC-3050 — "Coming up" on the Set-priorities view**
Pre: three items carry deadlines (4, 11 and 11 weeks out). Do: open Set new priorities. Then: a "Coming up" band lists them nearest-first with the date, how far out it is, what's open, and a star toggle on each. Starring from here adds to the set without leaving the view. Never: this band, or any deadline prompt, appearing anywhere else in the app.

**UC-3060 — Overload is legible without being stated**
Pre: 13 things starred across 5 Swimlanes. Do: open the view in Priorities focus. Then: cards degrade to bare titles (no Task lists — there is no room), at least one lane wraps to a second row, and the page no longer fits one screen. Never: a count of priorities shown back to the user, a warning, an amber state, a block, or any copy telling them they have taken on too much.

### UC-4xxx — Execution

**UC-4010 — Work from the view, time-bounded** *(money moment)*
Pre: 4 things starred at mixed levels, view in Priorities focus. Do: set the size lens to S. Then: **nothing navigates** — the same cards stay in the same places, and Tasks that aren't S fall out of them. Each remaining Task still shows the Goal (and Plan) it serves. Never: a separate picker screen; a single forced suggestion; a timer or countdown.

**UC-4020 — Widen to everything**
Pre: nothing starred appeals. Do: flip the focus toggle to Everything. Then: unstarred Goals return as quiet outlined cards in their own lanes, the collapsed "N more" lines are gone, and the size lens still applies. The layout is the same layout — no new screen, no reload of context.

**UC-4030 — A lens that matches nothing**
Pre: the only starred Task under "Plan the December trip" is an M. Do: set the lens to S. Then: the card remains (the Goal is still context) and says plainly that there is nothing small here. Never: the card vanishing, an empty state that implies failure, or a suggestion to do something else.

**UC-4040 — Complete a Task in place**
Do: tick a Task inside a card. Then: it leaves the open list, its Goal/Plan counts update, a done timestamp is recorded, and the view does not jump or re-sort under the cursor. Never: a score, a streak, a celebratory interruption requiring dismissal.

**UC-4050 — The three outs at the end of a time box**
Pre: Task "Find the missing March receipts", size M, was worked on. Do: choose one of — mark done (good enough) / leave it open (a bit more time) / break it down (UC-2050). Then: the chosen outcome applies and nothing is recorded about time spent. Never: an unprompted dialog asking how it went.

### UC-5xxx — Review and progress

**UC-5010 — See progress on a Goal**
Pre: Goal with 4 Tasks, 3 done. Do: open the Goal. Then: honest count of done vs. open; completed Tasks are visible (not hidden), presented as progress.

**UC-5015 — A Swimlane at rest**
Pre: Swimlane "Health" has one Goal and nothing starred. Do: open the view in Priorities focus. Then: the lane shows a single quiet line naming what's there and offering to show it. Never: an empty state, a zero, a prompt to add something, or any styling that reads as neglect.

**UC-5020 — Browse and cherry-pick by feel**
Pre: user doesn't want anything on the priority list. Do: browse Swimlane → Goal → Plan. Then: full structure is navigable by drilling in, one level at a time, without rendering everything at once.

### UC-6xxx — Data

**UC-6010 — Export**
Do: export. Then: a human-readable JSON file containing the entire state — Swimlanes, Goals, Plans, Tasks, The Pile, current priorities, all timestamps.

**UC-6020 — Import**
Pre: an exported file. Do: import into an empty app. Then: state is identical to the source, including priorities and done history. This round-trip is the primary durability guarantee given localStorage.

**UC-6030 — Import over existing state**
Do: import while data exists. Then: the app states clearly whether it replaces or merges, and requires explicit confirmation.

**UC-6040 — Persistence across sessions**
Do: make changes, close the browser, reopen. Then: state is intact.

**UC-6050 — Saved data that cannot be read**
Pre: the data in this browser is unreadable — a partly-completed write, a file from a newer version, or something else using the same storage. Do: open the app. Then: the board does not open, **nothing is written**, and the screen says what is wrong in words about *this browser* rather than about a file. Three ways out are offered, the destructive one last: download the raw data, show it on screen to copy, or **Import** a good export — which replaces the unreadable data without erasing it first. "Start fresh" erases permanently and takes two clicks. Never: an empty board that looks like a fresh install; a first edit that silently overwrites the only copy; a screen that still says nothing has been deleted after it has.

**UC-6060 — A browser that will not allow storage**
Pre: the browser refuses access to local storage — opening the app as a local file in Chrome, or a setting that blocks site data. Do: open the app. Then: it says so, says nothing can be saved, and does not open a board it could not keep. Never: an indefinite "Opening…"; a board that accepts work it will silently discard.

## 12. Mockups

Twelve artboards under `mocks/`, one `.dc.html` file each, laid out by `canvas.json`.

| Artboard | Shows | Use cases |
|---|---|---|
| `Main` | the view, 4 priorities starred at three different levels | UC-3020, 3021, 3022, 3023, 5015 |
| `Overloaded` | the same view with 13 starred — the load signal | UC-3060 |
| `SizeLens` | size lens set to S, including a card with no match | UC-4010, 4030 |
| `StarDepth` | all card shapes side by side, with the rule stated | UC-3020–3023 |
| `Everything` | focus toggle widened — and the one artboard where UC-2080 is visible: the Work lane's four goals all draw at full width in a single wrapping row, which is the crowding | UC-4020, 2080 |
| `Priorities` | the sweep, plus the "Coming up" deadline band | UC-3030, 3050 |
| `GoalDetail` | **superseded at M4.** Drill-in became opening a card in place rather than a separate screen — a second surface would be the mode the view exists to avoid. The card carries what this artboard showed: full contents, finished work under its own heading, send-to-Pile. | UC-2030, 2040, 5010, 1060 |
| `QuickCapture` | capture overlay | UC-1010, 1030 |
| `BreakDown` | Task → Plan, and the three outs | UC-2050, 4050 |
| `ThePile` | the global backlog | UC-1040, 1050, 1070 |
| `Lifecycle` | creating a Goal in-lane, capture-as-goal, the ladder menu, lane rename. The artboard draws **"Make it a plan under…"** — the picker, ellipsis and all. The code shipped a direct action instead, refused on every click from M5 until M8; the artboard was right the whole time. | UC-2011, 2012, 2025, 2026, 2057, 2059 |
| `DeleteArchive` | delete with the archive alternative beside it, and the Archive view. **Diverged at M5:** each Archive entry now also carries a permanent delete, which the artboard does not draw — added on request, and still described by no use case (BACKLOG). | UC-2105, 2106, 2130, 2131, 2132 |

The `.dc.html` files are the source and are hand-editable; `chipper-mockups.html` is generated from them and is not source.

The artboards are a **record of the design decisions**, not a live specification. Where the shipped app has moved on, the row above says so and the app is what is correct — but the traffic has gone both ways: `Lifecycle` drew a control correctly that the code then implemented wrongly for five milestones. The three boards the code must reproduce exactly (`Main`, `Everything`, `SizeLens`) are pinned as golden fixtures in `src/fixtures/boards.ts` and asserted against `buildBoard` in `test/board.test.ts`.

Surfaces added after the artboards, drawn nowhere: the blocked-storage screen and the storage-unavailable screen (UC-6050, UC-6060), the import dialog, and the notice strip.

## 13. Technical direction (summary — detail in the design doc)

- **v1:** single-page static app, no backend. Hostable on GitHub Pages or run locally. State in `localStorage`. JSON export/import as the durability story.
- **Later:** Cloud Run + Firestore, using the author's existing app framework (Google auth, storage). The v1 data model is designed so this migration is a persistence swap, not a rewrite.
- **Bias:** prototype fast, rewrite when the shape is proven.
