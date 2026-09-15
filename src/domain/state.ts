/**
 * The persisted state (DESIGN.md §3).
 *
 * Normalized and flat, with parent pointers — not a tree. A tree is the one shape
 * that would have to be rewritten for Firestore; this one becomes five collections
 * with the parent pointer already in place.
 */
import { compareText, type Id, type IsoDate, type IsoTime, type Size } from './primitives'

/** What a Goal, Plan or Task can hang from. */
export type Parent =
  { type: 'swimlane'; id: Id } | { type: 'goal'; id: Id } | { type: 'plan'; id: Id }

/** A pointer to something that can be starred. */
export type Ref = { type: 'goal' | 'plan' | 'task'; id: Id }

/** A pointer to anything addressable, including swimlanes. */
export type EntityRef = { type: 'swimlane' | 'goal' | 'plan' | 'task'; id: Id }

export type Swimlane = {
  id: Id
  name: string
  color: string
  order: number
  createdAt: IsoTime
  updatedAt: IsoTime
}

export type Goal = {
  id: Id
  swimlaneId: Id
  title: string
  notes: string
  deadline: IsoDate | null
  archived: boolean
  archivedAt: IsoTime | null
  createdAt: IsoTime
  updatedAt: IsoTime
}

export type Plan = {
  id: Id
  parent: Parent
  title: string
  notes: string
  deadline: IsoDate | null
  createdAt: IsoTime
  updatedAt: IsoTime
}

export type Task = {
  id: Id
  parent: Parent
  title: string
  notes: string
  size: Size | null
  deadline: IsoDate | null
  done: boolean
  doneAt: IsoTime | null
  createdAt: IsoTime
  updatedAt: IsoTime
}

export type PileItem = {
  id: Id
  text: string
  tags: string[]
  createdAt: IsoTime
}

export type State = {
  schemaVersion: number
  swimlanes: Record<Id, Swimlane>
  goals: Record<Id, Goal>
  plans: Record<Id, Plan>
  tasks: Record<Id, Task>
  pile: Record<Id, PileItem>
  /** The current set, in the order they were starred. Cleared wholesale by the sweep. */
  priorities: Ref[]
}

/**
 * The document format.
 *
 * Bumped to 2 at M8. The SHAPE is identical to 1 — no field was added, removed or
 * retyped — but the set of documents considered valid at version 1 shrank when invariant
 * 7 started being enforced over an archived goal's whole subtree rather than just the
 * goal ref. A document M7 wrote and called clean can be one M8 refuses to open, and a
 * refusal here is the blocked screen rather than a warning. The version is what lets the
 * chain repair those documents instead of rejecting them; see `migrations.ts`.
 */
export const SCHEMA_VERSION = 2

export function emptyState(): State {
  return {
    schemaVersion: SCHEMA_VERSION,
    swimlanes: {},
    goals: {},
    plans: {},
    tasks: {},
    pile: {},
    priorities: [],
  }
}

/* --- lookups ------------------------------------------------------------- */

export function childPlans(state: State, parent: Parent): Plan[] {
  return Object.values(state.plans).filter(
    (p) => p.parent.type === parent.type && p.parent.id === parent.id,
  )
}

export function childTasks(state: State, parent: Parent): Task[] {
  return Object.values(state.tasks).filter(
    (t) => t.parent.type === parent.type && t.parent.id === parent.id,
  )
}

export function goalsInSwimlane(state: State, swimlaneId: Id): Goal[] {
  return Object.values(state.goals).filter((g) => g.swimlaneId === swimlaneId && !g.archived)
}

export function orderedSwimlanes(state: State): Swimlane[] {
  return Object.values(state.swimlanes).sort(
    (a, b) => a.order - b.order || compareText(a.createdAt, b.createdAt) || compareText(a.id, b.id),
  )
}

/**
 * Whether anything sits directly under something.
 *
 * One predicate, two callers. `reduce` asks it to refuse sending a thing with contents to
 * the Pile; `buildBoard` asks it so the card can say `holdsAnything` instead of inferring
 * emptiness from `rows.length === 0` — a view artefact that is also true of a title-only
 * card and of a goal whose tasks are all done. Those were two implementations of the same
 * question, which is how a button comes to appear exactly where the reducer will refuse it.
 */
export function hasChildren(state: State, ref: { type: EntityRef['type']; id: Id }): boolean {
  if (ref.type === 'swimlane') {
    return (
      Object.values(state.goals).some((g) => g.swimlaneId === ref.id) ||
      childTasks(state, { type: 'swimlane', id: ref.id }).length > 0 ||
      childPlans(state, { type: 'swimlane', id: ref.id }).length > 0
    )
  }
  // A task is a leaf by definition: nothing in the model can name one as its parent.
  if (ref.type === 'task') return false
  const parent: Parent = { type: ref.type, id: ref.id }
  return childPlans(state, parent).length > 0 || childTasks(state, parent).length > 0
}

/**
 * Every Plan and Task beneath something, at any depth.
 *
 * Cycle-safe. A cycle should be impossible — the reducer refuses to create one and
 * `checkInvariants` reports one — but an imported file or an older bug can still produce
 * it, and walking into a cycle here took the whole app down rather than showing one
 * broken goal.
 *
 * The visited set is NOT a parameter. It was, briefly, on four exported functions at
 * once: a caller could pass one, a caller who reused one across two calls got "there is
 * nothing here" back instead of the truth, silently and indistinguishably from the real
 * answer. Keeping the recursion private makes that unwriteable rather than documented.
 */
export function descendants(state: State, parent: Parent): { plans: Plan[]; tasks: Task[] } {
  return walkDown(state, parent, new Set())
}

function walkDown(
  state: State,
  parent: Parent,
  seen: Set<string>,
): { plans: Plan[]; tasks: Task[] } {
  const key = `${parent.type}:${parent.id}`
  if (seen.has(key)) return { plans: [], tasks: [] }
  seen.add(key)

  const plans: Plan[] = []
  const tasks: Task[] = [...childTasks(state, parent)]
  for (const plan of childPlans(state, parent)) {
    plans.push(plan)
    const below = walkDown(state, { type: 'plan', id: plan.id }, seen)
    plans.push(...below.plans)
    tasks.push(...below.tasks)
  }
  return { plans, tasks }
}

/** Progress as an honest count, never a falsely precise percentage (PRD §5.2). */
export function progressOf(state: State, parent: Parent): { done: number; total: number } {
  const { tasks } = descendants(state, parent)
  return { done: tasks.filter((t) => t.done).length, total: tasks.length }
}

/** Walks up to the Goal that frames something, if there is one. Cycle-safe, as above. */
export function owningGoal(state: State, parent: Parent): Goal | null {
  return walkUp(state, parent, new Set())
}

function walkUp(state: State, parent: Parent, seen: Set<string>): Goal | null {
  if (parent.type === 'swimlane') return null
  if (parent.type === 'goal') return state.goals[parent.id] ?? null
  if (seen.has(parent.id)) return null
  seen.add(parent.id)
  const plan = state.plans[parent.id]
  return plan ? walkUp(state, plan.parent, seen) : null
}
