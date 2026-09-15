<script lang="ts">
  /**
   * Two seconds, no required fields (UC-1010). One line of text and Enter; everything
   * else is optional, including where it goes. It defaults to The Pile because the
   * point of having a pile is that you never have to decide at the moment of catching.
   */
  import type { CaptureDestination } from '../domain/mutations'
  import { parseTags } from '../domain/tags'

  let {
    swimlanes,
    oncapture,
    onclose,
  }: {
    swimlanes: { id: string; name: string; color: string }[]
    oncapture: (text: string, destination: CaptureDestination) => void
    onclose: () => void
  } = $props()

  let text = $state('')
  let target = $state<'pile' | string>('pile')
  let as = $state<'task' | 'goal'>('task')
  let input = $state<HTMLInputElement | null>(null)

  $effect(() => {
    input?.focus()
  })

  const parsed = $derived(parseTags(text))
  const ready = $derived(parsed.text.length > 0)

  function commit() {
    if (!ready) return
    const destination: CaptureDestination =
      target === 'pile' ? { kind: 'pile' } : { kind: 'swimlane', swimlaneId: target, as }
    oncapture(text, destination)
    onclose()
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      onclose()
    }
  }
</script>

<!-- Clicking away is the same as pressing Escape: catching something should never trap you. -->
<div
  class="scrim"
  role="presentation"
  onclick={(e) => (e.target === e.currentTarget ? onclose() : undefined)}
>
  <div class="sheet" role="dialog" aria-label="Capture">
    <div class="line">
      <svg
        width="19"
        height="19"
        viewBox="0 0 24 24"
        fill="none"
        stroke="var(--faint-2)"
        stroke-width="1.7"
        stroke-linecap="round"
        aria-hidden="true"
      >
        <path d="M12 5.5v13M5.5 12h13" />
      </svg>
      <input
        bind:this={input}
        bind:value={text}
        {onkeydown}
        placeholder="What just came to mind?"
        aria-label="What just came to mind?"
      />
    </div>

    <div class="row">
      <span class="eyebrow">Put it in</span>
      <button class:on={target === 'pile'} onclick={() => (target = 'pile')}>The Pile</button>
      {#each swimlanes as lane (lane.id)}
        <button class:on={target === lane.id} onclick={() => (target = lane.id)}>
          <span class="dot" style="background: {lane.color}"></span>{lane.name}
        </button>
      {/each}
      <span class="hint">{ready ? '↵' : ''}</span>
    </div>

    {#if target !== 'pile'}
      <!-- UC-2026: the toggle appears only once it has a home. The Pile has no such
           distinction, because nothing in it is a commitment yet. -->
      <div class="row">
        <span class="eyebrow">As</span>
        <button class:on={as === 'task'} onclick={() => (as = 'task')}>a task</button>
        <button class:on={as === 'goal'} onclick={() => (as = 'goal')}>a goal</button>
      </div>
    {/if}

    <p class="foot">
      {#if parsed.tags.length > 0}
        Tagged {parsed.tags.map((t) => `#${t}`).join(' ')} · filed as “{parsed.text}”
      {:else}
        Tags like #house are optional. So is everything else.
      {/if}
    </p>
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
    padding-top: 18vh;
    z-index: 10;
  }
  .sheet {
    width: min(604px, calc(100vw - 32px));
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 12px;
    box-shadow: 0 18px 44px rgba(38, 35, 31, 0.22);
    overflow: hidden;
  }
  .line {
    display: flex;
    align-items: center;
    gap: 13px;
    padding: 18px 22px;
  }
  .line input {
    flex: 1;
    font: inherit;
    font-size: 18px;
    color: var(--ink);
    border: none;
    outline: none;
    background: none;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    padding: 11px 22px;
    border-top: 1px solid var(--divider);
    background: var(--headfill);
  }
  .eyebrow {
    font-size: 11px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
    font-weight: 500;
    margin-right: 3px;
  }
  .row button {
    display: flex;
    align-items: center;
    gap: 6px;
    font: inherit;
    font-size: 12.5px;
    padding: 5px 12px;
    border-radius: var(--radius-pill);
    background: var(--card);
    color: var(--muted);
    border: 1px solid var(--border);
    cursor: pointer;
  }
  .row button.on {
    background: var(--ink);
    color: var(--paper);
    border-color: var(--ink);
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .hint {
    margin-left: auto;
    font-size: 11.5px;
    color: var(--faint);
  }
  .foot {
    margin: 0;
    padding: 10px 22px 14px;
    font-size: 11.5px;
    color: var(--faint);
  }
</style>
