# Chipper — Design Document

**Status:** Draft v1
**Date:** 2026-09-14
**Companion to:** `PRD.md` (product requirements, principles, numbered use cases)

---

## 1. Purpose and scope

This document describes how Chipper v1 is built: module boundaries, data model, contracts, toolchain and tests. It covers the v1 target — a static single-page app with state in browser `localStorage` — and is explicitly shaped so that the anticipated rewrite (Cloud Run + Firestore, with auth) is a **persistence swap rather than a rewrite**.

Two design goals sit above everything else:

1. **Clear modularity with contracts enforced by tests.** Layers are one-directional, and the boundary between them is a typed contract with a test suite that any implementation must pass.
2. **A toolchain that is versioned with the source.** A fresh checkout on a clean machine needs one of two things installed and nothing else.

### 1.1 What is deliberately not solved here

Concurrency, multi-device sync, and merge conflicts. v1 is single-user, single-device, single-writer. The seams are drawn so those can be added later (§10.4), but no code is written for them now.

---

## 2. Architecture at a glance

```
┌─────────────────────────────────────────────────────────┐
│ ui/        Svelte components. Dumb. Render a view model, │
│            emit intents. No business rules.              │
├─────────────────────────────────────────────────────────┤
│ app/       Commands: intent → validate → mutation →      │
│            store. Owns the clock and the id generator.   │
├─────────────────────────────────────────────────────────┤
│ store/     Persistence port + adapters. LocalStore now,  │
│            HttpStore later. One conformance suite.       │
├─────────────────────────────────────────────────────────┤
│ domain/    Pure. Types, invariants, the mutation reducer,│
│            the view-model selectors. No I/O, no DOM.     │
└─────────────────────────────────────────────────────────┘
```

**The dependency rule, in one line:** `domain` imports nothing from the other three; `store` imports only `domain` types; `app` imports `domain` and `store`; `ui` imports `app` and `domain` types. Enforced by a test that parses imports and fails on a violation (§9.5) — an architecture rule that isn't checked is a preference.

### 2.1 The load-bearing idea: the view is a pure function

`buildBoard(state, lens) → BoardModel` is a pure function in `domain/`. Every rule expressed in the mockups — the card renders by star level, the goal title goes quiet when the commitment is below it, siblings fold to "2 more", cards degrade to bare titles under load, "nothing small here" — is a derivation, not component code.

Three consequences, all of which we want:

- **The mockups become fixtures.** Most of the 54 use cases in PRD §11 become millisecond tests with no DOM. UC-3060 is `expect(board.lanes.flatMap(l => l.cards).every(c => c.detail === 'title-only')).toBe(true)`, not a human squinting at a browser.
- **Svelte components stay trivial.** They render a `BoardModel` and emit intents. If a component contains an `if` about product behaviour, it belongs in `domain`.
- **Product principles become type-level guarantees.** `BoardModel` has no field for "things you didn't finish". You cannot render a guilt tally because there is nowhere for the number to come from. That is stronger than a test, because it fails at compile time and it fails for code nobody thought to test.

---

## 3. Data model

### 3.1 Shape: normalized and flat

State is a single document of entity maps with parent pointers. Not a tree — a tree is the one shape that would need rewriting for Firestore.

```ts
type State = {
  schemaVersion: number
  swimlanes: Record<Id, Swimlane>
  goals:     Record<Id, Goal>
  plans:     Record<Id, Plan>
  tasks:     Record<Id, Task>
  pile:      Record<Id, PileItem>
  priorities: Ref[]           // the current set, in the order they were starred
}

type Ref = { type: 'goal' | 'plan' | 'task', id: Id }
type Parent =
  | { type: 'swimlane', id: Id }
  | { type: 'goal',     id: Id }
  | { type: 'plan',     id: Id }

type Swimlane = { id, name, color, order, createdAt, updatedAt }
type Goal  = { id, swimlaneId, title, notes, deadline: IsoDate | null,
               archived: boolean, archivedAt: IsoTime | null,
               createdAt, updatedAt }
type Plan  = { id, parent: Parent, title, notes, deadline: IsoDate | null,
               createdAt, updatedAt }
type Task  = { id, parent: Parent, title, notes, size: 'S'|'M'|'L'|null,
               deadline: IsoDate | null, done: boolean, doneAt: IsoTime | null,
               createdAt, updatedAt }
type PileItem = { id, text, tags: string[], createdAt }
```

