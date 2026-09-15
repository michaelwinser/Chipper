<script lang="ts">
  /** The icon set. Stroke-based, 24px grid, one consistent weight — never emoji. */
  type Name = 'star' | 'chevron' | 'plus' | 'plan' | 'lanes' | 'clock' | 'pile'

  let {
    name,
    size = 14,
    filled = false,
    color = 'currentColor',
  }: { name: Name; size?: number; filled?: boolean; color?: string } = $props()

  const paths: Record<Name, string> = {
    star: 'M12 3.2l2.75 5.7 6.25.88-4.5 4.4 1.06 6.22L12 17.44l-5.56 2.94 1.06-6.22-4.5-4.4 6.25-.88z',
    chevron: 'M9.5 5.5l6.5 6.5-6.5 6.5',
    plus: 'M12 5.5v13M5.5 12h13',
    plan: 'M4 6.5h16M4 12h16M4 17.5h10',
    lanes: 'M3 7h18M3 12h18M3 17h18',
    clock: 'M12 7.2v5l3.1 1.9',
    pile: 'M12 3.5l8.5 4.6-8.5 4.6-8.5-4.6z',
  }
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill={filled ? color : 'none'}
  stroke={filled ? 'none' : color}
  stroke-width="1.6"
  stroke-linecap="round"
  stroke-linejoin="round"
  style="flex: none"
  aria-hidden="true"
>
  <path d={paths[name]} />
  {#if name === 'clock'}<circle cx="12" cy="12" r="8.5" />{/if}
  {#if name === 'pile'}<path d="M3.5 13.4l8.5 4.6 8.5-4.6" />{/if}
</svg>
