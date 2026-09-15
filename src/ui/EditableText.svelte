<script lang="ts">
  /**
   * Click the text, type, Enter commits, Escape cancels (UC-2100: rename is inline and
   * immediate, no dialog and no save button). Blur commits too — losing an edit because
   * you clicked elsewhere is the kind of small cruelty this app is supposed to avoid.
   */
  let {
    value,
    onchange,
    placeholder = '',
    element = 'span',
  }: {
    value: string
    onchange: (next: string) => void
    placeholder?: string
    element?: string
  } = $props()

  let editing = $state(false)
  let draft = $state('')
  let input = $state<HTMLInputElement | null>(null)

  function start() {
    draft = value
    editing = true
    queueMicrotask(() => input?.select())
  }

  function commit() {
    if (!editing) return
    editing = false
    const next = draft.trim()
    if (next.length > 0 && next !== value) onchange(next)
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      commit()
    } else if (event.key === 'Escape') {
      event.preventDefault()
      editing = false
    }
  }
</script>

{#if editing}
  <input bind:this={input} bind:value={draft} {placeholder} onblur={commit} {onkeydown} />
{:else}
  <svelte:element
    this={element}
    class="text"
    role="button"
    tabindex="0"
    onclick={start}
    onkeydown={(e: KeyboardEvent) => (e.key === 'Enter' ? start() : undefined)}
    >{value}</svelte:element
  >
{/if}

<style>
  .text {
    cursor: text;
    border-radius: 3px;
    outline-offset: 2px;
  }
  .text:hover {
    background: rgba(38, 35, 31, 0.05);
    box-shadow: 0 0 0 3px rgba(38, 35, 31, 0.05);
  }
  input {
    font: inherit;
    color: inherit;
    background: var(--card);
    border: 1px solid var(--line);
    border-radius: 4px;
    padding: 1px 5px;
    margin: -2px -6px;
    width: 100%;
    max-width: 100%;
  }
</style>
