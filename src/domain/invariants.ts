/**
 * The invariants from DESIGN.md §3.3, as a checkable function.
 *
 * Returns problems rather than throwing, so tests can assert on the whole list and
 * the import path can explain exactly what is wrong with a file rather than dying.
 */
import type { State } from './state'
import type { Parent } from './state'

export type Problem = { code: string; detail: string }

function parentMissing(state: State, parent: Parent): boolean {
  if (parent.type === 'swimlane') return !(parent.id in state.swimlanes)
  if (parent.type === 'goal') return !(parent.id in state.goals)
  return !(parent.id in state.plans)
}

export function checkInvariants(state: State): Problem[] {
  const problems: Problem[] = []
  const add = (code: string, detail: string) => problems.push({ code, detail })

  // 1 — every parent resolves, with one deliberate exception.
  //
  // An ARCHIVED goal may name a swimlane that no longer exists. The PRD's restore rule
  // requires it: "if that Swimlane is gone, restore asks which one" only means anything
  // if the state can hold that situation. The alternative — reassigning archived goals
  // to some other lane when theirs is deleted — would silently rewrite history for work
  // that is already over. So the reference is allowed to dangle, and restore resolves it.
  for (const goal of Object.values(state.goals)) {
    if (goal.archived) continue
    if (!(goal.swimlaneId in state.swimlanes)) {
      add('dangling-parent', `goal ${goal.id} points at missing swimlane ${goal.swimlaneId}`)
    }
  }
  for (const plan of Object.values(state.plans)) {
    if (parentMissing(state, plan.parent)) {
      add('dangling-parent', `plan ${plan.id} points at missing ${plan.parent.type}`)
    }
    // 3 — a plan belongs to a goal or another plan, never straight to a swimlane.
    if (plan.parent.type === 'swimlane') {
      add('bad-parent', `plan ${plan.id} hangs off a swimlane`)
    }
  }
  for (const task of Object.values(state.tasks)) {
    if (parentMissing(state, task.parent)) {
      add('dangling-parent', `task ${task.id} points at missing ${task.parent.type}`)
    }
    // A task that is not done cannot carry a completion time, and vice versa.
    if (task.done !== (task.doneAt !== null)) {
      add('done-mismatch', `task ${task.id} has done=${task.done} and doneAt=${task.doneAt}`)
    }
  }

  // 2 — no cycles in the plan chain.
  for (const plan of Object.values(state.plans)) {
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
  for (const ref of state.priorities) {
    const key = `${ref.type}:${ref.id}`
    if (seenRefs.has(key)) add('duplicate-priority', `${key} is starred twice`)
    seenRefs.add(key)

    const collection =
      ref.type === 'goal' ? state.goals : ref.type === 'plan' ? state.plans : state.tasks
    if (!(ref.id in collection)) add('dangling-priority', `${key} does not exist`)

    if (ref.type === 'task' && state.tasks[ref.id]?.done) {
      add('done-priority', `${key} is starred but already done`)
    }
    // 7 — nothing starred inside an archived goal.
    if (ref.type === 'goal' && state.goals[ref.id]?.archived) {
      add('archived-priority', `${key} is starred but archived`)
    }
  }

  // 6 — a pile item is never also an entity.
  for (const id of Object.keys(state.pile)) {
    if (id in state.goals || id in state.plans || id in state.tasks) {
      add('pile-collision', `${id} is in the pile and also an entity`)
    }
  }

  return problems
}
