<script lang="ts">
  /** A quiet "+ thing" that becomes a field in place. No modal, no form. */
  import Icon from './Icon.svelte'

  let {
    label,
    onadd,
    placeholder = '',
  }: { label: string; onadd: (text: string) => void; placeholder?: string } = $props()

  let open = $state(false)
  let draft = $state('')
  let input = $state<HTMLInputElement | null>(null)

  function start() {
    open = true
    draft = ''
    queueMicrotask(() => input?.focus())
  }

  function commit(keepOpen: boolean) {
    const text = draft.trim()
    if (text.length > 0) onadd(text)
    draft = ''
    // Enter keeps the field open so several can be added in a row.
    if (!keepOpen) open = false
    else queueMicrotask(() => input?.focus())
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit(true)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      open = false
    }
  }
</script>

{#if open}
  <input
    bind:this={input}
    bind:value={draft}
    {placeholder}
    onblur={() => commit(false)}
    {onkeydown}
  />
{:else}
  <button onclick={start}>
    <Icon name="plus" size={14} color="var(--faint-2)" />
    <span>{label}</span>
  </button>
{/if}

<style>
  button {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 2px;
    font: inherit;
    font-size: 12.5px;
    color: var(--faint-2);
    background: none;
    border: none;
    cursor: pointer;
  }
  button:hover {
    color: var(--muted);
  }
  input {
    font: inherit;
    font-size: 12.5px;
    color: var(--ink);
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 6px;
    padding: 5px 8px;
    min-width: 200px;
  }
</style>
