/**
 * The Pile view model (PRD §5.5).
 *
 * Ideas, somedays and not-nows. Nothing in here is a commitment and nothing in here is
 * late — so this model has no notion of age, staleness, or how long something has sat
 * there, and there is nowhere for one to be added.
 */
import type { Id, IsoTime } from '../primitives'
import type { State } from '../state'
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
    (a, b) => b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id),
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
    swimlanes: Object.values(state.swimlanes)
      .sort((a, b) => a.order - b.order)
      .map((lane) => ({ id: lane.id, name: lane.name, color: lane.color })),
  }
}
