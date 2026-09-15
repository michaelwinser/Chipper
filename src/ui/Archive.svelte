<script lang="ts">
  /**
   * Things that are over (UC-2131).
   *
   * Some of these were finished and some were given up on, and nothing here tells you
   * which. No percentage, no badge, no count of what was left. An archived goal carries
   * a date and nothing else, because this is the screen where a person is most likely to
   * feel judged by their own tool.
   */
  import type { ArchiveModel } from '../domain/select/archive'

  let {
    archive,
    onrestore,
    onremove,
  }: {
    archive: ArchiveModel
    onrestore: (goalId: string, swimlaneId?: string) => void
    /** Opens the dialog that says what would go. Never deletes anything by itself. */
    onremove: (goalId: string) => void
  } = $props()

  /** Which entry is picking a lane, because the one it came from is gone. */
  let placing = $state<string | null>(null)
</script>

<main>
  <div class="intro">
    <h1>The Archive</h1>
    <p>Goals that are over. Put any of them back whenever you like.</p>
  </div>

  {#if archive.entries.length === 0}
    <p class="none">Nothing archived yet.</p>
  {:else}
    <div class="list">
      {#each archive.entries as entry (entry.goalId)}
        <div class="entry">
          {#if entry.swimlane}
            <span class="dot" style="background: {entry.swimlane.color}"></span>
            <span class="lane">{entry.swimlane.name}</span>
          {:else}
            <span class="dot gone"></span>
            <span class="lane gone">no lane</span>
          {/if}

          <span class="title">{entry.title}</span>
          <span class="when">{entry.archivedLabel}</span>

          {#if placing === entry.goalId}
            <div class="lanes">
              <span class="eyebrow">Put it in</span>
              {#each archive.swimlanes as lane (lane.id)}
                <button
                  class="pick"
                  onclick={() => {
                    onrestore(entry.goalId, lane.id)
                    placing = null
                  }}
                >
                  <span class="dot" style="background: {lane.color}"></span>{lane.name}
                </button>
              {/each}
              <button class="pick" onclick={() => (placing = null)}>cancel</button>
            </div>
          {:else}
            <div class="tools">
              <button
                class="restore"
                onclick={() =>
                  entry.swimlane ? onrestore(entry.goalId) : (placing = entry.goalId)}
              >
                Restore
              </button>
              <!-- Putting something away should not mean keeping it forever. -->
              <button
                class="discard"
                aria-label="Delete {entry.title} permanently"
                onclick={() => onremove(entry.goalId)}>Delete</button
              >
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {/if}
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
  .list {
    max-width: 780px;
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
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex: none;
  }
  .dot.gone {
    background: var(--line);
  }
  .lane {
    font-size: 11px;
    color: var(--faint);
    width: 58px;
  }
  .lane.gone {
    font-style: italic;
  }
  .title {
    flex: 1;
    font-family: var(--serif);
    font-size: 15px;
  }
  .when {
    font-size: 11.5px;
    color: var(--faint);
  }
  .restore,
  .pick {
    display: flex;
    align-items: center;
    gap: 6px;
    font: inherit;
    font-size: 11.5px;
    color: var(--muted);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: 4px 10px;
    cursor: pointer;
  }
  .restore:hover,
  .pick:hover {
    border-color: var(--line);
    color: var(--ink);
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .discard {
    font: inherit;
    font-size: 11.5px;
    color: var(--faint-2);
    background: none;
    border: 1px solid transparent;
    border-radius: var(--radius-control);
    padding: 4px 10px;
    cursor: pointer;
  }
  .discard:hover {
    color: var(--cherry);
    border-color: #e3c4bc;
  }
  .lanes {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    margin-left: auto;
  }
  .eyebrow {
    font-size: 11px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
    font-weight: 500;
  }
  .none {
    margin: 0;
    font-size: 13.5px;
    color: var(--faint);
  }
</style>
