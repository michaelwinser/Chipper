<script lang="ts">
  /**
   * A date, if you want one (UC-2090). Optional everywhere and never flagged when
   * absent — "no date" is a perfectly finished state, not a gap to be filled.
   */
  let {
    value,
    onchange,
  }: { value: { iso: string; label: string } | null; onchange: (iso: string | null) => void } =
    $props()

  let editing = $state(false)
  let input = $state<HTMLInputElement | null>(null)

  $effect(() => {
    if (editing) input?.focus()
  })
</script>

{#if editing}
  <input
    bind:this={input}
    type="date"
    value={value?.iso ?? ''}
    onblur={() => (editing = false)}
    onchange={(e) => {
      const next = (e.currentTarget as HTMLInputElement).value
      onchange(next === '' ? null : next)
      editing = false
    }}
  />
{:else if value}
  <button class="set" onclick={() => (editing = true)}>{value.label}</button>
  <button class="clear" aria-label="Remove the date" onclick={() => onchange(null)}>×</button>
{:else}
  <button class="add" onclick={() => (editing = true)}>add a date</button>
{/if}

<style>
  button {
    font: inherit;
    font-size: 11.5px;
    background: none;
    border: none;
    padding: 0;
    cursor: pointer;
  }
  .set {
    color: var(--muted-2);
  }
  .set:hover {
    color: var(--ink);
  }
  .clear {
    color: var(--faint-2);
    font-size: 13px;
    line-height: 1;
  }
  .clear:hover {
    color: var(--cherry);
  }
  /* Invisible until you go near the card: an absent date asks for nothing. */
  .add {
    color: var(--faint-2);
    opacity: 0;
  }
  :global(.card:hover) .add,
  .add:focus-visible {
    opacity: 1;
  }
  .add:hover {
    color: var(--muted);
  }
  input {
    font: inherit;
    font-size: 11.5px;
    color: var(--ink);
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 5px;
    padding: 1px 4px;
  }
</style>
