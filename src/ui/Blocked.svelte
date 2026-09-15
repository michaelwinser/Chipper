<script lang="ts">
  /**
   * Saved data that could not be read.
   *
   * This blocks. Everything else in the app is designed to get out of your way; this one
   * screen deliberately does not, because the alternative shipped for seven milestones:
   * an empty board that looked exactly like a fresh install, offering friendly buttons,
   * any one of which would have written over the only copy of the user's work.
   *
   * Nothing here is reversible by the app, so both choices are the user's and the
   * non-destructive one comes first.
   */
  import type { BlockedModel } from '../domain/select/blocked'

  let {
    blocked,
    onstartfresh,
    error = null,
  }: { blocked: BlockedModel; onstartfresh: () => void; error?: string | null } = $props()

  const raw = $derived(blocked.raw)

  let confirming = $state(false)
  /** Whether the download was offered to the browser, and whether it threw. */
  let saved = $state<'no' | 'yes' | 'failed'>('no')
  let showRaw = $state(false)

  /**
   * The only exit that loses nothing, so it is written to fail loudly rather than
   * quietly. The anchor is attached to the document before it is clicked (a synthetic
   * click on a detached anchor does nothing in Firefox) and the object URL is revoked on
   * a later task rather than in the same tick, which raced the download's start. If it
   * throws — `file://` pages block downloads in several browsers — the raw text is shown
   * so it can be copied by hand, because the remaining button is the destructive one.
   */
  function download() {
    try {
      const blob = new Blob([raw], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = 'chipper-unreadable-data.json'
      link.style.display = 'none'
      document.body.appendChild(link)
      link.click()
      link.remove()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
      saved = 'yes'
    } catch {
      saved = 'failed'
      showRaw = true
    }
  }
</script>

<main>
  <div class="sheet">
    <h1>There is saved data here that Chipper cannot read</h1>
    <p class="reason">{blocked.reason}</p>
    <p>
      Nothing has been changed and nothing has been deleted. All {blocked.sizeLabel} of it is still in
      this browser, exactly as it was — but the app will not write anything until you decide what to do,
      because writing would replace it.
    </p>

    <div class="actions">
      <button class="primary" onclick={download}>Download the raw data</button>
      <button class="plain" onclick={() => (showRaw = !showRaw)}>
        {showRaw ? 'Hide it' : 'Show it here'}
      </button>
      {#if confirming}
        <button class="danger" onclick={onstartfresh}>Yes, erase it and start fresh</button>
        <button class="plain" onclick={() => (confirming = false)}>Cancel</button>
      {:else}
        <button class="plain" onclick={() => (confirming = true)}>Start fresh</button>
      {/if}
    </div>

    {#if error}
      <p class="warning" role="alert">{error}</p>
    {/if}

    {#if saved === 'yes'}
      <p class="aside">
        The download was handed to your browser as <code>chipper-unreadable-data.json</code>. If no
        file appeared, use “Show it here” and copy the text instead.
      </p>
    {:else if saved === 'failed'}
      <p class="warning" role="alert">
        This browser would not start the download. The data is below — select it and copy it
        somewhere safe before doing anything else.
      </p>
    {/if}

    {#if showRaw}
      <!-- The fallback that makes the download's failure survivable: nothing on this
           screen may depend on a browser feature that can silently do nothing. -->
      <textarea class="raw" readonly rows="10" aria-label="The unreadable saved data"
        >{raw}</textarea
      >
    {/if}

    {#if confirming}
      <p class="warning">
        Starting fresh erases the unreadable data permanently. Download it first if there is any
        chance it can be recovered.
      </p>
    {:else}
      <p class="aside">
        If you have an export of your work on disk, use <b>Import</b> above — that replaces this data
        without erasing it first, and is the only way out of here that loses nothing.
      </p>
    {/if}
  </div>
</main>

<style>
  main {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: flex-start;
    padding: 12vh 40px 40px;
  }
  .sheet {
    max-width: 620px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  h1 {
    margin: 0;
    font-family: var(--serif);
    font-size: 28px;
    font-weight: 400;
    line-height: 1.25;
  }
  p {
    margin: 0;
    font-size: 14px;
    line-height: 1.6;
    color: var(--muted-2);
  }
  .reason {
    padding: 12px 15px;
    background: var(--headfill);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    color: var(--ink-2);
    font-size: 13px;
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    padding-top: 4px;
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
    cursor: pointer;
  }
  .danger {
    font: inherit;
    font-size: 13px;
    color: var(--cherry);
    background: none;
    border: 1px solid #e3c4bc;
    border-radius: var(--radius-control);
    padding: 9px 16px;
    cursor: pointer;
  }
  .warning {
    font-size: 12.5px;
    color: var(--ink-2);
  }
  .aside {
    font-size: 12.5px;
    color: var(--faint);
  }
  .raw {
    font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
    font-size: 11.5px;
    line-height: 1.5;
    color: var(--ink-2);
    background: var(--headfill);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: 10px 12px;
    resize: vertical;
    white-space: pre;
    overflow: auto;
  }
  code {
    font-size: 12px;
    background: var(--headfill);
    padding: 1px 4px;
    border-radius: 3px;
  }
</style>