Each top-level map becomes a Firestore collection with no reshaping. The parent pointer is already there.

### 3.2 Decisions worth recording

| Decision | Why |
|---|---|
| **`priorities` is a separate ordered set, not a `starred` flag on entities** | The sweep (UC-3030) clears one thing atomically. It keeps "current priorities" a first-class object we can give history to later without touching entities. And it makes "what is starred" a single read. |
| **A Plan's parent may be a Goal or another Plan; a Task's may be a Plan, Goal or Swimlane** | Directly from PRD §5: a Task can sit under a Goal with no Plan, and loose Tasks live in a Swimlane. One `Parent` union rather than three nullable fields. |
| **Ids are `crypto.randomUUID()`, generated by the caller** | Built into every target browser and into Node — zero dependencies, zero hand-rolled code. Caller-generated (not store-generated) is what makes mutations pure data and replayable, and means a future HTTP adapter never has to round-trip to learn an id. Tradeoff: UUIDv4 is not lexically sortable, so ordering comes from `createdAt` and explicit `order` fields, never from the id. |
| **Timestamps are ISO-8601 strings, passed into mutations, never read from the clock inside the reducer** | Keeps the reducer pure and tests deterministic. The `app` layer owns the clock and injects it. |
| **`createdAt` / `updatedAt` / `doneAt` captured on everything from commit one** | PRD §8.2 defers *surfacing* staleness, not *recording* it. The metadata has to already be there when we decide how to show it kindly. |
| **Done tasks stay in place; they are never moved or archived** | PRD §5.4 — done work is discoverable under its Goal as progress. |
| **Archive is a flag on `Goal`, not a separate collection** | Archiving takes the Goal's whole subtree out of the board without moving a single row, so restore (UC-2132) is one field flip and cannot lose children. A separate collection would mean relocating Plans and Tasks — the exact operation most likely to drop something. `buildBoard` filters on the flag; the Archive view inverts the same filter. |
| **Only Goals carry `archived`** | PRD §5.8. Tasks have two states by design; a third would undo that. |

### 3.3 Invariants

Six of the eight below are codes in `domain/invariants.ts`; items 4 and 8 are marked where they are not, because a blanket claim that every one is checked is the kind that stops people looking. `PROBLEM_CODES` is the list of codes, and `test/invariants.test.ts` asserts every one of them is provoked by a hand-built broken state — so a code added later cannot go untested.

Asserted after **every write** in development builds — in `store/local.ts` rather than in the reducer, which stays pure and knows nothing about what kind of build it is in; the store is the one funnel every mutation passes through, so the check cannot be skipped by a caller. It is off in production, where it would cost a walk of the document per keystroke. Also run on every import, and covered by tests that hand-build a broken state for each code below and prove it fires:

1. Every entity's `parent` resolves to an entity that exists — **except** an archived Goal's swimlane, which may be gone. PRD §5.8 requires it: "if that Swimlane is gone, restore asks which one" is only meaningful if the state can hold that. Reassigning archived goals when their lane is deleted would silently rewrite history for work that is already over.
2. No cycles in the parent chain.
3. A Goal belongs to exactly one Swimlane (PRD §5.1).
4. Plan nesting depth ≤ 3 is **guidance, not enforcement** (PRD D5). This is not in `checkInvariants` and should not be — an over-deep chain is a legal document, not a broken one. The depth is measured in `select/board.ts` and surfaced as `CardModel.guidance`; nothing blocks. Listed here because the rule belongs with the others, marked because it is the one that is not a check.
5. Every `Ref` in `priorities` resolves; refs are unique; a ref to a done Task is removed when it completes.
6. A Pile item is never also an entity — promotion (UC-1040/1050) deletes the Pile item in the same mutation.
7. No `Ref` in `priorities` resolves into an archived Goal's subtree — `archiveGoal` clears them in the same mutation (UC-2130).
8. An archived Goal keeps every child in place; nothing is reparented by archiving or restoring. Also not a check — it is a property of the mutations rather than of a document, so it is enforced where it can be: `archiveGoal` sets a flag and moves nothing, and `changeLevel` refuses any ref whose owning goal is archived, which was the one route out (`test/ladder.test.ts`).

