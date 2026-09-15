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
import { checkInvariants, type Problem } from '../domain/invariants'
import { rule } from '../domain/errors'
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

/**
 * Refusal copy lives here rather than in `domain/errors.ts` because these three are the
 * only rules in the app that are about THIS BROWSER rather than about the document, and
 * a future `HttpStore` will have neither the conditions nor the sentences.
 */
export const BLOCKED_MESSAGE =
  'This browser holds saved data that could not be read. Nothing can be changed until that is resolved.'
export const UNAVAILABLE_MESSAGE =
  'This browser will not let Chipper use its storage, so nothing can be saved. Export your work before closing the tab.'
export const COULD_NOT_WRITE =
  'Could not write to this browser. Nothing was changed — export your data before closing the tab.'

export type LocalStoreOptions = {
  key?: string
  /** Called when a write fails — quota, private mode, a full disk. */
  onWriteError?: (error: unknown) => void
  /**
   * Check the invariants after every mutation. On in development, off in production.
   *
   * It lives here rather than in `reduce` for two reasons. The reducer is pure and has
   * no business knowing what kind of build it is in; and this is the one funnel every
   * write passes through, so a check here cannot be skipped by a caller. The cost is a
   * walk of the whole document per mutation, which is why it is not on in production.
   */
  checkAfterEveryWrite?: boolean
  /** Where a broken invariant goes. Defaults to console.error. */
  onInvariantBroken?: (problems: Problem[], mutation: Mutation) => void
}

/**
 * What the store found when it opened.
 *
 * `blocked` is the important one: the stored document could not be read, and the store
 * will refuse every write until someone decides what to do about it. Before M8 this case
 * returned an empty state and the first edit overwrote the only copy of the user's data —
 * with no message, because the callback that was meant to warn fired before the session
 * that would have shown it existed.
 */
export type StoreStatus =
  | { kind: 'ok' }
  | { kind: 'empty' }
  | { kind: 'blocked'; reason: string; raw: string }
  /**
   * The browser refused to hand over storage at all. Chrome throws `SecurityError` for
   * `localStorage` on a `file://` page, which PRD §7 explicitly promises to support, and
   * again when a user has blocked site data. Before this the constructor threw out of
   * `onMount`, the promise rejected with nobody listening, and the app sat on "Opening…"
   * for ever — a blank screen being the app's answer to a supported way of running it.
   */
  | { kind: 'unavailable'; reason: string }

export interface LocalStore extends Store {
  /** Read synchronously, so the caller can decide before rendering anything. */
  readonly status: StoreStatus
  /** Abandon unreadable data and start over. Irreversible. */
  startFresh(): Promise<void>
  /** Replace everything with an already-validated document, unblocking the store. */
  adopt(next: State): Promise<void>
}

/**
 * What is in this browser, and whether it can be used.
 *
 * Separated from the constructor so that the four outcomes are one expression each and
 * the caller holds no half-assigned variables. Every branch returns a state, so there is
 * no path on which the store exists without one.
 */
function open(storage: StorageLike, key: string): { status: StoreStatus; state: State } {
  let raw: string | null
  try {
    raw = storage.getItem(key)
  } catch (error) {
    // Nothing can be read and nothing will be writable either. Say so once, here, rather
    // than letting every later call throw from somewhere else.
    return { status: { kind: 'unavailable', reason: String(error) }, state: emptyState() }
  }

  // An empty cell is an empty app, not a corrupt one. Treating `''` as unreadable put a
  // blocking screen — offering to download 0 bytes — in front of a user with nothing to
  // lose, reachable from a truncated write or from a storage shim that returns `''`.
  if (raw === null || raw === '') return { status: { kind: 'empty' }, state: emptyState() }

  let parsed: ReturnType<typeof parseEnvelope>
  try {
    parsed = parseEnvelope(raw, 'stored')
  } catch (error) {
    // parseEnvelope is meant to refuse rather than throw; if it ever does throw, that
    // must not take the app down with it.
    parsed = {
      ok: false,
      error: `The data saved in this browser could not be read. ${String(error)}`,
    }
  }
  if (parsed.ok) return { status: { kind: 'ok' }, state: parsed.state }

  // Blocked, not empty. Nothing is written until the caller resolves it, and the raw
  // bytes are kept so they can be handed back to the user before anything is lost.
  return { status: { kind: 'blocked', reason: parsed.error, raw }, state: emptyState() }
}

