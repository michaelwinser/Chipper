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
  import { randomId, systemClock } from './app/deps'
  import { createLocalStore } from './store/local'
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
    changeLevel: (ref, to) => guard((c) => c.changeLevel(ref, to)),
    sendToPile: (ref) => guard((c) => c.sendToPile(ref)),
  }

  setBoardActions(actions)
  setReadOnly(false)

  onMount(async () => {
    const store = createLocalStore(localStorage, systemClock, {
      onWriteError: () =>
        session?.setNotice(
          'Could not save to this browser. Export your data before closing the tab.',
        ),
      onLoadError: (detail) =>
        session?.setNotice(`Stored data could not be read, so the board started empty. ${detail}`),
    })
    const deps = { store, now: systemClock, newId: randomId }
    session = await createSession(deps, store)
    commands = createCommands(deps)
  })

  /** Capture has to be reachable from wherever you already are — that is the feature. */
  function onkeydown(event: KeyboardEvent) {
    const combo = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k'
    if (combo) {
      event.preventDefault()
      capturing = true
    }
  }

  function onexport() {
    if (session) downloadExport(session.state, systemClock())
  }

  const summarise = (s: State): ImportSummary => ({
    lanes: Object.keys(s.swimlanes).length,
    goals: Object.keys(s.goals).length,
    tasks: Object.keys(s.tasks).length,
  })

  async function onimport() {
    if (!session) return
    const raw = await pickFile()
    if (raw === null) return
    const result = parseEnvelope(raw)
    if (!result.ok) {
      session.setNotice(result.error)
      return
    }
    // Ask before replacing, and say what is on both sides of the trade (UC-6030).
    importing = {
      state: result.state,
      incoming: summarise(result.state),
      existing: summarise(session.state),
    }
  }
</script>

<svelte:window {onkeydown} />

<div class="shell">
  {#if session}
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
          guard((c) => c.replaceAll(file.state))
          session?.setNotice('Imported.')
          importing = null
        }}
        onclose={() => (importing = null)}
      />
    {/if}
    {#if removing}
      {@const r = removing}
      <RemoveDialog
        removal={r}
        ondelete={(disposition) => {
          guard((c) =>
            r.kind === 'goal'
              ? c.deleteGoal(r.id)
              : r.kind === 'plan'
                ? c.deletePlan(r.id, disposition)
                : c.deleteTask(r.id),
          )
          removing = null
        }}
        onarchive={() => {
          guard((c) =>
            r.kind === 'swimlane'
              ? c.deleteSwimlane(r.id, { kind: 'archive', looseTasks: r.looseTasks })
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