---

## 4. Schema versioning and migrations

`schemaVersion` is present from the first commit and appears in both stored state and the export envelope.

One file, `domain/migrations.ts`, holding an ordered `MIGRATIONS` list applied in sequence:

```ts
type Migration = {
  from: number          // applied to an envelope at this version, producing from + 1
  describe: string
  up: (state: unknown) => unknown   // pure; depends on nothing outside its input
}
```

One step so far, added at M8: `dropStarsInsideArchivedGoals` (v1 → v2). No SHAPE changed — what changed is the set of documents considered valid, when invariant 7 started being enforced over an archived goal's whole subtree rather than just the goal ref. Roughly 8% of documents M7 wrote and called clean are refused by M8, and a refusal on load is the blocked screen rather than a warning, so the step drops the offending stars: the same filter `archiveGoal` already applies. `test/fixtures/exports/v1-m7-archived-star.json` is a document in that exact shape, and the tests assert it fails unmigrated and opens after.

The machinery is also tested against synthetic versions, because the first real migration should not be the first test of whether migrating works at all.

On load: if `stored.schemaVersion < CURRENT`, apply migrations in order, persist the result, continue. If `stored.schemaVersion > CURRENT`, refuse to load and say so plainly — a newer file in an older app is a data-loss trap, not something to guess at.

Every migration ships with a test carrying a real fixture of the prior version. This costs ten lines now; retrofitting it onto data you care about is miserable.

---

## 5. The store port

### 5.1 The port

```ts
interface Store {
  read(): Promise<State>
  apply(mutation: Mutation): Promise<void>
  subscribe(listener: (state: State) => void): () => void
}
```

Three methods. That is the entire surface that has to be reimplemented for Firestore.

### 5.2 The reducer lives in `domain`, not in the adapters

```ts
// domain/reduce.ts
function reduce(state: State, mutation: Mutation): State   // pure, total, no clock
```

This is the point of the design. Adapters are about *persistence*, not *logic*:

- **`LocalStore`** holds state in memory, calls `reduce`, writes the whole document to `localStorage` (debounced), notifies subscribers.
- **`MemoryStore`** does the same without persisting. Used by tests and by import preview.
- **`HttpStore`** (future) POSTs the mutation and applies `reduce` optimistically. A Node server applies the *same* `reduce` against Firestore.

Business rules therefore cannot drift between client and server, because there is only one copy of them.

### 5.3 The mutation vocabulary

Mutations are plain typed data — no functions, no closures — so they serialize, replay and become HTTP request bodies unchanged.

The complete list is `MUTATION_KINDS` in `domain/mutations.ts`, held in step with the union by a compile-time exhaustiveness check (`_allKindsListed` fails to build if a kind is added without being listed). `test/generator.test.ts` asserts the trace generator emits every one of them except `replaceAll`, which is excluded because it discards the history being built — so a new mutation cannot quietly escape the property tests.

**Structure**
`createSwimlane` · `setSwimlaneColor` · `reorderSwimlanes`
`createGoal` · `createPlan` · `createTask`
`renameEntity` · `setNotes` · `setTaskSize` · `setDeadline` · `setTaskDone`

`changeLevel { ref, to: 'goal'|'plan'|'task', newId, parent?, at }` — **the ladder** (PRD §5.8), one mutation for all four moves including the signature Task → Plan (UC-2050). Non-destructive: title, notes, deadline, star and children carry over; the new id is a parameter so the mutation stays pure and replayable. Unifying these was a deliberate choice — four near-identical mutations would drift, and the reducer case is the same shape for all of them.

