/**
 * The persistence port (DESIGN.md §5.1).
 *
 * Three methods. This is the entire surface that has to be reimplemented for
 * Firestore — and because the reducer lives in the domain rather than in here,
 * adapters persist but never decide.
 */
import type { Mutation } from '../domain/mutations'
import type { State } from '../domain/state'

export interface Store {
  read(): Promise<State>
  apply(mutation: Mutation): Promise<void>
  subscribe(listener: (state: State) => void): () => void
}
