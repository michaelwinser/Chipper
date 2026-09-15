/**
 * The invariant checker, checked (M8).
 *
 * 24 assertions across the suite read `expect(checkInvariants(state)).toEqual([])`, and
 * before this file exactly one of the eight problem codes had ever been shown to fire. A
 * `checkInvariants` that returned `[]` unconditionally would have left every one of those
 * green — so the safety net under every cascade and every ladder move rested on a function
 * nobody had proven worked.
 *
 * Each case below hand-builds a broken state and asserts its code appears. These states
 * are deliberately NOT reachable through the reducer; that is the point — they are what an
 * imported file, an older bug, or a future mistake can produce.
 */
import { describe, expect, it } from 'vitest'
import { checkInvariants, PROBLEM_CODES } from '../src/domain/invariants'
import {
  emptyState,
  SCHEMA_VERSION,
  type Goal,
  type Plan,
  type State,
  type Task,
} from '../src/domain/state'
import { buildArchive } from '../src/domain/select/archive'
import { createLocalStore } from '../src/store/local'
import { generateState } from './support/generate'

const AT = '2026-09-15T10:00:00.000Z'

const goal = (id: string, over: Partial<Goal> = {}): Goal => ({
  id,
  swimlaneId: 'l1',
  title: id,
  notes: '',
  deadline: null,
  archived: false,
  archivedAt: null,
  createdAt: AT,
  updatedAt: AT,
  ...over,
})

const plan = (id: string, over: Partial<Plan> = {}): Plan => ({
  id,
  parent: { type: 'goal', id: 'g1' },
  title: id,
  notes: '',
  deadline: null,
  createdAt: AT,
  updatedAt: AT,
  ...over,
})

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  parent: { type: 'goal', id: 'g1' },
  title: id,
  notes: '',
  size: null,
  deadline: null,
  done: false,
  doneAt: null,
  createdAt: AT,
  updatedAt: AT,
  ...over,
})

/** A minimal consistent state to break in one specific way. */
function base(): State {
  return {
    ...emptyState(),
    swimlanes: {
      l1: { id: 'l1', name: 'Work', color: '#000', order: 0, createdAt: AT, updatedAt: AT },
    },
    goals: { g1: goal('g1') },
  }
}

const codes = (state: State): string[] =>
  checkInvariants(state)
    .map((p) => p.code)
    .sort()

describe('every problem code fires', () => {
  it('dangling-parent — a goal whose swimlane is gone', () => {
    const state = { ...base(), goals: { g1: goal('g1', { swimlaneId: 'nope' }) } }
    expect(codes(state)).toContain('dangling-parent')
  })

  it('dangling-parent — a plan and a task pointing at nothing', () => {
    const state = {
      ...base(),
      plans: { p1: plan('p1', { parent: { type: 'goal', id: 'gone' } }) },
      tasks: { t1: task('t1', { parent: { type: 'plan', id: 'gone' } }) },
    }
    expect(checkInvariants(state).filter((p) => p.code === 'dangling-parent')).toHaveLength(2)
  })

  it('bad-parent — a plan hanging off a swimlane', () => {
    const state = {
      ...base(),
      plans: { p1: plan('p1', { parent: { type: 'swimlane', id: 'l1' } }) },
    }
    expect(codes(state)).toContain('bad-parent')
  })

  it('cycle — two plans that are each other’s ancestor', () => {
    const state = {
      ...base(),
      plans: {
        p1: plan('p1', { parent: { type: 'plan', id: 'p2' } }),
        p2: plan('p2', { parent: { type: 'plan', id: 'p1' } }),
      },
    }
    expect(codes(state)).toContain('cycle')
  })

  it('cycle — a plan that is its own parent', () => {
    const state = { ...base(), plans: { p1: plan('p1', { parent: { type: 'plan', id: 'p1' } }) } }
    expect(codes(state)).toContain('cycle')
  })

  it('done-mismatch — done with no time, and a time without done', () => {
    const state = {
      ...base(),
      tasks: {
        t1: task('t1', { done: true, doneAt: null }),
        t2: task('t2', { done: false, doneAt: AT }),
      },
    }
    expect(checkInvariants(state).filter((p) => p.code === 'done-mismatch')).toHaveLength(2)
  })

  it('duplicate-priority — the same thing starred twice', () => {
    const state = {
      ...base(),
      priorities: [
        { type: 'goal' as const, id: 'g1' },
        { type: 'goal' as const, id: 'g1' },
      ],
    }
    expect(codes(state)).toContain('duplicate-priority')
  })

  it('dangling-priority — a star pointing at nothing', () => {
    const state = { ...base(), priorities: [{ type: 'task' as const, id: 'gone' }] }
    expect(codes(state)).toContain('dangling-priority')
  })

  it('done-priority — a star on finished work', () => {
    const state = {
      ...base(),
      tasks: { t1: task('t1', { done: true, doneAt: AT }) },
      priorities: [{ type: 'task' as const, id: 't1' }],
    }
    expect(codes(state)).toContain('done-priority')
  })

  it('archived-priority — the goal itself', () => {
    const state = {
      ...base(),
      goals: { g1: goal('g1', { archived: true, archivedAt: AT }) },
      priorities: [{ type: 'goal' as const, id: 'g1' }],
    }
    expect(codes(state)).toContain('archived-priority')
  })

  it('archived-priority — a plan inside it (the half that was unenforced)', () => {
    const state = {
      ...base(),
      goals: { g1: goal('g1', { archived: true, archivedAt: AT }) },
      plans: { p1: plan('p1') },
      priorities: [{ type: 'plan' as const, id: 'p1' }],
    }
    expect(codes(state)).toContain('archived-priority')
  })

  it('archived-priority — a task nested two levels inside it', () => {
    const state = {
      ...base(),
      goals: { g1: goal('g1', { archived: true, archivedAt: AT }) },
      plans: { p1: plan('p1'), p2: plan('p2', { parent: { type: 'plan', id: 'p1' } }) },
      tasks: { t1: task('t1', { parent: { type: 'plan', id: 'p2' } }) },
      priorities: [{ type: 'task' as const, id: 't1' }],
    }
    expect(codes(state)).toContain('archived-priority')
  })

  it('pile-collision — an id that is both an idea and a thing', () => {
    const state = {
      ...base(),
      tasks: { shared: task('shared') },
      pile: { shared: { id: 'shared', text: 'an idea', tags: [], createdAt: AT } },
    }
    expect(codes(state)).toContain('pile-collision')
  })
})

