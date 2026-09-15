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
import { MIGRATIONS, migrateWith, type Migration, type RawEnvelope } from '../src/domain/migrations'
import { parseEnvelope, toEnvelope } from '../src/domain/transfer'
import { SCHEMA_VERSION, type State } from '../src/domain/state'
import { checkInvariants } from '../src/domain/invariants'
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

  it('round-trips back out with its content intact, so re-exporting is lossless', () => {
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const again = JSON.parse(toEnvelope(result.state, '2026-09-15T09:00:00.000Z')).state
    const before = JSON.parse(v1).state

    // The version stamp is the one thing that SHOULD differ — the document has been
    // upgraded, and saying so is the whole job of the field. Everything else must match,
    // which is what makes this a losslessness test rather than a byte-identity test.
    expect(before.schemaVersion).toBe(1)
    expect(again.schemaVersion).toBe(SCHEMA_VERSION)

    const { schemaVersion: _was, ...contentBefore } = before
    const { schemaVersion: _now, ...contentAfter } = again
    expect(contentAfter).toEqual(contentBefore)
  })

  it('carries no star that the v1 → v2 repair should have removed', () => {
    // The migration exists for exactly this, so the fixture has to be able to show it.
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const archived = new Set(
      Object.values(result.state.goals)
        .filter((g) => g.archived)
        .map((g) => g.id),
    )
    for (const ref of result.state.priorities) {
      if (ref.type === 'goal') expect(archived.has(ref.id)).toBe(false)
    }
  })
})

/**
 * The dangling-swimlane case, in its own hand-written file.
 *
 * This shape lived briefly inside `v1-m6.json`, which turned a frozen export into a
 * hand-edited fixture while its docstring still said "committed unchanged" — the guard
 * and the thing being guarded became the same file. It belongs in something named for
 * what it is; see `fixtures/exports/README.md`.
 */
describe('an archived goal whose swimlane was deleted', () => {
  const raw = readFileSync(
    resolve(import.meta.dirname, 'fixtures/exports/synthetic-dangling-swimlane.json'),
    'utf8',
  )
  const result = parseEnvelope(raw)

  it('is the one place a reference is allowed to dangle (DESIGN.md §3.3, invariant 1)', () => {
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const orphan = result.state.goals['g-orphan']
    expect(orphan?.archived).toBe(true)
    expect(orphan?.swimlaneId !== undefined && orphan.swimlaneId in result.state.swimlanes).toBe(
      false,
    )
    expect(checkInvariants(result.state)).toEqual([])
  })

  it('reads in the Archive with no lane rather than breaking it', () => {
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(
      buildArchive(result.state).entries.find((e) => e.goalId === 'g-orphan')?.swimlane,
    ).toBeNull()
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
    expect(result.error).toMatch(/format 2.*no way to upgrade it to 3/)
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

describe('v1 → v2 — the repair that keeps M7 documents openable', () => {
  /**
   * A document in exactly the shape M7 wrote and considered valid: two stars pointing
   * inside a goal that was archived after they were set. M7's `addPriority` checked only
   * goal-typed refs, so it accepted both, and M7's `checkInvariants` reported nothing.
   *
   * Under M8's invariant 7 that document is refused, and a refusal on load is the blocked
   * screen rather than a warning — the user opens the app after a deploy and cannot reach
   * their board. Review measured roughly 8% of valid M7 documents in this state.
   */
  const raw = readFileSync(
    resolve(import.meta.dirname, 'fixtures/exports/synthetic-v1-m7-archived-star.json'),
    'utf8',
  )

  it('is a document M8 would refuse without the migration', () => {
    // The evidence the migration is needed at all. Run the invariants against the file's
    // own state, unmigrated — if this ever comes back clean the fixture has stopped
    // being an M7 document and this whole suite is asserting nothing.
    const asWritten = JSON.parse(raw).state as State
    const problems = checkInvariants(asWritten)
    expect(problems.map((p) => p.code)).toEqual(['archived-priority', 'archived-priority'])
  })

  it('opens, because the migration removes exactly those stars', () => {
    const result = parseEnvelope(raw)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(checkInvariants(result.state)).toEqual([])
    expect(result.state.schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('keeps every star that was pointing at live work', () => {
    const result = parseEnvelope(raw)
    if (!result.ok) throw new Error(result.error)
    expect(result.state.priorities).toEqual([{ type: 'task', id: 't-may' }])
  })

  it('destroys nothing else — the archived goal keeps its plan and its task', () => {
    const result = parseEnvelope(raw)
    if (!result.ok) throw new Error(result.error)
    expect(Object.keys(result.state.goals).sort()).toEqual(['g-done', 'g-live'])
    expect(Object.keys(result.state.plans)).toEqual(['p-cut'])
    expect(Object.keys(result.state.tasks).sort()).toEqual(['t-may', 't-notes'])
    expect(result.state.goals['g-done']!.archived).toBe(true)
  })

  it('is idempotent — the step applied twice equals the step applied once', () => {
    // Round-tripping through `toEnvelope` does NOT test this: it stamps the CURRENT
    // version, so the second `parseEnvelope` sees a v2 document and the migration loop
    // never runs. The step has to be called directly.
    const step = MIGRATIONS.find((m) => m.from === 1)!
    const asWritten = JSON.parse(raw).state as unknown
    const once = step.up(asWritten)
    expect(step.up(once)).toEqual(once)
  })

  it('and the whole chain is safe to re-run over a v1 envelope', () => {
    const envelope = JSON.parse(raw) as RawEnvelope
    const first = migrateWith(envelope, MIGRATIONS, SCHEMA_VERSION)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    // Re-stamped back to 1 so the chain genuinely walks again.
    const again = migrateWith(
      { ...envelope, schemaVersion: 1, state: first.state },
      MIGRATIONS,
      SCHEMA_VERSION,
    )
    expect(again.ok).toBe(true)
    if (!again.ok) return
    expect(again.state).toEqual(first.state)
  })
})
