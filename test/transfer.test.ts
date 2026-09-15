/**
 * Export and import (UC-6010, 6020, 6030, 6040).
 *
 * This is the whole durability story for a localStorage app, so the round trip gets a
 * property test rather than a handful of examples.
 */
import { describe, expect, it } from 'vitest'
import { emptyState } from '../src/domain/state'
import { parseEnvelope, toEnvelope } from '../src/domain/transfer'
import { SCHEMA_VERSION } from '../src/domain/state'
import { generateState } from './support/generate'

const AT = '2026-09-14T10:00:00.000Z'

describe('UC-6010 — export', () => {
  it('is human-readable, versioned and names the app', () => {
    const text = toEnvelope(emptyState(), AT)
    expect(text).toContain('\n  ')
    expect(text.endsWith('\n')).toBe(true)
    const parsed = JSON.parse(text)
    expect(parsed).toMatchObject({ app: 'chipper', schemaVersion: SCHEMA_VERSION, exportedAt: AT })
  })

  it('writes keys in a stable order, so two exports diff legibly', () => {
    const state = generateState(3)
    const shuffled = { ...state, tasks: Object.fromEntries(Object.entries(state.tasks).reverse()) }
    expect(toEnvelope(shuffled, AT)).toBe(toEnvelope(state, AT))
  })
})

describe('UC-6020 — round trip', () => {
  it('survives export and import unchanged, for every generated state', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const original = generateState(seed)
      const result = parseEnvelope(toEnvelope(original, AT))
      if (!result.ok) throw new Error(`seed ${seed}: ${result.error}`)
      expect(result.state).toEqual(original)
    }
  })

  it('carries done history and priorities across, not just open work', () => {
    // The original emptied `priorities` on the line above and then asserted nothing about
    // them — a title promising the thing the test had just removed. The generator now
    // produces priorities, an archive and a pile, so all of it can actually be checked.
    const original = generateState(11)
    const doneCount = Object.values(original.tasks).filter((t) => t.done).length
    expect(doneCount).toBeGreaterThan(0)
    expect(original.priorities.length).toBeGreaterThan(0)
    expect(Object.keys(original.pile).length).toBeGreaterThan(0)

    const result = parseEnvelope(toEnvelope(original, AT))
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(result.state.priorities).toEqual(original.priorities)
    expect(result.state.pile).toEqual(original.pile)
    expect(Object.values(result.state.tasks).filter((t) => t.done)).toHaveLength(doneCount)
    for (const task of Object.values(result.state.tasks)) {
      if (task.done) expect(task.doneAt).not.toBeNull()
    }
    expect(Object.values(result.state.goals).filter((g) => g.archived)).toEqual(
      Object.values(original.goals).filter((g) => g.archived),
    )
  })
})

describe('UC-6030 — import refuses rather than guesses', () => {
  const cases: [string, string, RegExp][] = [
    ['not JSON', 'nonsense{', /not valid JSON/],
    [
      'another app',
      JSON.stringify({ app: 'todoist', schemaVersion: 1, state: {} }),
      /not exported by Chipper/,
    ],
    ['no version', JSON.stringify({ app: 'chipper', state: {} }), /no version/],
    [
      'a newer format',
      JSON.stringify({ app: 'chipper', schemaVersion: 99, state: {} }),
      /newer version of Chipper/,
    ],
    [
      'a broken structure',
      JSON.stringify({ app: 'chipper', schemaVersion: 1, state: { swimlanes: [] } }),
      /missing parts of its structure/,
    ],
  ]

  it.each(cases)('rejects %s with a legible reason', (_label, raw, expected) => {
    const result = parseEnvelope(raw)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(expected)
  })

  it('explains what to do about a newer file rather than only refusing', () => {
    const raw = JSON.stringify({ app: 'chipper', schemaVersion: 99, state: {} })
    const result = parseEnvelope(raw)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/Update the app/)
  })

  it('rejects a state whose references dangle, rather than importing a broken board', () => {
    const state = {
      ...emptyState(),
      goals: {
        g1: {
          id: 'g1',
          swimlaneId: 'missing',
          title: 'Orphan',
          notes: '',
          deadline: null,
          archived: false,
          archivedAt: null,
          createdAt: AT,
          updatedAt: AT,
        },
      },
    }
    const result = parseEnvelope(toEnvelope(state, AT))
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/inconsistent/)
  })
})

describe('UC-6030 — a corrupt file is refused, never crashed on', () => {
  /**
   * The import path is the last thing between a damaged document and the app. Before M8 a
   * plausible-looking one threw a TypeError out of `checkInvariants` — which, because
   * `parseEnvelope` also runs inside `createLocalStore`, took down app construction rather
   * than producing a message anyone could read.
   */
  const wrap = (state: unknown) =>
    JSON.stringify({ app: 'chipper', schemaVersion: 1, exportedAt: AT, state })

  const shape = {
    schemaVersion: 1,
    swimlanes: {},
    goals: {},
    plans: {},
    tasks: {},
    pile: {},
    priorities: [],
  }

  const corpus: [string, unknown][] = [
    ['a task that is a number', { ...shape, tasks: { t1: 42 } }],
    ['a goal that is null', { ...shape, goals: { g1: null } }],
    ['a task missing everything but its id', { ...shape, tasks: { t1: { id: 't1' } } }],
    ['a null in priorities', { ...shape, priorities: [null] }],
    ['a string in priorities', { ...shape, priorities: ['not a ref'] }],
    ['priorities that are not a list', { ...shape, priorities: 'nope' }],
    // `undefined` cannot survive JSON, so the reachable version of this is null.
    ['a pile entry that is null', { ...shape, pile: { x: null } }],
    ['a plan with no parent', { ...shape, plans: { p1: { id: 'p1', title: 'x' } } }],
    [
      'a goal whose swimlaneId is a number',
      { ...shape, goals: { g1: { id: 'g1', swimlaneId: 7 } } },
    ],
    ['collections that are arrays', { ...shape, goals: [], tasks: [] }],
    ['nothing at all', null],
    ['a bare string', 'hello'],
  ]

  it.each(corpus)('refuses %s with a reason, without throwing', (_label, state) => {
    let result: ReturnType<typeof parseEnvelope> | null = null
    expect(() => {
      result = parseEnvelope(wrap(state))
    }).not.toThrow()
    const outcome = result as ReturnType<typeof parseEnvelope> | null
    expect(outcome).not.toBeNull()
    expect(outcome?.ok).toBe(false)
    if (!outcome || outcome.ok) return
    expect(outcome.error.length).toBeGreaterThan(10)
  })
})