**Deletion — one mutation per type, because the cascades genuinely differ**
`deleteGoal { id, at }` — destroys the subtree. The *dialog* offers Archive (UC-2105); the mutation does not, because a mutation that sometimes does something else is untestable.
`deletePlan { id, disposition: 'promote-children' | 'cascade', at }` — default promotes Tasks to the Plan's parent (UC-2106, PRD D11).
`deleteTask { id, at }`
`deleteSwimlane { id, disposition: { kind: 'move', toSwimlaneId } | { kind: 'archive', pileIds }, at }` — a destination is **required by the type**, so a silent cascade is not expressible (UC-2014). `archive` puts the goals away intact and turns **unfinished** loose tasks into pile items; `pileIds` is `Record<taskId, newPileId>`, keyed by task rather than positional, so the mutation stays pure and replayable and cannot pair the wrong idea with the wrong task. Finished loose tasks are destroyed rather than converted — an idea has no notion of being done, and routing completed work through the Pile dropped `done`, `doneAt`, `notes` and `deadline`. `buildRemoval` states that count before it happens.

**Priorities and the pile**
`addPriority` · `removePriority` · `setPriorities`
`capture` · `editPileItem` · `promotePileItem` · `sendToPile` · `deletePileItem`

**Wholesale**
`replaceAll { state, at }` — the import path (UC-6020), and the only mutation that takes a document rather than editing one. It is why the development-build invariant check sits after the reducer in `store/local.ts` rather than relying on per-mutation rules. It returns a shallow copy rather than the payload itself, so the store never aliases a mutation's data.

**Ids** are supplied by the caller and are unique across the **whole document**, not within a collection — `idTaken` in the reducer is that check, and every mutation that mints an id asks it. Invariant 6 (a pile item is never also an entity) depends on it.

**Archive**
`archiveGoal { id, at }` — sets the flag and clears any priority refs into its subtree, in one atomic mutation.
`restoreGoal { id, swimlaneId?, at }` — `swimlaneId` required only when the original lane is gone (UC-2132).

The sweep (UC-3030) replaces the whole priority set in one atomic `setPriorities`, which is exactly why priorities are a separate collection.

27 mutations — `MUTATION_KINDS` is the list, and `_allKindsListed` fails to compile if the union gains one it does not mention. Each is one case in the reducer and one test.

Two shapes above are load-bearing and worth stating plainly: **`deleteSwimlane` cannot be constructed without a destination**, and **`deletePlan` cannot be constructed without saying what happens to its Tasks**. Both are product rules (PRD §5.8) hoisted into the type system, where they are enforced for code nobody remembered to test.

### 5.4 The conformance suite

`test/support/conformance.ts` exports a suite that takes a `Store` factory and a reference adapter to agree with. It lives under `test/` because it imports `vitest`: in `src/store/` it was one ordinary import from the shipped bundle, and the architecture guard could not see package imports at all.

1. Read on empty returns a valid empty state, checked against the JSON Schema with `ajv`. The suite lives in `test/support/` for this reason: in `src/store/` it could not import `ajv`, so this case was `toEqual(emptyState())` — a tautology against the constructor the store itself uses.
2. Every kind in `MUTATION_KINDS` is exercised. The suite asserts the coverage set is complete before running it, so adding a mutation without adding a sample fails here rather than passing quietly.
3. Each mutation is observable through `read()`.
4. State survives destroying the adapter and constructing a new one over the same backing.
5. Subscribers fire exactly once per applied mutation.
6. A broken mutation is rejected without corrupting what is already there.
7. The same sequence applied twice gives the same state.
8. Two *different* adapters reach the same state from the same sequence. `describeStoreConformance` takes a reference-adapter factory and runs this itself, so an `HttpStore` author who runs the suite gets it — while it lived outside the suite, §5.4's closing sentence was false for the one case that catches serialization loss.
9. `create()` returns a new instance each time, not a shared singleton.
10. A state that breaks an invariant is refused or stored whole, never silently mangled — the case `replaceAll` most needs, being the only mutation that takes a document.

