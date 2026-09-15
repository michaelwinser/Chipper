<script lang="ts">
  import type { Lens } from '../domain/board'
  import { getBoardActions, isReadOnly } from './actions'

  let { lens }: { lens: Lens } = $props()
  const actions = getBoardActions()
  const readOnly = isReadOnly()

  const sizes: { value: Lens['size']; label: string }[] = [
    { value: 'any', label: 'Any size' },
    { value: 'S', label: 'S · 15m' },
    { value: 'M', label: 'M · 1–2h' },
    { value: 'L', label: 'L · ½ day' },
  ]
</script>

<div class="controls">
  <!-- Read-only is a picture: spans, not controls nobody can use. -->
  <div class="seg">
    {#if readOnly}
      <span class:on={lens.focus === 'priorities'}>Priorities</span>
      <span class:on={lens.focus === 'everything'}>Everything</span>
    {:else}
      <button class:on={lens.focus === 'priorities'} onclick={() => actions.setFocus('priorities')}>
        Priorities
      </button>
      <button class:on={lens.focus === 'everything'} onclick={() => actions.setFocus('everything')}>
        Everything
      </button>
    {/if}
  </div>
  <!-- A filter over the same view, never a mode: nothing moves and nothing navigates. -->
  <div class="seg">
    {#each sizes as s (s.value)}
      {#if readOnly}
        <span class:on={lens.size === s.value}>{s.label}</span>
      {:else}
        <button class:on={lens.size === s.value} onclick={() => actions.setSizeLens(s.value)}>
          {s.label}
        </button>
      {/if}
    {/each}
  </div>
</div>

<style>
  .controls {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }
  .seg {
    display: flex;
    gap: 2px;
    padding: 3px;
    background: var(--badge);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
  }
  .seg button {
    font: inherit;
    border: none;
    background: none;
    font-size: 12px;
    padding: 5px 12px;
    border-radius: 6px;
    color: var(--muted-2);
    white-space: nowrap;
    cursor: pointer;
  }
  .seg button.on {
    background: var(--card);
    color: var(--ink);
    font-weight: 500;
    box-shadow: var(--shadow-raised);
  }
  .seg button:disabled {
    cursor: default;
  }
  .seg span {
    font-size: 12px;
    padding: 5px 12px;
    border-radius: 6px;
    color: var(--muted-2);
    white-space: nowrap;
  }
  .seg span.on {
    background: var(--card);
    color: var(--ink);
    font-weight: 500;
    box-shadow: var(--shadow-raised);
  }
</style>
