/**
 * Wires a store to the UI: holds the current state reactively, derives the board, and
 * exposes commands. The one piece of glue in the app.
 */
import { buildBoard } from '../domain/select/board'
import { buildPile, type PileModel } from '../domain/select/pile'
import { buildArchive, type ArchiveModel } from '../domain/select/archive'
import { buildSweep, type SweepModel } from '../domain/select/sweep'
import type { Lens } from '../domain/board'
import type { State } from '../domain/state'
import type { Store } from '../store/port'
import { createCommands, type Commands } from './commands'
import type { Deps } from './deps'

/** Which surface is showing. Two, so far — the board and the backlog. */
export type Page = 'board' | 'pile' | 'archive' | 'priorities'

export type Session = {
  readonly state: State
  readonly board: ReturnType<typeof buildBoard>
  readonly pile: PileModel
  readonly archive: ArchiveModel
  readonly sweep: SweepModel
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
    get archive() {
      return buildArchive(state)
    },
    get sweep() {
      // Today is injected; the domain never reads a clock of its own. `deps.today()`,
      // not `now().slice(0, 10)` — the latter is the UTC date, which is a different day
      // from the user's for several hours out of every twenty-four.
      return buildSweep(state, deps.today())
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
