/**
 * The persisted state (DESIGN.md §3).
 *
 * Normalized and flat, with parent pointers — not a tree. A tree is the one shape
 * that would have to be rewritten for Firestore; this one becomes five collections
 * with the parent pointer already in place.
 */
import type { Id, IsoDate, IsoTime, Size } from './primitives'

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

export const SCHEMA_VERSION = 1

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
    (a, b) => a.order - b.order || a.createdAt.localeCompare(b.createdAt),
  )
}

/** Every Plan and Task beneath something, at any depth. */
export function descendants(state: State, parent: Parent): { plans: Plan[]; tasks: Task[] } {
  const plans: Plan[] = []
  const tasks: Task[] = [...childTasks(state, parent)]
  for (const plan of childPlans(state, parent)) {
    plans.push(plan)
    const below = descendants(state, { type: 'plan', id: plan.id })
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

/** Walks up to the Goal that frames something, if there is one. */
export function owningGoal(state: State, parent: Parent): Goal | null {
  if (parent.type === 'swimlane') return null
  if (parent.type === 'goal') return state.goals[parent.id] ?? null
  const plan = state.plans[parent.id]
  return plan ? owningGoal(state, plan.parent) : null
}
