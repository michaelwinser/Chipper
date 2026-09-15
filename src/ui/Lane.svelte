<script lang="ts">
  import type { LaneModel } from '../domain/board'
  import GoalCard from './GoalCard.svelte'
  import Chip from './Chip.svelte'
  import Icon from './Icon.svelte'
  import EditableText from './EditableText.svelte'
  import AddInline from './AddInline.svelte'
  import { getBoardActions, isReadOnly } from './actions'

  let {
    lane,
    first = false,
    last = false,
  }: { lane: LaneModel; first?: boolean; last?: boolean } = $props()

  const actions = getBoardActions()
  const readOnly = isReadOnly()
  const subtitle = $derived(
    lane.cards.length > 0
      ? `${lane.cards.length} ${lane.cards.length === 1 ? 'goal' : 'goals'}`
      : lane.chips.length > 0
        ? `${lane.chips.length} loose ${lane.chips.length === 1 ? 'task' : 'tasks'}`
        : '',
  )
</script>

<section class="lane">
  <div class="head">
    <span class="dot" style="background: {lane.color}"></span>
    <h2>
      {#if readOnly}
        {lane.name}
      {:else}
        <EditableText
          value={lane.name}
          onchange={(t) => actions.rename({ type: 'swimlane', id: lane.id }, t)}
        />
      {/if}
    </h2>
    {#if subtitle}<span class="sub">{subtitle}</span>{/if}

    {#if !readOnly}
      <span class="tools">
        <button
          disabled={first}
          aria-label="Move lane up"
          onclick={() => actions.moveSwimlane(lane.id, -1)}>↑</button
        >
        <button
          disabled={last}
          aria-label="Move lane down"
          onclick={() => actions.moveSwimlane(lane.id, 1)}>↓</button
        >
        <button
          aria-label="Delete lane"
          class="danger"
          onclick={() => actions.remove('swimlane', lane.id)}>×</button
        >
      </span>
    {/if}
  </div>

  <div class="items">
    {#each lane.cards as card (card.goalId)}<GoalCard {card} />{/each}
    {#each lane.chips as chip (chip.taskId)}<Chip {chip} />{/each}

    <!-- Both of these are the same offer: show me what is here but not in play. -->
    {#snippet aside(text: string)}
      {#if readOnly}
        <span class="aside">
          <span>{text}</span>
          <Icon name="chevron" size={13} color="#c3baab" />
        </span>
      {:else}
        <button class="aside reveal" onclick={() => actions.setFocus('everything')}>
          <span>{text}</span>
          <Icon name="chevron" size={13} color="#c3baab" />
        </button>
      {/if}
    {/snippet}

    {#if lane.resting}{@render aside(lane.resting.summary)}{/if}
    {#if lane.collapsed}{@render aside(`${lane.collapsed.count} more in ${lane.name}`)}{/if}

    {#if !readOnly}
      <div class="aside">
        <AddInline
          label="Add a goal"
          placeholder="an outcome you want"
          onadd={(t) => actions.addGoal(lane.id, t)}
        />
      </div>
      <div class="aside">
        <AddInline
          label="loose task"
          placeholder="something with no goal above it"
          onadd={(t) => actions.addTask({ type: 'swimlane', id: lane.id }, t)}
        />
      </div>
    {/if}
  </div>
</section>

<style>
  .lane {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .head {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex: none;
  }
  h2 {
    margin: 0;
    font-family: var(--serif);
    font-size: 16.5px;
    font-weight: 400;
  }
  .sub {
    font-size: 11.5px;
    color: var(--faint);
  }
  .tools {
    display: flex;
    gap: 2px;
    opacity: 0;
  }
  .head:hover .tools {
    opacity: 1;
  }
  .tools button {
    border: 1px solid var(--border);
    background: var(--card);
    border-radius: 5px;
    color: var(--muted);
    font-size: 11px;
    line-height: 1;
    padding: 3px 6px;
    cursor: pointer;
  }
  .tools button:disabled {
    opacity: 0.35;
    cursor: default;
  }
  .tools button.danger:hover {
    color: var(--cherry);
    border-color: var(--cherry);
  }
  .items {
    display: flex;
    gap: 14px;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  /*
   * UC-2080, D1 — the Rule of 3.
   *
   * Nothing here. That is the implementation, and it is deliberate.
   *
   * Cards are a fixed width and the lane wraps, so a fourth goal pushes the lane onto a
   * second row and the page stops fitting on one screen — which is PRD §5.7's mechanic
   * exactly, and `layout.goalsPerLane` is the number the widths were chosen around.
   *
   * M8 briefly added a `.crowded` rule narrowing cards from 296px to 244px and the gap
   * from 14px to 8px. Review measured what that did: four crowded goals came to 1000px
   * where four uncrowded ones came to 1226px, so at exactly the count where the layout
   * would first show strain, the "crowding signal" removed the strain and bought back
   * room for one or two more goals. The signal was also binary — a lane of four and a
   * lane of nine rendered identically — and degrading the cards instead was no better:
   * it contradicts `Main.dc.html`, which draws four goals in Work with full task lists.
   *
   * So the honest answer is that the layout already does this, and the job was to stop
   * undoing it. See BACKLOG B-9 for what a real gradient would take.
   */
  .reveal {
    font: inherit;
    border: none;
    background: none;
    cursor: pointer;
  }
  .reveal:hover {
    color: var(--muted);
  }
  .aside {
    display: flex;
    align-items: center;
    gap: 7px;
    align-self: center;
    padding: 2px;
    font-size: 12.5px;
    color: var(--faint);
  }
</style>
