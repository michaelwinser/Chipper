/**
 * The reducer: pure, total, synchronous (DESIGN.md §5.2).
 *
 * This is where the product's rules actually live. A rule stated in the PRD but
 * absent from here does not exist. The store adapters persist what this produces;
 * they never decide anything themselves, which is why the future server can share
 * this exact function rather than reimplementing it.
 *
 * Never mutates its input. Never reads a clock, an id source, or anything ambient.
 */
import { rule } from './errors'
import type { Mutation } from './mutations'
import { parseTags } from './tags'
import type { Id } from './primitives'
import type { EntityRef, Goal, Parent, Plan, Ref, State, Task } from './state'
import { childPlans, childTasks, descendants, hasChildren, owningGoal } from './state'

function parentExists(state: State, parent: Parent): boolean {
  if (parent.type === 'swimlane') return parent.id in state.swimlanes
  if (parent.type === 'goal') return parent.id in state.goals
  return parent.id in state.plans
}

function exists(state: State, ref: EntityRef): boolean {
  return ref.id in state[`${ref.type}s` as const]
}

const sameRef = (a: Ref, b: Ref): boolean => a.type === b.type && a.id === b.id

/**
 * The goal a ref sits under, archived or not. Starring anything inside an archived goal
 * puts a priority on work that renders nowhere and cannot be unstarred from the board —
 * invariant 7 forbids the whole subtree, not just the goal itself.
 */
/**
 * Whether an id is already taken anywhere in the document.
 *
 * Invariant 6 says a pile item is never also an entity, and `changeLevel` was the only
 * mutation that checked it — its own comment ("an id is unique across the document, not
 * merely within its own collection") described a rule one of five id-minting mutations
 * enforced. `capture`, `sendToPile`, `promotePileItem` and `deleteSwimlane`'s archive
 * branch could all produce the collision, and the three `create*` mutations never looked
 * at the pile at all. UUIDs make it improbable in the app; the reducer is the rule layer
 * and the same vocabulary is used by import and by a future server.
 */
function idTaken(state: State, id: Id): boolean {
  return (
    id in state.swimlanes ||
    id in state.goals ||
    id in state.plans ||
    id in state.tasks ||
    id in state.pile
  )
}

/**
 * The archived goal a prospective parent sits inside, if any.
 *
 * The route back IN, matching the routes back out that `changeLevel` and `sendToPile`
 * refuse. A plan or task created under an archived goal — or an idea promoted there —
 * lands where nothing renders it: not the board, which filters archived; not the Archive,
 * which lists goals; not the Pile, which it has left. It is gone until the goal is
 * restored, and no invariant reports it, because the document is perfectly consistent.
 */
function archivedParent(state: State, parent: Parent): Goal | null {
  if (parent.type === 'swimlane') return null
  return archivedOwnerOf(state, { type: parent.type, id: parent.id })
}

const ARCHIVED_PARENT = 'that goal is archived — restore it before putting anything inside it'

/** A record whose entries are fresh objects, so nothing is shared with the caller. */
function copyEach<T extends object>(map: Record<Id, T>): Record<Id, T> {
  return Object.fromEntries(Object.entries(map).map(([id, value]) => [id, { ...value }]))
}

function archivedOwnerOf(state: State, ref: Ref): Goal | null {
  const goal =
    ref.type === 'goal'
      ? state.goals[ref.id]
      : ref.type === 'plan'
        ? owningGoal(state, { type: 'plan', id: ref.id })
        : (() => {
            const task = state.tasks[ref.id]
            return task ? owningGoal(state, task.parent) : null
          })()
  return goal?.archived === true ? goal : null
}

/**
 * Removes entities and, in the same step, every star pointing at one of them. Doing it
 * here rather than at each call site is why no deletion can leave a dangling priority:
 * there is only one way to remove something (invariant 5).
 */
