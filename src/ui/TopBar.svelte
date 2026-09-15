<script lang="ts">
  import Icon from './Icon.svelte'

  let {
    page = 'board',
    onexport,
    onimport,
    onnavigate,
    oncapture,
  }: {
    page?: 'board' | 'pile' | 'archive' | 'priorities'
    onexport?: () => void
    onimport?: () => void
    onnavigate?: (page: 'board' | 'pile' | 'archive' | 'priorities') => void
    oncapture?: () => void
  } = $props()
</script>

<header>
  <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--ink)" aria-hidden="true">
    <rect x="4" y="4.5" width="16" height="4" rx="1.6" />
    <rect x="4" y="10" width="11" height="4" rx="1.6" />
    <rect x="4" y="15.5" width="6.5" height="4" rx="1.6" />
  </svg>
  <span class="wordmark">Chipper</span>

  <nav>
    <!--
      Each guarded on its own callback, not both on `onexport`.
      They were paired, and the blocked screen passes only `onimport` — so the one
      control that recovers unreadable data without erasing it did not render, while
      `Blocked.svelte` told the user to use it. Export is genuinely absent there:
      there is nothing loaded to export.
    -->
    {#if onexport}
      <button onclick={onexport}>Export</button>
    {/if}
    {#if onimport}
      <button onclick={onimport}>Import</button>
    {/if}
    {#if onnavigate}
      <button class="link" class:on={page === 'board'} onclick={() => onnavigate('board')}>
        Swimlanes
      </button>
      <!-- No count here, ever: you go to the Pile, it never comes to you (PRD §5.5). -->
      <button class="link" class:on={page === 'pile'} onclick={() => onnavigate('pile')}>
        The Pile
      </button>
      <button class="link" class:on={page === 'archive'} onclick={() => onnavigate('archive')}>
        Archive
      </button>
    {/if}
    {#if oncapture}
      <button onclick={oncapture}>
        <Icon name="plus" size={13} color="var(--muted)" />Capture<em>⌘K</em>
      </button>
    {/if}
    {#if onnavigate}
      <button onclick={() => onnavigate('priorities')}>
        <Icon name="star" size={12} filled color="var(--cherry)" />Set priorities
      </button>
    {/if}
  </nav>
</header>

<style>
  header {
    height: 56px;
    flex: none;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 0 40px;
    background: var(--rail);
    border-bottom: 1px solid var(--border);
  }
  .wordmark {
    font-family: var(--serif);
    font-size: 18px;
    letter-spacing: 0.2px;
  }
  nav {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 14px;
  }
  button.link {
    font: inherit;
    font-size: 13px;
    color: var(--muted);
    background: none;
    border: none;
    padding: 4px 0;
    cursor: pointer;
  }
  button.link.on {
    color: var(--ink);
    font-weight: 500;
  }
  button {
    display: flex;
    align-items: center;
    gap: 6px;
    font: inherit;
    font-size: 12.5px;
    color: var(--ink-2);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-control);
    padding: 6px 12px;
    cursor: pointer;
  }
  button:hover {
    border-color: var(--line);
  }
</style>
