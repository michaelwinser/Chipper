// @vitest-environment happy-dom
/**
 * The states nobody designs: nothing at all, one of something, and importing over
 * everything (M7 edge-state pass, UC-6030).
 *
 * A person's first sixty seconds with this app happen in the first of these, and their
 * worst sixty seconds could happen in the last.
 */
import { describe, expect, it, afterEach } from 'vitest'
import Board from '../../src/ui/Board.svelte'
import Pile from '../../src/ui/Pile.svelte'
import Archive from '../../src/ui/Archive.svelte'
import SetPriorities from '../../src/ui/SetPriorities.svelte'
import ImportDialog from '../../src/ui/ImportDialog.svelte'
import { buildBoard } from '../../src/domain/select/board'
import { buildPile } from '../../src/domain/select/pile'
import { buildArchive } from '../../src/domain/select/archive'
import { buildSweep } from '../../src/domain/select/sweep'
import { reduce } from '../../src/domain/reduce'
import { emptyState } from '../../src/domain/state'
import type { Lens } from '../../src/domain/board'
import { render, recordingActions, settle, type Rendered } from './harness'

const AT = '2026-09-15T10:00:00.000Z'
const LENS: Lens = { focus: 'priorities', size: 'any', expanded: [] }

let open: Rendered[] = []
const show = (r: Rendered) => {
  open.push(r)
  return r
}
afterEach(() => {
  for (const r of open) r.destroy()
  open = []
})

describe('the first sixty seconds', () => {
  const board = (actions?: ReturnType<typeof recordingActions>['actions']) =>
    show(render(Board, { board: buildBoard(emptyState(), LENS) }, actions ? { actions } : {}))

  it('explains what the app is made of, in the app, without a tour', () => {
    const r = board()
    for (const word of ['swimlane', 'goals', 'plans', 'tasks']) {
      expect(r.text.toLowerCase()).toContain(word)
    }
  })

  it('offers a way in rather than an empty grid', () => {
    const r = board()
    for (const name of ['Work', 'Family', 'Health', 'Fun']) {
      expect(r.button(name)).not.toBeNull()
    }
    expect(r.text).toContain('name your own')
  })

  it('a suggestion creates a lane and nothing else — no sample data to clear out later', async () => {
    const { actions, calls } = recordingActions()
    const r = board(actions)
    r.button('Work')?.click()
    await settle()
    expect(calls).toEqual(['addSwimlane("Work")'])
  })

  it('does not scold, hurry, or congratulate', () => {
    const r = board()
    expect(r.text.toLowerCase()).not.toMatch(
      /welcome|get started|let's|you should|don't forget|take a tour|tip:/,
    )
  })

  it('shows no second way to add a lane while the first-run block is up', () => {
    // Two "add a swimlane" affordances on an empty board is noise, not generosity.
    const r = board()
    const adders = r.all('button').filter((b) => /swimlane/i.test(b.textContent ?? ''))
    expect(adders).toHaveLength(0)
  })
})

describe('empty states that are not the first run', () => {
  it('an empty Pile says where things come from', () => {
    const r = show(
      render(Pile, {
        pile: buildPile(emptyState(), null),
        onfilter: () => {},
        oncapture: () => {},
        onedit: () => {},
        onpromote: () => {},
        ondelete: () => {},
      }),
    )
    expect(r.text).toContain('Nothing in the pile')
    expect(r.text).toContain('⌘K')
  })

  it('an empty Archive states the fact and stops', () => {
    const r = show(
      render(Archive, {
        archive: buildArchive(emptyState()),
        onrestore: () => {},
        onremove: () => {},
      }),
    )
    expect(r.text).toContain('Nothing archived yet')
    expect(r.text.toLowerCase()).not.toMatch(/should|try|why not|start by/)
  })

  it('the sweep with nothing to sweep still offers somewhere to look', () => {
    const state = reduce(emptyState(), {
      kind: 'createSwimlane',
      id: 'l1',
      name: 'Work',
      color: '#5A7391',
      at: AT,
    })
    const r = show(
      render(SetPriorities, {
        sweep: buildSweep(state, '2026-09-15'),
        onsave: () => {},
        oncancel: () => {},
      }),
    )
    expect(r.text).toContain('Nothing starred')
    expect(r.text).toContain('Work')
    expect(r.text).not.toContain('Coming up')
  })

  it('a board with a lane but nothing in it says the lane is empty, not that you are behind', () => {
    const state = reduce(emptyState(), {
      kind: 'createSwimlane',
      id: 'l1',
      name: 'Work',
      color: '#5A7391',
      at: AT,
    })
    const r = show(render(Board, { board: buildBoard(state, LENS) }))
    expect(r.text).toContain('Nothing here yet')
    expect(r.text.toLowerCase()).not.toMatch(/empty|you have no|nothing to do/)
  })
})

describe('UC-6030 — importing over what is already here', () => {
  const summary = { lanes: 4, goals: 7, tasks: 46 }

  function dialog(existing: typeof summary | null) {
    const calls: string[] = []
    const r = show(
      render(ImportDialog, {
        incoming: summary,
        existing,
        onconfirm: () => calls.push('confirm'),
        onexportfirst: () => calls.push('export'),
        onclose: () => calls.push('close'),
      }),
    )
    return { r, calls }
  }

  it('says what arrives and what goes, in counts', () => {
    const { r } = dialog({ lanes: 2, goals: 3, tasks: 12 })
    expect(r.text).toContain('Replace everything with this file?')
    expect(r.text).toMatch(/4 swimlanes, 7 goals, 46 tasks/)
    expect(r.text).toMatch(/2 swimlanes, 3 goals, 12 tasks/)
    expect(r.text).toContain('only place it exists')
  })

  it('offers to export first, and that is the primary action', () => {
    const { r } = dialog({ lanes: 2, goals: 3, tasks: 12 })
    const first = r.all('button')[0]
    expect(first?.textContent).toContain('Export what is here first')
    expect(first?.className).toContain('primary')
  })

  it('replacing is the red one, and never the default', async () => {
    const { r, calls } = dialog({ lanes: 2, goals: 3, tasks: 12 })
    const replace = r.button('Replace everything')!
    expect(replace.className).toContain('danger')
    replace.click()
    await settle()
    expect(calls).toEqual(['confirm'])
  })

  it('on a fresh browser there is nothing to lose, so it does not pretend otherwise', () => {
    const { r } = dialog({ lanes: 0, goals: 0, tasks: 0 })
    expect(r.text).toContain('Import this file?')
    expect(r.text).not.toContain('will be gone')
    expect(r.button('Export what is here first')).toBeNull()
  })

  it('cancelling imports nothing', async () => {
    const { r, calls } = dialog({ lanes: 2, goals: 3, tasks: 12 })
    r.button('Cancel')?.click()
    await settle()
    expect(calls).toEqual(['close'])
  })
})
