import type { NoGuilt } from '../board'
/**
 * What a deletion would actually cost, worked out before it happens (UC-2105, UC-2106,
 * UC-2014).
 *
 * The counts live here rather than in the dialog because they are a fact about the
 * state, not about the presentation — and because a dialog that computes its own
 * warning can drift from what the mutation then does. The dialog renders what this
 * says; the reducer does what this describes.
 */
import { byCreation, type Id } from '../primitives'
import type { State } from '../state'
import { childPlans, childTasks, descendants, orderedSwimlanes } from '../state'

export type RemovalKind = 'goal' | 'plan' | 'task' | 'swimlane'

export type Removal = {
  kind: RemovalKind
  id: Id
  title: string
  /** Plain-English account of what goes, or null when nothing else does. */
  cost: string | null
  /** For a plan: what the second, destructive option would cost. Null when it is the same. */
  cascadeCost: string | null
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
  /** The loose tasks that would become pile items, by id — not merely how many. */
  looseTaskIds: Id[]
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export function buildRemoval(state: State, kind: RemovalKind, id: Id): Removal | null {
  const lanes = orderedSwimlanes(state).map((lane) => ({
    id: lane.id,
    name: lane.name,
    color: lane.color,
  }))

  if (kind === 'task') {
    const task = state.tasks[id]
    if (!task) return null
    return {
      kind,
      id,
      title: task.title,
      cost: null,
      cascadeCost: null,
      alternative: null,
      holdsAnything: false,
      swimlanes: [],
      looseTaskIds: [],
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
      cascadeCost: null,
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
      looseTaskIds: [],
    }
  }

  if (kind === 'plan') {
    const plan = state.plans[id]
    if (!plan) return null
    const here = { type: 'plan' as const, id }
    const kids = childTasks(state, here).length + childPlans(state, here).length
    // What the RED button would destroy, which is the whole subtree — not the direct
    // children the promote sentence talks about. Stating only the kind outcome above a
    // destructive one is how a dialog misleads while technically saying something true.
    const below = descendants(state, here)
    const doneBelow = below.tasks.filter((t) => t.done).length
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
      /** What the destructive option costs, stated separately from what the kind one does. */
      cascadeCost:
        below.plans.length + below.tasks.length === 0
          ? null
          : `Deleting its tasks too destroys ${count(below.tasks.length, 'task', 'tasks')}` +
            (below.plans.length > 0 ? ` and ${count(below.plans.length, 'plan', 'plans')}` : '') +
            (doneBelow > 0 ? `, including ${doneBelow} you've completed` : '') +
            '. That cannot be undone.',
      alternative: null,
      holdsAnything: kids > 0,
      swimlanes: [],
      looseTaskIds: [],
    }
  }

  const lane = state.swimlanes[id]
  if (!lane) return null
  const goals = Object.values(state.goals).filter((g) => g.swimlaneId === id && !g.archived)
  // Sorted, because this list decides which task gets which new pile id: leaving it in
  // record order made the same logical state produce different results on two machines.
  const loose = childTasks(state, { type: 'swimlane', id }).sort(byCreation)
  const finished = loose.filter((t) => t.done)
  const keeping = loose.filter((t) => !t.done)
  const parts: string[] = []
  if (goals.length > 0) parts.push(count(goals.length, 'goal', 'goals'))
  if (loose.length > 0) parts.push(count(loose.length, 'loose task', 'loose tasks'))

  return {
    kind,
    id,
    title: lane.name,
    cost: parts.length === 0 ? null : `It holds ${parts.join(' and ')}. They have to go somewhere.`,
    cascadeCost: null,
    alternative:
      goals.length + loose.length === 0
        ? null
        : {
            kind: 'archive',
            // Exactly what survives and what does not. The old copy said "Nothing is
            // destroyed" while the same path was converting finished tasks into open
            // ideas — the one sentence a person reads before agreeing to it.
            text:
              `Archive its ${count(goals.length, 'goal', 'goals')} whole` +
              (keeping.length > 0
                ? `, and keep the ${count(keeping.length, 'loose task', 'loose tasks')} as ideas in the Pile`
                : '') +
              '. ' +
              (finished.length > 0
                ? `The ${count(finished.length, 'task', 'tasks')} you have already finished ${finished.length === 1 ? 'is' : 'are'} destroyed — the Pile holds ideas, and an idea cannot be done.`
                : 'Nothing is destroyed.'),
          },
    holdsAnything: goals.length + loose.length > 0,
    swimlanes: lanes.filter((l) => l.id !== id),
    // Only the unfinished ones need a new pile id; the finished ones are not going there.
    looseTaskIds: keeping.map((t) => t.id),
  }
}

/* ------------------------------------------------------------------------- *
 * Structural guarantee (DESIGN.md §2.1, §9.5)
 *
 * A removal dialog states what a delete DESTROYS, which is legitimate (UC-2105). What it
 * must not state is what the user failed to finish.
 * ------------------------------------------------------------------------- */
export const _noGuiltRemoval: [NoGuilt<Removal>] = [true]
