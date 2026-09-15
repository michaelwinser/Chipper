<script lang="ts">
  /**
   * The signature move (UC-2050) and the three outs (UC-4050).
   *
   * A time box ran out. The app does not ask how it went, does not record how long it
   * took, and does not prompt any of this unasked — you came here. All three outs sit
   * side by side in the footer with nothing to distinguish the "right" one, because
   * there isn't one: good enough, a bit more time, and it was bigger than it looked are
   * equally respectable answers.
   */
  import type { Size } from '../domain/primitives'
  import Icon from './Icon.svelte'

  let {
    title,
    starred = false,
    onbreakdown,
    ondone,
    onclose,
  }: {
    title: string
    starred?: boolean
    /** The task becomes a plan, and these become its first tasks. */
    onbreakdown: (pieces: { title: string; size: Size | null }[]) => void
    ondone: () => void
    onclose: () => void
  } = $props()

  let draft = $state('')
  let pieces = $state<{ title: string; size: Size | null }[]>([])
  let size = $state<Size | null>('M')
  let input = $state<HTMLInputElement | null>(null)

  $effect(() => {
    input?.focus()
  })

  function addPiece() {
    const text = draft.trim()
    if (text.length === 0) return
    pieces = [...pieces, { title: text, size }]
    draft = ''
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      addPiece()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onclose()
    }
  }

  function makePlan() {
    // Whatever is half-typed counts: losing it would punish you for not pressing Enter.
    const text = draft.trim()
    onbreakdown(text.length > 0 ? [...pieces, { title: text, size }] : pieces)
    onclose()
  }
</script>

<div
  class="scrim"
  role="presentation"
  onclick={(e) => (e.target === e.currentTarget ? onclose() : undefined)}
>
  <div class="sheet" role="dialog" aria-label="This one is too big">
    <header>
      <div class="head">
        <Icon name="plan" size={17} color="var(--muted)" />
        <h2>This one is too big</h2>
      </div>
      <p>It becomes a plan and keeps everything it already had. Add the pieces you can just do.</p>
    </header>

    <section>
      <span class="eyebrow">Was a task, now a plan</span>
      <div class="was">
        <Icon name="plan" size={15} color="var(--muted-2)" />
        <span class="title">{title}</span>
        {#if starred}<Icon name="star" size={14} filled color="var(--cherry)" />{/if}
      </div>
      <span class="note">Its notes, deadline and star come with it. Nothing is deleted.</span>
    </section>

    <section>
      <span class="eyebrow">Break it into</span>
      <div class="pieces">
        {#each pieces as piece, i (i)}
          <div class="piece">
            <span class="box"></span>
            <span class="piece-title">{piece.title}</span>
            {#if piece.size}<span class="size">{piece.size}</span>{/if}
          </div>
        {/each}
        <div class="piece">
          <span class="box dashed"></span>
          <input
            bind:this={input}
            bind:value={draft}
            {onkeydown}
            placeholder="something you can just do"
            aria-label="A piece of this plan"
          />
        </div>
      </div>
      <div class="sizes">
        <span class="note">Size</span>
        {#each ['S', 'M', 'L'] as const as s (s)}
          <button class="pill" class:on={size === s} onclick={() => (size = s)}>{s}</button>
        {/each}
        <button class="pill" class:on={size === null} onclick={() => (size = null)}>–</button>
      </div>
    </section>

    <!-- The three outs, equal in weight (UC-4050). -->
    <footer>
      <button class="primary" onclick={makePlan}>Make it a plan</button>
      <button class="plain" onclick={onclose}>Leave it open for now</button>
      <button
        class="plain"
        onclick={() => {
          ondone()
          onclose()
        }}
      >
        It's good enough — mark it done
      </button>
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
    padding-top: 12vh;
    z-index: 10;
  }
  .sheet {
    width: min(640px, calc(100vw - 32px));
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
  .head {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  h2 {
    margin: 0;
    font-family: var(--serif);
    font-size: 22px;
    font-weight: 400;
  }
  header p {
    margin: 8px 0 0;
    font-size: 13.5px;
    color: var(--muted-2);
    line-height: 1.55;
  }
  section {
    padding: 18px 24px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }
  section + section {
    padding-top: 0;
  }
  .eyebrow {
    font-size: 11px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
    font-weight: 500;
  }
  .was {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 12px 15px;
    background: var(--headfill);
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
  }
  .was .title {
    flex: 1;
    font-family: var(--serif);
    font-size: 16.5px;
  }
  .note {
    font-size: 11.5px;
    color: var(--faint);
  }
  .pieces {
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    overflow: hidden;
  }
  .piece {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 10px 15px;
  }
  .piece + .piece {
    border-top: 1px solid var(--divider);
  }
  .box {
    width: 16px;
    height: 16px;
    flex: none;
    border: 1.4px solid var(--line);
    border-radius: var(--radius-chip);
  }
  .box.dashed {
    border-style: dashed;
    border-color: var(--line);
  }
  .piece-title {
    flex: 1;
    font-size: 13.5px;
  }
  .piece input {
    flex: 1;
    font: inherit;
    font-size: 13.5px;
    color: var(--ink);
    border: none;
    outline: none;
    background: none;
  }
  .size {
    font-size: 10.5px;
    font-weight: 500;
    color: var(--muted-2);
    background: var(--badge);
    border-radius: var(--radius-chip);
    padding: 2px 6px;
  }
  .sizes {
    display: flex;
    align-items: center;
    gap: 8px;
    padding-top: 3px;
  }
  .pill {
    font: inherit;
    font-size: 11.5px;
    padding: 4px 12px;
    border-radius: var(--radius-pill);
    background: var(--card);
    color: var(--muted);
    border: 1px solid var(--border);
    cursor: pointer;
  }
  .pill.on {
    background: var(--ink);
    color: var(--paper);
    border-color: var(--ink);
  }
  footer {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    padding: 16px 24px;
    border-top: 1px solid var(--divider);
    background: var(--headfill);
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
  .plain {
    font: inherit;
    font-size: 13px;
    color: var(--muted);
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .plain:hover {
    color: var(--ink);
  }
</style>
