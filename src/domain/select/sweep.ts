import type { NoGuilt } from '../board'
/**
 * Setting new priorities (UC-3030, UC-3040, UC-3050).
 *
 * This is the only surface in the app that raises a date on its own (PRD §8.2). Setting
 * priorities is the moment you have ASKED to think ahead, so looking forward here is
 * help; doing it anywhere else would be nagging.
 *
 * What this model deliberately cannot express: how long anything has been starred, how
 * many times something has been kept, how much of the last set was finished. The sweep
 * is a fresh choice, not a report card.
 */
import { daysUntil, distanceLabel } from '../days'
import { formatDeadline } from '../format'
import { byCreation, compareText, type Id, type IsoDate } from '../primitives'
import type { Goal, Plan, Ref, State, Task } from '../state'
import { childTasks, goalsInSwimlane, orderedSwimlanes, owningGoal, progressOf } from '../state'

/** Something dated that has not happened yet, or has just gone by. */
export type Upcoming = {
  ref: Ref
  title: string
  swimlane: { name: string; color: string } | null
  /** "30 Nov" */
  date: string
  /** "11 weeks away", "this week", "was last week" — factual, never a scolding. */
  distance: string
  /** Negative once the date has passed. Whoever renders it decides how much to say. */
  days: number
  /** "3 tasks left", or null when there is nothing open under it. */
  left: string | null
  starred: boolean
}

/** Something currently starred, offered to be kept or let go. */
export type Current = {
  ref: Ref
  title: string
  /** "Work · goal", "Family · Plan the December trip" */
  context: string
}

/** A place to find something to add. */
export type BrowseLane = {
  id: Id
  name: string
  color: string
  items: { ref: Ref; title: string; detail: string; indent: number; starred: boolean }[]
}

export type SweepModel = {
  current: Current[]
  comingUp: Upcoming[]
  browse: BrowseLane[]
}

const key = (ref: Ref) => `${ref.type}:${ref.id}`

function openUnder(state: State, ref: Ref): number {
  if (ref.type === 'task') return state.tasks[ref.id]?.done === false ? 1 : 0
  const progress = progressOf(state, { type: ref.type, id: ref.id })
  return progress.total - progress.done
}

function leftLabel(n: number): string | null {
  if (n === 0) return null
  return n === 1 ? '1 task left' : `${n} tasks left`
}

function swimlaneOfRef(state: State, ref: Ref): Goal | null {
  if (ref.type === 'goal') return state.goals[ref.id] ?? null
  if (ref.type === 'plan') {
    const plan = state.plans[ref.id]
    return plan ? owner(state, plan) : null
  }
  const task = state.tasks[ref.id]
  if (!task) return null
  if (task.parent.type === 'goal') return state.goals[task.parent.id] ?? null
  if (task.parent.type === 'plan') {
    const plan = state.plans[task.parent.id]
    return plan ? owner(state, plan) : null
  }
  return null
}

/** Cycle-safe: a cyclic document must render one broken goal, not hang the whole app. */
function owner(state: State, plan: Plan, seen: Set<string> = new Set()): Goal | null {
  if (seen.has(plan.id)) return null
  seen.add(plan.id)
  if (plan.parent.type === 'goal') return state.goals[plan.parent.id] ?? null
  if (plan.parent.type === 'plan') {
    const up = state.plans[plan.parent.id]
    return up ? owner(state, up, seen) : null
  }
  return null
}

function contextOf(state: State, ref: Ref): string {
  const goal = swimlaneOfRef(state, ref)
  const lane = goal ? state.swimlanes[goal.swimlaneId] : null
  if (ref.type === 'goal') return `${lane?.name ?? 'somewhere'} · goal`
  if (goal) return `${lane?.name ?? 'somewhere'} · ${goal.title}`
  // A loose task: its lane is its whole context.
  const task = state.tasks[ref.id]
  const looseLane = task?.parent.type === 'swimlane' ? state.swimlanes[task.parent.id] : null
  return `${looseLane?.name ?? 'somewhere'} · task`
}