describe('the checker itself', () => {
  it('reports nothing for a consistent state', () => {
    expect(checkInvariants(base())).toEqual([])
    expect(checkInvariants(emptyState())).toEqual([])
  })

  it('reports every problem, not only the first', () => {
    const state = {
      ...base(),
      goals: { g1: goal('g1', { swimlaneId: 'nope' }) },
      tasks: { t1: task('t1', { done: true, doneAt: null }) },
      priorities: [{ type: 'task' as const, id: 'gone' }],
    }
    expect(codes(state)).toEqual(['dangling-parent', 'dangling-priority', 'done-mismatch'])
  })

  it('returns problems rather than throwing, even for a state full of nonsense', () => {
    // The import path depends on this: a corrupt file must be refused with a reason, and
    // a throw here escapes as an unhandled rejection with no message for the user.
    const wrecked = [
      { ...base(), plans: { p1: 42 } },
      { ...base(), goals: { g1: null } },
      { ...base(), tasks: { t1: { id: 't1' } } },
      { ...base(), priorities: [null] },
      { ...base(), priorities: ['not a ref'] },
      { ...base(), pile: { x: undefined } },
    ] as unknown as State[]

    for (const state of wrecked) {
      expect(() => checkInvariants(state)).not.toThrow()
      expect(checkInvariants(state).length).toBeGreaterThan(0)
    }
  })

  /**
   * The fuzz net this function actually backs.
   *
   * The bound was 40. The M8 review reran it wider and found real reducer bugs first
   * appearing at seeds 893, 1020, 1901 and 2084 — `changeLevel` accepting a destination
   * inside an archived goal, which produces a document the loader then refuses. Forty
   * seeds is not a net, it is a spot check, and the cost of the real one is under a
   * second. If this ever gets slow, lower it deliberately and say so here.
   */
  it('holds for every generated state — the fuzz net it actually backs', () => {
    for (let seed = 1; seed <= 2500; seed++) {
      expect({ seed, problems: checkInvariants(generateState(seed)) }).toEqual({
        seed,
        problems: [],
      })
    }
  })
})

