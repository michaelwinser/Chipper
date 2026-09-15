<script lang="ts">
  import type { ChipModel } from '../domain/board'
  import Icon from './Icon.svelte'
  import StarButton from './StarButton.svelte'
  import { getBoardActions, isReadOnly } from './actions'

  let { chip }: { chip: ChipModel } = $props()
  const actions = getBoardActions()
  const readOnly = isReadOnly()
</script>

<div class="chip" class:quiet={chip.emphasis === 'quiet'}>
  <!-- A read-only chip is a picture: a span, not a control nobody can use. -->
  {#if readOnly}
    <span class="box" class:ticked={chip.done}></span>
  {:else}
    <button
      class="box"
      class:ticked={chip.done}
      aria-label={chip.done ? 'Mark not done' : 'Mark done'}
      onclick={() => actions.setDone(chip.taskId, !chip.done)}
    ></button>
  {/if}
  <span class:struck={chip.done}>{chip.title}</span>
  {#if readOnly}
    {#if chip.starred}<Icon name="star" size={13} filled color="var(--cherry)" />{/if}
  {:else if !chip.done}
    <StarButton
      starred={chip.starred}
      size={13}
      label={chip.title}
      ontoggle={() => actions.toggleStar({ type: 'task', id: chip.taskId })}
    />
  {/if}
  {#if chip.size}<span class="size">{chip.size}</span>{/if}
</div>

<style>
  .chip.quiet {
    background: transparent;
    opacity: 0.72;
  }
  .chip {
    display: flex;
    align-items: center;
    gap: 9px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: 9px 13px;
    font-size: 13px;
  }
  .box {
    width: 16px;
    height: 16px;
    flex: none;
    padding: 0;
    border: 1.4px solid var(--line);
    border-radius: var(--radius-chip);
    background: none;
    cursor: pointer;
  }
  .box:not(button) {
    cursor: default;
  }
  .box.ticked {
    border-color: var(--sage);
    background: var(--sage);
  }
  .struck {
    color: var(--faint);
    text-decoration: line-through;
    text-decoration-color: var(--line);
  }
  .size {
    flex: none;
    font-size: 10.5px;
    font-weight: 500;
    color: var(--muted-2);
    background: var(--badge);
    border-radius: var(--radius-chip);
    padding: 2px 6px;
  }
</style>
