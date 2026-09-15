/**
 * Formatting lives in the domain, not in components: one spelling of a date across
 * every surface, and testable without a DOM.
 *
 * Deliberately not `toLocaleDateString` — its output varies by machine locale and
 * timezone, which would make the same state render differently on two computers and
 * make tests depend on where they run (DESIGN.md §9.5, hidden non-determinism).
 */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-12-01" -> "1 Dec". Returns null for anything that is not a plain ISO date. */
export function formatDeadline(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const month = MONTHS[Number(m[2]) - 1]
  if (!month) return null
  const day = Number(m[3])
  if (day < 1 || day > 31) return null
  return `${day} ${month}`
}
