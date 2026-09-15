import type { NoGuilt } from '../board'
/**
 * The Pile view model (PRD §5.5).
 *
 * Ideas, somedays and not-nows. Nothing in here is a commitment and nothing in here is
 * late — so this model has no notion of age, staleness, or how long something has sat
 * there, and there is nowhere for one to be added.
 */
import { compareText, type Id, type IsoTime } from '../primitives'
import { orderedSwimlanes, type State } from '../state'
import { tagCounts } from '../tags'

export type PileEntry = {
  id: Id
  text: string
  tags: string[]
  createdAt: IsoTime
}

export type PileModel = {
  entries: PileEntry[]
  /** Every tag in use, most used first, plus the count of items carrying none. */
  tags: { tag: string; count: number }[]
  untagged: number
  total: number
  /** The tag currently filtering the list, if any. */
  filter: string | null
  /** Where a promoted item could go. Empty until there is somewhere to put it. */
  swimlanes: { id: Id; name: string; color: string }[]
}

export function buildPile(state: State, filter: string | null = null): PileModel {
  const all = Object.values(state.pile).sort(
    (a, b) => compareText(b.createdAt, a.createdAt) || compareText(a.id, b.id),
  )
  const entries = filter === null ? all : all.filter((item) => item.tags.includes(filter))

  return {
    entries: entries.map((item) => ({
      id: item.id,
      text: item.text,
      tags: item.tags,
      createdAt: item.createdAt,
    })),
    tags: tagCounts(all),
    untagged: all.filter((item) => item.tags.length === 0).length,
    total: all.length,
    filter,
    // orderedSwimlanes, not a local sort: duplicate `order` values are not forbidden by
    // any invariant, and a copy without its createdAt tiebreak falls back to record order.
    swimlanes: orderedSwimlanes(state).map((lane) => ({
      id: lane.id,
      name: lane.name,
      color: lane.color,
    })),
  }
}

/* ------------------------------------------------------------------------- *
 * Structural guarantee (DESIGN.md §2.1, §9.5)
 *
 * The Pile accumulates and nothing in it completes away on its own, which makes it the
 * other place a count of what you have not done would arrive naturally.
 * ------------------------------------------------------------------------- */
export const _noGuiltPileModel: [NoGuilt<PileModel>] = [true]
