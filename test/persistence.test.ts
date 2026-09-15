/**
 * The milestone's actual promise (UC-6040): put things in, close the browser, find
 * them there. This drives the real command layer against the real LocalStore, then
 * throws the store away and opens a new one over the same storage.
 *
 * What it does NOT cover: the Svelte wiring above the commands. That needs a browser.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createCommands } from '../src/app/commands'
import { createLocalStore, STORAGE_KEY, type StorageLike } from '../src/store/local'
import { checkInvariants } from '../src/domain/invariants'
import { buildBoard } from '../src/domain/select/board'
import { progressOf, SCHEMA_VERSION } from '../src/domain/state'
import { parseEnvelope } from '../src/domain/transfer'

function browserStorage(): StorageLike & { snapshot(): string | null } {
  const data = new Map<string, string>()
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    snapshot: () => data.get(STORAGE_KEY) ?? null,
  }
}

let tick = 0
const now = () => `2026-09-14T10:00:${String(tick++).padStart(2, '0')}.000Z`
const today = () => '2026-09-14'
let counter = 0
const newId = () => `id-${counter++}`

describe('UC-6040 — a session survives being closed and reopened', () => {
  it('keeps structure, sizes and done history across a reload', async () => {
    const storage = browserStorage()

    // --- first session: build something real ---
    const first = createLocalStore(storage, now)
    const c1 = createCommands({ store: first, now, today, newId })
    const lane = await c1.addSwimlane('Work', '#5A7391')
    const goal = await c1.addGoal(lane, 'Catch up on invoicing')
    const plan = await c1.addPlan({ type: 'goal', id: goal }, 'One month a week')
    const march = await c1.addTask({ type: 'plan', id: plan }, 'Invoice March', 'M')
    await c1.addTask({ type: 'plan', id: plan }, 'Invoice April', 'M')
    await c1.addTask({ type: 'goal', id: goal }, 'Find the receipts', 'S')
    await c1.setDone(march, true)

    expect(storage.snapshot()).not.toBeNull()

    // --- the browser closes; a completely new store opens the same storage ---
    const second = createLocalStore(storage, now)
    const state = await second.read()

    expect(Object.keys(state.swimlanes)).toHaveLength(1)
    expect(state.swimlanes[lane]?.name).toBe('Work')
    expect(state.goals[goal]?.title).toBe('Catch up on invoicing')
    expect(state.plans[plan]?.parent).toEqual({ type: 'goal', id: goal })
    expect(progressOf(state, { type: 'goal', id: goal })).toEqual({ done: 1, total: 3 })
    expect(state.tasks[march]?.doneAt).not.toBeNull()

    // What was written is a valid export, so the safety net works on real data too.
    const parsed = parseEnvelope(storage.snapshot()!)
    expect(parsed.ok).toBe(true)
  })

  it('refuses to write over data it could not read, rather than starting empty', async () => {
    // The worst path in the app before M8: unreadable data produced an empty board, and
    // the first edit persisted that empty board over the only copy that existed.
    const storage = browserStorage()
    storage.setItem(STORAGE_KEY, 'not json at all')
    const store = createLocalStore(storage, now)

    expect(store.status.kind).toBe('blocked')
    if (store.status.kind === 'blocked') {
      expect(store.status.reason).toMatch(/not valid JSON/)
      // The bytes are kept, so they can be handed back before anything is lost.
      expect(store.status.raw).toBe('not json at all')
    }

    const commands = createCommands({ store, now, today, newId })
    await expect(commands.addSwimlane('Work', '#5A7391')).rejects.toThrow(/could not be read/)
    expect(storage.snapshot()).toBe('not json at all')
  })

  it('starts fresh only when told to, and only then writes', async () => {
    const storage = browserStorage()
    storage.setItem(STORAGE_KEY, 'not json at all')
    const store = createLocalStore(storage, now)

    await store.startFresh()
    expect(store.status.kind).toBe('empty')
    expect(storage.snapshot()).not.toBe('not json at all')

    const commands = createCommands({ store, now, today, newId })
    await commands.addSwimlane('Work', '#5A7391')
    expect(Object.keys((await store.read()).swimlanes)).toHaveLength(1)
  })

  it('blocks on stored data from a newer version, which is the case most likely to happen', async () => {
    // A second device, or an older deployment opened after a newer one. ROADMAP claimed
    // this refused to load; it was true of file import and false of stored data.
    const storage = browserStorage()
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({ app: 'chipper', schemaVersion: 99, exportedAt: now(), state: {} }),
    )
    const store = createLocalStore(storage, now)
    expect(store.status.kind).toBe('blocked')
    if (store.status.kind !== 'blocked') return
    expect(store.status.reason).toMatch(/newer version of Chipper/)
  })

  it('tells the caller when the browser refuses to save, rather than failing silently', async () => {
    const failures: unknown[] = []
    const full: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError')
      },
    }
    const store = createLocalStore(full, now, { onWriteError: (e) => failures.push(e) })
    const commands = createCommands({ store, now, today, newId })
    await commands.addSwimlane('Work', '#5A7391')

    expect(failures).toHaveLength(1)
    // The change still applied in memory — the user does not lose their typing.
    expect(Object.keys((await store.read()).swimlanes)).toHaveLength(1)
  })
})

describe('UC-6050 — opening M7 data under M8, which is what every existing user does', () => {
  /**
   * The deploy-day path, and it had no test.
   *
   * Every v1→v2 assertion went through `parseEnvelope` directly — the IMPORT path. The
   * path that matters is a version-1 envelope sitting in `localStorage` when the new
   * bundle loads, because that is where `createLocalStore` turns a migration failure into
   * `blocked`: a screen instead of a board, for a user who did nothing but refresh.
   */
  const m7 = readFileSync(
    resolve(import.meta.dirname, 'fixtures/exports/synthetic-v1-m7-archived-star.json'),
    'utf8',
  )

  function storageHolding(raw: string) {
    const cells = new Map<string, string>([[STORAGE_KEY, raw]])
    return {
      getItem: (k: string) => cells.get(k) ?? null,
      setItem: (k: string, v: string) => void cells.set(k, v),
      raw: () => cells.get(STORAGE_KEY) ?? null,
    }
  }

  it('opens the board, rather than the blocking screen', () => {
    const storage = storageHolding(m7)
    const store = createLocalStore(storage, now)
    expect(store.status.kind).toBe('ok')
  })

  it('arrives migrated — the stars inside the archived goal are gone, the live one stays', async () => {
    const store = createLocalStore(storageHolding(m7), now)
    const state = await store.read()
    expect(state.priorities).toEqual([{ type: 'task', id: 't-may' }])
    expect(state.schemaVersion).toBe(SCHEMA_VERSION)
    expect(checkInvariants(state)).toEqual([])
  })

  it('keeps everything else — the archived goal still holds its plan and its task', async () => {
    const store = createLocalStore(storageHolding(m7), now)
    const state = await store.read()
    expect(state.goals['g-done']?.archived).toBe(true)
    expect(Object.keys(state.plans)).toEqual(['p-cut'])
    expect(Object.keys(state.tasks).sort()).toEqual(['t-may', 't-notes'])
  })

  it('persists the upgrade on the first write, so it happens once', async () => {
    const storage = storageHolding(m7)
    const store = createLocalStore(storage, now)
    await store.apply({
      kind: 'renameEntity',
      ref: { type: 'goal', id: 'g-live' },
      title: 'X',
      at: now(),
    })
    const written = JSON.parse(storage.raw()!) as { schemaVersion: number }
    expect(written.schemaVersion).toBe(SCHEMA_VERSION)
  })

  it('and the board renders, which is the thing the user actually sees', async () => {
    const store = createLocalStore(storageHolding(m7), now)
    const board = buildBoard(await store.read(), {
      focus: 'everything',
      size: 'any',
      expanded: [],
    })
    expect(board.lanes.flatMap((l) => l.cards).map((c) => c.header.title)).toContain(
      'Catch up on invoicing',
    )
  })
})
