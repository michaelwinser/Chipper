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

/**
 * A byte count as a person reads it: "15 bytes" · "4 KB" · "1.2 MB".
 *
 * Here rather than in the selector that uses it, because this is where formatting lives —
 * "one spelling across every surface, and testable without a DOM". It was in
 * `select/blocked.ts`, which meant the only test for it ran in a happy-dom file for a
 * function that needs no DOM.
 *
 * UTF-8 length, not `String.length`: the number is shown to someone deciding whether their
 * work is recoverable, and "15 bytes" for a 15-character string containing an emoji would
 * be wrong. The MB tier exists because the format is designed to fit under localStorage's
 * ~5 MB ceiling, so a document at the ceiling rendered as "4883 KB" — a number nobody
 * reads as five megabytes.
 */
export function formatBytes(raw: string): string {
  const bytes = new TextEncoder().encode(raw).length
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`
  return `${bytes} ${bytes === 1 ? 'byte' : 'bytes'}`
}