function dropAll(state: State, gone: { goals?: Id[]; plans?: Id[]; tasks?: Id[] }): State {
  const goals = { ...state.goals }
  const plans = { ...state.plans }
  const tasks = { ...state.tasks }
  for (const id of gone.goals ?? []) delete goals[id]
  for (const id of gone.plans ?? []) delete plans[id]
  for (const id of gone.tasks ?? []) delete tasks[id]

  return {
    ...state,
    goals,
    plans,
    tasks,
    priorities: state.priorities.filter((ref) =>
      ref.type === 'goal'
        ? ref.id in goals
        : ref.type === 'plan'
          ? ref.id in plans
          : ref.id in tasks,
    ),
  }
}

/** Walks up to the swimlane something ultimately sits in. Cycle-safe (see `descendants`). */
function swimlaneOf(state: State, parent: Parent): string | null {
  return laneOf(state, parent, new Set())
}

/** Private, so the visited set cannot be supplied or reused — see `state.ts`. */
function laneOf(state: State, parent: Parent, seen: Set<string>): string | null {
  if (parent.type === 'swimlane') return parent.id
  if (parent.type === 'goal') return state.goals[parent.id]?.swimlaneId ?? null
  if (seen.has(parent.id)) return null
  seen.add(parent.id)
  const plan = state.plans[parent.id]
  return plan ? laneOf(state, plan.parent, seen) : null
}

