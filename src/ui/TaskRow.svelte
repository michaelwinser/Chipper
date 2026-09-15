<script lang="ts">
  import type { TaskRowModel } from '../domain/board'
  import { SIZES, type Size } from '../domain/primitives'
  import Icon from './Icon.svelte'
  import StarButton from './StarButton.svelte'
  import EditableText from './EditableText.svelte'
  import { getBoardActions, isReadOnly } from './actions'

  let { row }: { row: TaskRowModel } = $props()
  const actions = getBoardActions()
  const readOnly = isReadOnly()

  function cycleSize() {
    const order: (Size | null)[] = [...SIZES, null]
    const next = order[(order.indexOf(row.size) + 1) % order.length] ?? null
    actions.setSize(row.id, next)
  }
</script>

<div class="row" style="padding-left: {row.indent * 22}px" class:done={row.done}>
  {#snippet tick()}
    {#if row.done}
      <svg
        width="11"
        height="11"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#fff"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <path d="M5 12.5l4.5 4.5L19 7" />
      </svg>
    {/if}
  {/snippet}

  <!-- A read-only row is a picture: a span, not a control nobody can use. -->
  {#if readOnly}
    <span class="box" class:ticked={row.done}>{@render tick()}</span>
  {:else}
    <button
      class="box"
      class:ticked={row.done}
      aria-label={row.done ? 'Mark not done' : 'Mark done'}
      onclick={() => actions.setDone(row.id, !row.done)}
    >
      {@render tick()}
    </button>
  {/if}

  <span class="title">
    {#if readOnly}
      {row.title}
    {:else}
      <EditableText
        value={row.title}
        onchange={(t) => actions.rename({ type: 'task', id: row.id }, t)}
      />
    {/if}
  </span>

  {#if readOnly}
    {#if row.starred}<Icon name="star" size={12} filled color="var(--cherry)" />{/if}
  {:else if !row.done}
    <StarButton
      starred={row.starred}
      size={12}
      label={row.title}
      ontoggle={() => actions.toggleStar({ type: 'task', id: row.id })}
    />
  {/if}

  {#if readOnly}
    {#if row.size}<span class="size">{row.size}</span>{/if}
  {:else}
    <button class="size editable" onclick={cycleSize} title="Small / Medium / Large">
      {row.size ?? '–'}
    </button>
    <button
      class="toobig"
      aria-label="This one is too big"
      onclick={() => actions.breakDown(row.id, row.title, row.starred)}>too big</button
    >
    <button
      class="pile"
      aria-label="Send to the Pile"
      onclick={() => actions.sendToPile({ type: 'task', id: row.id })}>↑</button
    >
    <button class="remove" aria-label="Delete task" onclick={() => actions.remove('task', row.id)}
      >×</button
    >
  {/if}
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 9px;
    padding-top: 5px;
    padding-bottom: 5px;
  }
  .box {
    width: 14px;
    height: 14px;
    flex: none;
    padding: 0;
    border: 1.4px solid var(--line);
    border-radius: var(--radius-chip);
    background: none;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  .box:not(button) {
    cursor: default;
  }
  .box.ticked {
    border-color: var(--sage);
    background: var(--sage);
  }
  .title {
    flex: 1;
    min-width: 0;
    font-size: 12.5px;
    color: var(--ink-2);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .done .title {
    color: var(--faint);
    text-decoration: line-through;
    text-decoration-color: var(--line);
  }
  .size {
    flex: none;
    font-size: 10px;
    font-weight: 500;
    color: var(--muted-2);
    background: var(--badge);
    border-radius: var(--radius-chip);
    padding: 2px 5px;
    min-width: 20px;
    text-align: center;
  }
  .size.editable {
    border: none;
    font-family: inherit;
    cursor: pointer;
  }
  .toobig {
    flex: none;
    border: none;
    background: none;
    color: var(--faint-2);
    font: inherit;
    font-size: 10.5px;
    padding: 0 2px;
    cursor: pointer;
    opacity: 0;
    white-space: nowrap;
  }
  .row:hover .toobig {
    opacity: 1;
  }
  .toobig:hover {
    color: var(--muted);
  }
  .pile {
    flex: none;
    border: none;
    background: none;
    color: var(--faint-2);
    font-size: 13px;
    line-height: 1;
    padding: 0 2px;
    cursor: pointer;
    opacity: 0;
  }
  .row:hover .pile {
    opacity: 1;
  }
  .pile:hover {
    color: var(--muted);
  }
  .remove {
    flex: none;
    border: none;
    background: none;
    color: var(--faint-2);
    font-size: 15px;
    line-height: 1;
    padding: 0 2px;
    cursor: pointer;
    opacity: 0;
  }
  .row:hover .remove {
    opacity: 1;
  }
  .remove:hover {
    color: var(--cherry);
  }
</style>
