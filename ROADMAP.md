# Chipper — Implementation Roadmap

**Companion to:** `PRD.md` (what and why), `DESIGN.md` (how)

Eight milestones. Each one is a **vertical slice**: it ends with something you can open in a browser and use, and something I can assert on in tests. There is deliberately no milestone that builds a layer without exposing it.

Two sequencing rules drive the order:

1. **Durability ships with the first real data.** Export/import is in M1, not at the end — M1 is the first point real goals go into `localStorage`, and `localStorage` is one cleared cache from gone.
2. **You start using it for real at M2.** The layout constants (`DESIGN.md` §6.4) and whether the size lens earns its place (PRD D9) cannot be settled in the abstract. M2 is the earliest honest test of both.

Every milestone is done when: it runs, `make check` is green, the listed use cases are covered by named tests, and the listed reviewers have been run and their findings resolved or recorded.

---

## M0 — Walking skeleton

Toolchain end to end, and the design rendered as real HTML.

`mise.toml`, `Dockerfile`, `Makefile`, `package.json` with the pinned dev set, Vite + Svelte + TypeScript + Vitest wired up. `BoardModel` types. `Board` / `Lane` / `GoalCard` / `TaskRow` / `PlanRow` components rendering **golden fixtures transcribed from the board artboards** — the view, overloaded, the size lens, everything, every card shape, and first-run. The seven non-board screens (goal detail, the Pile, capture, break-down, priorities, lifecycle, archive) stay as mockups until the milestones that own them.

**What you can do:** open the board in every state we designed, as real HTML at your actual screen width, in your browser, in light and dark. Resize it. Tell me what breaks — this is the first moment the design meets a real viewport rather than a 1280px artboard.

**What I can catch:** the toolchain works from a cold checkout on both paths (version manager and Docker). The mechanical guards from `DESIGN.md` §9.5 are in place and failing correctly on purpose-broken code — import direction, the forbidden-keys compile assertion, the domain-purity grep. Fixtures exist for every board state, including the overloaded one.

**Closes:** no use cases. This validates §2.1 and §9 before anything depends on them.
**Reviewers:** `contract-reviewer` on the skeleton.

---

## M1 — It holds your structure

The engine, and enough UI to put your real life into it.

`State` types and `schema/*.schema.json`. `reduce()` with the structural mutations. Invariants. `MemoryStore`, `LocalStore`, and the conformance suite both must pass. Export and import. UI: create, rename and reorder Swimlanes; create Goals, Plans and Tasks; tick a Task done. The board renders in **Everything** focus only — there are no priorities yet.

**What you can do:** put your actual goals in, close the browser, reopen it, and find them there. Export the JSON and read it. This is the milestone where the structure stops being hypothetical and you find out whether Swimlanes → Goals → Plans → Tasks survives contact with your real work.

**What I can catch:** every reducer case with frozen input. Every invariant. The conformance suite against two adapters. The export/import round-trip as a **property test** over generated states — the durability guarantee deserves properties, not examples.

**Closes:** UC-2010, 2011, 2012, 2020, 2025, 2030, 2040, 2060, 2100, 4040, 6010, 6020, 6040.
**Reviewers:** `mutation-reviewer`, `purity-reviewer`.
**Note:** the biggest milestone. If it needs splitting, the seam is export/import — but do not move it later than the first real data.

---

## M2 — It runs your week

Priorities, and the rendering rule that the whole view rests on.

Star a Goal, Plan or Task. `buildBoard` implements the star-level rule (`DESIGN.md` §6.2) in all four shapes, per-lane collapse, the lane at rest, and degradation under load. The focus toggle.

**What you can do:** **start using it daily.** Star four things and run your week off it. Then star twelve and see whether the view actually conveys that you have taken on too much — that is the central product claim and this is the first time it can be judged rather than asserted.

**What I can catch:** `buildBoard` against every star-level case, including a Task starred inside a Plan inside a Goal. UC-3060 asserted structurally — every card comes back `title-only` above the budget. The negative assertions: no card vanishes, nothing reports a count of unfinished work.

**Closes:** UC-3010, 3020, 3021, 3022, 3023, 3060, 4020, 5015, 5020.
**Reviewers:** `view-model-reviewer`, `principle-auditor`.
**Expect to tune:** `layout.detailBudget` and `layout.rowsPerCard`. The tests pin boundary *behaviour*, so tuning the numbers must not require editing tests. If it does, the tests are wrong.

---

## M3 — Capture without leaving what you're doing, and tests that reach the UI

Quick capture with its keyboard shortcut, destination selection, the as-a-goal toggle, hashtag parsing. The Pile: list, tag filter, promote out, send to Pile, complete in place.

