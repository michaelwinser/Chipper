<script lang="ts">
  /**
   * Ideas, somedays and not-nows (PRD §5.5).
   *
   * Nothing in here is a commitment and nothing in here is late, so there is no age, no
   * order but newest-first, and nothing anywhere that counts how long something has sat.
   * You come here; it never comes to you — which is why no count of it appears in the
   * top bar, or anywhere else in the app.
   */
  import type { PileModel } from '../domain/select/pile'
  import AddInline from './AddInline.svelte'
  import EditableText from './EditableText.svelte'

  let {
    pile,
    onfilter,
    oncapture,
    onedit,
    onpromote,
    ondelete,
  }: {
    pile: PileModel
    onfilter: (tag: string | null) => void
    oncapture: (text: string) => void
    onedit: (id: string, text: string) => void
    onpromote: (
      id: string,
      to: { kind: 'goal'; swimlaneId: string } | { kind: 'task'; swimlaneId: string },
    ) => void
    ondelete: (id: string) => void
  } = $props()

  /** Which item is mid-promotion, and as what. Purely local: it decides nothing. */
  let promoting = $state<{ id: string; kind: 'goal' | 'task' } | null>(null)
</script>

<main>
  <div class="intro">
    <h1>The Pile</h1>
    <p>
      Ideas, somedays and not-nows. Nothing in here is a commitment, and nothing in here is late.
    </p>
  </div>

  <div class="capture">
    <AddInline
      label="Add something to the pile"
      placeholder="an idea, a someday, a not-now"
      onadd={oncapture}
    />
  </div>

  {#if pile.total > 0}
    <div class="tags">
      <button class:on={pile.filter === null} onclick={() => onfilter(null)}>
        Everything {pile.total}
      </button>
      {#each pile.tags as t (t.tag)}
        <button class:on={pile.filter === t.tag} onclick={() => onfilter(t.tag)}>
          #{t.tag}
          {t.count}
        </button>
      {/each}
    </div>
  {/if}

  <div class="list">
    {#each pile.entries as entry (entry.id)}
      <div class="entry">
        <!-- Editing is the same gesture as everywhere else: click the words and type.
             Tags re-parse, so adding #house later is typing it the first time. -->
        <span class="text">
          <EditableText value={entry.text} onchange={(text) => onedit(entry.id, text)} />
        </span>
        {#each entry.tags as tag (tag)}<span class="tag">#{tag}</span>{/each}

        {#if promoting?.id === entry.id}
          <div class="where">
            <span class="eyebrow">Into</span>
            {#each pile.swimlanes as lane (lane.id)}
              <button
                class="pick"
                onclick={() => {
                  onpromote(entry.id, { kind: promoting!.kind, swimlaneId: lane.id })
                  promoting = null
                }}
              >
                <span class="dot" style="background: {lane.color}"></span>{lane.name}
              </button>
            {/each}
            <button class="pick" onclick={() => (promoting = null)}>cancel</button>
          </div>
        {:else}
          <div class="actions">
            <button onclick={() => (promoting = { id: entry.id, kind: 'goal' })}>Make a goal</button
            >
            <button onclick={() => (promoting = { id: entry.id, kind: 'task' })}>Make a task</button
            >
            <button onclick={() => ondelete(entry.id)}>Done</button>
          </div>
        {/if}
      </div>
    {/each}

    {#if pile.entries.length === 0}
      <p class="none">
        {pile.filter === null
          ? 'Nothing in the pile. Capture with ⌘K and it lands here.'
          : `Nothing tagged #${pile.filter}.`}
      </p>
    {/if}
  </div>
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
  .intro {
    max-width: 640px;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  h1 {
    margin: 0;
    font-family: var(--serif);
    font-size: 30px;
    font-weight: 400;
    line-height: 1.2;
  }
  .intro p {
    margin: 0;
    font-size: 14px;
    color: var(--muted-2);
    line-height: 1.5;
  }
  .capture {
    max-width: 760px;
    padding: 6px 15px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
  }
  .tags {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }
  .tags button {
    font: inherit;
    font-size: 12.5px;
    padding: 6px 13px;
    border-radius: var(--radius-pill);
    background: var(--card);
    color: var(--muted);
    border: 1px solid var(--border);
    cursor: pointer;
  }
  .tags button.on {
    background: var(--ink);
    color: var(--paper);
    border-color: var(--ink);
  }
  .list {
    max-width: 760px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    overflow: hidden;
  }
  .entry {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 12px 16px;
    border-top: 1px solid var(--divider);
    flex-wrap: wrap;
  }
  .entry:first-child {
    border-top: none;
  }
  .text {
    font-size: 13.5px;
    color: var(--ink-2);
  }
  .tag {
    font-size: 11.5px;
    color: var(--muted-2);
    background: var(--badge);
    border-radius: var(--radius-chip);
    padding: 2px 7px;
  }
  .actions,
  .where {
    display: flex;
    gap: 8px;
    margin-left: auto;
    align-items: center;
    flex-wrap: wrap;
  }
  .actions {
    opacity: 0;
  }
  .entry:hover .actions,
  .entry:focus-within .actions {
    opacity: 1;
  }
  .actions button,
  .pick {
    display: flex;
    align-items: center;
    gap: 6px;
    font: inherit;
    font-size: 11.5px;
    color: var(--muted);
    border: 1px solid var(--border);
    background: var(--card);
    border-radius: var(--radius-control);
    padding: 4px 9px;
    cursor: pointer;
  }
  .actions button:hover,
  .pick:hover {
    border-color: var(--line);
    color: var(--ink);
  }
  .eyebrow {
    font-size: 11px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
    font-weight: 500;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .none {
    margin: 0;
    padding: 16px;
    font-size: 13px;
    color: var(--faint);
  }
</style>