export function reduce(state: State, m: Mutation): State {
  switch (m.kind) {
    case 'createSwimlane': {
      rule(!idTaken(state, m.id), 'duplicate-id', `${m.id} already exists`)
      const order = Object.values(state.swimlanes).reduce((n, s) => Math.max(n, s.order + 1), 0)
      return {
        ...state,
        swimlanes: {
          ...state.swimlanes,
          [m.id]: {
            id: m.id,
            name: m.name,
            color: m.color,
            order,
            createdAt: m.at,
            updatedAt: m.at,
          },
        },
      }
    }

    case 'setSwimlaneColor': {
      const lane = state.swimlanes[m.id]
      rule(lane !== undefined, 'not-found', `no swimlane ${m.id}`)
      return {
        ...state,
        swimlanes: { ...state.swimlanes, [m.id]: { ...lane, color: m.color, updatedAt: m.at } },
      }
    }

    case 'reorderSwimlanes': {
      const known = Object.keys(state.swimlanes)
      rule(m.order.length === known.length, 'incomplete-order', 'order must list every swimlane')
      rule(new Set(m.order).size === m.order.length, 'duplicate-order', 'order has duplicates')
      rule(
        m.order.every((id) => id in state.swimlanes),
        'unknown-swimlane',
        'order names a swimlane that does not exist',
      )
      const swimlanes = { ...state.swimlanes }
      m.order.forEach((id, index) => {
        const lane = swimlanes[id]
        if (lane) swimlanes[id] = { ...lane, order: index, updatedAt: m.at }
      })
      return { ...state, swimlanes }
    }

    case 'createGoal': {
      rule(!idTaken(state, m.id), 'duplicate-id', `${m.id} already exists`)
      rule(m.swimlaneId in state.swimlanes, 'not-found', `no swimlane ${m.swimlaneId}`)
      return {
        ...state,
        goals: {
          ...state.goals,
          [m.id]: {
            id: m.id,
            swimlaneId: m.swimlaneId,
            title: m.title,
            notes: '',
            deadline: null,
            archived: false,
            archivedAt: null,
            createdAt: m.at,
            updatedAt: m.at,
          },
        },
      }
    }

    case 'createPlan': {
      rule(!idTaken(state, m.id), 'duplicate-id', `${m.id} already exists`)
      rule(parentExists(state, m.parent), 'not-found', 'plan parent does not exist')
      rule(m.parent.type !== 'swimlane', 'bad-parent', 'a plan belongs to a goal or another plan')
      rule(archivedParent(state, m.parent) === null, 'archived', ARCHIVED_PARENT)
      return {
        ...state,
        plans: {
          ...state.plans,
          [m.id]: {
            id: m.id,
            parent: m.parent,
            title: m.title,
            notes: '',
            deadline: null,
            createdAt: m.at,
            updatedAt: m.at,
          },
        },
      }
    }

    case 'createTask': {
      rule(!idTaken(state, m.id), 'duplicate-id', `${m.id} already exists`)
      rule(parentExists(state, m.parent), 'not-found', 'task parent does not exist')
      rule(archivedParent(state, m.parent) === null, 'archived', ARCHIVED_PARENT)
      return {
        ...state,
        tasks: {
          ...state.tasks,
          [m.id]: {
            id: m.id,
            parent: m.parent,
            title: m.title,
            notes: '',
            size: m.size,
            deadline: null,
            done: false,
            doneAt: null,
            createdAt: m.at,
            updatedAt: m.at,
          },
        },
      }
    }

    case 'renameEntity': {
      rule(exists(state, m.ref), 'not-found', `no ${m.ref.type} ${m.ref.id}`)
      const title = m.title.trim()
      rule(title.length > 0, 'empty-title', 'a name cannot be empty')
      if (m.ref.type === 'swimlane') {
        const lane = state.swimlanes[m.ref.id]!
        return {
          ...state,
          swimlanes: {
            ...state.swimlanes,
            [m.ref.id]: { ...lane, name: title, updatedAt: m.at },
          },
        }
      }
      const key = `${m.ref.type}s` as 'goals' | 'plans' | 'tasks'
      const collection = state[key]
      const entity = collection[m.ref.id]!
      return {
        ...state,
        [key]: { ...collection, [m.ref.id]: { ...entity, title, updatedAt: m.at } },
      }
    }

    case 'setNotes': {
      rule(exists(state, m.ref), 'not-found', `no ${m.ref.type} ${m.ref.id}`)
      rule(m.ref.type !== 'swimlane', 'unsupported', 'swimlanes do not carry notes')
      const key = `${m.ref.type}s` as 'goals' | 'plans' | 'tasks'
      const collection = state[key]
      const entity = collection[m.ref.id]!
      return {
        ...state,
        [key]: { ...collection, [m.ref.id]: { ...entity, notes: m.notes, updatedAt: m.at } },
      }
    }

    case 'setTaskSize': {
      const task = state.tasks[m.id]
      rule(task !== undefined, 'not-found', `no task ${m.id}`)
      return {
        ...state,
        tasks: { ...state.tasks, [m.id]: { ...task, size: m.size, updatedAt: m.at } },
      }
    }

    case 'setDeadline': {
      rule(exists(state, m.ref), 'not-found', `no ${m.ref.type} ${m.ref.id}`)
      rule(m.ref.type !== 'swimlane', 'unsupported', 'swimlanes do not carry deadlines')
      const key = `${m.ref.type}s` as 'goals' | 'plans' | 'tasks'
      const collection = state[key]
      const entity = collection[m.ref.id]!
      return {
        ...state,
        [key]: { ...collection, [m.ref.id]: { ...entity, deadline: m.deadline, updatedAt: m.at } },
      }
    }

    case 'setTaskDone': {
      const task = state.tasks[m.id]
      rule(task !== undefined, 'not-found', `no task ${m.id}`)
      // Finishing something takes its star with it: a priority is work you intend to
      // do, and done work is not that. Nothing is said about it — the star just goes.
      const priorities = m.done
        ? state.priorities.filter((ref) => !sameRef(ref, { type: 'task', id: m.id }))
        : state.priorities
      return {
        ...state,
        priorities,
        tasks: {
          ...state.tasks,
          [m.id]: { ...task, done: m.done, doneAt: m.done ? m.at : null, updatedAt: m.at },
        },
      }
    }

    case 'addPriority': {
      rule(exists(state, m.ref), 'not-found', `no ${m.ref.type} ${m.ref.id}`)
      rule(
        !(m.ref.type === 'task' && state.tasks[m.ref.id]?.done === true),
        'already-done',
        'that is already done',
      )
      rule(archivedOwnerOf(state, m.ref) === null, 'archived', 'that is archived')
      if (state.priorities.some((ref) => sameRef(ref, m.ref))) return state
      return { ...state, priorities: [...state.priorities, m.ref] }
    }

    case 'setPriorities': {
      for (const ref of m.refs) {
        rule(exists(state, ref), 'not-found', `no ${ref.type} ${ref.id}`)
        rule(
          !(ref.type === 'task' && state.tasks[ref.id]?.done === true),
          'already-done',
          'that is already done',
        )
        rule(archivedOwnerOf(state, ref) === null, 'archived', 'that is archived')
      }
      const seen = new Set<string>()
      const refs = m.refs.filter((ref) => {
        const k = `${ref.type}:${ref.id}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      return { ...state, priorities: refs }
    }

    case 'removePriority':
      return { ...state, priorities: state.priorities.filter((ref) => !sameRef(ref, m.ref)) }

    case 'deleteGoal': {
      rule(m.id in state.goals, 'not-found', `no goal ${m.id}`)
      const below = descendants(state, { type: 'goal', id: m.id })
      return dropAll(state, {
        goals: [m.id],
        plans: below.plans.map((p) => p.id),
        tasks: below.tasks.map((t) => t.id),
      })
    }

    case 'deletePlan': {
      const plan = state.plans[m.id]
      rule(plan !== undefined, 'not-found', `no plan ${m.id}`)
      const here: Parent = { type: 'plan', id: m.id }

      if (m.disposition === 'cascade') {
        const below = descendants(state, here)
        return dropAll(state, {
          plans: [m.id, ...below.plans.map((p) => p.id)],
          tasks: below.tasks.map((t) => t.id),
        })
      }

      // The kind default: breaking down is reversible, so un-breaking-down keeps the
      // work. Direct children move up one level; anything deeper stays where it is.
      const plans = { ...state.plans }
      const tasks = { ...state.tasks }
      for (const child of childPlans(state, here)) {
        plans[child.id] = { ...child, parent: plan.parent, updatedAt: m.at }
      }
      for (const child of childTasks(state, here)) {
        tasks[child.id] = { ...child, parent: plan.parent, updatedAt: m.at }
      }
      delete plans[m.id]
      return dropAll({ ...state, plans, tasks }, { plans: [], tasks: [] })
    }

    case 'deleteTask': {
      rule(m.id in state.tasks, 'not-found', `no task ${m.id}`)
      return dropAll(state, { tasks: [m.id] })
    }

    case 'deleteSwimlane': {
      rule(m.id in state.swimlanes, 'not-found', `no swimlane ${m.id}`)
      const here: Parent = { type: 'swimlane', id: m.id }
      const goals = Object.values(state.goals).filter((g) => g.swimlaneId === m.id)
      const liveGoals = goals.filter((g) => !g.archived)
      const loose = childTasks(state, here)

      if (m.disposition.kind === 'move') {
        const to = m.disposition.toSwimlaneId
        rule(to in state.swimlanes, 'not-found', `no swimlane ${to}`)
        rule(to !== m.id, 'same-swimlane', 'that is the swimlane being deleted')
        // Archived goals keep pointing at the lane they came from, dangling, exactly as
        // PRD §10 requires: reassigning them would rewrite history for work already over.
        // Restore is where that reference gets resolved, by asking.
        const moved = { ...state.goals }
        for (const goal of goals) {
          if (goal.archived) continue
          moved[goal.id] = { ...goal, swimlaneId: to, updatedAt: m.at }
        }
        const movedTasks = { ...state.tasks }
        for (const task of loose) {
          movedTasks[task.id] = { ...task, parent: { type: 'swimlane', id: to }, updatedAt: m.at }
        }
        const swimlanes = { ...state.swimlanes }
        delete swimlanes[m.id]
        return { ...state, swimlanes, goals: moved, tasks: movedTasks }
      }

      // Archive the goals whole, and turn the UNFINISHED loose tasks into pile items,
      // which loses only their size.
      //
      // Finished ones are destroyed instead, and the dialog says so. The Pile holds
      // ideas, and an idea has no notion of being done — routing completed work through
      // it (as this did, for every loose task, silently) dropped `done`, `doneAt`,
      // `deadline` and `notes` and put finished work back in the backlog as something
      // still to do. PRD §5.5: "done items belong to structure, not to the backlog";
      // DESIGN §3.2: "Done tasks stay in place; they are never moved or archived." When
      // the structure itself is going, the only honest options are destroy it or refuse
      // the delete — and `buildRemoval` states the count so the choice is the user's.
      const ids = m.disposition.pileIds
      const keeping = loose.filter((t) => !t.done)
      for (const task of keeping) {
        const pileId = ids[task.id]
        rule(pileId !== undefined, 'wrong-ids', `no new id given for task ${task.id}`)
        rule(!idTaken(state, pileId), 'duplicate-id', `${pileId} already exists`)
      }
      rule(
        new Set(Object.values(ids)).size === Object.keys(ids).length,
        'duplicate-id',
        'the same new id was given to two tasks',
      )

      let next = state
      for (const goal of liveGoals)
        next = reduce(next, { kind: 'archiveGoal', id: goal.id, at: m.at })
      const pile = { ...next.pile }
      for (const task of keeping) {
        const id = ids[task.id]!
        pile[id] = { id, text: task.title, tags: [], createdAt: m.at }
      }
      const tasks = { ...next.tasks }
      for (const task of loose) delete tasks[task.id]
      const swimlanes = { ...next.swimlanes }
      delete swimlanes[m.id]
      return {
        ...next,
        swimlanes,
        tasks,
        pile,
        priorities: next.priorities.filter(
          (ref) => !(ref.type === 'task' && loose.some((t) => t.id === ref.id)),
        ),
      }
    }

    case 'archiveGoal': {
      const goal = state.goals[m.id]
      rule(goal !== undefined, 'not-found', `no goal ${m.id}`)
      if (goal.archived) return state

      // Nothing starred may point into something off the board (invariant 7).
      const below = descendants(state, { type: 'goal', id: m.id })
      const gone = new Set<string>([
        `goal:${m.id}`,
        ...below.plans.map((p) => `plan:${p.id}`),
        ...below.tasks.map((t) => `task:${t.id}`),
      ])
      return {
        ...state,
        goals: {
          ...state.goals,
          [m.id]: { ...goal, archived: true, archivedAt: m.at, updatedAt: m.at },
        },
        priorities: state.priorities.filter((ref) => !gone.has(`${ref.type}:${ref.id}`)),
      }
    }

    case 'restoreGoal': {
      const goal = state.goals[m.id]
      rule(goal !== undefined, 'not-found', `no goal ${m.id}`)
      rule(goal.archived, 'not-archived', 'that goal is not archived')
      // Its lane may be gone, in which case the caller has to say where it goes.
      const lane = m.swimlaneId ?? goal.swimlaneId
      rule(lane in state.swimlanes, 'no-swimlane', 'that swimlane no longer exists')
      return {
        ...state,
        goals: {
          ...state.goals,
          [m.id]: {
            ...goal,
            archived: false,
            archivedAt: null,
            swimlaneId: lane,
            updatedAt: m.at,
          },
        },
      }
    }

    case 'changeLevel': {
      rule(exists(state, m.ref), 'not-found', `no ${m.ref.type} ${m.ref.id}`)
      rule(m.ref.type !== m.to, 'no-change', `that is already a ${m.to}`)
      // An id is unique across the document, not merely within its own collection: the
      // board keys rows by id, and the pile must never collide with an entity. `idTaken`
      // is that question, asked by every mutation that mints one.
      rule(!idTaken(state, m.newId), 'duplicate-id', `${m.newId} already exists`)
      // Archived work comes back through restore, which asks which lane. Climbing the
      // ladder must not be a side door onto the board.
      //
      // This checked `ref.type === 'goal'` only, which meant a PLAN or TASK inside an
      // archived goal could climb out: `changeLevel(plan → goal)` produced a live goal on
      // the board carrying every child task with it, silently emptying the archived goal
      // that held them. `archivedOwnerOf` is the same question invariant 7 asks, and was
      // already being used two rules over by `addPriority` — it just was not asked here.
      rule(
        archivedOwnerOf(state, m.ref) === null,
        'archived',
        'restore it first — the ladder is not a way back out of the archive',
      )
      // A finished task has a completion to lose; nothing on the ladder can carry it.
      rule(
        !(m.ref.type === 'task' && state.tasks[m.ref.id]?.done === true),
        'already-done',
        'that is already done',
      )

      const fromKey = `${m.ref.type}s` as 'goals' | 'plans' | 'tasks'
      const source = state[fromKey][m.ref.id]!
      // Only a goal or a plan can hold anything, so only they can have children to move.
      const here: Parent | null = m.ref.type === 'task' ? null : { type: m.ref.type, id: m.ref.id }
      const kids = {
        plans: here === null ? [] : childPlans(state, here),
        tasks: here === null ? [] : childTasks(state, here),
      }

      // A task holds nothing, so anything with children cannot become one.
      rule(
        m.to !== 'task' || kids.plans.length + kids.tasks.length === 0,
        'has-children',
        'a task holds nothing — this still has things under it',
      )

      // A thing cannot be moved inside itself. Without this the reducer accepts a goal
      // demoted under its own child, producing two plans that are each other's ancestor:
      // the subtree becomes unreachable, and every later delete recurses forever. Found
      // by the generator at M8, once it could emit changeLevel at all.
      if (m.parent !== undefined && here !== null) {
        const below = descendants(state, here)
        const inside = new Set<string>([
          `${m.ref.type}:${m.ref.id}`,
          ...below.plans.map((p) => `plan:${p.id}`),
          ...below.tasks.map((x) => `task:${x.id}`),
        ])
        rule(
          !inside.has(`${m.parent.type}:${m.parent.id}`),
          'cycle',
          'that would put this inside itself',
        )
      }

      // ...and the destination is bound by the same rule as the source. Demoting a
      // starred item under an archived goal was accepted, and produced a document that
      // breaks invariant 7 — which the loader enforces. Nothing failed at the time: the
      // development-only check is off in production and the store does not roll back, so
      // the user's NEXT session opened on the blocked screen, from one ordinary click.
      if (m.parent !== undefined && m.parent.type !== 'swimlane') {
        const destination = archivedOwnerOf(state, { type: m.parent.type, id: m.parent.id })
        rule(
          destination === null,
          'archived',
          'that goal is archived — restore it before putting anything inside it',
        )
      }

      // Where does the new thing live? Only ask when it cannot be worked out.
      const currentParent: Parent =
        m.ref.type === 'goal'
          ? { type: 'swimlane', id: (source as Goal).swimlaneId }
          : (source as Plan | Task).parent
      let parent: Parent
      if (m.to === 'goal') {
        // A goal lives in a swimlane: the one it is already inside.
        const lane = m.parent?.type === 'swimlane' ? m.parent.id : swimlaneOf(state, currentParent)
        rule(lane !== null, 'not-found', 'cannot tell which swimlane this belongs to')
        parent = { type: 'swimlane', id: lane }
      } else if (m.to === 'plan') {
        // A plan belongs to a goal or another plan, never to a swimlane — so a loose
        // task cannot become a plan, and is told to become a goal instead.
        parent = m.parent ?? currentParent
        rule(
          parent.type !== 'swimlane',
          'bad-parent',
          'a plan belongs to a goal — make this a goal instead, or move it into one first',
        )
      } else {
        parent = m.parent ?? currentParent
      }

      // Build the replacement, carrying everything the old one had.
      const withoutSource = { ...state, [fromKey]: { ...state[fromKey] } }
      delete (withoutSource[fromKey] as Record<string, unknown>)[m.ref.id]

      let next: State
      if (m.to === 'goal') {
        next = reduce(withoutSource, {
          kind: 'createGoal',
          id: m.newId,
          swimlaneId: parent.id,
          title: source.title,
          at: m.at,
        })
        const goal = next.goals[m.newId]!
        next = {
          ...next,
          goals: {
            ...next.goals,
            // createdAt comes too: this is the same thing at a different level, and the
            // metadata exists so staleness can be surfaced kindly later (PRD §8.2).
            [m.newId]: {
              ...goal,
              notes: source.notes,
              deadline: source.deadline,
              createdAt: source.createdAt,
            },
          },
        }
      } else if (m.to === 'plan') {
        next = reduce(withoutSource, {
          kind: 'createPlan',
          id: m.newId,
          parent,
          title: source.title,
          at: m.at,
        })
        const plan = next.plans[m.newId]!
        next = {
          ...next,
          plans: {
            ...next.plans,
            [m.newId]: {
              ...plan,
              notes: source.notes,
              deadline: source.deadline,
              createdAt: source.createdAt,
            },
          },
        }
      } else {
        next = reduce(withoutSource, {
          kind: 'createTask',
          id: m.newId,
          parent,
          title: source.title,
          size: null,
          at: m.at,
        })
        const task = next.tasks[m.newId]!
        next = {
          ...next,
          tasks: {
            ...next.tasks,
            [m.newId]: {
              ...task,
              notes: source.notes,
              deadline: source.deadline,
              createdAt: source.createdAt,
            },
          },
        }
      }

      // Children come with it. Nothing is orphaned and nothing is retyped. A task can
      // never be a parent, and the rule above guaranteed there are none to move here.
      const plans = { ...next.plans }
      const tasks = { ...next.tasks }
      if (m.to !== 'task') {
        const moved: Parent = { type: m.to, id: m.newId }
        // `updatedAt` too: `deletePlan`'s promote-children branch performs the identical
        // reparent and stamps it, and DESIGN §3.2 says the metadata is captured on
        // everything. A child that moved is a child that changed.
        for (const child of kids.plans)
          plans[child.id] = { ...plans[child.id]!, parent: moved, updatedAt: m.at }
        for (const child of kids.tasks)
          tasks[child.id] = { ...tasks[child.id]!, parent: moved, updatedAt: m.at }
      }

      // The star moves with the thing, in the same place in the set.
      const priorities = next.priorities.map((ref) =>
        ref.type === m.ref.type && ref.id === m.ref.id ? ({ type: m.to, id: m.newId } as Ref) : ref,
      )

      return { ...next, plans, tasks, priorities }
    }

    case 'capture': {
      const text = m.text.trim()
      rule(text.length > 0, 'empty-capture', 'nothing to capture')

      if (m.destination.kind === 'pile') {
        rule(!idTaken(state, m.id), 'duplicate-id', `${m.id} already exists`)
        const parsed = parseTags(text)
        rule(parsed.text.length > 0, 'only-tags', 'that is only tags — say what the thing is')
        return {
          ...state,
          pile: {
            ...state.pile,
            [m.id]: { id: m.id, text: parsed.text, tags: parsed.tags, createdAt: m.at },
          },
        }
      }

      const { swimlaneId, as } = m.destination
      rule(swimlaneId in state.swimlanes, 'not-found', `no swimlane ${swimlaneId}`)
      // Tags are a pile idea; once something has a home, its home is its category.
      const titled = parseTags(text).text
      rule(titled.length > 0, 'only-tags', 'that is only tags — say what the thing is')

      if (as === 'goal') {
        return reduce(state, {
          kind: 'createGoal',
          id: m.id,
          swimlaneId,
          title: titled,
          at: m.at,
        })
      }
      return reduce(state, {
        kind: 'createTask',
        id: m.id,
        parent: { type: 'swimlane', id: swimlaneId },
        title: titled,
        size: null,
        at: m.at,
      })
    }

    case 'promotePileItem': {
      const item = state.pile[m.itemId]
      rule(item !== undefined, 'not-found', `no pile item ${m.itemId}`)

      const pile = { ...state.pile }
      delete pile[m.itemId]
      const carried = { ...state, pile }

      // The item becomes the thing, and stops being an idea, in one step.
      if (m.to.kind === 'goal') {
        return reduce(carried, {
          kind: 'createGoal',
          id: m.to.id,
          swimlaneId: m.to.swimlaneId,
          title: item.text,
          at: m.at,
        })
      }
      if (m.to.kind === 'plan') {
        return reduce(carried, {
          kind: 'createPlan',
          id: m.to.id,
          parent: m.to.parent,
          title: item.text,
          at: m.at,
        })
      }
      return reduce(carried, {
        kind: 'createTask',
        id: m.to.id,
        parent: m.to.parent,
        title: item.text,
        size: m.to.size,
        at: m.at,
      })
    }

    case 'sendToPile': {
      rule(exists(state, m.ref), 'not-found', `no ${m.ref.type} ${m.ref.id}`)
      rule(m.ref.type !== 'swimlane', 'unsupported', 'a swimlane is not an idea')
      // Rebuilt from the narrowed discriminant. `EntityRef` is one object type rather
      // than a union, so asserting on `.type` narrows the property and not the object —
      // `{ type: m.ref.type, id: m.ref.id }` is the `Ref` the assertion just proved.
      const ref: Ref = { type: m.ref.type, id: m.ref.id }
      // The Pile holds a line of text, so anything with structure under it cannot go
      // there without destroying that structure. Deciding what happens to children is
      // what Archive is for (PRD §5.8) — this refuses rather than guesses.
      rule(
        !hasChildren(state, m.ref),
        'has-children',
        'this still has things under it — send its parts, or archive it instead',
      )
      // The Pile holds ideas, and an idea has no notion of being done. Sending finished
      // work there destroys `done`, `doneAt`, `size`, `deadline` and `notes` and puts it
      // back in the backlog as something still to do — PRD §5.5: "done items belong to
      // structure, not to the backlog". This rule lived in `Chip.svelte`, as a comment
      // explaining why that component hid the button; `TaskRow` rendered the same button
      // with no such guard. A destructive product rule belongs here, once.
      rule(
        !(m.ref.type === 'task' && state.tasks[m.ref.id]?.done === true),
        'already-done',
        'that is already done — the Pile is for ideas, and an idea cannot be done',
      )
      // The SECOND side door out of the archive. `changeLevel` was closed at M8 and this
      // was not, so DESIGN §3.3's claim that the ladder "was the one route out" was wrong
      // when it was written: piling a task out of an archived goal destroyed the task and
      // left a bare line in the Pile, emptying a goal the Archive still lists with its
      // date. Not reachable from today's UI, which is exactly the argument that did not
      // save `changeLevel` — this vocabulary is also import and a future server's API.
      rule(
        archivedOwnerOf(state, ref) === null,
        'archived',
        'that is inside an archived goal — restore it first',
      )
      rule(!idTaken(state, m.pileId), 'duplicate-id', `${m.pileId} already exists`)

      const key = `${m.ref.type}s` as 'goals' | 'plans' | 'tasks'
      const entity = state[key][m.ref.id]!
      const collection = { ...state[key] }
      delete collection[m.ref.id]

      return {
        ...state,
        [key]: collection,
        pile: {
          ...state.pile,
          [m.pileId]: { id: m.pileId, text: entity.title, tags: [], createdAt: m.at },
        },
        // It leaves the board, so it leaves the current set. Nothing is said about it.
        priorities: state.priorities.filter(
          (ref) => !(ref.type === m.ref.type && ref.id === m.ref.id),
        ),
      }
    }

    case 'editPileItem': {
      const item = state.pile[m.id]
      rule(item !== undefined, 'not-found', `no pile item ${m.id}`)
      const parsed = parseTags(m.text)
      rule(parsed.text.length > 0, 'empty-text', 'an idea needs some words')
      return {
        ...state,
        pile: { ...state.pile, [m.id]: { ...item, text: parsed.text, tags: parsed.tags } },
      }
    }

    case 'deletePileItem': {
      rule(m.id in state.pile, 'not-found', `no pile item ${m.id}`)
      const pile = { ...state.pile }
      delete pile[m.id]
      return { ...state, pile }
    }

    case 'replaceAll':
      // Copied all the way down, not aliased. Returning `m.state` made the store hold the
      // very object the mutation payload holds; copying only the maps left every entity
      // shared, so a caller that kept its payload could still rename a swimlane inside
      // the store from the outside. This is the import path — once per file, not a hot
      // path — and it is the one case where the reducer does not build its own document.
      return {
        ...m.state,
        swimlanes: copyEach(m.state.swimlanes),
        goals: copyEach(m.state.goals),
        plans: copyEach(m.state.plans),
        tasks: copyEach(m.state.tasks),
        pile: copyEach(m.state.pile),
        priorities: m.state.priorities.map((ref) => ({ ...ref })),
      }

    default: {
      // Exhaustiveness: a new mutation kind fails to compile until it is handled.
      const unreachable: never = m
      throw new Error(`unhandled mutation: ${JSON.stringify(unreachable)}`)
    }
  }
}
