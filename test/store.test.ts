/**
 * Every adapter runs the same contract (DESIGN.md §5.4). Adding an adapter means
 * adding four lines here — and the suite is what says whether it is finished.
 */
import { describeStoreConformance, type StoreHarness } from '../src/store/conformance'
import { createMemoryStore } from '../src/store/memory'
import { createLocalStore, type StorageLike } from '../src/store/local'

const NOW = () => '2026-09-14T10:00:00.000Z'

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

describeStoreConformance('memory', (): StoreHarness => {
  // The memory store has no backing to share, so "reopening" starts from what the
  // previous instance held — modelled by keeping the state between create() calls.
  let carried = createMemoryStore()
  return {
    create: () => carried,
    reset: () => {
      carried = createMemoryStore()
    },
  }
})

describeStoreConformance('local', (): StoreHarness => {
  const storage = fakeStorage()
  return {
    create: () => createLocalStore(storage, NOW),
    reset: () => storage.clear(),
  }
})