When `HttpStore` is written, it is finished when this suite is green. That is the contract, and it is executable.

---

## 6. The view model

### 6.1 `BoardModel`

`domain/board.ts` is authoritative; this is the shape it holds and why each field is there.

```ts
type Lens = {
  focus: 'priorities' | 'everything'
  size: 'any' | 'S' | 'M' | 'L'
  expanded: Id[]                           // goals opened to look inside (UC-5020)
}

type BoardModel = {
  lanes: LaneModel[]
  lens: Lens
}

type LaneModel = {
  id, name, color
  cards: CardModel[]
  chips: ChipModel[]                       // loose Tasks with no Goal above them (UC-3023)
  collapsed: { count: number } | null      // "2 more in Work"
  resting: { summary: string } | null      // "1 goal, nothing prioritised right now"
}

type CardModel = {
  goalId
  emphasis: 'active' | 'quiet'             // in play, or shown only because focus is Everything
  header: { title, contextual: boolean, starred: boolean }
  meta:   { done, total, label: string, deadline: { iso, label } | null }
  expanded: boolean
  holdsAnything: boolean                   // is anything under it at all — NOT rows.length
  done: { tasks: { id, title }[] } | null  // finished work, as progress (UC-5010)
  guidance: { text: string } | null        // gentle, never a block (UC-2070, D5)
  detail: 'tasks' | 'title-only'           // degradation under load (UC-3060)
  rows:   RowModel[]                       // plan and task rows, with indent
  folded: { text: string } | null          // "2 other plans in this goal"
  empty:  { text: string } | null          // "nothing small here — your starred task is an M"
  demoteUnder: { goalId, label }[]         // every OTHER live goal (UC-2059)
}
```

`holdsAnything` exists because inferring it from the drawn rows was wrong: it was `rows.length === 0`, which is also true of a title-only card and of a goal whose tasks are all done — so "to the Pile" appeared on goals the reducer then refused.

`demoteUnder` is per CARD and not per board, with the card's own goal already excluded. As a board-level list every card had to filter itself out in Svelte, which is `changeLevel`'s cycle rule restated in a component; and no artboard draws a picker's contents, so the field had to be carved out of the golden-fixture comparison. A field the fixtures cannot describe is a field on the wrong model.

`LaneModel` carried a `crowding` field for part of M8. It is gone — see BACKLOG B-9 for why the signal it fed was worse than nothing.

There is no `overdueCount`, no `missedCount`, no `streak`, no `completionRate`. `_noGuiltFields` makes that a compile error rather than a review note (§9.5), every selector module asserts it, and `test/shape.test.ts` pins each model's whole field list — because a name-based guard only catches the names someone thought of, and review demonstrated that by adding `tally: 'some of it was finished'` to every Archive entry and watching 549 tests pass.

### 6.2 The star-level rule

One rule, four cases (PRD §5.7). For each starred `Ref`, walk to its owning Goal and group by Goal. Then per Goal:

Archived Goals are excluded before any of this runs; the Archive view (§6.5) inverts the same filter.

- `header.starred` = the Goal itself is in `priorities`
- `header.contextual` = `!header.starred` — when the commitment is below the Goal, the Goal is context, not a promise
- `rows` = the union of visible subtrees for each starred ref under that Goal, preserving Plan → Task nesting as `indent`
- `folded` = a count of everything under the Goal that is not visible, at every level

A starred Task with no owning Goal produces a `ChipModel`, not a card — there is no Goal above it to frame it.

### 6.3 The size lens

Rows are filtered to Tasks whose `size` equals the lens. Unsized Tasks appear only under `any`. A card whose rows all filter out **stays visible** with `empty` set — the Goal is still the context, and vanishing cards would make the view feel like it was hiding things (UC-4030).

### 6.4 Degradation under load

The mechanic that makes overload visible without saying anything (PRD §5.7, UC-3060). Two constants, in one module so tuning is one edit:

```ts
export const layout = {
  detailBudget: 6,     // above this many starred items, cards go title-only
  rowsPerCard: 3,      // task rows shown per card before folding
}
```

