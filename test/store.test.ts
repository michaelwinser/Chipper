/**
 * Every adapter runs the same contract (DESIGN.md §5.4). Adding an adapter means
 * adding four lines here — and the suite is what says whether it is finished.
 */
import {
  describeStoreConformance,
  expectAdaptersAgree,
  type StoreHarness,
} from './support/conformance'
import { describe, expect, it } from 'vitest'
import { createMemoryStore } from '../src/store/memory'
import { emptyState } from '../src/domain/state'
import { createLocalStore, type StorageLike } from '../src/store/local'
import type { Problem } from '../src/domain/invariants'
import type { Mutation } from '../src/domain/mutations'

const NOW = () => '2026-09-14T10:00:00.000Z'
const AT = NOW()

/** A localStorage stand-in, so the adapter is testable with no browser. */
function fakeStorage(): StorageLike & { clear(): void; raw(): Record<string, string> } {
  let data: Record<string, string> = {}
  return {
    getItem: (k) => data[k] ?? null,
    setItem: (k, v) => {
      data[k] = v
    },
    clear: () => {
      data = {}
    },
    raw: () => data,
  }
}

describeStoreConformance(
  'memory',
  (): StoreHarness => {
    // The memory store has no persistent backing, so its "backing" is the last state it
    // held: create() hands back a NEW store seeded from it. Returning the same instance
    // made the durability case satisfiable by a singleton.
    let backing = emptyState()
    return {
      create: () => {
        const store = createMemoryStore(backing)
        store.subscribe((s) => {
          backing = s
        })
        return store
      },
      reset: () => {
        backing = emptyState()
      },
    }
  },
  createMemoryStore,
)

describeStoreConformance(
  'local',
  (): StoreHarness => {
    const storage = fakeStorage()
    return {
      create: () => createLocalStore(storage, NOW),
      reset: () => storage.clear(),
    }
  },
  // The reference to agree with. A LocalStore round-trips through JSON and a MemoryStore
  // does not, so this pairing is the one that catches a field lost in serialization.
  createMemoryStore,
)

describe('the adapters agree with each other', () => {
  it('reaches the same state from the same sequence', async () => {
    const storage = fakeStorage()
    await expectAdaptersAgree(createMemoryStore(), createLocalStore(storage, NOW))
  })

  it('survives the round trip through storage without losing a field', async () => {
    // The specific risk JSON introduces: `doneAt: null`, empty strings, empty arrays.
    const storage = fakeStorage()
    const local = createLocalStore(storage, NOW)
    const memory = createMemoryStore()
    await expectAdaptersAgree(memory, local)

    const reopened = createLocalStore(storage, NOW)
    expect(await reopened.read()).toEqual(await memory.read())
  })
})

describe('the invariants are asserted on every write in development (DESIGN.md §3.3)', () => {
  const opts = () => {
    const broken: { codes: string[]; mutation: string }[] = []
    return {
      broken,
      onInvariantBroken: (problems: Problem[], mutation: Mutation) =>
        broken.push({ codes: problems.map((p) => p.code), mutation: mutation.kind }),
    }
  }

  it('says nothing while the reducer behaves', async () => {
    const { broken, onInvariantBroken } = opts()
    const store = createLocalStore(fakeStorage(), NOW, {
      checkAfterEveryWrite: true,
      onInvariantBroken,
    })
    await store.apply({ kind: 'createSwimlane', id: 'l1', name: 'Work', color: '#333', at: AT })
    await store.apply({ kind: 'createGoal', id: 'g1', swimlaneId: 'l1', title: 'A goal', at: AT })
    await store.apply({ kind: 'addPriority', ref: { type: 'goal', id: 'g1' }, at: AT })
    expect(broken).toEqual([])
  })

  /**
   * `replaceAll` is the one mutation that takes a whole document rather than editing
   * the one it is given — the import path, and by some distance the most likely way a
   * broken state ever enters the app. Every other mutation refuses bad input at the
   * rule level, which is why the check has to sit after the reducer rather than inside
   * it: it is there for the mistake no rule anticipated.
   */
  const brokenState = () => ({
    ...emptyState(),
    priorities: [{ type: 'goal' as const, id: 'never-existed' }],
  })

  it('reports the mutation that broke one, rather than failing silently later', async () => {
    const { broken, onInvariantBroken } = opts()
    const store = createLocalStore(fakeStorage(), NOW, {
      checkAfterEveryWrite: true,
      onInvariantBroken,
    })
    await store.apply({ kind: 'replaceAll', state: brokenState(), at: AT })
    expect(broken).toEqual([{ codes: ['dangling-priority'], mutation: 'replaceAll' }])
  })

  it('does not roll the write back — a reducer bug must be visible, not papered over', async () => {
    const { onInvariantBroken } = opts()
    const store = createLocalStore(fakeStorage(), NOW, {
      checkAfterEveryWrite: true,
      onInvariantBroken,
    })
    await store.apply({ kind: 'replaceAll', state: brokenState(), at: AT })
    expect((await store.read()).priorities).toEqual([{ type: 'goal', id: 'never-existed' }])
  })

  it('is off unless asked for, so production pays nothing for it', async () => {
    let called = 0
    const store = createLocalStore(fakeStorage(), NOW, {
      onInvariantBroken: () => void called++,
    })
    await store.apply({ kind: 'replaceAll', state: brokenState(), at: AT })
    expect(called).toBe(0)
  })
})
