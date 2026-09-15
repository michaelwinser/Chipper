/**
 * The reducer is where the product's rules live (DESIGN.md §5.2). Every case is
 * exercised against FROZEN input — mutating the argument is the bug that makes undo
 * and optimistic updates silently wrong, and it passes every other kind of test.
 */
import { describe, expect, it } from 'vitest'
import { reduce } from '../src/domain/reduce'
import { mainState } from '../src/fixtures/states'
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

describe('an id is unique across the whole document, not within a collection', () => {
  /**
   * DESIGN.md §5.3 states this and `idTaken` is meant to be it. The rule matters because
   * invariant 6 (a pile item is never also an entity) depends on it, and because the
   * board keys rows by id alone — two things sharing one makes a row vanish.
   *
   * Every one of these passed before: `idTaken` did not look at swimlanes, and
   * `createSwimlane` did not call it. The generator cannot reach it either, since its id
   * prefixes never collide by construction — so this is hand-written on purpose.
   */
  const lane = (id: string) =>
    ({ kind: 'createSwimlane', id, name: 'Somewhere', color: '#333', at: AT }) as const
  const goal = (id: string) =>
    ({ kind: 'createGoal', id, swimlaneId: 'l-work', title: 'A goal', at: AT }) as const

  it.each([
    ['a swimlane taking an existing goal’s id', lane('g-invoicing')],
    ['a swimlane taking an existing task’s id', lane('t-receipts')],
    ['a goal taking an existing swimlane’s id', goal('l-work')],
    [
      'a plan taking an existing swimlane’s id',
      {
        kind: 'createPlan' as const,
        id: 'l-work',
        parent: { type: 'goal' as const, id: 'g-invoicing' },
        title: 'A plan',
        at: AT,
      },
    ],
    [
      'a task taking an existing goal’s id',
      {
        kind: 'createTask' as const,
        id: 'g-invoicing',
        parent: { type: 'goal' as const, id: 'g-trip' },
        title: 'A task',
        size: null,
        at: AT,
      },
    ],
    [
      'a pile item taking an existing swimlane’s id',
      {
        kind: 'capture' as const,
        id: 'l-work',
        text: 'an idea',
        destination: { kind: 'pile' as const },
        at: AT,
      },
    ],
  ])('refuses %s', (_name, mutation) => {
    expect(() => reduce(mainState(), mutation)).toThrow(/already exists/)
  })

  it('and a fresh id is still accepted', () => {
    const state = reduce(mainState(), lane('l-brand-new'))
    expect(state.swimlanes['l-brand-new']).toBeDefined()
  })
})

describe('replaceAll holds a copy, not the caller’s document', () => {
  it('a caller editing its own payload afterwards does not edit the state', () => {
    // It returned `m.state` directly, so the store held the very object the mutation
    // payload held. `purity.test.ts` is a grep and cannot see this; nothing else did.
    const payload = mainState()
    const after = reduce(emptyState(), { kind: 'replaceAll', state: payload, at: AT })

    delete payload.goals['g-invoicing']
    payload.priorities.push({ type: 'goal', id: 'invented' })
    payload.swimlanes['l-work']!.name = 'Renamed behind its back'

    expect(after.goals['g-invoicing']).toBeDefined()
    expect(after.priorities.some((r) => r.id === 'invented')).toBe(false)
    expect(after.swimlanes['l-work']?.name).toBe('Work')
  })
})

describe('the ladder keeps createdAt on every rung, not just the one that was tested', () => {
  const at = '2026-10-01T09:00:00.000Z'

  it('task → plan', () => {
    const before = mainState().tasks['t-receipts']!.createdAt
    const after = reduce(mainState(), {
      kind: 'changeLevel',
      ref: { type: 'task', id: 't-receipts' },
      to: 'plan',
      newId: 'p-x',
      at,
    })
    expect(after.plans['p-x']!.createdAt).toBe(before)
  })

  it('plan → goal', () => {
    const before = mainState().plans['p-prototype']!.createdAt
    const after = reduce(mainState(), {
      kind: 'changeLevel',
      ref: { type: 'plan', id: 'p-prototype' },
      to: 'goal',
      newId: 'g-x',
      at,
    })
    expect(after.goals['g-x']!.createdAt).toBe(before)
  })

  it('goal → plan', () => {
    const before = mainState().goals['g-garage']!.createdAt
    const after = reduce(mainState(), {
      kind: 'changeLevel',
      ref: { type: 'goal', id: 'g-garage' },
      to: 'plan',
      newId: 'p-x',
      parent: { type: 'goal', id: 'g-trip' },
      at,
    })
    expect(after.plans['p-x']!.createdAt).toBe(before)
  })

  it('loose task → goal', () => {
    const before = mainState().tasks['t-gate']!.createdAt
    const after = reduce(mainState(), {
      kind: 'changeLevel',
      ref: { type: 'task', id: 't-gate' },
      to: 'goal',
      newId: 'g-x',
      at,
    })
    expect(after.goals['g-x']!.createdAt).toBe(before)
  })

  it('and stamps updatedAt on the children it reparents', () => {
    // `deletePlan`'s promote-children branch does this; `changeLevel`'s did not, and
    // DESIGN §3.2 says the metadata is captured on everything.
    const after = reduce(mainState(), {
      kind: 'changeLevel',
      ref: { type: 'goal', id: 'g-garage' },
      to: 'plan',
      newId: 'p-garage',
      parent: { type: 'goal', id: 'g-trip' },
      at,
    })
    const moved = Object.values(after.tasks).filter(
      (t) => t.parent.type === 'plan' && t.parent.id === 'p-garage',
    )
    expect(moved.length).toBeGreaterThan(0)
    for (const task of moved) expect(task.updatedAt).toBe(at)
  })
})
