/**
 * What a deletion would actually cost, worked out before it happens (UC-2105, UC-2106,
 * UC-2014).
 *
 * The counts live here rather than in the dialog because they are a fact about the
 * state, not about the presentation — and because a dialog that computes its own
 * warning can drift from what the mutation then does. The dialog renders what this
 * says; the reducer does what this describes.
 */
import type { Id } from '../primitives'
import type { State } from '../state'
import { childPlans, childTasks, descendants } from '../state'

export type RemovalKind = 'goal' | 'plan' | 'task' | 'swimlane'

export type Removal = {
  kind: RemovalKind
  id: Id
  title: string
  /** Plain-English account of what goes, or null when nothing else does. */
  cost: string | null
  /** Offered beside the destructive choice, never instead of it. */
  alternative: { kind: 'archive'; text: string } | { kind: 'promote-children'; text: string } | null
  /**
   * Whether anything is under it. Stated rather than inferred from the other fields,
   * because "is this empty" decides which choices exist at all — and inferring it from
   * a null `cost` is how an empty swimlane ended up with no way to delete it.
   */
  holdsAnything: boolean
  /** Where the contents could go instead. Only swimlane removal needs these. */
  swimlanes: { id: Id; name: string; color: string }[]
  looseTasks: number
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function buildRemoval(state: State, kind: RemovalKind, id: Id): Removal | null {
  const lanes = Object.values(state.swimlanes)
    .sort((a, b) => a.order - b.order)
    .map((lane) => ({ id: lane.id, name: lane.name, color: lane.color }))

  if (kind === 'task') {
    const task = state.tasks[id]
    if (!task) return null
    return {
      kind,
      id,
      title: task.title,
      cost: null,
      alternative: null,
      holdsAnything: false,
      swimlanes: [],
      looseTasks: 0,
    }
  }

  if (kind === 'goal') {
    const goal = state.goals[id]
    if (!goal) return null
    const below = descendants(state, { type: 'goal', id })
    const done = below.tasks.filter((t) => t.done).length
    const parts: string[] = []
    if (below.plans.length > 0) parts.push(count(below.plans.length, 'plan', 'plans'))
    if (below.tasks.length > 0) parts.push(count(below.tasks.length, 'task', 'tasks'))
    const cost =
      parts.length === 0
        ? null
        : `This also deletes ${parts.join(' and ')}` +
          (done > 0 ? `, including ${done} you've completed.` : '.')
    return {
      kind,
      id,
      title: goal.title,
      cost,
      // The destructive path always presents the non-destructive one (PRD §5.8) — but
      // only when there is one. Offering to archive something already archived would be
      // an escape hatch that goes nowhere.
      alternative: goal.archived
        ? null
        : {
            kind: 'archive',
            text: 'It leaves the board and keeps everything — the plans, the tasks, and whatever you finished. You can put it back.',
          },
      holdsAnything: below.plans.length + below.tasks.length > 0,
      swimlanes: [],
      looseTasks: 0,
    }
  }

  if (kind === 'plan') {
    const plan = state.plans[id]
    if (!plan) return null
    const here = { type: 'plan' as const, id }
    const kids = childTasks(state, here).length + childPlans(state, here).length
    const parentTitle =
      plan.parent.type === 'goal'
        ? (state.goals[plan.parent.id]?.title ?? 'its goal')
        : (state.plans[plan.parent.id]?.title ?? 'its plan')
    return {
      kind,
      id,
      title: plan.title,
      cost:
        kids === 0
          ? null
          : `Its ${count(kids, 'item', 'items')} move up to “${parentTitle}” and keep their sizes, stars and done state. Only the plan goes.`,
      alternative: null,
      holdsAnything: kids > 0,
      swimlanes: [],
      looseTasks: 0,
    }
  }

  const lane = state.swimlanes[id]
  if (!lane) return null
  const goals = Object.values(state.goals).filter((g) => g.swimlaneId === id && !g.archived)
  const loose = childTasks(state, { type: 'swimlane', id })
  const parts: string[] = []
  if (goals.length > 0) parts.push(count(goals.length, 'goal', 'goals'))
  if (loose.length > 0) parts.push(count(loose.length, 'loose task', 'loose tasks'))

  return {
    kind,
    id,
    title: lane.name,
    cost: parts.length === 0 ? null : `It holds ${parts.join(' and ')}. They have to go somewhere.`,
    alternative:
      goals.length + loose.length === 0
        ? null
        : {
            kind: 'archive',
            text: `Archive its ${count(goals.length, 'goal', 'goals')} whole${
              loose.length > 0
                ? `, and keep the ${count(loose.length, 'loose task', 'loose tasks')} as ideas in the Pile`
                : ''
            }. Nothing is destroyed.`,
          },
    holdsAnything: goals.length + loose.length > 0,
    swimlanes: lanes.filter((l) => l.id !== id),
    looseTasks: loose.length,
  }
}
