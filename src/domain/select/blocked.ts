import { formatBytes } from '../format'
import type { NoGuilt } from '../board'

/**
 * What the blocking screen says (DESIGN.md §2.1).
 *
 * Every other surface in the app goes through a selector; this one did not. `App.svelte`
 * read `store.status` and handed `reason` and `raw` straight to a component, which then
 * measured and formatted the byte count itself — a derived value assembled in a Svelte
 * file, untestable without a DOM, on the one screen standing between a person and the
 * permanent loss of their work.
 */

/**
 * The shape the store reports, restated rather than imported.
 *
 * `domain` may import nothing — not even `store` (DESIGN.md §2, enforced by
 * `test/architecture.test.ts`). Two fields is a small price for a layer that stays
 * reusable by a server that has no browser storage at all.
 */
export type Unreadable = { reason: string; raw: string }

export type BlockedModel = {
  /** Why the document could not be read, in the reader's own words. */
  reason: string
  /** The bytes themselves, so they can be downloaded or shown and copied. */
  raw: string
  /** "15 bytes" · "4 KB" · "1.2 MB". Never "0 KB", and never an unqualified number. */
  sizeLabel: string
}

export function buildBlocked(status: Unreadable): BlockedModel {
  return { reason: status.reason, raw: status.raw, sizeLabel: formatBytes(status.raw) }
}

/* ------------------------------------------------------------------------- *
 * Structural guarantee (DESIGN.md §2.1, §9.5)
 *
 * This model exists for the worst moment the app has, which is exactly where a
 * "you have lost N things" would feel justified. It says what is there and what
 * went wrong; it never counts what is gone.
 * ------------------------------------------------------------------------- */
export const _noGuiltBlockedModel: [NoGuilt<BlockedModel>, NoGuilt<Unreadable>] = [true, true]
