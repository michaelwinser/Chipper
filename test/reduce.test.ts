/**
 * The reducer is where the product's rules live (DESIGN.md §5.2). Every case is
 * exercised against FROZEN input — mutating the argument is the bug that makes undo
 * and optimistic updates silently wrong, and it passes every other kind of test.
 */
import { describe, expect, it } from 'vitest'
import { reduce } from '../src/domain/reduce'
import { RuleError } from '../src/domain/errors'
import { MUTATION_KINDS, type Mutation } from '../src/domain/mutations'
import { emptyState, progressOf, type State } from '../src/domain/state'
import { checkInvariants } from '../src/domain/invariants'
import { sampleSequence } from './support/conformance'
import { deepFreeze } from './support/freeze'
import { generateState } from './support/generate'

const AT = '2026-09-14T10:00:00.000Z'
const LATER = '2026-09-15T10:00:00.000Z'

/** Applies a sequence from empty, freezing before every step. */
function run(mutations: Mutation[]): State {
  return mutations.reduce((state, m) => reduce(deepFreeze(state), m), emptyState())
}

const base = (): Mutation[] => [
  { kind: 'createSwimlane', id: 'sw1', name: 'Work', color: '#5A7391', at: AT },
  { kind: 'createGoal', id: 'g1', swimlaneId: 'sw1', title: 'Catch up on invoicing', at: AT },
  {
    kind: 'createPlan',
    id: 'p1',
    parent: { type: 'goal', id: 'g1' },
    title: 'A month a week',
    at: AT,
  },
  {
    kind: 'createTask',
    id: 't1',
    parent: { type: 'plan', id: 'p1' },
    title: 'Invoice March',
    size: 'M',
    at: AT,
  },
]

describe('reduce — purity', () => {
  it('never mutates its input, for every mutation in the vocabulary', () => {
    // If any case reaches into the state it was given, the freeze throws here.
    expect(() => run(sampleSequence())).not.toThrow()
  })

  it('leaves every invariant intact after every mutation', () => {
    let state = emptyState()
    for (const mutation of sampleSequence()) {
      state = reduce(deepFreeze(state), mutation)
      expect(checkInvariants(state)).toEqual([])
    }
  })

  it('holds invariants over randomly generated histories', () => {
    for (let seed = 1; seed <= 25; seed++) {
      expect(checkInvariants(generateState(seed))).toEqual([])
    }
  })

  it('every mutation kind has a case — an unhandled one would throw', () => {
    const covered = new Set(sampleSequence().map((m) => m.kind))
    expect([...MUTATION_KINDS].filter((k) => !covered.has(k))).toEqual([])
  })
})

describe('UC-2010/2011/2012 — swimlanes', () => {
  it('creates lanes in the order they were made', () => {
    const state = run([
      { kind: 'createSwimlane', id: 'a', name: 'Work', color: '#1', at: AT },
      { kind: 'createSwimlane', id: 'b', name: 'Family', color: '#2', at: AT },
    ])
    expect(state.swimlanes['a']?.order).toBe(0)
    expect(state.swimlanes['b']?.order).toBe(1)
  })

  it('UC-2011 renames in place without touching anything inside', () => {
    const state = run([
      ...base(),
      {
        kind: 'renameEntity',
        ref: { type: 'swimlane', id: 'sw1' },
        title: 'Work things',
        at: LATER,
      },
    ])
    expect(state.swimlanes['sw1']?.name).toBe('Work things')
    expect(state.swimlanes['sw1']?.updatedAt).toBe(LATER)
    expect(Object.keys(state.goals)).toEqual(['g1'])
  })

  it('refuses an empty name rather than creating something unnameable', () => {
    expect(() =>
      run([
        ...base(),
        { kind: 'renameEntity', ref: { type: 'swimlane', id: 'sw1' }, title: '   ', at: AT },
      ]),
    ).toThrow(RuleError)
  })

  it('UC-2012 reorders, and refuses an order that does not name every lane', () => {
    const two: Mutation[] = [
      { kind: 'createSwimlane', id: 'a', name: 'A', color: '#1', at: AT },
      { kind: 'createSwimlane', id: 'b', name: 'B', color: '#2', at: AT },
    ]
    const reordered = run([...two, { kind: 'reorderSwimlanes', order: ['b', 'a'], at: AT }])
    expect(reordered.swimlanes['b']?.order).toBe(0)
    expect(reordered.swimlanes['a']?.order).toBe(1)

    expect(() => run([...two, { kind: 'reorderSwimlanes', order: ['b'], at: AT }])).toThrow(
      RuleError,
    )
    expect(() => run([...two, { kind: 'reorderSwimlanes', order: ['b', 'b'], at: AT }])).toThrow(
      RuleError,
    )
  })
})