/** Everything dated and still open, nearest first — dates already passed included. */
function upcoming(state: State, today: IsoDate, starred: Set<string>): Upcoming[] {
  const dated: { ref: Ref; title: string; deadline: IsoDate }[] = []

  for (const goal of Object.values(state.goals)) {
    if (goal.archived || goal.deadline === null) continue
    dated.push({ ref: { type: 'goal', id: goal.id }, title: goal.title, deadline: goal.deadline })
  }
  // Archived is a property of the whole SUBTREE, not of the goal ref alone — the same
  // half-implementation invariant 7 had. Filtering only goals here put plans and tasks
  // inside archived goals into "Coming up", each with a star button; the reducer then
  // refused the star, and `setPriorities` refuses the ENTIRE set on one bad ref, so a
  // click on that button discarded every keep and drop the user had just made. It is
  // also how documents that M8 cannot open came to exist in the first place.
  for (const plan of Object.values(state.plans)) {
    if (plan.deadline === null) continue
    if (owningGoal(state, plan.parent)?.archived === true) continue
    dated.push({ ref: { type: 'plan', id: plan.id }, title: plan.title, deadline: plan.deadline })
  }
  for (const task of Object.values(state.tasks)) {
    if (task.deadline === null || task.done) continue
    if (owningGoal(state, task.parent)?.archived === true) continue
    dated.push({ ref: { type: 'task', id: task.id }, title: task.title, deadline: task.deadline })
  }

  return (
    dated
      .flatMap((item) => {
        const days = daysUntil(today, item.deadline)
        const date = formatDeadline(item.deadline)
        if (days === null || date === null) return []
        // Nothing finished is worth raising: a goal with nothing open is not "coming up".
        const open = openUnder(state, item.ref)
        if (item.ref.type !== 'task' && open === 0) return []
        const goal = swimlaneOfRef(state, item.ref)
        const lane = goal ? state.swimlanes[goal.swimlaneId] : null
        return [
          {
            ref: item.ref,
            title: item.title,
            swimlane: lane ? { name: lane.name, color: lane.color } : null,
            date,
            distance: distanceLabel(days),
            days,
            left: leftLabel(open),
            starred: starred.has(key(item.ref)),
          },
        ]
      })
      // Total: without a tiebreak, two same-day items with the same title fall back to
      // record order, which is insertion history rather than state. The tiebreak is
      // `key(ref)`, not `ref.id` — this list mixes goals, plans and tasks, so an id alone
      // is not an identity here, and the reducer only enforces id uniqueness WITHIN a
      // collection (plus the pile). Two different things sharing an id is constructible.
      .sort(
        (a, b) =>
          a.days - b.days || compareText(a.title, b.title) || compareText(key(a.ref), key(b.ref)),
      )
  )
}

export function buildSweep(state: State, today: IsoDate): SweepModel {
  const starred = new Set(state.priorities.map(key))

  const current: Current[] = state.priorities.flatMap((ref) => {
    const title =
      ref.type === 'goal'
        ? state.goals[ref.id]?.title
        : ref.type === 'plan'
          ? state.plans[ref.id]?.title
          : state.tasks[ref.id]?.title
    return title === undefined ? [] : [{ ref, title, context: contextOf(state, ref) }]
  })

  const browse: BrowseLane[] = orderedSwimlanes(state).map((lane) => {
    const items: BrowseLane['items'] = []
    for (const goal of goalsInSwimlane(state, lane.id).sort(byCreation)) {
      const progress = progressOf(state, { type: 'goal', id: goal.id })
      const date = goal.deadline === null ? null : formatDeadline(goal.deadline)
      items.push({
        ref: { type: 'goal', id: goal.id },
        title: goal.title,
        detail: [
          'goal',
          `${progress.done} of ${progress.total} done`,
          ...(date === null ? [] : [date]),
        ].join(' · '),
        indent: 0,
        starred: starred.has(`goal:${goal.id}`),
      })
      for (const task of childTasks(state, { type: 'goal', id: goal.id })
        .filter((t) => !t.done)
        .sort(byCreation)) {
        items.push({
          ref: { type: 'task', id: task.id },
          title: task.title,
          detail: ['task', ...(task.size === null ? [] : [task.size])].join(' · '),
          indent: 1,
          starred: starred.has(`task:${task.id}`),
        })
      }
    }
    for (const task of childTasks(state, { type: 'swimlane', id: lane.id })
      .filter((t) => !t.done)
      .sort(byCreation)) {
      items.push({
        ref: { type: 'task', id: task.id },
        title: task.title,
        detail: ['loose task', ...(task.size === null ? [] : [task.size])].join(' · '),
        indent: 0,
        starred: starred.has(`task:${task.id}`),
      })
    }
    return { id: lane.id, name: lane.name, color: lane.color, items }
  })

  return { current, comingUp: upcoming(state, today, starred), browse }
}

export type { Task, Goal, Plan }

/* ------------------------------------------------------------------------- *
 * Structural guarantee (DESIGN.md §2.1, §9.5)
 *
 * The file header says what this model "deliberately cannot express": how long anything
 * has been starred, how many times something has been kept, how much of the last set was
 * finished. That was prose. This is the compile error.
 * ------------------------------------------------------------------------- */
export const _noGuiltSweepModel: [NoGuilt<SweepModel>] = [true]
