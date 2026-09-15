<script lang="ts">
  /**
   * Getting rid of something (UC-2105, UC-2106, UC-2014).
   *
   * Two rules hold this together. The first: say exactly what goes — counts, including
   * work already finished, because that is the part a person forgets they will lose.
   * The second: the destructive path always shows the non-destructive one beside it,
   * reading first. Delete is last, and it is the only red thing on the screen.
   */
  import type { Removal } from '../domain/select/removal'
  import Icon from './Icon.svelte'

  let {
    removal,
    ondelete,
    onarchive,
    onmove,
    onclose,
  }: {
    removal: Removal
    /** For a plan, whether its contents go with it. */
    ondelete: (disposition: 'promote-children' | 'cascade') => void
    onarchive: () => void
    onmove: (toSwimlaneId: string) => void
    onclose: () => void
  } = $props()

  const noun = $derived(removal.kind === 'swimlane' ? 'swimlane' : removal.kind)
  let choosingLane = $state(false)
</script>

<div
  class="scrim"
  role="presentation"
  onclick={(e) => (e.target === e.currentTarget ? onclose() : undefined)}
>
  <div class="sheet" role="dialog" aria-label="Delete {removal.title}">
    <header>
      <h2>Delete the {noun} “{removal.title}”?</h2>
      {#if removal.cost}
        <p>{removal.cost}</p>
      {:else}
        <p>Nothing else goes with it.</p>
      {/if}
      {#if removal.kind !== 'plan' && removal.kind !== 'swimlane'}
        <p class="final">It cannot be undone.</p>
      {/if}
      {#if removal.cascadeCost}
        <!-- The destructive option's own cost. Stating only the kind outcome above a red
             button is how a dialog misleads while saying something technically true. -->
        <p class="final">{removal.cascadeCost}</p>
      {/if}
    </header>

    {#if removal.alternative}
      <!-- Reads before the destructive choice, deliberately. -->
      <section class="alternative">
        <Icon name="pile" size={16} color="var(--muted)" />
        <div>
          <span class="lead">
            {removal.kind === 'swimlane' ? 'Put its contents away instead' : 'Archive it instead'}
          </span>
          <span class="detail">{removal.alternative.text}</span>
        </div>
      </section>
    {/if}

    {#if removal.kind === 'swimlane' && choosingLane}
      <section class="lanes">
        <span class="eyebrow">Move everything to</span>
        {#each removal.swimlanes as lane (lane.id)}
          <button class="pick" onclick={() => onmove(lane.id)}>
            <span class="dot" style="background: {lane.color}"></span>{lane.name}
          </button>
        {/each}
        <button class="pick" onclick={() => (choosingLane = false)}>cancel</button>
      </section>
    {/if}

    <!--
      Which choices exist depends on whether there is anything to save. Something empty
      has no contents to rescue, so it gets one confirmation and goes (UC-2013); asking
      where to move nothing would be a question with no answer.
    -->
    <footer>
      {#if removal.holdsAnything}
        {#if removal.alternative?.kind === 'archive'}
          <button class="primary" onclick={onarchive}>
            {removal.kind === 'swimlane' ? 'Archive its contents' : 'Archive'}
          </button>
        {/if}
        {#if removal.kind === 'swimlane' && removal.swimlanes.length > 0 && !choosingLane}
          <button class="secondary" onclick={() => (choosingLane = true)}>Move it elsewhere</button>
        {/if}
        {#if removal.kind === 'plan'}
          <button class="primary" onclick={() => ondelete('promote-children')}>
            Delete the plan
          </button>
        {/if}
      {/if}

      <button class="plain" onclick={onclose}>Cancel</button>

      {#if removal.kind === 'plan' && removal.holdsAnything}
        <button class="danger" onclick={() => ondelete('cascade')}>Delete its tasks too</button>
      {:else if removal.kind !== 'swimlane' || !removal.holdsAnything}
        <button class="danger" onclick={() => ondelete('cascade')}>
          {removal.holdsAnything ? 'Delete everything' : 'Delete'}
        </button>
      {/if}
    </footer>
  </div>
</div>

<style>
  .scrim {
    position: fixed;
    inset: 0;
    background: rgba(43, 38, 32, 0.4);
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding-top: 16vh;
    z-index: 10;
  }
  .sheet {
    width: min(520px, calc(100vw - 32px));
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 18px 44px rgba(38, 35, 31, 0.22);
    overflow: hidden;
  }
  header {
    padding: 22px 24px 18px;
    border-bottom: 1px solid var(--divider);
  }
  h2 {
    margin: 0;
    font-family: var(--serif);
    font-size: 21px;
    font-weight: 400;
    line-height: 1.3;
  }
  header p {
    margin: 9px 0 0;
    font-size: 13.5px;
    color: var(--muted-2);
    line-height: 1.55;
  }
  .final {
    color: var(--muted);
  }
  .alternative {
    display: flex;
    align-items: flex-start;
    gap: 11px;
    padding: 18px 24px;
    background: var(--headfill);
  }
  .alternative div {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .lead {
    font-size: 13.5px;
    color: var(--ink);
  }
  .detail {
    font-size: 12px;
    color: var(--muted-2);
    line-height: 1.5;
  }
  .lanes {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 14px 24px;
    border-top: 1px solid var(--divider);
  }
  .eyebrow {
    font-size: 11px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
    font-weight: 500;
  }
  .pick {
    display: flex;
    align-items: center;
    gap: 6px;
    font: inherit;
    font-size: 12px;
    color: var(--muted);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: 5px 11px;
    cursor: pointer;
  }
  .pick:hover {
    border-color: var(--line);
    color: var(--ink);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  footer {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    padding: 16px 24px;
    border-top: 1px solid var(--divider);
  }
  .primary {
    font: inherit;
    font-size: 13.5px;
    color: var(--paper);
    background: var(--ink);
    border: 1px solid var(--ink);
    border-radius: var(--radius-control);
    padding: 10px 20px;
    cursor: pointer;
  }
  .secondary {
    font: inherit;
    font-size: 13px;
    color: var(--ink-2);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: 9px 16px;
    cursor: pointer;
  }
  .plain {
    font: inherit;
    font-size: 13px;
    color: var(--muted);
    background: none;
    border: none;
    cursor: pointer;
  }
  /* The only red on the screen, and the last thing on the row. */
  .danger {
    margin-left: auto;
    font: inherit;
    font-size: 13px;
    color: var(--cherry);
    background: none;
    border: 1px solid #e3c4bc;
    border-radius: var(--radius-control);
    padding: 9px 16px;
    cursor: pointer;
  }
  .danger:hover {
    border-color: var(--cherry);
  }
</style>
