<script lang="ts">
  /**
   * The browser will not let Chipper use storage at all.
   *
   * Chrome throws `SecurityError` for `localStorage` on a `file://` page — a way of
   * running the app that PRD §7 explicitly promises — and again when a user has blocked
   * site data. Before this the constructor threw out of `onMount`, the promise rejected
   * with nobody listening, and the app sat on "Opening…" indefinitely. A blank screen
   * was the app's answer to a supported way of running it.
   *
   * This screen does not offer to fix anything, because the app cannot: the setting is
   * the browser's. It says what happened, what still works, and what does not.
   */
  let { reason }: { reason: string } = $props()
</script>

<main>
  <div class="sheet">
    <h1>This browser will not let Chipper save anything</h1>
    <p class="reason">{reason}</p>
    <p>
      Chipper keeps your work in this browser's own storage, and this browser is refusing access to
      it. Nothing has been lost — there is nothing saved to lose — but nothing you do here would be
      kept either, so the board is not opened rather than opened and silently discarded.
    </p>
    <p class="aside">
      The two usual causes are opening the app as a local file in Chrome, which blocks storage for
      files opened that way, and a browser setting that blocks site data. Serving the folder from a
      local web server resolves the first — <code>make preview</code> does it.
    </p>
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
    overflow-wrap: anywhere;
  }
  .aside {
    font-size: 12.5px;
    color: var(--faint);
  }
  code {
    font-size: 12px;
    background: var(--headfill);
    padding: 1px 4px;
    border-radius: 3px;
  }
</style>
