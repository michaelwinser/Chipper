/**
 * A small seeded generator, so property tests are random but reproducible — and so we
 * do not take on a property-testing dependency for the handful of places that need one.
 *
 * Rewritten at M8. The first version emitted 6 of 27 mutation kinds and never produced a
 * pile item, a priority or an archived goal — which silently hollowed out the schema
 * drift guard, the export round-trip property test and the invariant fuzzer at once.
 * Four separate reviewers found the same hole from four directions.
 *
 * The rule now: every mutation a user can cause must be reachable here. `replaceAll` is
 * the sole exception, because it discards the history the generator is building.
 */
import type { Mutation } from '../../src/domain/mutations'
import type { Size } from '../../src/domain/primitives'
import { reduce } from '../../src/domain/reduce'
import { childTasks, emptyState, type Parent, type Ref, type State } from '../../src/domain/state'

/** mulberry32 — tiny, fast, and deterministic from a seed. */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const WORDS = ['invoice', 'garage', 'flights', 'receipts', 'physio', 'gutters', 'prototype', 'skip']
const TAGS = ['#house', '#work', '#someday', '#reading']
const SIZES: (Size | null)[] = ['S', 'M', 'L', null]
const COLORS = ['#5A7391', '#A0684E', '#5E8A72', '#7A6E9E', '#8A8279']

/** Everything the generator can do, so coverage can be asserted rather than hoped for. */
export const GENERATED_KINDS = [
  'createSwimlane',
  'setSwimlaneColor',
  'reorderSwimlanes',
  'createGoal',
  'createPlan',
  'createTask',
  'renameEntity',
  'setNotes',
  'setTaskSize',
  'setDeadline',
  'setTaskDone',
  'deleteGoal',
  'deletePlan',
  'deleteTask',
  'deleteSwimlane',
  'archiveGoal',
  'restoreGoal',
  'changeLevel',
  'capture',
  'promotePileItem',
  'sendToPile',
  'editPileItem',
  'deletePileItem',
  'addPriority',
  'removePriority',
  'setPriorities',
] as const

export type GeneratedKind = (typeof GENERATED_KINDS)[number]

export type Trace = { applied: Mutation[]; refused: number }

/**
 * Builds a random state by applying random mutations — never by hand-assembling one — so
 * every generated state is one the app could actually reach. Invalid combinations are
 * expected and counted; a run where almost everything is refused is itself a finding, so
 * `generateTrace` reports both halves.
 */
