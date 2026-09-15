/**
 * A small seeded generator, so property tests are random but reproducible — and so we
 * do not take on a property-testing dependency for the handful of places that need one.
 */
import type { Mutation } from '../../src/domain/mutations'
import type { Size } from '../../src/domain/primitives'
import { reduce } from '../../src/domain/reduce'
import { emptyState, type Parent, type State } from '../../src/domain/state'

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
const SIZES: (Size | null)[] = ['S', 'M', 'L', null]

/**
 * Builds a random state by applying random VALID mutations — never by hand-assembling
 * one — so every generated state is one the app could actually reach.
 */
export function generateState(seed: number, steps = 60): State {
  const random = rng(seed)
  const pick = <T>(xs: T[]): T | undefined =>
    xs.length === 0 ? undefined : xs[Math.floor(random() * xs.length)]
  const word = () => `${pick(WORDS)} ${Math.floor(random() * 900 + 100)}`

  let state = emptyState()
  let n = 0
  const at = (i: number) => `2026-0${1 + (i % 9)}-1${i % 9}T0${i % 9}:0${i % 6}:00.000Z`

  const apply = (m: Mutation) => {
    try {
      state = reduce(state, m)
    } catch {
      /* invalid combinations are expected; the generator moves on */
    }
  }

  for (let i = 0; i < steps; i++) {
    n += 1
    const laneIds = Object.keys(state.swimlanes)
    const goalIds = Object.keys(state.goals)
    const planIds = Object.keys(state.plans)
    const taskIds = Object.keys(state.tasks)
    const roll = random()

    if (roll < 0.18 || laneIds.length === 0) {
      apply({ kind: 'createSwimlane', id: `sw${n}`, name: word(), color: '#5A7391', at: at(i) })
    } else if (roll < 0.42) {
      apply({
        kind: 'createGoal',
        id: `g${n}`,
        swimlaneId: pick(laneIds)!,
        title: word(),
        at: at(i),
      })
    } else if (roll < 0.56 && goalIds.length > 0) {
      const parent: Parent =
        random() < 0.7 || planIds.length === 0
          ? { type: 'goal', id: pick(goalIds)! }
          : { type: 'plan', id: pick(planIds)! }
      apply({ kind: 'createPlan', id: `p${n}`, parent, title: word(), at: at(i) })
    } else if (roll < 0.84) {
      const options: Parent[] = [
        { type: 'swimlane', id: pick(laneIds)! },
        ...(goalIds.length ? [{ type: 'goal' as const, id: pick(goalIds)! }] : []),
        ...(planIds.length ? [{ type: 'plan' as const, id: pick(planIds)! }] : []),
      ]
      apply({
        kind: 'createTask',
        id: `t${n}`,
        parent: pick(options)!,
        title: word(),
        size: pick(SIZES)!,
        at: at(i),
      })
    } else if (roll < 0.92 && taskIds.length > 0) {
      apply({ kind: 'setTaskDone', id: pick(taskIds)!, done: random() < 0.7, at: at(i) })
    } else if (goalIds.length > 0) {
      apply({
        kind: 'setDeadline',
        ref: { type: 'goal', id: pick(goalIds)! },
        deadline: `2026-1${1 + (i % 2)}-0${1 + (i % 9)}`,
        at: at(i),
      })
    }
  }
  return state
}
