<script lang="ts">
  /**
   * The app: a board backed by this browser's storage, and the surfaces around it.
   *
   * The one piece of wiring in the project. It owns the dialogs (which are transient
   * view state, not app state), holds the store, and turns every intent a component
   * emits into exactly one command. It decides nothing about what things mean.
   */
  import { onMount } from 'svelte'
  import { createSession, type Session } from './app/session.svelte'
  import { createCommands, nextLaneColor } from './app/commands'
  import { randomId, systemClock, systemToday } from './app/deps'
  import { createLocalStore, type StoreStatus } from './store/local'
  import { downloadExport, pickFile } from './app/files'
  import { parseEnvelope } from './domain/transfer'
  import { orderedSwimlanes, type State } from './domain/state'
  import { RuleError } from './domain/errors'
  import Board from './ui/Board.svelte'
  import Pile from './ui/Pile.svelte'
  import CaptureOverlay from './ui/CaptureOverlay.svelte'
  import BreakDownDialog from './ui/BreakDownDialog.svelte'
  import RemoveDialog from './ui/RemoveDialog.svelte'
  import ImportDialog, { type ImportSummary } from './ui/ImportDialog.svelte'
  import Archive from './ui/Archive.svelte'
  import SetPriorities from './ui/SetPriorities.svelte'
  import { buildRemoval, type Removal } from './domain/select/removal'
  import TopBar from './ui/TopBar.svelte'
  import Notice from './ui/Notice.svelte'
  import Blocked from './ui/Blocked.svelte'
  import { buildBlocked } from './domain/select/blocked'
  import Unavailable from './ui/Unavailable.svelte'
  import { setBoardActions, setReadOnly, type BoardActions } from './ui/actions'

  let capturing = $state(false)
  let breaking = $state<{ taskId: string; title: string; starred: boolean } | null>(null)
  let removing = $state<Removal | null>(null)
  let importing = $state<{
    state: State
    incoming: ImportSummary
    existing: ImportSummary | null
  } | null>(null)
  let session = $state<Session | null>(null)
  /** A failed "start fresh" has no session to carry a notice, so it is held here. */
  let startFreshError = $state<string | null>(null)
  let store = $state<ReturnType<typeof createLocalStore> | null>(null)
  /**
   * The store's status, mirrored into reactive state.
   *
   * It is mirrored rather than read through `store.status` because `status` is a getter
   * over a closure variable that Svelte cannot track. The first version poked the shell
   * with `store = store`, which Svelte 5 discards — `$state` sources compare with `===`
   * and `proxy()` hands back the same proxy — so after "start fresh" the data was really
   * gone while the screen still read "nothing has been deleted", with the erase button
   * still armed. A screen that lies at exactly the moment it is load-bearing.
   */
  let status = $state<StoreStatus | null>(null)
  let commands = $state<ReturnType<typeof createCommands> | null>(null)

  /** Surfaces a refused rule as a notice instead of an unexplained no-op. */
  function guard(run: (c: ReturnType<typeof createCommands>) => Promise<unknown>) {
    const c = commands
    if (!c) return
    void run(c).catch((error: unknown) => {
      session?.setNotice(
        error instanceof RuleError ? error.message : 'Something went wrong with that change.',
      )
    })
  }

  /**
   * Context has to be established while this component initialises, so the actions are
   * built now and simply do nothing until the store has finished opening.
   */
  const actions: BoardActions = {
    addSwimlane: (name) => guard((c) => c.addSwimlane(name, nextLaneColor(session!.state))),
    moveSwimlane: (id, delta) =>
      guard((c) => {
        const order = orderedSwimlanes(session!.state).map((l) => l.id)
        const from = order.indexOf(id)
        const to = from + delta
        if (from < 0 || to < 0 || to >= order.length) return Promise.resolve()
        const next = [...order]
        next.splice(from, 1)
        next.splice(to, 0, id)
        return c.reorderSwimlanes(next)
      }),
    addGoal: (swimlaneId, title) => guard((c) => c.addGoal(swimlaneId, title)),
    addPlan: (parent, title) => guard((c) => c.addPlan(parent, title)),
    addTask: (parent, title) => guard((c) => c.addTask(parent, title)),
    rename: (ref, title) => guard((c) => c.rename(ref, title)),
    setDone: (id, done) => guard((c) => c.setDone(id, done)),
    toggleStar: (ref) => guard((c) => c.toggleStar(session!.state, ref)),
    setFocus: (focus) => {
      if (session) session.lens = { ...session.lens, focus }
    },
    setSizeLens: (size) => {
      if (session) session.lens = { ...session.lens, size }
    },
    breakDown: (taskId, title, starred) => {
      breaking = { taskId, title, starred }
    },
    toggleExpanded: (goalId) => {
      if (!session) return
      const open = session.lens.expanded
      session.lens = {
        ...session.lens,
        expanded: open.includes(goalId) ? open.filter((id) => id !== goalId) : [...open, goalId],
      }
    },
    closeAll: () => {
      if (session) session.lens = { ...session.lens, expanded: [] }
    },
    setSize: (id, size) => guard((c) => c.setTaskSize(id, size)),
    // Nothing is removed from a click: the dialog first says what would go.
    remove: (kind, id) => {
      if (session) removing = buildRemoval(session.state, kind, id)
    },
    archive: (goalId) => guard((c) => c.archiveGoal(goalId)),
    setDeadline: (ref, deadline) => guard((c) => c.setDeadline(ref, deadline)),
    changeLevel: (ref, to, parent) => guard((c) => c.changeLevel(ref, to, parent)),
    sendToPile: (ref) => guard((c) => c.sendToPile(ref)),
  }

  setBoardActions(actions)
  setReadOnly(false)

  onMount(async () => {
    // The write-error callback is safe to hand over now: writes only happen after mount.
    // The read failure is NOT a callback — it is read synchronously off `store.status`,
    // because it happens during construction, before any session exists to be told.
    const opened = createLocalStore(localStorage, systemClock, {
      onWriteError: () =>
        session?.setNotice(
          'Could not save to this browser. Export your data before closing the tab.',
        ),
      // DESIGN.md §3.3: the invariants are asserted on every write in development.
      // `import.meta.env.DEV` is a build-time constant, so the check and everything it
      // reaches is dropped from the production bundle entirely.
      checkAfterEveryWrite: import.meta.env.DEV,
    })
    store = opened
    status = opened.status

    // No session over a store that refuses every write.
    //
    // Building one anyway made the whole recovery path dead code: `adopt` branches on
    // `commands && session`, both of which were truthy, so importing a good export took
    // the ordinary mutation route, `replaceAll` was refused by the blocked store, and the
    // RuleError went to a notice the blocked branch does not render. The user clicked
    // Import, nothing happened, no message appeared — leaving "Start fresh" as the only
    // button that does anything, on the screen built to stop them needing it.
    if (opened.status.kind === 'ok' || opened.status.kind === 'empty') await begin(opened)
  })

  /**
   * Open the board on top of a store that can be written to.
   *
   * Called at mount, and again on each way out of a blocked state — starting fresh and
   * importing both leave a writable store with no session, and a shell that renders
   * "Opening…" for ever is not an improvement on one that renders a lie.
   */
  async function begin(on: ReturnType<typeof createLocalStore>) {
    const deps = { store: on, now: systemClock, today: systemToday, newId: randomId }
    const next = await createSession(deps, on)
    commands = createCommands(deps)
    // Session first, status last: the other order paints one frame pairing status `ok`
    // with a stale empty session, which on the recovery path reads as "the import wiped
    // everything".
    session = next
    status = on.status
    startFreshError = null
  }

  /** Capture has to be reachable from wherever you already are — that is the feature. */
  function onkeydown(event: KeyboardEvent) {
    const combo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
    if (combo) {
      event.preventDefault()
      capturing = true
    }
  }

  function onexport() {
    if (!session) return
    if (!downloadExport(session.state, systemClock())) {
      session.setNotice(
        'This browser would not start the download. Copy your data out another way before closing the tab.',
      )
    }
  }

  const summarise = (s: State): ImportSummary => ({
    lanes: Object.keys(s.swimlanes).length,
    goals: Object.keys(s.goals).length,
    tasks: Object.keys(s.tasks).length,
  })

  /**
   * Import works from the blocked screen too, where there is no session.
   *
   * That is the case it matters most in: the user's stored data is unreadable and the
   * file they are holding is the good copy. `existing` is null there — there is nothing
   * loaded to weigh the incoming file against — and the dialog already handles that.
   */
  /**
   * Take an imported document as the truth.
   *
   * Two routes because the shell can be in two states. With a session this is an
   * ordinary mutation and the notice machinery works. From the blocked screen there is
   * no session, no commands and a store that refuses every write — so the file is
   * written straight through and the app opens again on top of it. That second route
   * is the only way out of a blocked state that does not destroy the stored bytes.
   */
  async function adopt(next: State) {
    // With a session this is an ordinary mutation. Without one — the blocked and
    // unavailable screens — there is nothing to mutate, so the document is written
    // straight through and the app opens on top of it.
    if (commands && session) {
      guard((c) => c.replaceAll(next))
      session.setNotice('Imported.')
      return
    }
    try {
      // The store already in hand, not a new one over the same key: a replacement would
      // re-parse the corrupt bytes into `blocked` only to have that overridden, and its
      // `onWriteError` would write `startFreshError`, which is rendered only on the
      // blocked screen — so every later failed write would be silent.
      const live = store
      if (!live) return
      await live.adopt(next)
      await begin(live)
    } catch (error) {
      startFreshError = error instanceof RuleError ? error.message : String(error)
    }
  }

  async function onimport() {
    const raw = await pickFile()
    if (raw === null) return
    // `parseEnvelope` is meant to refuse rather than throw, and mostly does — but it walks
    // an unvalidated document to decide, and a shape nobody anticipated becomes a
    // TypeError. Unhandled here it was an unhandled rejection: the user picked a file, no
    // message appeared, and the click did nothing. The store path has had this guard since
    // M8; the import path is the one people actually use.
    let result: ReturnType<typeof parseEnvelope>
    try {
      result = parseEnvelope(raw)
    } catch (error) {
      result = { ok: false, error: `This file could not be read. ${String(error)}` }
    }
    if (!result.ok) {
      if (session) session.setNotice(result.error)
      else startFreshError = result.error
      return
    }
    // Ask before replacing, and say what is on both sides of the trade (UC-6030).
    importing = {
      state: result.state,
      incoming: summarise(result.state),
      existing: session ? summarise(session.state) : null,
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="shell">
  {#if status?.kind === 'blocked'}
    {@const blocked = status}
    <!--
      Import stays reachable. The blocked screen's only two moves used to be download the
      opaque bytes or erase them — so a user holding a working export on disk, which is
      the whole point of having export, had no way to use it. Export is deliberately not
      offered: there is nothing loaded to export.
    -->
    <TopBar page="board" {onimport} />
    <Blocked
      blocked={buildBlocked(blocked)}
      onstartfresh={async () => {
        const live = store
        if (!live) return
        try {
          await live.startFresh()
          await begin(live)
        } catch (error) {
          startFreshError = error instanceof RuleError ? error.message : String(error)
        }
      }}
      error={startFreshError}
    />
  {:else if status?.kind === 'unavailable'}
    {@const reason = status.reason}
    <TopBar page="board" />
    <Unavailable {reason} />
  {:else if session}
    <TopBar
      page={session.page}
      {onexport}
      {onimport}
      onnavigate={(p) => (session!.page = p)}
      oncapture={() => (capturing = true)}
    />
    {#if session.notice}
      <div class="notice-slot">
        <Notice message={session.notice} ondismiss={() => session?.setNotice(null)} />
      </div>
    {/if}

    {#if session.page === 'board'}
      <Board board={session.board} />
    {:else if session.page === 'priorities'}
      <SetPriorities
        sweep={session.sweep}
        onsave={(refs) => {
          guard((c) => c.setPriorities(refs))
          session!.page = 'board'
        }}
        oncancel={() => (session!.page = 'board')}
      />
    {:else if session.page === 'archive'}
      <Archive
        archive={session.archive}
        onrestore={(goalId, swimlaneId) => guard((c) => c.restoreGoal(goalId, swimlaneId))}
        onremove={(goalId) => actions.remove('goal', goalId)}
      />
    {:else}
      <Pile
        pile={session.pile}
        onfilter={(tag) => (session!.pileFilter = tag)}
        oncapture={(text) => guard((c) => c.capture(text, { kind: 'pile' }))}
        onedit={(id, text) => guard((c) => c.editPileItem(id, text))}
        onpromote={(id, to) =>
          guard((c) =>
            to.kind === 'goal'
              ? c.promotePileItem(id, { kind: 'goal', swimlaneId: to.swimlaneId })
              : c.promotePileItem(id, {
                  kind: 'task',
                  parent: { type: 'swimlane', id: to.swimlaneId },
                }),
          )}
        ondelete={(id) => guard((c) => c.deletePileItem(id))}
      />
    {/if}

    {#if removing}
      {@const r = removing}
      <RemoveDialog
        removal={r}
        ondelete={(disposition) => {
          // Every kind, named. The original ended in a fallback that swallowed
          // 'swimlane' into deleteTask, so deleting an empty lane raised "no task <id>"
          // — and the component test passed because it stubbed this callback.
          guard((c) => {
            switch (r.kind) {
              case 'goal':
                return c.deleteGoal(r.id)
              case 'plan':
                return c.deletePlan(r.id, disposition)
              case 'task':
                return c.deleteTask(r.id)
              case 'swimlane':
                // `r.looseTaskIds`, not `[]`. The dialog only offers a plain delete for an
                // empty lane, so the list is empty in practice — but hardcoding that made
                // a comment's assumption load-bearing, and if it were ever wrong the
                // reducer refuses with `wrong-ids` and the user sees a raw rule code.
                // Passing what the model already computed makes the assumption not matter.
                return c.deleteSwimlane(r.id, { kind: 'archive', looseTaskIds: r.looseTaskIds })
            }
          })
          removing = null
        }}
        onarchive={() => {
          guard((c) =>
            r.kind === 'swimlane'
              ? c.deleteSwimlane(r.id, { kind: 'archive', looseTaskIds: r.looseTaskIds })
              : c.archiveGoal(r.id),
          )
          removing = null
        }}
        onmove={(toSwimlaneId) => {
          guard((c) => c.deleteSwimlane(r.id, { kind: 'move', toSwimlaneId }))
          removing = null
        }}
        onclose={() => (removing = null)}
      />
    {/if}
    {#if breaking}
      {@const task = breaking}
      <BreakDownDialog
        title={task.title}
        starred={task.starred}
        onbreakdown={(pieces) => {
          guard(async (c) => {
            // The task becomes the plan, then the pieces become its first tasks.
            const planId = await c.changeLevel({ type: 'task', id: task.taskId }, 'plan')
            for (const piece of pieces) {
              await c.addTask({ type: 'plan', id: planId }, piece.title, piece.size)
            }
          })
        }}
        ondone={() => guard((c) => c.setDone(task.taskId, true))}
        onclose={() => (breaking = null)}
      />
    {/if}
    {#if capturing}
      <CaptureOverlay
        swimlanes={session.pile.swimlanes}
        oncapture={(text, destination) => guard((c) => c.capture(text, destination))}
        onclose={() => (capturing = false)}
      />
    {/if}
  {:else}
    <TopBar />
    <p class="loading">Opening…</p>
  {/if}

  <!--
    Outside the session branch on purpose: importing is how a user recovers from the
    blocked screen, where there is no session at all. With one, it goes through the
    command path; without one it writes through the store and reopens the app.
  -->
  {#if importing}
    {@const file = importing}
    <ImportDialog
      incoming={file.incoming}
      existing={file.existing}
      onexportfirst={() => {
        onexport()
        session?.setNotice('Exported. Import again when you are ready to replace.')
        importing = null
      }}
      onconfirm={() => {
        void adopt(file.state)
        importing = null
      }}
      onclose={() => (importing = null)}
    />
  {/if}
</div>

<style>
  .shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .notice-slot {
    padding-top: 20px;
  }
  .loading {
    padding: 38px 40px;
    color: var(--muted-2);
  }
</style>
