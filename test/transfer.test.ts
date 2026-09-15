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
    const original = { ...generateState(11), priorities: [] }
    const doneCount = Object.values(original.tasks).filter((t) => t.done).length
    expect(doneCount).toBeGreaterThan(0)

    const result = parseEnvelope(toEnvelope(original, AT))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(Object.values(result.state.tasks).filter((t) => t.done)).toHaveLength(doneCount)
    for (const task of Object.values(result.state.tasks)) {
      if (task.done) expect(task.doneAt).not.toBeNull()
    }
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