`detail = priorities.length <= layout.detailBudget ? 'tasks' : 'title-only'`.

**These numbers are guesses.** They were chosen to make the mockups read correctly and they are the single most likely thing to need tuning after real use. They live behind one named export so that tuning is a one-line change with a test that pins the boundary behaviour rather than the constant.

---

### 6.5 The Archive view

`buildArchive(state) → ArchiveModel` — archived Goals, most recent first, each carrying Swimlane, title and `archivedAt`.

```ts
type ArchiveModel = { entries: { goalId, title, swimlaneName, archivedAt }[] }
```

There is no `completedCount`, no `abandonedCount`, and no flag distinguishing a finished Goal from an abandoned one. UC-2130 requires the two to be indistinguishable, so the model cannot tell them apart either — the same §2.1 argument, applied to the place it matters most.

## 7. The app layer

`app/commands.ts` is the only place that knows the current time or generates an id.

```ts
type Deps = { store: Store, now: () => IsoTime, newId: () => Id }

async function promoteTaskToPlan(deps, taskId) {
  const planId = deps.newId()
  await deps.store.apply({
    kind: 'changeLevel', ref: { type: 'task', id: taskId },
    to: 'plan', newId: planId, at: deps.now(),
  })
}
```

Injecting `now` and `newId` is what makes every command deterministic under test. Commands validate intent, build exactly one mutation, and apply it. Anything more interesting than that belongs in `domain`.

**Undo** keeps the last N mutations plus inverse mutations in memory. It is deliberately *not* persisted in v1 — undo across sessions implies a durable log, which is a different design and is not needed to be useful.

---

## 8. The UI layer

Svelte 5 components. The table is what SHIPPED — it was written ahead of the code and named six components that were never built (`GoalDetail`, `ComingUp`, `GoalMenu`, `AddGoalInline`, `LaneHeader`, `DeleteDialog`), which is a map of a building that does not exist.

| Component | Artboard |
|---|---|
| `Board` + `Lane` + `GoalCard` + `TaskRow` + `PlanRow` + `Chip` | `Main`, `Overloaded`, `SizeLens`, `Everything`, `StarDepth` |
| `LensControls` (focus toggle, size lens), `TopBar` | header of every board artboard |
| `SetPriorities` (the sweep and the "Coming up" band) | `Priorities` |
| `CaptureOverlay` | `QuickCapture` |
| `BreakDownDialog` | `BreakDown` |
| `Pile` | `ThePile` |
| `GoalCard`'s own controls (the ladder, archive, delete), `AddInline`, `Lane`'s header | `Lifecycle` |
| `RemoveDialog` (with the archive alternative), `Archive` | `DeleteArchive` |
| `Blocked`, `Unavailable`, `ImportDialog`, `Notice` | nothing — added after the artboards, see PRD §12 |
| `EditableText`, `DeadlineField`, `StarButton`, `Icon` | shared pieces, drawn inside the others |

`GoalDetail` is absent because the artboard is (PRD §12): drilling in became opening a card in place at M4, and a second surface would be the mode the view exists to avoid.

Rules: components receive a view model and emit intents. No component fetches, computes product rules, or reaches into `store`. The design tokens from the mockups (palette, type scale, radii, the reservation of cherry for priority and sage for done) move into one `tokens.css` and are referenced by variable — the token drift caught in the mockup review is the exact failure mode this prevents.

---

## 9. Toolchain

### 9.1 Requirements

A fresh checkout needs **either** a Node version manager **or** Docker. Nothing else. Both paths are in the repo and produce the same result.

### 9.2 Pinning

| File | Pins |
|---|---|
| `mise.toml` | the exact Node version (with `.nvmrc` mirrored for nvm users) |
| `package-lock.json` | every dependency, committed; `npm ci` only, never `npm install` in CI |
| `Dockerfile` | the same Node version, for the cold-machine path |
| `Makefile` | the commands, so neither path has to be remembered |

### 9.3 Dependencies

