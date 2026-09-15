<script lang="ts">
  import type { BoardModel } from '../domain/board'
  import Lane from './Lane.svelte'
  import LensControls from './LensControls.svelte'
  import AddInline from './AddInline.svelte'
  import { getBoardActions, isReadOnly } from './actions'

  let { board }: { board: BoardModel } = $props()
  const actions = getBoardActions()
  const readOnly = isReadOnly()
</script>

<main>
  <div class="head">
    <h1>Swimlanes</h1>
    {#if !readOnly && board.lens.expanded.length > 0}
      <button class="close-all" onclick={() => actions.closeAll()}>
        close {board.lens.expanded.length} open
      </button>
    {/if}
    <LensControls lens={board.lens} />
  </div>

  <div class="lanes">
    {#each board.lanes as lane, i (lane.id)}
      <Lane {lane} first={i === 0} last={i === board.lanes.length - 1} />
    {/each}

    {#if board.lanes.length === 0}
      <!--
        First run. Explains the model in two lines and offers a way in — no tour, no
        sample data to delete later, and nothing that has to be dismissed.
      -->
      <div class="first-run">
        <p class="lead">
          A <b>swimlane</b> is an area of your life or work. Inside it go <b>goals</b> — outcomes
          you want — which you break into <b>plans</b> and <b>tasks</b> you can just do.
        </p>
        <p class="lead">Start with one swimlane. You can rename it, and add more later.</p>
        {#if !readOnly}
          <div class="suggestions">
            {#each ['Work', 'Family', 'Health', 'Fun'] as name (name)}
              <button onclick={() => actions.addSwimlane(name)}>{name}</button>
            {/each}
            <span class="or">or</span>
            <AddInline
              label="name your own"
              placeholder="an area of your life or work"
              onadd={(n) => actions.addSwimlane(n)}
            />
          </div>
        {/if}
      </div>
    {/if}
  </div>

  {#if !readOnly && board.lanes.length > 0}
    <div class="add-lane">
      <AddInline
        label="Swimlane"
        placeholder="an area of your life or work"
        onadd={(n) => actions.addSwimlane(n)}
      />
    </div>
  {/if}
</main>

<style>
  main {
    flex: 1;
    min-width: 0;
    padding: 38px 40px;
    display: flex;
    flex-direction: column;
    gap: 22px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }
  h1 {
    margin: 0;
    margin-right: auto;
    font-family: var(--serif);
    font-size: 30px;
    font-weight: 400;
    line-height: 1.2;
  }
  .close-all {
    font: inherit;
    font-size: 12px;
    color: var(--muted);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: 6px 12px;
    cursor: pointer;
  }
  .close-all:hover {
    border-color: var(--line);
    color: var(--ink);
  }
  .lanes {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .first-run {
    max-width: 560px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .lead {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
    color: var(--muted-2);
  }
  .lead b {
    font-weight: 500;
    color: var(--ink);
  }
  .suggestions {
    display: flex;
    align-items: center;
    gap: 9px;
    flex-wrap: wrap;
    padding-top: 2px;
  }
  .suggestions button {
    font: inherit;
    font-size: 13px;
    color: var(--ink-2);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    padding: 7px 16px;
    cursor: pointer;
  }
  .suggestions button:hover {
    border-color: var(--line);
  }
  .or {
    font-size: 12px;
    color: var(--faint);
  }
  .add-lane {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 2px 0;
    font-size: 12.5px;
    color: var(--faint-2);
  }
</style>