export function generateTrace(seed: number, steps = 220): { state: State; trace: Trace } {
  const random = rng(seed)
  const pick = <T>(xs: T[]): T | undefined =>
    xs.length === 0 ? undefined : xs[Math.floor(random() * xs.length)]
  const chance = (p: number) => random() < p
  const word = () => `${pick(WORDS)} ${Math.floor(random() * 900 + 100)}`
  const tagged = () => `${chance(0.5) ? `${pick(TAGS)} ` : ''}${word()}`

  let state = emptyState()
  let n = 0
  const applied: Mutation[] = []
  let refused = 0
  // Valid and monotonic. Generated states are validated against the JSON Schema, which
  // checks `format: date-time`, so a clever-looking stamp that is not a real time fails.
  const at = (i: number) => {
    const minutes = String(Math.floor(i / 60)).padStart(2, '0')
    const seconds = String(i % 60).padStart(2, '0')
    return `2026-09-01T00:${minutes}:${seconds}.000Z`
  }

  const apply = (m: Mutation) => {
    try {
      state = reduce(state, m)
      applied.push(m)
    } catch {
      // Invalid combinations are expected — the generator walks on rather than steering
      // around them, which is how it reaches states a careful caller never would.
      refused += 1
    }
  }

  for (let i = 0; i < steps; i++) {
    n += 1
    const t = at(i)
    const lanes = Object.keys(state.swimlanes)
    const goals = Object.values(state.goals)
    const live = goals.filter((g) => !g.archived).map((g) => g.id)
    const archived = goals.filter((g) => g.archived).map((g) => g.id)
    const plans = Object.keys(state.plans)
    const tasks = Object.values(state.tasks)
    const openTasks = tasks.filter((x) => !x.done).map((x) => x.id)
    const pile = Object.keys(state.pile)
    const roll = random()

    /* --- structure, weighted so states stay populated --- */
    if (roll < 0.1 || lanes.length === 0) {
      apply({ kind: 'createSwimlane', id: `sw${n}`, name: word(), color: pick(COLORS)!, at: t })
    } else if (roll < 0.24) {
      apply({ kind: 'createGoal', id: `g${n}`, swimlaneId: pick(lanes)!, title: word(), at: t })
    } else if (roll < 0.34 && live.length > 0) {
      const parent: Parent =
        chance(0.7) || plans.length === 0
          ? { type: 'goal', id: pick(live)! }
          : { type: 'plan', id: pick(plans)! }
      apply({ kind: 'createPlan', id: `p${n}`, parent, title: word(), at: t })
    } else if (roll < 0.5) {
      const options: Parent[] = [
        { type: 'swimlane', id: pick(lanes)! },
        ...(live.length ? [{ type: 'goal' as const, id: pick(live)! }] : []),
        ...(plans.length ? [{ type: 'plan' as const, id: pick(plans)! }] : []),
      ]
      apply({
        kind: 'createTask',
        id: `t${n}`,
        parent: pick(options)!,
        title: word(),
        size: pick(SIZES)!,
        at: t,
      })

      /* --- editing --- */
    } else if (roll < 0.54 && tasks.length > 0) {
      apply({
        kind: 'setTaskDone',
        id: pick(openTasks.length ? openTasks : [tasks[0]!.id])!,
        done: chance(0.75),
        at: t,
      })
    } else if (roll < 0.57 && live.length > 0) {
      apply({
        kind: 'setDeadline',
        ref: { type: 'goal', id: pick(live)! },
        deadline: chance(0.85) ? `2026-1${1 + (i % 2)}-0${1 + (i % 9)}` : null,
        at: t,
      })
    } else if (roll < 0.59 && plans.length > 0) {
      apply({
        kind: 'setDeadline',
        ref: { type: 'plan', id: pick(plans)! },
        deadline: '2026-11-30',
        at: t,
      })
    } else if (roll < 0.61 && tasks.length > 0) {
      apply({
        kind: 'setDeadline',
        ref: { type: 'task', id: pick(tasks.map((x) => x.id))! },
        deadline: '2026-10-05',
        at: t,
      })
    } else if (roll < 0.63 && tasks.length > 0) {
      apply({ kind: 'setTaskSize', id: pick(tasks.map((x) => x.id))!, size: pick(SIZES)!, at: t })
    } else if (roll < 0.65 && live.length > 0) {
      apply({ kind: 'setNotes', ref: { type: 'goal', id: pick(live)! }, notes: word(), at: t })
    } else if (roll < 0.66 && tasks.length > 0) {
      apply({
        kind: 'setNotes',
        ref: { type: 'task', id: pick(tasks.map((x) => x.id))! },
        notes: word(),
        at: t,
      })
    } else if (roll < 0.68 && live.length > 0) {
      apply({ kind: 'renameEntity', ref: { type: 'goal', id: pick(live)! }, title: word(), at: t })
    } else if (roll < 0.69 && lanes.length > 0) {
      apply({
        kind: 'renameEntity',
        ref: { type: 'swimlane', id: pick(lanes)! },
        title: word(),
        at: t,
      })
    } else if (roll < 0.7 && lanes.length > 0) {
      apply({ kind: 'setSwimlaneColor', id: pick(lanes)!, color: pick(COLORS)!, at: t })
    } else if (roll < 0.71 && lanes.length > 1) {
      const order = [...lanes]
      // A rotation, so the order is always a complete permutation.
      order.push(order.shift()!)
      apply({ kind: 'reorderSwimlanes', order, at: t })

      /* --- the pile --- */
    } else if (roll < 0.77) {
      apply({ kind: 'capture', id: `pi${n}`, text: tagged(), destination: { kind: 'pile' }, at: t })
    } else if (roll < 0.79 && lanes.length > 0) {
      apply({
        kind: 'capture',
        id: `c${n}`,
        text: tagged(),
        destination: {
          kind: 'swimlane',
          swimlaneId: pick(lanes)!,
          as: chance(0.5) ? 'goal' : 'task',
        },
        at: t,
      })
    } else if (roll < 0.81 && pile.length > 0) {
      apply({ kind: 'editPileItem', id: pick(pile)!, text: tagged(), at: t })
    } else if (roll < 0.83 && pile.length > 0 && lanes.length > 0) {
      const to = chance(0.5)
        ? ({ kind: 'goal', id: `pg${n}`, swimlaneId: pick(lanes)! } as const)
        : ({
            kind: 'task',
            id: `pt${n}`,
            parent: { type: 'swimlane', id: pick(lanes)! },
            size: pick(SIZES)!,
          } as const)
      apply({ kind: 'promotePileItem', itemId: pick(pile)!, to, at: t })
    } else if (roll < 0.84 && pile.length > 0) {
      apply({ kind: 'deletePileItem', id: pick(pile)!, at: t })
    } else if (roll < 0.86 && tasks.length > 0) {
      apply({
        kind: 'sendToPile',
        ref: { type: 'task', id: pick(tasks.map((x) => x.id))! },
        pileId: `sp${n}`,
        at: t,
      })

      /* --- priorities --- */
    } else if (roll < 0.9) {
      const candidates: Ref[] = [
        ...live.map((id) => ({ type: 'goal' as const, id })),
        ...plans.map((id) => ({ type: 'plan' as const, id })),
        ...openTasks.map((id) => ({ type: 'task' as const, id })),
      ]
      const ref = pick(candidates)
      if (ref) apply({ kind: 'addPriority', ref, at: t })
    } else if (roll < 0.91 && state.priorities.length > 0) {
      apply({ kind: 'removePriority', ref: pick([...state.priorities])!, at: t })
    } else if (roll < 0.93) {
      // The sweep: keep a random subset of what is starred.
      apply({ kind: 'setPriorities', refs: state.priorities.filter(() => chance(0.5)), at: t })

      /* --- the ladder and the exits --- */
    } else if (roll < 0.95 && tasks.length > 0) {
      const task = pick(tasks)!
      apply({
        kind: 'changeLevel',
        ref: { type: 'task', id: task.id },
        to: chance(0.5) ? 'plan' : 'goal',
        newId: `cl${n}`,
        at: t,
      })
    } else if (roll < 0.96 && plans.length > 0) {
      apply({
        kind: 'changeLevel',
        ref: { type: 'plan', id: pick(plans)! },
        to: 'goal',
        newId: `cg${n}`,
        at: t,
      })
    } else if (roll < 0.965 && live.length > 0 && plans.length > 0) {
      // Demotion, including — deliberately — targets that may be inside the goal's own
      // subtree. That is a state a user can ask for, so the generator must be able to.
      apply({
        kind: 'changeLevel',
        ref: { type: 'goal', id: pick(live)! },
        to: 'plan',
        newId: `cp${n}`,
        parent: { type: 'plan', id: pick(plans)! },
        at: t,
      })
    } else if (roll < 0.975 && live.length > 0) {
      apply({ kind: 'archiveGoal', id: pick(live)!, at: t })
    } else if (roll < 0.98 && archived.length > 0) {
      apply({ kind: 'restoreGoal', id: pick(archived)!, at: t })
    } else if (roll < 0.985 && tasks.length > 0) {
      apply({ kind: 'deleteTask', id: pick(tasks.map((x) => x.id))!, at: t })
    } else if (roll < 0.99 && plans.length > 0) {
      apply({
        kind: 'deletePlan',
        id: pick(plans)!,
        disposition: chance(0.5) ? 'promote-children' : 'cascade',
        at: t,
      })
    } else if (roll < 0.995 && live.length > 0) {
      apply({ kind: 'deleteGoal', id: pick(live)!, at: t })
    } else if (lanes.length > 1) {
      const id = pick(lanes)!
      const loose = childTasks(state, { type: 'swimlane', id })
      const others = lanes.filter((l) => l !== id)
      apply(
        chance(0.5)
          ? {
              kind: 'deleteSwimlane',
              id,
              disposition: { kind: 'move', toSwimlaneId: pick(others)! },
              at: t,
            }
          : {
              kind: 'deleteSwimlane',
              id,
              disposition: {
                kind: 'archive',
                pileIds: Object.fromEntries(loose.map((task, k) => [task.id, `dsp${n}-${k}`])),
              },
              at: t,
            },
      )
    }
  }
  return { state, trace: { applied, refused } }
}

