<script lang="ts">
  /**
   * Importing over what is already here (UC-6030).
   *
   * Replaces a browser `confirm()`, which could not say what was in the file, could not
   * be styled to put the safe choice first, and could not be tested. This states both
   * sides — what arrives and what goes — because the thing being destroyed is the only
   * copy of it that exists.
   */
  export type ImportSummary = { lanes: number; goals: number; tasks: number }

  let {
    incoming,
    existing,
    onconfirm,
    onexportfirst,
    onclose,
  }: {
    incoming: ImportSummary
    /** Null on a first run: there is nothing here to lose. */
    existing: ImportSummary | null
    onconfirm: () => void
    onexportfirst: () => void
    onclose: () => void
  } = $props()

  const describe = (s: ImportSummary) =>
    [
      `${s.lanes} ${s.lanes === 1 ? 'swimlane' : 'swimlanes'}`,
      `${s.goals} ${s.goals === 1 ? 'goal' : 'goals'}`,
      `${s.tasks} ${s.tasks === 1 ? 'task' : 'tasks'}`,
    ].join(', ')

  const replacing = $derived(
    existing !== null && existing.lanes + existing.goals + existing.tasks > 0,
  )
</script>

<div
  class="scrim"
  role="presentation"
  onclick={(e) => (e.target === e.currentTarget ? onclose() : undefined)}
>
  <div class="sheet" role="dialog" aria-label="Import">
    <header>
      <h2>{replacing ? 'Replace everything with this file?' : 'Import this file?'}</h2>
      <p>This file holds {describe(incoming)}.</p>
      {#if replacing && existing}
        <p class="going">
          What is here now — {describe(existing)} — will be gone. This browser is the only place it exists.
        </p>
      {/if}
    </header>

    <footer>
      {#if replacing}
        <!-- The safe move, first: exporting takes a second and makes the rest reversible. -->
        <button class="primary" onclick={onexportfirst}>Export what is here first</button>
      {/if}
      <button class="plain" onclick={onclose}>Cancel</button>
      <button class="danger" onclick={onconfirm}>
        {replacing ? 'Replace everything' : 'Import'}
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
  .going {
    color: var(--ink-2);
  }
  footer {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
    padding: 16px 24px;
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
