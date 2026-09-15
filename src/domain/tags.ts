/**
 * Hashtags in captured text (UC-1030).
 *
 * Tags are optional and get out of the way: they are lifted out of the text so the
 * item reads as a plain sentence, and they may foreshadow a Swimlane that does not
 * exist yet (PRD §5.5). Parsing lives here so the same rule applies to anything that
 * ever captures — the overlay today, a share target or a server tomorrow.
 */

const TAG = /(^|\s)#([\p{L}\p{N}][\p{L}\p{N}_-]*)/gu

export type Captured = { text: string; tags: string[] }

export function parseTags(raw: string): Captured {
  const tags: string[] = []
  const stripped = raw.replace(TAG, (_match, lead: string, tag: string) => {
    const normalized = tag.toLowerCase()
    if (!tags.includes(normalized)) tags.push(normalized)
    return lead
  })
  return { text: stripped.replace(/\s+/g, ' ').trim(), tags }
}

/** Every tag in the pile, most used first, so the filter row reflects actual use. */
export function tagCounts(items: { tags: string[] }[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const item of items) {
    for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag))
}
