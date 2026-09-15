/**
 * The only place that knows the time or invents an id (DESIGN.md §7).
 *
 * Injecting both is what makes every command deterministic under test, and it is why
 * the domain can stay pure: mutations carry their timestamp and their ids as data.
 */
import type { Store } from '../store/port'

export type Deps = {
  store: Store
  now: () => string
  newId: () => string
}

export const systemClock = (): string => new Date().toISOString()

/**
 * crypto.randomUUID is built into every target browser and into Node, so ids cost no
 * dependency and no hand-rolled code. The trade is that they are not lexically
 * sortable — ordering comes from createdAt and explicit order fields, never from an id.
 */
export const randomId = (): string => crypto.randomUUID()
