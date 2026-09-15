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
| `PRD.md` | Product requirements. Principles, concepts, the one view, 54 numbered use cases (UC-####) written as `Pre / Do / Then / Never`. The `Never` clauses are the product principles made testable. |
| `ROADMAP.md` | Nine milestones (M0–M8), each a vertical slice that ends in something usable and something testable, plus the review loop each one closes through. |
| `BACKLOG.md` | Rough edges and open decisions noticed while using the app. Not milestone work. |
| `DESIGN.md` | Technical design. Layering, data model, the store port and its conformance suite, the pure view model, toolchain and tests. |
| `mocks/*.dc.html` | Twelve screen mockups, one artboard per file. Source, hand-editable. They record the design decisions rather than specifying the current app — one is superseded outright and two have diverged in a detail; `PRD.md` §12 says which, and which are still pinned as golden fixtures. |
| `mocks/canvas.json` | Canvas layout: artboard positions, titles, annotations. |
| `.claude/agents/` | Standing reviewer roles. Read-only agents that audit the docs and mocks along one dimension each: lifecycle, principles, traceability, edge states, contracts. |

### Viewing the mockups

The files in `mocks/` are the source. A rendered pan/zoom canvas of them lives at
<https://claude.ai/code/artifact/d763ffb0-a7f3-403b-9d3d-b8ddf05387aa> — a view of these files, not a second copy to edit.
It is regenerated from the `.dc.html` sources with the `design` skill; `mocks/chipper-mockups.html` is that generated
bundle (2.5 MB, editor plus artboard sources), and is gitignored.

## Running it

Needs **either** a Node version manager **or** Docker — nothing else.

```
make setup     # install pinned dependencies (npm ci, exact lockfile)
make dev       # dev server on :2447
make check     # types, svelte, formatting, tests — what CI runs
make test      # tests only
make build     # static bundle into dist/
make           # list every target
```

Or entirely in the container, with no Node on the host: `make docker-dev`, `make docker-test`, `make docker-check`.

Node is pinned in `mise.toml` and `.nvmrc`; everything else in `package-lock.json`; the same version again in the `Dockerfile`.

## Reviewing

The reviewers in `.claude/agents/` exist because an external reviewer found a gap — the whole
lifecycle of creating, changing and destroying Goals — that a general "review this" pass had
not. They are versioned with the source so the review dimensions don't depend on what anyone
remembers to ask for on the day.

**They run at the close of every milestone — all of them, not a chosen few.** `ROADMAP.md`
§"How a milestone closes" has the loop: run all ten, fix or record or escalate every finding,
re-run until a pass produces nothing new, then commit. Tooling findings are fixed before code
findings, because weak tools are what let the code findings through.

Run one with `@lifecycle-reviewer PRD.md and mocks/`, or by name from the agent picker. Agents
added mid-session are not available by name until the next session; until then, run each as a
general-purpose agent told to read its own definition file.

| Agent | Finds |
|---|---|
| `lifecycle-reviewer` | entities with no route to create, change kind, destroy or restore; unstated cascades |
| `principle-auditor` | violations of the PRD's principles and `Never` clauses; tallies, nags, gamification |
| `traceability-reviewer` | coverage claims that aren't true; use cases with no mock or test |
| `edge-state-reviewer` | first run, empty, singular, enormous, failed and stale states |
| `contract-reviewer` | boundaries with no executable test; duplicated truth; unenforced layering |

For implementation, after the code exists. These encode what `DESIGN.md` promised, which a general reviewer cannot know — use the built-in `/code-review` for the general correctness and simplification pass, and `/security-review` at the Cloud Run boundary rather than now.

| Agent | Finds |
|---|---|
| `purity-reviewer` | non-determinism, input mutation, logic leaking into store adapters |
| `mutation-reviewer` | reducer vs. the PRD's stated invariants and cascades |
| `view-model-reviewer` | product rules leaking into components; model fields the principles forbid |
| `migration-reviewer` | schema changes with no migration, no prior-version fixture, or silent data loss |
| `test-quality-reviewer` | tests that cannot fail, and `Never` clauses asserted nowhere |

## Deploying

Pushing to `main` builds and publishes to GitHub Pages via `.github/workflows/deploy.yml`.
The workflow runs `make check` first, so a deploy cannot ship something the local gate
would have refused. Repo **Settings → Pages → Source** must be set to **GitHub Actions**
(done once, by hand).

`localStorage` is scoped per origin, so the deployed app and a local dev server are
**separate stores**. Moving your data between them means Export on one and Import on the
other — which is the durability story working, not a workaround.

## Status

M0–M7 built: the board, priorities, capture and the Pile, the working loop, lifecycle,
the ritual, and the first-run and shipping work. `ROADMAP.md` has what each milestone
covered; `BACKLOG.md` has the rough edges found by using it.

v1 is a static single-page app with state in browser `localStorage`, hostable on GitHub Pages or run locally, desktop only, with JSON export/import as the durability story. Later: Cloud Run + Firestore. The data model is designed so that migration is a persistence swap rather than a rewrite.