**Plus the testing layer that M0–M2 deferred.** Three bugs reached the user through the UI layer — a `setContext` call in the wrong lifecycle hook, goal contents made unreachable, and two elements sharing a CSS class so an opened card rendered at `opacity: 0`. The domain has produced none. The trigger written into the original decision ("a regression that unit tests missed") has fired three times, so component tests with `happy-dom` go in here: render a component against a view-model fixture and assert what is actually in the DOM. One dev dependency, no browser binaries.

**What you can do:** catch things during the day in two seconds, from wherever you are, and stop holding them in your head. The Pile becomes the place ideas go instead of the back of your mind.

**What I can catch:** capture with no destination lands in the Pile; hashtags parse and strip; promotion deletes the Pile item in the same mutation (invariant 6); sending a starred Goal to the Pile clears its star. And, for the first time, that components render what the view model tells them to — an opened card shows its contents, a quiet card does not, a starred row shows its star.

**Closes:** UC-1010, 1020, 1030, 1040, 1050, 1060, 1070, 2026.
**Reviewers:** `mutation-reviewer`.

---

## M4 — The whole working loop

Goal detail with done work shown as progress. Task → Plan and the three outs. The size lens.

**What you can do:** the complete money moment — sit down with forty minutes, set the lens, pick something, and when it turns out to be bigger than it looked, break it down without losing your place. Also the first real use of the size lens, which decides whether it stays (PRD D9).

**What I can catch:** `changeLevel` carries title, notes, deadline, star and children. The lens filters rows without removing cards, and a card with no match keeps its context and says so (UC-4030) rather than vanishing.

**Closes:** UC-2050, 2070, 4010, 4030, 4050, 5010.
**Reviewers:** `principle-auditor`, `view-model-reviewer`.

---

## M5 — Lifecycle

The ladder in both directions. Archive and restore. Delete with its cascades, the archive alternative in the delete dialog, and Swimlane deletion requiring a destination.

**What you can do:** stop accumulating. Finish a Goal and put it away; abandon one and put it away identically; delete the thing you created by mistake and be told exactly what goes with it.

**What I can catch:** the cascades match the PRD clause for clause — Plan deletion promotes its Tasks, Swimlane deletion is unconstructable without a destination, archiving clears priority refs into the subtree. And that nothing anywhere distinguishes an abandoned Goal from a finished one.

**Closes:** UC-2013, 2014, 2057, 2058, 2059, 2105, 2106, 2130, 2131, 2132.
**Reviewers:** `lifecycle-reviewer`, `mutation-reviewer`.

---

## M6 — The ritual

Deadlines on Goals, Plans and Tasks. The Set-priorities sweep with per-item keep. The "Coming up" band.

**What you can do:** the Sunday ritual, properly — look ahead, see what has a date and how far out it is, keep what still matters, and let the rest go without a mark against it.

**What I can catch:** the sweep replaces the set atomically; nothing anywhere tallies what was not finished; priorities never change without an explicit action (UC-3040); "Coming up" appears on exactly one surface and nowhere else.

**Closes:** UC-2090, 3030, 3040, 3050.
**Reviewers:** `principle-auditor`, `traceability-reviewer`.

---

## M7 — Ship it

The migration chain with real prior-version fixtures. Import over existing state. First-run, empty, singular and enormous states. GitHub Pages deploy from CI.

**What you can do:** use it on a machine that has never seen it, with no data, and have the first sixty seconds make sense. Hand it to a friend.

**What I can catch:** a real export from every earlier milestone still imports. A newer `schemaVersion` refuses to load rather than guessing. Every screen has a defined first-run and empty state.

**Closes:** UC-6030, plus the first-run and empty states that no use case currently names.
**Reviewers:** `migration-reviewer`, `edge-state-reviewer`, `traceability-reviewer`, then `/code-review` over the whole diff.

---

## What I will need from you

| Milestone | What only you can answer |
|---|---|
| M0 | does the design hold at your real screen width? |
| M1 | does the four-level structure fit your actual work, or does something not have a home? |
| M2 | does the view convey overload — and are the layout constants right? |
| M3 | is capture fast enough to use mid-task? |
| M4 | does the size lens earn its place, or do we delete it (D9)? |
| M5 | are the delete cascades the ones you want, particularly Plan deletion (D11)? |
| M6 | is "Coming up" helpful or is it the nag we said we would not build? |
| M7 | would you give this to a mentee? |

## Deliberately not in this roadmap

Recurring work, workback visualisation, staleness surfacing, multi-user, calendar integration, mobile, Cloud Run + Firestore. All are PRD §8 or §10 items. The Firestore migration in particular waits until the app has proven it is worth migrating — and `DESIGN.md` §10.4 is honest that concurrency is real new work when it comes.
