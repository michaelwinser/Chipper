<script lang="ts">
  /**
   * The app. A live board backed by localStorage, plus the M0 fixture gallery kept
   * alongside it — the fixtures are what M2's buildBoard has to reproduce, so being
   * able to flip between "what it does" and "what it must do" is worth the strip.
   */
  import { onMount } from 'svelte'
  import { boards, type BoardName } from './fixtures/boards'
  import { createSession, type Session } from './app/session.svelte'
  import { createCommands, nextLaneColor } from './app/commands'
  import { randomId, systemClock } from './app/deps'
  import { createLocalStore } from './store/local'
  import { downloadExport, pickFile } from './app/files'
  import { parseEnvelope } from './domain/transfer'
  import { orderedSwimlanes } from './domain/state'
  import { RuleError } from './domain/errors'
  import Board from './ui/Board.svelte'
  import ReadOnlyBoard from './ui/ReadOnlyBoard.svelte'
  import Pile from './ui/Pile.svelte'
  import CaptureOverlay from './ui/CaptureOverlay.svelte'
  import BreakDownDialog from './ui/BreakDownDialog.svelte'
  import RemoveDialog from './ui/RemoveDialog.svelte'
  import Archive from './ui/Archive.svelte'
  import SetPriorities from './ui/SetPriorities.svelte'
  import { buildRemoval, type Removal } from './domain/select/removal'
  import TopBar from './ui/TopBar.svelte'
  import Notice from './ui/Notice.svelte'
  import { setBoardActions, setReadOnly, type BoardActions } from './ui/actions'

  type View = 'live' | BoardName

  const fixtures: { name: BoardName; label: string; note: string }[] = [
    { name: 'main', label: 'The view', note: '4 priorities at three levels — M2' },
    { name: 'overloaded', label: 'Overloaded', note: '13 starred — UC-3060, M2' },
    { name: 'sizeLensS', label: 'Size lens: S', note: 'UC-4030 — M4' },
    { name: 'everything', label: 'Everything', note: 'UC-4020 — M2' },
    { name: 'starDepth', label: 'Card shapes', note: 'all four — M2' },
  ]

  let view = $state<View>('live')
  let capturing = $state(false)
  let breaking = $state<{ taskId: string; title: string; starred: boolean } | null>(null)
  let removing = $state<Removal | null>(null)
  let session = $state<Session | null>(null)
  let commands = $state<ReturnType<typeof createCommands> | null>(null)
  let width = $state(0)

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
    if (combo && view === 'live') {
      event.preventDefault()
      capturing = true
    }
  }

  function onexport() {
    if (session) downloadExport(session.state, systemClock())
  }

  async function onimport() {
    if (!session) return
    const raw = await pickFile()
    if (raw === null) return
    const result = parseEnvelope(raw)
    if (!result.ok) {
      session.setNotice(result.error)
      return
    }
    const counts = {
      lanes: Object.keys(result.state.swimlanes).length,
      goals: Object.keys(result.state.goals).length,
      tasks: Object.keys(result.state.tasks).length,
    }
    const ok = confirm(
      `Replace everything currently in Chipper with this file?\n\n` +
        `It holds ${counts.lanes} swimlanes, ${counts.goals} goals and ${counts.tasks} tasks.\n` +
        `What is here now will be gone. Export first if you want to keep it.`,
    )
    if (!ok) return
    await session.commands.replaceAll(result.state)
    session.setNotice('Imported.')
  }
</script>

<svelte:window bind:innerWidth={width} {onkeydown} />

<div class="shell">
  <div class="picker">
    <span class="tag">M5</span>
    <button class:on={view === 'live'} onclick={() => (view = 'live')}>Live</button>
    <span class="rule"></span>
    <span class="tag">fixtures</span>
    {#each fixtures as f (f.name)}
      <button class:on={view === f.name} onclick={() => (view = f.name)}>{f.label}</button>
    {/each}
    <span class="note">
      {view === 'live'
        ? 'your data, in this browser'
        : (fixtures.find((f) => f.name === view)?.note ?? '')}
    </span>
    <span class="width">{width}px</span>
  </div>

  <div class="app">
    {#if view === 'live'}
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
          <BreakDownDialog
            title={breaking.title}
            starred={breaking.starred}
            onbreakdown={(pieces) => {
              const task = breaking!.taskId
              guard(async (c) => {
                // The task becomes the plan, then the pieces become its first tasks.
                const planId = await c.changeLevel({ type: 'task', id: task }, 'plan')
                for (const piece of pieces) {
                  await c.addTask({ type: 'plan', id: planId }, piece.title, piece.size)
                }
              })
            }}
            ondone={() => {
              const task = breaking!.taskId
              guard((c) => c.setDone(task, true))
            }}
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
        <p class="loading">Loading…</p>
      {/if}
    {:else}
      <TopBar />
      <ReadOnlyBoard board={boards[view]} />
    {/if}
  </div>
</div>

<style>
  .shell {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }
  .picker {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 8px 14px;
    background: #2a2622;
    color: #e8e1d6;
    font-size: 12px;
  }
  .tag {
    font-size: 10px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.55;
  }
  .rule {
    width: 1px;
    height: 16px;
    background: #4a443d;
    margin: 0 4px;
  }
  button {
    font: inherit;
    color: #e8e1d6;
    background: transparent;
    border: 1px solid #4a443d;
    border-radius: 6px;
    padding: 4px 10px;
    cursor: pointer;
  }
  button.on {
    background: #e8e1d6;
    color: #2a2622;
    border-color: #e8e1d6;
  }
  .note {
    opacity: 0.5;
    margin-left: 4px;
  }
  .width {
    margin-left: auto;
    opacity: 0.4;
    font-variant-numeric: tabular-nums;
  }
  .app {
    flex: 1;
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