export function generateState(seed: number, steps = 220): State {
  return generateTrace(seed, steps).state
}

/** What a state actually contains, so "non-trivial" can be asserted rather than assumed. */
export function census(state: State): Record<string, number> {
  const goals = Object.values(state.goals)
  const tasks = Object.values(state.tasks)
  const pile = Object.values(state.pile)
  return {
    swimlanes: Object.keys(state.swimlanes).length,
    goals: goals.length,
    archived: goals.filter((g) => g.archived).length,
    deadlines: [
      ...goals.filter((g) => g.deadline !== null),
      ...Object.values(state.plans).filter((p) => p.deadline !== null),
      ...tasks.filter((t) => t.deadline !== null),
    ].length,
    notes: [...goals, ...Object.values(state.plans), ...tasks].filter((e) => e.notes !== '').length,
    plans: Object.keys(state.plans).length,
    tasks: tasks.length,
    done: tasks.filter((t) => t.done).length,
    pile: pile.length,
    pileItem: pile.length,
    tags: pile.filter((p) => p.tags.length > 0).length,
    priorities: state.priorities.length,
    // Keyed to match `schema/state.schema.json`'s `$defs`, so `generator.test.ts` can
    // require a counter per definition rather than a hand-picked list. Without that, a
    // generator that stopped emitting plans would leave the `plan` and `size` definitions
    // validated against no data at all while `schema.test.ts` still passed — the M6
    // failure this milestone was written to close, one level down.
    swimlane: Object.keys(state.swimlanes).length,
    goal: goals.length,
    plan: Object.keys(state.plans).length,
    task: tasks.length,
    size: tasks.filter((t) => t.size !== null).length,
    ref: state.priorities.length,
    parent: [...Object.values(state.plans), ...tasks].length,
    id: Object.keys(state.swimlanes).length + goals.length + tasks.length,
    isoDate: [
      ...goals.filter((g) => g.deadline !== null),
      ...Object.values(state.plans).filter((p) => p.deadline !== null),
      ...tasks.filter((t) => t.deadline !== null),
    ].length,
    isoTime: goals.length,
  }
}
