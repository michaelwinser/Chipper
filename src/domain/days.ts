/**
 * Calendar arithmetic, done with integers.
 *
 * No `Date` anywhere: it reads the machine timezone, which would make "three weeks
 * away" differ between two laptops and make every test depend on where it ran. Today
 * is passed in as a plain `YYYY-MM-DD` by whoever knows what day it is.
 */
import type { IsoDate } from './primitives'

/** Days since 1970-01-01, from a civil date. Howard Hinnant's algorithm. */
function daysFromCivil(y: number, m: number, d: number): number {
  const year = y - (m <= 2 ? 1 : 0)
  const era = Math.floor(year / 400)
  const yoe = year - era * 400
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

export function toDayNumber(iso: IsoDate): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return daysFromCivil(y, mo, d)
}

/** Positive when `date` is in the future. Null if either date is unreadable. */
export function daysUntil(today: IsoDate, date: IsoDate): number | null {
  const a = toDayNumber(today)
  const b = toDayNumber(date)
  return a === null || b === null ? null : b - a
}

/**
 * How far away, in words. Deliberately factual for dates that have passed — "was last
 * week", not "overdue" — because the app states what is true and leaves the judgement
 * to the person reading it (PRD §3).
 */
export function distanceLabel(days: number): string {
  if (days === 0) return 'today'
  if (days === 1) return 'tomorrow'
  if (days === -1) return 'was yesterday'
  if (days > 1 && days <= 7) return 'this week'
  if (days > 7 && days <= 14) return 'next week'
  if (days > 14) {
    const weeks = Math.round(days / 7)
    return `${weeks} weeks away`
  }
  const weeks = Math.round(-days / 7)
  if (weeks <= 1) return 'was last week'
  return `was ${weeks} weeks ago`
}
