<script lang="ts">
  import type { PlanRowModel } from '../domain/board'
  import Icon from './Icon.svelte'
  import StarButton from './StarButton.svelte'
  import EditableText from './EditableText.svelte'
  import AddInline from './AddInline.svelte'
  import { getBoardActions, isReadOnly } from './actions'

  let { row }: { row: PlanRowModel } = $props()
  const actions = getBoardActions()
  const readOnly = isReadOnly()
  const parent = $derived({ type: 'plan' as const, id: row.id })
</script>

<div class="row" style="padding-left: {row.indent * 22}px">
  <Icon name="plan" size={14} color="var(--muted-2)" />
  <span class="title">
    {#if readOnly}
      {row.title}
    {:else}
      <EditableText
        value={row.title}
        onchange={(t) => actions.rename({ type: 'plan', id: row.id }, t)}
      />
    {/if}
  </span>
  <span class="progress">{row.progress.done} of {row.progress.total}</span>
  {#if readOnly}
    {#if row.starred}<Icon name="star" size={12} filled color="var(--cherry)" />{/if}
  {:else}
    <StarButton
      starred={row.starred}
      size={12}
      label={row.title}
      ontoggle={() => actions.toggleStar({ type: 'plan', id: row.id })}
    />
  {/if}
  {#if !readOnly}
    <span class="tools">
      <AddInline
        label="task"
        placeholder="a task in this plan"
        onadd={(t) => actions.addTask(parent, t)}
      />
      <button
        class="remove"
        aria-label="Delete plan"
        onclick={() => actions.remove({ type: 'plan', id: row.id })}>×</button
      >
    </span>
  {/if}
</div>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 5px;
    padding-bottom: 5px;
  }
  .title {
    flex: 1;
    min-width: 0;
    font-family: var(--serif);
    font-size: 13.5px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .progress {
    flex: none;
    font-size: 10.5px;
    color: var(--faint);
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 2px;
    opacity: 0;
  }
  .row:hover .tools {
    opacity: 1;
  }
  .remove {
    border: none;
    background: none;
    color: var(--faint-2);
    font-size: 15px;
    line-height: 1;
    padding: 0 2px;
    cursor: pointer;
  }
  .remove:hover {
    color: var(--cherry);
  }
</style>
