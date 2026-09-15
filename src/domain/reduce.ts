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
import type { EntityRef, Goal, Parent, Plan, Ref, State, Task } from './state'
import { childPlans, childTasks } from './state'

function parentExists(state: State, parent: Parent): boolean {
  if (parent.type === 'swimlane') return parent.id in state.swimlanes
  if (parent.type === 'goal') return parent.id in state.goals
  return parent.id in state.plans
}

function hasChildren(state: State, ref: EntityRef): boolean {
  if (ref.type === 'swimlane') {
    return (
      Object.values(state.goals).some((g) => g.swimlaneId === ref.id) ||
      childTasks(state, { type: 'swimlane', id: ref.id }).length > 0 ||
      childPlans(state, { type: 'swimlane', id: ref.id }).length > 0
    )
  }
  if (ref.type === 'task') return false
  const parent: Parent = { type: ref.type, id: ref.id }
  return childPlans(state, parent).length > 0 || childTasks(state, parent).length > 0
}

function exists(state: State, ref: EntityRef): boolean {
  return ref.id in state[`${ref.type}s` as const]
}

const sameRef = (a: Ref, b: Ref): boolean => a.type === b.type && a.id === b.id

/** Walks up to the swimlane something ultimately sits in. */
function swimlaneOf(state: State, parent: Parent): string | null {
  if (parent.type === 'swimlane') return parent.id
  if (parent.type === 'goal') return state.goals[parent.id]?.swimlaneId ?? null
  const plan = state.plans[parent.id]
  return plan ? swimlaneOf(state, plan.parent) : null
}

export function reduce(state: State, m: Mutation): State {
  switch (m.kind) {
    case 'createSwimlane': {
      rule(!(m.id in state.swimlanes), 'duplicate-id', `swimlane ${m.id} already exists`)
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
      rule(!(m.id in state.goals), 'duplicate-id', `goal ${m.id} already exists`)
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
      rule(!(m.id in state.plans), 'duplicate-id', `plan ${m.id} already exists`)
      rule(parentExists(state, m.parent), 'not-found', 'plan parent does not exist')
      rule(m.parent.type !== 'swimlane', 'bad-parent', 'a plan belongs to a goal or another plan')
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
      rule(!(m.id in state.tasks), 'duplicate-id', `task ${m.id} already exists`)
      rule(parentExists(state, m.parent), 'not-found', 'task parent does not exist')
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
      rule(
        !(m.ref.type === 'goal' && state.goals[m.ref.id]?.archived === true),
        'archived',
        'that goal is archived',
      )
      if (state.priorities.some((ref) => sameRef(ref, m.ref))) return state
      return { ...state, priorities: [...state.priorities, m.ref] }
    }

    case 'removePriority':
      return { ...state, priorities: state.priorities.filter((ref) => !sameRef(ref, m.ref)) }

    case 'deleteEmpty': {
      rule(exists(state, m.ref), 'not-found', `no ${m.ref.type} ${m.ref.id}`)
      rule(
        !hasChildren(state, m.ref),
        'has-children',
        'this still has things under it — cascades are decided in M5, not guessed at here',
      )
      const key = `${m.ref.type}s` as 'swimlanes' | 'goals' | 'plans' | 'tasks'
      const collection = { ...state[key] }
      delete collection[m.ref.id]
      const priorities = state.priorities.filter(
        (ref) => !(ref.type === m.ref.type && ref.id === m.ref.id),
      )
      return { ...state, [key]: collection, priorities }
    }

    case 'changeLevel': {
      rule(exists(state, m.ref), 'not-found', `no ${m.ref.type} ${m.ref.id}`)
      rule(m.ref.type !== m.to, 'no-change', `that is already a ${m.to}`)
      rule(!(m.newId in state[`${m.to}s` as const]), 'duplicate-id', `${m.newId} already exists`)

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
            [m.newId]: { ...goal, notes: source.notes, deadline: source.deadline },
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
            [m.newId]: { ...plan, notes: source.notes, deadline: source.deadline },
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
            [m.newId]: { ...task, notes: source.notes, deadline: source.deadline },
          },
        }
      }

      // Children come with it. Nothing is orphaned and nothing is retyped. A task can
      // never be a parent, and the rule above guaranteed there are none to move here.
      const plans = { ...next.plans }
      const tasks = { ...next.tasks }
      if (m.to !== 'task') {
        const moved: Parent = { type: m.to, id: m.newId }
        for (const child of kids.plans) plans[child.id] = { ...plans[child.id]!, parent: moved }
        for (const child of kids.tasks) tasks[child.id] = { ...tasks[child.id]!, parent: moved }
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
        rule(!(m.id in state.pile), 'duplicate-id', `pile item ${m.id} already exists`)
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
      // The Pile holds a line of text, so anything with structure under it cannot go
      // there without destroying that structure. Deciding what happens to children is
      // what Archive is for (PRD §5.8) — this refuses rather than guesses.
      rule(
        !hasChildren(state, m.ref),
        'has-children',
        'this still has things under it — send its parts, or archive it once that arrives',
      )
      rule(!(m.pileId in state.pile), 'duplicate-id', `pile item ${m.pileId} already exists`)

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
      return m.state

    default: {
      // Exhaustiveness: a new mutation kind fails to compile until it is handled.
      const unreachable: never = m
      throw new Error(`unhandled mutation: ${JSON.stringify(unreachable)}`)
    }
  }
}
