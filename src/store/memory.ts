/** Holds state in memory and nothing else. Used by tests and by import preview. */
import { reduce } from '../domain/reduce'
import type { Mutation } from '../domain/mutations'
import { emptyState, type State } from '../domain/state'
import type { Store } from './port'

export function createMemoryStore(initial: State = emptyState()): Store {
  let state = initial
  const listeners = new Set<(s: State) => void>()

  return {
    async read() {
      return state
    },
    async apply(mutation: Mutation) {
      state = reduce(state, mutation)
      for (const listener of listeners) listener(state)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
