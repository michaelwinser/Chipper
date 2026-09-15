/** Shared scalar types. Kept apart so the state and the view model agree on them. */

export type Id = string
/** Calendar day, `YYYY-MM-DD`. Never a timestamp: deadlines are days, not moments. */
export type IsoDate = string
/** A moment, `YYYY-MM-DDTHH:MM:SS.sssZ`. */
export type IsoTime = string

/** A task's declared time box. Not an estimate — a hint at the shape of the work. */
export type Size = 'S' | 'M' | 'L'
export const SIZES: readonly Size[] = ['S', 'M', 'L'] as const

/**
 * Ordering by UTF-16 code unit, never by locale.
 *
 * `localeCompare` reads the host locale and the ICU build: `'A'.localeCompare('a')` is 1
 * here and -1 by code unit, and a runtime without full ICU falls back to code units
 * entirely. Sorting with it means the same state renders in a different order on a
 * different machine — the exact failure `formatDeadline` avoids for dates.
 *
 * Code UNIT, not code point: `<` on JS strings compares UTF-16 units, so characters
 * outside the basic plane (an emoji in a title) order differently than true code-point
 * order would put them. That is fine here and stated so nobody assumes otherwise — the
 * property this function exists for is that the answer is the same everywhere, and it
 * matches the bare `.sort()` the export envelope uses for its keys.
 */
export function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * The app's one total ordering for entities.
 *
 * Creation time first, id second. The id tiebreak is what makes it TOTAL: two things
 * created in the same millisecond — routine, since a mutation carries one timestamp for
 * everything it touches — would otherwise fall back to whatever order the record handed
 * them over in, which is insertion history, not state.
 */
export function byCreation<T extends { createdAt: string; id: string }>(a: T, b: T): number {
  return compareText(a.createdAt, b.createdAt) || compareText(a.id, b.id)
}

/**
 * The next size in the cycle: S → M → L → unsized → S.
 *
 * That unsized is IN the cycle is a product decision (a size is a hint, and taking the
 * hint back has to be as easy as giving it). It lived, verbatim, in both `TaskRow` and
 * `Chip` — two components deciding the same rule, which is how they drift.
 */
export function nextSize(size: Size | null): Size | null {
  const order: (Size | null)[] = [...SIZES, null]
  return order[(order.indexOf(size) + 1) % order.length] ?? null
}
