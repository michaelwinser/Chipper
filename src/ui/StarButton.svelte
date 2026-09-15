<script lang="ts">
  /**
   * The only cherry-coloured thing on screen, so it is the only thing that pulls the
   * eye. Unstarred it is invisible until you go near it — the board should never look
   * covered in empty stars asking to be filled.
   */
  import Icon from './Icon.svelte'

  let {
    starred,
    size = 14,
    label,
    ontoggle,
  }: { starred: boolean; size?: number; label: string; ontoggle: () => void } = $props()
</script>

<button
  class:starred
  aria-label={starred ? `Remove ${label} from priorities` : `Make ${label} a priority`}
  aria-pressed={starred}
  onclick={ontoggle}
>
  <Icon name="star" {size} filled={starred} color={starred ? 'var(--cherry)' : '#c3baab'} />
</button>

<style>
  button {
    display: flex;
    align-items: center;
    border: none;
    background: none;
    padding: 1px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.1s;
  }
  button.starred {
    opacity: 1;
  }
  /* Revealed on approach, never sitting there asking to be filled in. */
  :global(.card:hover) button,
  :global(.row:hover) button,
  :global(.chip:hover) button,
  button:focus-visible {
    opacity: 1;
  }
</style>
