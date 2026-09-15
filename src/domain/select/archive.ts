/**
 * The Archive (PRD §5.8, UC-2131).
 *
 * Goals that are over — finished, or given up on. There is deliberately no field here
 * distinguishing the two: UC-2130 requires that archiving an unfinished goal feel
 * identical to archiving a completed one, so the model cannot tell them apart either.
 * No completion percentage, no count of what was left, no "abandoned" marker.
 *
 * Same argument as DESIGN.md §2.1, applied to the place it matters most: a person is
 * most likely to feel judged here, so there is nothing here that could judge them.
 */
import type { Id, IsoTime } from '../primitives'
import type { State } from '../state'

export type ArchiveEntry = {
  goalId: Id
  title: string
  /** The lane it came from, or null when that lane no longer exists (UC-2132). */
  swimlane: { id: Id; name: string; color: string } | null
  archivedAt: IsoTime
  archivedLabel: string
}

export type ArchiveModel = {
  entries: ArchiveEntry[]
  /** Where a restore could put something whose original lane is gone. */
  swimlanes: { id: Id; name: string; color: string }[]
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-09-12T…" -> "12 Sep". A date and nothing else is all an archived goal carries. */
function archivedLabel(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return ''
  const month = MONTHS[Number(m[2]) - 1]
  return month === undefined ? '' : `${Number(m[3])} ${month}`
}

export function buildArchive(state: State): ArchiveModel {
  const entries = Object.values(state.goals)
    .filter((goal) => goal.archived)
    .sort(
      (a, b) => (b.archivedAt ?? '').localeCompare(a.archivedAt ?? '') || a.id.localeCompare(b.id),
    )
    .map((goal) => {
      const lane = state.swimlanes[goal.swimlaneId]
      return {
        goalId: goal.id,
        title: goal.title,
        swimlane: lane ? { id: lane.id, name: lane.name, color: lane.color } : null,
        archivedAt: goal.archivedAt ?? '',
        archivedLabel: archivedLabel(goal.archivedAt ?? ''),
      }
    })

  return {
    entries,
    swimlanes: Object.values(state.swimlanes)
      .sort((a, b) => a.order - b.order)
      .map((lane) => ({ id: lane.id, name: lane.name, color: lane.color })),
  }
}
