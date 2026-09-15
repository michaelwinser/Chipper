<script lang="ts">
  import type { CardModel } from '../domain/board'
  import TaskRow from './TaskRow.svelte'
  import PlanRow from './PlanRow.svelte'
  import Icon from './Icon.svelte'
  import StarButton from './StarButton.svelte'
  import EditableText from './EditableText.svelte'
  import DeadlineField from './DeadlineField.svelte'
  import AddInline from './AddInline.svelte'
  import { getBoardActions, isReadOnly } from './actions'

  let { card }: { card: CardModel } = $props()
  const actions = getBoardActions()
  const readOnly = isReadOnly()
  const parent = $derived({ type: 'goal' as const, id: card.goalId })
</script>

<article class="card" class:quiet={card.emphasis === 'quiet'} class:open={card.expanded}>
  <div class="head">
    <h3 class:contextual={card.header.contextual}>
      {#if readOnly}
        {card.header.title}
      {:else}
        <EditableText
          value={card.header.title}
          onchange={(t) => actions.rename({ type: 'goal', id: card.goalId }, t)}
        />
      {/if}
    </h3>
    {#if readOnly}
      {#if card.header.starred}<Icon name="star" size={14} filled color="var(--cherry)" />{/if}
    {:else}
      <StarButton
        starred={card.header.starred}
        label={card.header.title}
        ontoggle={() => actions.toggleStar({ type: 'goal', id: card.goalId })}
      />
    {/if}
    {#if !readOnly}
      <span class="tools">
        <!-- Archive sits before delete everywhere it appears, so the eye reaches the
             reversible choice first (PRD §5.8). -->
        <button onclick={() => actions.archive(card.goalId)}>archive</button>
        <button
          title="It is a step towards something bigger"
          onclick={() => actions.changeLevel({ type: 'goal', id: card.goalId }, 'plan')}
          >↓ plan</button
        >
        {#if card.rows.length === 0}
          <button onclick={() => actions.sendToPile({ type: 'goal', id: card.goalId })}>
            to the Pile
          </button>
        {/if}
        <button
          class="remove"
          aria-label="Delete goal"
          onclick={() => actions.remove('goal', card.goalId)}>×</button
        >
      </span>
    {/if}
  </div>

  <div class="meta">
    <span>{card.meta.label}</span>
    <span class="dot">·</span>
    {#if readOnly}
      {#if card.meta.deadline}<span>{card.meta.deadline.label}</span>{/if}
    {:else}
      <DeadlineField
        value={card.meta.deadline}
        onchange={(iso) => actions.setDeadline({ type: 'goal', id: card.goalId }, iso)}
      />
    {/if}
    {#if !readOnly}
      <!-- The way into a goal: one at a time, so the board never unfolds all at once. -->
      <button
        class="opener"
        class:isopen={card.expanded}
        aria-expanded={card.expanded}
        onclick={() => actions.toggleExpanded(card.goalId)}
      >
        <span>{card.expanded ? 'close' : 'open'}</span>
        <Icon name="chevron" size={12} color="currentColor" />
      </button>
    {/if}
  </div>

  {#if card.detail === 'tasks' && (card.rows.length > 0 || card.empty)}
    <div class="body">
      {#each card.rows as row (row.id)}
        {#if row.kind === 'task'}<TaskRow {row} />{:else}<PlanRow {row} />{/if}
      {/each}
      {#if card.empty}<p class="empty">{card.empty.text}</p>{/if}
      {#if card.folded}<p class="folded">{card.folded.text}</p>{/if}
    </div>
  {/if}

  {#if card.done}
    <!-- Finished work, shown as something achieved rather than as clutter (UC-5010). -->
    <div class="finished">
      <span class="eyebrow">Done so far ({card.done.tasks.length})</span>
      <div class="chips">
        {#each card.done.tasks as task (task.id)}
          {#if readOnly}
            <span class="chip">{task.title}</span>
          {:else}
            <button
              class="chip"
              title="Put this back on the list"
              onclick={() => actions.setDone(task.id, false)}>{task.title}</button
            >
          {/if}
        {/each}
      </div>
    </div>
  {/if}

  {#if card.guidance}
    <!-- Guidance, never a warning: it blocks nothing and scolds no one (PRD D5). -->
    <p class="guidance">{card.guidance.text}</p>
  {/if}

  {#if !readOnly}
    <div class="adders" class:always={card.expanded || card.rows.length === 0}>
      <AddInline
        label="task"
        placeholder="something you can just do"
        onadd={(t) => actions.addTask(parent, t)}
      />
      <AddInline
        label="plan"
        placeholder="a way to break this down"
        onadd={(t) => actions.addPlan(parent, t)}
      />
    </div>
  {/if}
</article>

<style>
  .card {
    width: 296px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    padding: 13px 14px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .card.open {
    width: 380px;
    border-color: var(--line);
  }
  .card.quiet {
    background: transparent;
    box-shadow: none;
    opacity: 0.72;
  }
  /* Opened means you are looking at it, whatever the focus says about it. */
  .card.quiet.open {
    background: var(--card);
    box-shadow: var(--shadow-card);
    opacity: 1;
  }
  .head {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  h3 {
    margin: 0;
    flex: 1;
    min-width: 0;
    font-family: var(--serif);
    font-size: 16px;
    font-weight: 400;
    line-height: 1.25;
  }
  h3.contextual {
    color: var(--muted);
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 7px;
    font-size: 11.5px;
    color: var(--muted-2);
  }
  .opener {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 3px;
    font: inherit;
    font-size: 11px;
    color: var(--faint-2);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    opacity: 0;
  }
  .card:hover .opener,
  .opener:focus-visible,
  .opener.isopen {
    opacity: 1;
  }
  .opener:hover {
    color: var(--muted);
  }
  .opener.isopen :global(svg) {
    transform: rotate(90deg);
  }
  .dot {
    color: #d6cdbe;
  }
  .body {
    border-top: 1px solid var(--divider);
    padding-top: 4px;
    margin-top: 2px;
  }
  .empty,
  .folded {
    margin: 0;
    font-size: 11px;
    color: var(--faint);
  }
  .empty {
    padding: 6px 0 2px;
    font-size: 11.5px;
  }
  .folded {
    padding: 4px 0 0 23px;
  }
  .finished {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--divider);
  }
  .eyebrow {
    font-size: 10.5px;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    color: var(--faint);
    font-weight: 500;
  }
  .chips {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }
  .chip {
    font: inherit;
    font-size: 11.5px;
    color: var(--muted-2);
    background: var(--badge);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 3px 8px;
    cursor: pointer;
  }
  button.chip:hover {
    border-color: var(--line);
    color: var(--ink);
  }
  .guidance {
    margin: 4px 0 0;
    padding: 8px 10px;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--muted-2);
    background: var(--headfill);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
  }
  .adders {
    display: flex;
    gap: 14px;
    border-top: 1px solid var(--divider);
    margin-top: 2px;
    opacity: 0;
  }
  /* An open or empty card is being worked on — do not make the user hunt on hover. */
  .adders.always {
    opacity: 1;
  }
  .card:hover .adders,
  .card:focus-within .adders {
    opacity: 1;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 8px;
    opacity: 0;
  }
  .card:hover .tools,
  .card:focus-within .tools {
    opacity: 1;
  }
  .tools button {
    font: inherit;
    font-size: 11px;
    color: var(--faint-2);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
    white-space: nowrap;
  }
  .tools button:hover {
    color: var(--muted);
  }
  .remove {
    font-size: 15px !important;
    line-height: 1;
  }
  .remove:hover {
    color: var(--cherry) !important;
  }
</style>