export function createLocalStore(
  storage: StorageLike,
  now: () => string,
  options: LocalStoreOptions = {},
): LocalStore {
  const key = options.key ?? STORAGE_KEY
  const listeners = new Set<(s: State) => void>()

  const opened = open(storage, key)
  let status: StoreStatus = opened.status
  let state: State = opened.state

  const checking = options.checkAfterEveryWrite ?? false
  const report =
    options.onInvariantBroken ??
    ((problems: Problem[], mutation: Mutation) => {
      console.error(
        `Invariants broken by ${mutation.kind}:`,
        problems.map((p) => `${p.code}: ${p.detail}`),
      )
    })

  /** Writes, and says whether it got there. Callers that change `status` need to know. */
  const persist = (): boolean => {
    try {
      storage.setItem(key, toEnvelope(state, now()))
      return true
    } catch (error) {
      options.onWriteError?.(error)
      return false
    }
  }

  return {
    get status() {
      return status
    },
    async read() {
      return state
    },
    async apply(mutation: Mutation) {
      rule(status.kind !== 'blocked', 'blocked', BLOCKED_MESSAGE)
      rule(status.kind !== 'unavailable', 'unavailable', UNAVAILABLE_MESSAGE)
      const next = reduce(state, mutation)
      if (checking) {
        const problems = checkInvariants(next)
        if (problems.length > 0) {
          // Loud, and it does NOT roll back: a state that breaks an invariant is a bug
          // in the reducer, and hiding it behind a silent revert is how one survives to
          // reach a user's data. The write still happens; the developer hears about it.
          report(problems, mutation)
        }
      }
      state = next
      persist()
      for (const listener of listeners) listener(state)
    },
    /**
     * Replace everything with a document the caller has already validated.
     *
     * This is the one write a blocked store accepts, and it exists so that importing a
     * good export is a way OUT of the blocked screen. `startFresh` erases; this one
     * replaces — the difference matters, because erasing is the only irreversible thing
     * the app can do and it should never be the sole exit from a recoverable state.
     */
    async adopt(next: State) {
      const before = { status, state }
      status = { kind: 'ok' }
      // Copied, not aliased, and checked — the same two things `replaceAll` does. This is
      // the second door to the same operation, and a door that skips the defences the
      // first one has is how they stop being defences.
      state = {
        ...next,
        swimlanes: { ...next.swimlanes },
        goals: { ...next.goals },
        plans: { ...next.plans },
        tasks: { ...next.tasks },
        pile: { ...next.pile },
        priorities: [...next.priorities],
      }
      if (checking) {
        const problems = checkInvariants(state)
        if (problems.length > 0) report(problems, { kind: 'replaceAll', state, at: now() })
      }
      if (!persist()) {
        status = before.status
        state = before.state
        rule(false, 'write-failed', COULD_NOT_WRITE)
      }
      for (const listener of listeners) listener(state)
    },

    /**
     * Give up on the unreadable bytes and start over.
     *
     * The write comes FIRST and the status only moves if it succeeded. The other order
     * shipped briefly: it declared the store empty and then swallowed a failed write, so
     * a user whose storage was full — a plausible cause of the corruption in the first
     * place — was told they had a fresh start, worked a session that persisted nothing,
     * and was blocked again on reload with no signal at any point.
     */
    async startFresh() {
      const before = { status, state }
      status = { kind: 'empty' }
      state = emptyState()
      if (!persist()) {
        status = before.status
        state = before.state
        rule(false, 'write-failed', COULD_NOT_WRITE)
      }
      for (const listener of listeners) listener(state)
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
