/** Shared scalar types. Kept apart so the state and the view model agree on them. */

export type Id = string
/** Calendar day, `YYYY-MM-DD`. Never a timestamp: deadlines are days, not moments. */
export type IsoDate = string
/** A moment, `YYYY-MM-DDTHH:MM:SS.sssZ`. */
export type IsoTime = string

/** A task's declared time box. Not an estimate — a hint at the shape of the work. */
export type Size = 'S' | 'M' | 'L'
export const SIZES: readonly Size[] = ['S', 'M', 'L'] as const
