<script lang="ts">
  import type { ChipModel } from '../domain/board'
  import Icon from './Icon.svelte'
  import StarButton from './StarButton.svelte'
  import EditableText from './EditableText.svelte'
  import { nextSize } from '../domain/primitives'
  import { getBoardActions, isReadOnly } from './actions'

  let { chip }: { chip: ChipModel } = $props()
  const actions = getBoardActions()
  const readOnly = isReadOnly()

  /**
   * A finished task keeps only the tick that undoes it.
   *
   * The ladder and the Pile both refuse or damage done work — `changeLevel` refuses it
   * outright, and `sendToPile` does not refuse it at all: it converts the task into an
   * idea, discarding done, doneAt, size, deadline and notes with no dialog and no undo.
   */
  const settled = $derived(readOnly || chip.done)
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
  <span class:struck={chip.done}>
    {#if settled}
      {chip.title}
    {:else}
      <EditableText
        value={chip.title}
        onchange={(t) => actions.rename({ type: 'task', id: chip.taskId }, t)}
      />
    {/if}
  </span>
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
  {#if settled}
    {#if chip.size}<span class="size">{chip.size}</span>{/if}
  {:else}
    <!-- A loose task is a task. It could be created three ways and then never renamed,
         resized, piled or deleted — its only controls were a checkbox and a star. -->
    <button
      class="size editable"
      onclick={() => actions.setSize(chip.taskId, nextSize(chip.size))}
      title="Small / Medium / Large"
    >
      {chip.size ?? '–'}
    </button>
    <span class="tools">
      <button
        aria-label="Make this a goal"
        onclick={() => actions.changeLevel({ type: 'task', id: chip.taskId }, 'goal')}
        >↑ goal</button
      >
      <!-- Its own glyph: this sat beside "↑ goal" as a bare "↑", two different moves
           sharing one arrow. -->
      <button
        class="pile"
        aria-label="Send to the Pile"
        onclick={() => actions.sendToPile({ type: 'task', id: chip.taskId })}
      >
        <Icon name="pile" size={12} color="currentColor" />
      </button>
      <button
        class="remove"
        aria-label="Delete task"
        onclick={() => actions.remove('task', chip.taskId)}>×</button
      >
    </span>
  {/if}
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
    /* A chip sizes to its contents, so a long title stretches it across the lane rather
       than wrapping. Same treatment as the card title, for the same reason. */
    max-width: 100%;
    overflow-wrap: anywhere;
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
  .size.editable {
    border: none;
    font-family: inherit;
    cursor: pointer;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 2px;
    opacity: 0;
  }
  .chip:hover .tools,
  .chip:focus-within .tools {
    opacity: 1;
  }
  .tools button {
    font: inherit;
    font-size: 10.5px;
    color: var(--faint-2);
    background: none;
    border: none;
    padding: 0 2px;
    cursor: pointer;
    white-space: nowrap;
  }
  .tools button:hover {
    color: var(--muted);
  }
  .tools .remove {
    font-size: 14px;
    line-height: 1;
  }
  .tools .remove:hover {
    color: var(--cherry);
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
