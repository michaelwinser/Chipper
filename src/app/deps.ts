/**
 * The only place that knows the time or invents an id (DESIGN.md §7).
 *
 * Injecting both is what makes every command deterministic under test, and it is why
 * the domain can stay pure: mutations carry their timestamp and their ids as data.
 */
import type { Store } from '../store/port'

export type Deps = {
  store: Store
  /** A moment, in UTC. What goes into `createdAt`, `doneAt` and every mutation's `at`. */
  now: () => string
  /** The user's calendar day, `YYYY-MM-DD`. Not the UTC one — see `systemToday`. */
  today: () => string
  newId: () => string
}

export const systemClock = (): string => new Date().toISOString()

/**
 * What day it is WHERE THE USER IS.
 *
 * `domain/days.ts` goes to real lengths to avoid `Date` — "it reads the machine timezone,
 * which would make 'three weeks away' differ between two laptops" — and hands the question
 * of what today is to whoever knows. That caller answered `now().slice(0, 10)`, which is
 * the UTC date: for a user in California the sweep rolled over to tomorrow at 5pm, and for
 * one in Auckland it lagged half a day. Every "today", "tomorrow" and "was yesterday" on
 * the Set-priorities screen was wrong through those windows, and no test could catch it
 * because the tests inject the day.
 *
 * Local parts, assembled by hand rather than through `toLocaleDateString`, which would put
 * the host locale's formatting into a value the domain parses.
 */
export const systemToday = (): string => {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * crypto.randomUUID is built into every target browser and into Node, so ids cost no
 * dependency and no hand-rolled code. The trade is that they are not lexically
 * sortable — ordering comes from createdAt and explicit order fields, never from an id.
 */
export const randomId = (): string => crypto.randomUUID()
