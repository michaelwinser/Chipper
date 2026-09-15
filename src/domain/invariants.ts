/**
 * The invariants from DESIGN.md §3.3, as a checkable function.
 *
 * Returns problems rather than throwing, so tests can assert on the whole list and
 * the import path can explain exactly what is wrong with a file rather than dying.
 */
import {
  owningGoal,
  type Goal,
  type Parent,
  type Plan,
  type Ref,
  type State,
  type Task,
} from './state'

/**
 * Every code this function can emit.
 *
 * Listed so the suite can assert it has provoked all of them. `checkInvariants` had ten
 * codes and nine hand-built cases, with nothing binding the two — a new code was
 * untested silently, which is the same failure `MUTATION_KINDS` exists to prevent one
 * layer down. The list is the contract; `Problem['code']` is derived from it so the two
 * cannot drift.
 */
export const PROBLEM_CODES = [
  'malformed',
  'dangling-parent',
  'bad-parent',
  'cycle',
  'done-mismatch',
  'duplicate-priority',
  'dangling-priority',
  'done-priority',
  'archived-priority',
  'archived-mismatch',
  'pile-collision',
] as const

export type ProblemCode = (typeof PROBLEM_CODES)[number]
export type Problem = { code: ProblemCode; detail: string }

function parentMissing(state: State, parent: Parent): boolean {
  const map =
    parent.type === 'swimlane'
      ? state.swimlanes
      : parent.type === 'goal'
        ? state.goals
        : state.plans
  return !isRecord(map) || !(parent.id in map)
}

/**
 * Shape guards. This function is the last thing standing between a corrupt document and
 * the app, and it promised not to throw while dereferencing whatever it was handed —
 * so a plausible-looking broken file took down `createLocalStore` itself rather than
 * being refused with a reason.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isParentish(value: unknown): value is Parent {
  return isRecord(value) && typeof value.type === 'string' && typeof value.id === 'string'
}

/** Same shape, different union: a Ref names a goal, plan or task — never a swimlane. */
function isRefish(value: unknown): value is Ref {
  return isRecord(value) && typeof value.type === 'string' && typeof value.id === 'string'
}

/** Entries that are not objects at all, reported once rather than crashed on. */
function wellFormed<T>(
  map: unknown,
  label: string,
  add: (code: ProblemCode, detail: string) => void,
): T[] {
  if (!isRecord(map)) {
    add('malformed', `${label} is not a collection`)
    return []
  }
  return Object.entries(map).flatMap(([id, entry]) => {
    if (!isRecord(entry)) {
      add('malformed', `${label}.${id} is not an object`)
      return []
    }
    return [entry as T]
  })
}

