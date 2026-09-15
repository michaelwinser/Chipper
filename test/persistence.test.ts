/**
 * The milestone's actual promise (UC-6040): put things in, close the browser, find
 * them there. This drives the real command layer against the real LocalStore, then
 * throws the store away and opens a new one over the same storage.
 *
 * What it does NOT cover: the Svelte wiring above the commands. That needs a browser.
 */
import { describe, expect, it } from 'vitest'
import { createCommands } from '../src/app/commands'
import { createLocalStore, STORAGE_KEY, type StorageLike } from '../src/store/local'
import { progressOf } from '../src/domain/state'
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
let counter = 0
const newId = () => `id-${counter++}`

describe('UC-6040 — a session survives being closed and reopened', () => {
  it('keeps structure, sizes and done history across a reload', async () => {
    const storage = browserStorage()

    // --- first session: build something real ---
    const first = createLocalStore(storage, now)
    const c1 = createCommands({ store: first, now, newId })
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

  it('starts empty and unbroken when storage holds something unreadable', async () => {
    const storage = browserStorage()
    storage.setItem(STORAGE_KEY, 'not json at all')
    const reasons: string[] = []
    const store = createLocalStore(storage, now, { onLoadError: (d) => reasons.push(d) })

    const state = await store.read()
    expect(Object.keys(state.swimlanes)).toHaveLength(0)
    expect(reasons).toHaveLength(1)
    expect(reasons[0]).toMatch(/not valid JSON/)
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
    const commands = createCommands({ store, now, newId })
    await commands.addSwimlane('Work', '#5A7391')

    expect(failures).toHaveLength(1)
    // The change still applied in memory — the user does not lose their typing.
    expect(Object.keys((await store.read()).swimlanes)).toHaveLength(1)
  })
})
