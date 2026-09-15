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
      <!-- First run. M7 owns this properly; here so the board cannot crash empty. -->
      <p class="first-run">
        Nothing here yet. Start with a swimlane — an area of your life or work.
      </p>
    {/if}
  </div>

  {#if !readOnly}
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
    margin: 0;
    font-size: 14px;
    color: var(--muted-2);
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
