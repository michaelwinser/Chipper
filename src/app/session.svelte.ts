/**
 * Wires a store to the UI: holds the current state reactively, derives the board, and
 * exposes commands. The one piece of glue in the app.
 */
import { buildBoard } from '../domain/select/board'
import { buildPile, type PileModel } from '../domain/select/pile'
import type { Lens } from '../domain/board'
import type { State } from '../domain/state'
import type { Store } from '../store/port'
import { createCommands, type Commands } from './commands'
import type { Deps } from './deps'

/** Which surface is showing. Two, so far — the board and the backlog. */
export type Page = 'board' | 'pile'

export type Session = {
  readonly state: State
  readonly board: ReturnType<typeof buildBoard>
  readonly pile: PileModel
  page: Page
  pileFilter: string | null
  lens: Lens
  readonly commands: Commands
  /** Non-fatal things worth telling the user about — a failed write, a bad import. */
  readonly notice: string | null
  setNotice(message: string | null): void
}

export async function createSession(deps: Deps, store: Store): Promise<Session> {
  let state = $state(await store.read())
  let lens = $state<Lens>({ focus: 'priorities', size: 'any', expanded: [] })
  let notice = $state<string | null>(null)
  let page = $state<Page>('board')
  let pileFilter = $state<string | null>(null)

  store.subscribe((next) => {
    state = next
  })

  const commands = createCommands(deps)

  return {
    get state() {
      return state
    },
    get board() {
      return buildBoard(state, lens)
    },
    get pile() {
      return buildPile(state, pileFilter)
    },
    get page() {
      return page
    },
    set page(next: Page) {
      page = next
    },
    get pileFilter() {
      return pileFilter
    },
    set pileFilter(next: string | null) {
      pileFilter = next
    },
    get lens() {
      return lens
    },
    set lens(next: Lens) {
      lens = next
    },
    get commands() {
      return commands
    },
    get notice() {
      return notice
    },
    setNotice(message: string | null) {
      notice = message
    },
  }
}