describe('the code list is the contract', () => {
  /**
   * Every code, provoked at least once.
   *
   * `checkInvariants` had ten codes and nine hand-built cases, with nothing binding the
   * two lists — so a code added later was untested silently, which is exactly what the
   * per-code cases above exist to prevent. This is the same mechanism `MUTATION_KINDS`
   * uses one layer down: the const is the contract, and the suite proves it is covered.
   */
  const broken: State[] = [
    { ...base(), plans: { p1: 42 } } as unknown as State,
    { ...base(), goals: { g1: goal('g1', { swimlaneId: 'nope' }) } },
    { ...base(), plans: { p1: plan('p1', { parent: { type: 'swimlane', id: 'l1' } }) } },
    { ...base(), plans: { p1: plan('p1', { parent: { type: 'plan', id: 'p1' } }) } },
    { ...base(), tasks: { t1: task('t1', { done: true, doneAt: null }) } },
    {
      ...base(),
      priorities: [
        { type: 'goal', id: 'g1' },
        { type: 'goal', id: 'g1' },
      ],
    },
    { ...base(), priorities: [{ type: 'task', id: 'gone' }] },
    {
      ...base(),
      tasks: { t1: task('t1', { done: true, doneAt: AT }) },
      priorities: [{ type: 'task', id: 't1' }],
    },
    {
      ...base(),
      goals: { g1: goal('g1', { archived: true, archivedAt: AT }) },
      priorities: [{ type: 'goal', id: 'g1' }],
    },
    { ...base(), goals: { g1: goal('g1', { archived: true, archivedAt: null }) } },
    {
      ...base(),
      tasks: { shared: task('shared') },
      pile: { shared: { id: 'shared', text: 'an idea', tags: [], createdAt: AT } },
    },
  ]

  it('every code in PROBLEM_CODES is provoked by some case here', () => {
    const seen = new Set(broken.flatMap((s) => checkInvariants(s).map((p) => p.code)))
    expect([...PROBLEM_CODES].filter((c) => !seen.has(c))).toEqual([])
  })

  it('and every code it emits is in PROBLEM_CODES', () => {
    const emitted = new Set(broken.flatMap((s) => checkInvariants(s).map((p) => p.code)))
    expect([...emitted].filter((c) => !PROBLEM_CODES.includes(c))).toEqual([])
  })
})

describe('archived-mismatch — a goal archived with no time, or timed without being archived', () => {
  it('fires both ways', () => {
    expect(
      codes({ ...base(), goals: { g1: goal('g1', { archived: true, archivedAt: null }) } }),
    ).toContain('archived-mismatch')
    expect(
      codes({ ...base(), goals: { g1: goal('g1', { archived: false, archivedAt: AT }) } }),
    ).toContain('archived-mismatch')
  })

  it('is what the Archive was papering over with a blank date', () => {
    // `buildArchive` reads `goal.archivedAt ?? ''`, which renders such a goal under an
    // empty label at the bottom of the list rather than saying the document is wrong.
    const state = { ...base(), goals: { g1: goal('g1', { archived: true, archivedAt: null }) } }
    expect(buildArchive(state).entries[0]?.archivedLabel).toBe('')
    expect(checkInvariants(state).map((p) => p.code)).toContain('archived-mismatch')
  })
})

describe('it still does not throw, on the shapes that used to make it', () => {
  /**
   * The six cases in the "nonsense" test above all keep the five top-level maps as
   * objects, so they never reached the two places that used `in` against a raw map.
   * These are those places: `{ goals: 42 }` took down `createLocalStore` itself — the
   * path whose entire job is refusing a corrupt document with a reason.
   */
  const wrecked = [
    { ...base(), goals: 42, priorities: [{ type: 'goal', id: 'x' }] },
    { ...base(), plans: 'nope', priorities: [{ type: 'plan', id: 'x' }] },
    { ...base(), tasks: null, priorities: [{ type: 'task', id: 'x' }] },
    { ...base(), goals: null, pile: { a: { id: 'a', text: 'x', tags: [], createdAt: AT } } },
    { ...base(), tasks: [], priorities: [{ type: 'task', id: 'x' }] },
  ] as unknown as State[]

  it.each(wrecked.map((s, i) => [i, s] as const))('case %i is refused, not thrown on', (_i, s) => {
    expect(() => checkInvariants(s)).not.toThrow()
    expect(checkInvariants(s).length).toBeGreaterThan(0)
  })

  it('and the store refuses such a document rather than dying on it', async () => {
    const storage = {
      getItem: () =>
        JSON.stringify({
          app: 'chipper',
          schemaVersion: SCHEMA_VERSION,
          state: { ...base(), goals: 42, priorities: [{ type: 'goal', id: 'x' }] },
        }),
      setItem: () => {},
    }
    const store = createLocalStore(storage, () => AT)
    expect(store.status.kind).toBe('blocked')
  })
})