describe('UC-2020/2025/2030/2040/2060 — structure', () => {
  it('a goal starts with no plans, no tasks and no deadline, and that is not incomplete', () => {
    const state = run([
      { kind: 'createSwimlane', id: 'sw1', name: 'Health', color: '#1', at: AT },
      { kind: 'createGoal', id: 'g1', swimlaneId: 'sw1', title: 'Three runs a week', at: AT },
    ])
    const goal = state.goals['g1']!
    expect(goal.deadline).toBeNull()
    expect(goal.archived).toBe(false)
    expect(progressOf(state, { type: 'goal', id: 'g1' })).toEqual({ done: 0, total: 0 })
  })

  it('UC-2030 a task can sit directly under a goal, with no plan between', () => {
    const state = run([
      ...base(),
      {
        kind: 'createTask',
        id: 't2',
        parent: { type: 'goal', id: 'g1' },
        title: 'Find receipts',
        size: 'S',
        at: AT,
      },
    ])
    expect(state.tasks['t2']?.parent).toEqual({ type: 'goal', id: 'g1' })
  })

  it('a task can sit loose in a swimlane, with no goal at all', () => {
    const state = run([
      ...base(),
      {
        kind: 'createTask',
        id: 't9',
        parent: { type: 'swimlane', id: 'sw1' },
        title: 'Back gate',
        size: 'S',
        at: AT,
      },
    ])
    expect(state.tasks['t9']?.parent.type).toBe('swimlane')
  })

  it('UC-2060 nests a plan under a plan', () => {
    const state = run([
      ...base(),
      { kind: 'createPlan', id: 'p2', parent: { type: 'plan', id: 'p1' }, title: 'March', at: AT },
    ])
    expect(state.plans['p2']?.parent).toEqual({ type: 'plan', id: 'p1' })
    expect(checkInvariants(state)).toEqual([])
  })

  it('refuses a plan hanging straight off a swimlane', () => {
    expect(() =>
      run([
        ...base(),
        {
          kind: 'createPlan',
          id: 'p9',
          parent: { type: 'swimlane', id: 'sw1' },
          title: 'No',
          at: AT,
        },
      ]),
    ).toThrow(RuleError)
  })

  it('refuses anything pointing at a parent that does not exist', () => {
    expect(() =>
      run([
        ...base(),
        { kind: 'createGoal', id: 'g9', swimlaneId: 'nope', title: 'Orphan', at: AT },
      ]),
    ).toThrow(RuleError)
  })

  it('counts progress across the whole subtree, not just direct children', () => {
    const state = run([
      ...base(),
      { kind: 'createPlan', id: 'p2', parent: { type: 'plan', id: 'p1' }, title: 'Deeper', at: AT },
      {
        kind: 'createTask',
        id: 't2',
        parent: { type: 'plan', id: 'p2' },
        title: 'Nested',
        size: 'S',
        at: AT,
      },
      { kind: 'setTaskDone', id: 't2', done: true, at: AT },
    ])
    expect(progressOf(state, { type: 'goal', id: 'g1' })).toEqual({ done: 1, total: 2 })
  })
})

describe('UC-4040 — completing a task', () => {
  it('records when it was done, and clears that when it is un-done', () => {
    const done = run([...base(), { kind: 'setTaskDone', id: 't1', done: true, at: LATER }])
    expect(done.tasks['t1']).toMatchObject({ done: true, doneAt: LATER })

    const undone = reduce(deepFreeze(done), {
      kind: 'setTaskDone',
      id: 't1',
      done: false,
      at: LATER,
    })
    expect(undone.tasks['t1']).toMatchObject({ done: false, doneAt: null })
  })

  it('never records how long anything took — only that it is finished (PRD §8.1)', () => {
    const state = run([...base(), { kind: 'setTaskDone', id: 't1', done: true, at: LATER }])
    expect(Object.keys(state.tasks['t1']!)).not.toContain('duration')
    expect(Object.keys(state.tasks['t1']!)).not.toContain('startedAt')
    expect(Object.keys(state.tasks['t1']!)).not.toContain('timeSpent')
  })
})
