/**
 * Persists the whole document to browser storage.
 *
 * Writes on every apply rather than debouncing: the document is small, the write is
 * synchronous, and a debounce introduces a window where a closed tab loses the last
 * edit. If profiling ever says otherwise, that is the moment to add one — not before.
 *
 * Storage is injected rather than reached for, so this is testable without a browser
 * and so a quota failure is something the caller can see.
 */
import { reduce } from '../domain/reduce'
import type { Mutation } from '../domain/mutations'
import { emptyState, type State } from '../domain/state'
import { parseEnvelope, toEnvelope } from '../domain/transfer'
import type { Store } from './port'

/** The slice of the Storage API actually used. localStorage satisfies it. */
export type StorageLike = {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export const STORAGE_KEY = 'chipper.state.v1'

export type LocalStoreOptions = {
  key?: string
  /** Called when a write fails — quota, private mode, a full disk. */
  onWriteError?: (error: unknown) => void
  /** Called when existing data cannot be read, with the reason. */
  onLoadError?: (detail: string) => void
}

export function createLocalStore(
  storage: StorageLike,
  now: () => string,
  options: LocalStoreOptions = {},
): Store {
  const key = options.key ?? STORAGE_KEY
  const listeners = new Set<(s: State) => void>()

  const load = (): State => {
    const raw = storage.getItem(key)
    if (raw === null) return emptyState()
    const parsed = parseEnvelope(raw)
    if (!parsed.ok) {
      // Refuse rather than guess. Nothing is overwritten until the user acts.
      options.onLoadError?.(parsed.error)
      return emptyState()
    }
    return parsed.state
  }

  let state = load()

  const persist = () => {
    try {
      storage.setItem(key, toEnvelope(state, now()))
    } catch (error) {
      options.onWriteError?.(error)
    }
  }

  return {
    async read() {
      return state
    },
    async apply(mutation: Mutation) {
      state = reduce(state, mutation)
      persist()
      for (const listener of listeners) listener(state)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
