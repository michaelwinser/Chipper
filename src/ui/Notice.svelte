<script lang="ts">
  /** Says what happened and gets out of the way. Never scolds, never blocks. */
  let { message, ondismiss }: { message: string; ondismiss: () => void } = $props()
</script>

<div class="notice" role="status">
  <span>{message}</span>
  <button onclick={ondismiss} aria-label="Dismiss">×</button>
</div>

<style>
  .notice {
    display: flex;
    align-items: center;
    gap: 12px;
    margin: 0 40px;
    padding: 10px 14px;
    background: var(--card);
    border: 1px solid var(--border);
    border-left: 3px solid var(--muted-2);
    border-radius: var(--radius-control);
    font-size: 13px;
    color: var(--ink-2);
    box-shadow: var(--shadow-card);
  }
  button {
    margin-left: auto;
    border: none;
    background: none;
    color: var(--faint);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
  }
</style>