**Runtime dependencies: zero.** Svelte compiles away. No UI kit, no date library, no state library, no id library (`crypto.randomUUID` is built in). The entire dependency surface is dev-side, where it cannot reach production.

**Dev dependencies, and why each one is there:**

| Package | Why it earns its place |
|---|---|
| `svelte`, `@sveltejs/vite-plugin-svelte` | the framework, chosen for prior success and because it compiles to no runtime |
| `vite` | dev server and build |
| `typescript`, `svelte-check` | the contract enforcement mechanism of §2.1 |
| `vitest` | test runner, same module resolution as the build |
| `ajv`, `ajv-formats` | JSON Schema validation, in tests only |
| `prettier` | formatting |

No ESLint. With TypeScript strict and Prettier, it earns less than it costs in configuration and version churn — add it later if a real class of bug shows up that the compiler misses.

### 9.4 Commands

```
make setup     install the pinned toolchain and dependencies
make dev       vite dev server
make test      vitest
make check     tsc --noEmit && svelte-check && prettier --check && vitest run
make build     static bundle into dist/
make docker-*  the same targets inside the container
```

CI runs `make check` and `make build`, then deploys `dist/` to GitHub Pages. `dist/` is not committed.

### 9.5 Mechanical guards

Anything that is a rule is a test, not a review item. A test runs on every commit for free; a reviewer has off days. These are cheap and go in before the first feature:

| Guard | Catches |
|---|---|
| Walk `src/`, parse imports, fail on a wrong-direction dependency | layering as a *contract* rather than a convention |
| Grep `src/domain/` for `Date.now`, `new Date(`, `Math.random`, `crypto.`, `window`, `document`, `localStorage` | hidden clock, randomness or I/O in the layer that claims to be pure |
| Deep-freeze state in every reducer test | the reducer mutating its input — the bug that makes undo and optimistic updates silently wrong |
| Enumerate the `Mutation` union; assert every kind has a reducer case, is exercised by the conformance suite, and is emitted by the trace generator | a mutation added without a rule, a contract case, or property coverage |
| Compile-time assertion that `CardModel` and `BoardModel` have no key in a forbidden list (`overdueCount`, `streak`, `completionRate`, `missed`, `abandoned`) | someone reintroducing the guilt tally §2.1 exists to prevent |

The last one turns the principle argument in §2.1 into a build failure, which is the point: the guarantee should not depend on anyone having read this document.

---

## 10. Contracts

### 10.1 JSON Schema is the source of truth for data

`schema/*.schema.json` defines every entity and the export envelope. It is load-bearing on day one because export/import (UC-6010/6020) makes the JSON format a public surface the moment a file leaves the app.

TypeScript types are **hand-written**, not generated. Drift between the two is caught in test instead: `additionalProperties: false` plus complete `required` lists mean that validating generated states against the schema catches both directions — a field the schema does not know about, and a field the types have dropped. The schemas are validated with `ajv`; they are not shipped in the runtime bundle.

This is weaker than generation and deliberately so: generation would add a build step and a code generator to a project whose whole toolchain promise is that `npm install && npm run dev` is the entire setup. The drift test is what buys that back, which is why `test/generator.test.ts` reads the `$defs` keys out of the schema file and requires a census counter for each — a generator that stopped emitting plans would otherwise leave the `plan` and `size` definitions validated against no data at all, with nothing failing.

### 10.2 The export envelope

```json
{ "app": "chipper", "schemaVersion": 1, "exportedAt": "2026-09-14T…Z", "state": { … } }
```

Human-readable, pretty-printed, stable key order — so a diff between two exports is legible, which makes it useful for debugging and for git-tracking your own data if you want to.

### 10.3 OpenAPI: deferred, not abandoned

There is no server in v1, so an OpenAPI document would describe an API nobody calls, and it would drift. What OpenAPI gave you before — an explicit, versioned, machine-readable contract — is preserved here in the JSON Schemas and the mutation vocabulary.

When the server arrives, OpenAPI is authored over the **same** schema files as `components/schemas`, and the mutation vocabulary becomes the request bodies. The contract does not get invented then; it gets an HTTP envelope.