export function checkInvariants(state: State): Problem[] {
  const problems: Problem[] = []
  const add = (code: ProblemCode, detail: string) => problems.push({ code, detail })

  const goals = wellFormed<Goal>(state.goals, 'goals', add)
  const plans = wellFormed<Plan>(state.plans, 'plans', add)
  const tasks = wellFormed<Task>(state.tasks, 'tasks', add)
  const pileIds = isRecord(state.pile)
    ? Object.entries(state.pile).flatMap(([id, entry]) => {
        if (!isRecord(entry)) {
          add('malformed', `pile.${id} is not an object`)
          return []
        }
        return [id]
      })
    : []
  if (!isRecord(state.pile)) add('malformed', 'pile is not a collection')
  const priorities = Array.isArray(state.priorities) ? state.priorities : []
  if (!Array.isArray(state.priorities)) add('malformed', 'priorities is not a list')

  // 1 — every parent resolves, with one deliberate exception.
  //
  // An ARCHIVED goal may name a swimlane that no longer exists. The PRD's restore rule
  // requires it: "if that Swimlane is gone, restore asks which one" only means anything
  // if the state can hold that situation. The alternative — reassigning archived goals
  // to some other lane when theirs is deleted — would silently rewrite history for work
  // that is already over. So the reference is allowed to dangle, and restore resolves it.
  for (const goal of goals) {
    // A goal is archived exactly when it carries the time it was archived — the same
    // pairing `done`/`doneAt` has, and it was unchecked. `buildArchive` was papering over
    // the gap with `archivedAt ?? ''`, which sorts such a goal to the bottom of the
    // Archive under a blank date rather than reporting that the document is wrong.
    if (goal.archived !== (goal.archivedAt != null)) {
      add(
        'archived-mismatch',
        `goal ${String(goal.id)} has archived=${String(goal.archived)} and archivedAt=${String(goal.archivedAt)}`,
      )
    }
    if (goal.archived) continue
    if (typeof goal.swimlaneId !== 'string' || !isRecord(state.swimlanes)) {
      add('malformed', `goal ${String(goal.id)} has no swimlane`)
      continue
    }
    if (!(goal.swimlaneId in state.swimlanes)) {
      add('dangling-parent', `goal ${goal.id} points at missing swimlane ${goal.swimlaneId}`)
    }
  }
  for (const plan of plans) {
    if (!isParentish(plan.parent)) {
      add('malformed', `plan ${String(plan.id)} has no parent`)
      continue
    }
    if (parentMissing(state, plan.parent)) {
      add('dangling-parent', `plan ${plan.id} points at missing ${plan.parent.type}`)
    }
    // 3 — a plan belongs to a goal or another plan, never straight to a swimlane.
    if (plan.parent.type === 'swimlane') {
      add('bad-parent', `plan ${plan.id} hangs off a swimlane`)
    }
  }
  for (const task of tasks) {
    if (!isParentish(task.parent)) {
      add('malformed', `task ${String(task.id)} has no parent`)
      continue
    }
    if (parentMissing(state, task.parent)) {
      add('dangling-parent', `task ${task.id} points at missing ${task.parent.type}`)
    }
    // A task that is not done cannot carry a completion time, and vice versa.
    if (task.done !== (task.doneAt !== null)) {
      add('done-mismatch', `task ${task.id} has done=${task.done} and doneAt=${task.doneAt}`)
    }
  }

  // 2 — no cycles in the plan chain.
  for (const plan of plans) {
    if (!isParentish(plan.parent)) continue
    const seen = new Set<string>([plan.id])
    let cursor: Parent = plan.parent
    while (cursor.type === 'plan') {
      if (seen.has(cursor.id)) {
        add('cycle', `plan ${plan.id} is its own ancestor`)
        break
      }
      seen.add(cursor.id)
      const next = state.plans[cursor.id]
      if (!next) break
      cursor = next.parent
    }
  }

  // 5 — every priority resolves, is unique, and never points at done work.
  const seenRefs = new Set<string>()
  for (const ref of priorities) {
    if (!isRefish(ref)) {
      add('malformed', 'a priority is not a reference')
      continue
    }
    const key = `${ref.type}:${ref.id}`
    if (seenRefs.has(key)) add('duplicate-priority', `${key} is starred twice`)
    seenRefs.add(key)

    // `in` on a non-object throws, and this function's whole contract is that it does
    // not. The M8 guards covered the entity loops and missed these two: `{ goals: 42 }`
    // reached here and took down `createLocalStore` — the very path that is supposed to
    // refuse a corrupt document with a reason.
    const collection =
      ref.type === 'goal' ? state.goals : ref.type === 'plan' ? state.plans : state.tasks
    if (!isRecord(collection)) add('malformed', `${ref.type}s is not a collection`)
    else if (!(ref.id in collection)) add('dangling-priority', `${key} does not exist`)

    if (ref.type === 'task' && isRecord(state.tasks) && state.tasks[ref.id]?.done) {
      add('done-priority', `${key} is starred but already done`)
    }

    // 7 — nothing starred inside an archived goal's SUBTREE. Checking only goal-typed
    // refs left the documented half of this invariant unenforced: a starred plan or task
    // under an archived goal renders nowhere, cannot be cleared from the board, and was
    // invisible to this function.
    // Every dereference guarded. `owningGoal` walks `state.plans` and `state.goals`
    // itself, so a document where either is not a collection cannot be handed to it —
    // this function's contract is that a corrupt document comes back as problems.
    const maps = isRecord(state.goals) && isRecord(state.plans) && isRecord(state.tasks)
    const goal = !maps
      ? null
      : ref.type === 'goal'
        ? state.goals[ref.id]
        : ref.type === 'plan'
          ? owningGoal(state, { type: 'plan', id: ref.id })
          : (() => {
              const task = state.tasks[ref.id]
              return task && isParentish(task.parent) ? owningGoal(state, task.parent) : null
            })()
    if (goal?.archived === true) {
      add('archived-priority', `${key} is starred but sits inside archived goal ${goal.id}`)
    }
  }

  // 6 — a pile item is never also an entity.
  const entityMaps = [state.goals, state.plans, state.tasks].filter(isRecord)
  for (const id of pileIds) {
    if (entityMaps.some((map) => id in map)) {
      add('pile-collision', `${id} is in the pile and also an entity`)
    }
  }

  return problems
}
