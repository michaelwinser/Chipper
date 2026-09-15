/**
 * Upgrade safety (DESIGN.md §4).
 *
 * This app's data lives in a browser with no server backup and no support channel, so a
 * bad migration is unrecoverable for the person it happens to. Two things are tested:
 * that a real file written by an earlier version still opens, and that the chain itself
 * works — because the first genuine migration should not also be the first test of
 * whether migrating works at all.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { migrateWith, type Migration, type RawEnvelope } from '../src/domain/migrations'
import { parseEnvelope, toEnvelope } from '../src/domain/transfer'
import { checkInvariants } from '../src/domain/invariants'
import { SCHEMA_VERSION } from '../src/domain/state'
import { buildBoard } from '../src/domain/select/board'
import { buildArchive } from '../src/domain/select/archive'
import { buildPile } from '../src/domain/select/pile'
import type { Lens } from '../src/domain/board'

const LENS: Lens = { focus: 'priorities', size: 'any', expanded: [] }

/** A real export, written by the app at M6 and committed unchanged. */
const v1 = readFileSync(resolve(import.meta.dirname, 'fixtures/exports/v1-m6.json'), 'utf8')

describe('a file written by an earlier version still opens', () => {
  const result = parseEnvelope(v1)

  it('imports without complaint', () => {
    expect(result.ok).toBe(true)
  })

  it('arrives whole — structure, done work, the pile, the archive, priorities', () => {
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const state = result.state

    expect(Object.keys(state.swimlanes)).toHaveLength(4)
    expect(Object.keys(state.tasks).length).toBeGreaterThan(30)
    expect(Object.values(state.tasks).filter((t) => t.done).length).toBeGreaterThan(0)
    expect(Object.keys(state.pile)).toHaveLength(2)
    expect(Object.values(state.goals).filter((g) => g.archived)).toHaveLength(1)
    expect(state.priorities).toHaveLength(4)
    expect(state.tasks['t-receipts']?.notes).toBe('the shoebox in the office')
    expect(checkInvariants(state)).toEqual([])
  })

  it('still renders every surface', () => {
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(buildBoard(result.state, LENS).lanes).toHaveLength(4)
    expect(buildArchive(result.state).entries).toHaveLength(1)
    expect(buildPile(result.state, null).entries).toHaveLength(2)
  })

  it('round-trips back out unchanged, so re-exporting is lossless', () => {
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const again = toEnvelope(result.state, '2026-09-15T09:00:00.000Z')
    expect(JSON.parse(again).state).toEqual(JSON.parse(v1).state)
  })
})

describe('the migration chain itself', () => {
  /** Two steps that leave a trace, so order is observable rather than assumed. */
  const steps: Migration[] = [
    {
      from: 1,
      describe: 'add a marker',
      up: (state) => ({ ...(state as object), applied: ['one'] }),
    },
    {
      from: 2,
      describe: 'append to it',
      up: (state) => {
        const s = state as { applied?: string[] }
        return { ...s, applied: [...(s.applied ?? []), 'two'] }
      },
    },
  ]

  const envelope = (version: number, state: unknown): RawEnvelope => ({
    app: 'chipper',
    schemaVersion: version,
    state,
  })

  const shape = () => ({
    schemaVersion: 1,
    swimlanes: {},
    goals: {},
    plans: {},
    tasks: {},
    pile: {},
    priorities: [],
  })

  it('applies every step, in order', () => {
    const result = migrateWith(envelope(1, shape()), steps, 3)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((result.state as unknown as { applied: string[] }).applied).toEqual(['one', 'two'])
  })

  it('starts from the version the file is at, not from the beginning', () => {
    const result = migrateWith(envelope(2, shape()), steps, 3)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((result.state as unknown as { applied: string[] }).applied).toEqual(['two'])
  })

  it('does nothing at all when the file is already current', () => {
    const result = migrateWith(envelope(3, shape()), steps, 3)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect('applied' in (result.state as object)).toBe(false)
  })

  it('refuses when a step is missing, rather than skipping it', () => {
    const gap: Migration[] = [steps[0]!] // 1 → 2 only
    const result = migrateWith(envelope(1, shape()), gap, 3)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/No way to upgrade this export from format 2 to 3/)
  })

  it('refuses a result that stopped looking like a state', () => {
    const wrecking: Migration[] = [
      { from: 1, describe: 'breaks it', up: () => ({ nonsense: true }) },
    ]
    const result = migrateWith(envelope(1, shape()), wrecking, 2)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/missing parts of its structure/)
  })
})

describe('a file from the future', () => {
  it('is refused, and says what to do about it', () => {
    const newer = JSON.stringify({ app: 'chipper', schemaVersion: SCHEMA_VERSION + 1, state: {} })
    const result = parseEnvelope(newer)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.error).toMatch(/newer version of Chipper/)
    expect(result.error).toMatch(/Update the app/)
    // The point: it never partially applies. Guessing at a newer format is how data is
    // quietly dropped, and there is no backup to recover it from.
    expect(result.error).toMatch(/quietly drop/)
  })
})