### 10.4 What the migration actually costs

| Layer | Change |
|---|---|
| `domain/` | none |
| `store/port.ts` | none |
| `store/http.ts` | new, small — `read` is a GET, `apply` is a POST |
| Server | applies the *same* `reduce` against Firestore |
| `schema/` | reused verbatim as OpenAPI components |
| Auth | wraps `read`/`apply` with credentials; no other layer learns about it |
| **Genuinely new** | **concurrency.** Two writers, optimistic updates and conflict resolution are a real problem localStorage never posed. Not designed here, and not pretended away. |

---

## 11. Testing strategy

Four layers, fast to slow, with no browser in v1.

1. **Domain tests** — the bulk. Reducer cases, invariants, and `buildBoard` against fixtures drawn from the mockups. Every test naming a use case carries its `UC-####` in the test title, so PRD §11 and the suite can be diffed against each other.
2. **Store conformance** (§5.4) — one suite, run against every adapter.
3. **Round-trip property test** — generate random valid states, export, import into a fresh store, assert deep equality including priorities and done history. This is the durability guarantee for a localStorage app and deserves a property test rather than examples (UC-6020).
4. **Schema validation** — every fixture and every export validates against the JSON Schema; malformed imports are rejected with a legible error (UC-6030).

**The `Never` clauses are testable.** PRD §11 writes each use case as `Pre / Do / Then / Never`, and the `Never` is usually a structural assertion on `BoardModel`: no count of unfinished work, no state change that happened while the user was away, no card vanishing when a filter matches nothing. Those are the product principles, and they are the tests most worth having.

5. **Component tests** (added at M3) — `happy-dom` plus vitest, rendering a component against a view-model fixture and asserting the DOM. Added because three bugs reached the user through the UI layer while the domain produced none: a `setContext` call in the wrong lifecycle hook, goal contents made unreachable, and two elements sharing a CSS class so an opened card rendered invisible. None of those are reachable from a pure function, and all three are reachable from a rendered component. One dev dependency, no browser binaries.

**Still deferred:** Playwright. Component tests cover rendering; full browser automation buys little more until there is a second store implementation or a multi-screen flow to drive.

---

## 12. Repository layout

```
PRD.md  DESIGN.md  README.md
Makefile  mise.toml  .nvmrc  Dockerfile  package.json  package-lock.json
schema/          *.schema.json          — source of truth for data
src/
  domain/        types, invariants, reduce, selectors/board, layout constants
  store/         port, local, memory
  app/           commands, clock, ids, state container
  ui/            Svelte components, tokens.css
  domain/migrations.ts  the migration chain, each step with a fixture test
src/fixtures/    board fixtures transcribed from the artboards, and the states behind them
test/            architecture.test.ts, shape.test.ts, support/ (conformance, generator)
test/fixtures/   frozen export files — see its README for the provenance rules
mocks/           the twelve .dc.html artboards + canvas.json
```

---

## 13. Risks and open questions

1. **The layout budget constants (§6.4) are guesses.** They make the mockups read correctly; only real use will say whether 6 and 3 are right. Isolated behind one module for exactly this reason.
2. **localStorage has no durability guarantee.** A cleared cache loses everything. Mitigated only by export, which is a manual act. Worth considering an automatic periodic export-to-download once the app is in daily use.
3. **Undo is in-memory only.** Fine for v1; revisit if a lost afternoon's work ever proves otherwise.
4. **`changeLevel` on a done Task** — currently unspecified. Probably disallowed downward (a done Task does not need breaking down) but harmless upward.
5. **Archive at scale** (PRD §10, still open) — a flat reverse-chronological list is the v1 answer. If it becomes something to search, `ArchiveModel` grows; the storage shape does not have to.
6. **The reducer is shared between client and server in the future design.** That assumes a Node backend. If the backend ends up in another language, the rules get reimplemented and the conformance suite becomes the thing that keeps them honest — which is an argument for keeping that suite language-neutral in spirit.
