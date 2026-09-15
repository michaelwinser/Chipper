// @vitest-environment happy-dom
/**
 * The ritual, rendered (UC-3030, UC-3040, UC-3050, UC-2090).
 */
import { describe, expect, it, afterEach } from 'vitest'
import SetPriorities from '../../src/ui/SetPriorities.svelte'
import GoalCard from '../../src/ui/GoalCard.svelte'
import Board from '../../src/ui/Board.svelte'
import Pile from '../../src/ui/Pile.svelte'
import Archive from '../../src/ui/Archive.svelte'
import { buildSweep } from '../../src/domain/select/sweep'
import { buildBoard } from '../../src/domain/select/board'
import { buildPile } from '../../src/domain/select/pile'
import { buildArchive } from '../../src/domain/select/archive'
import { reduce } from '../../src/domain/reduce'
import { mainState } from '../../src/fixtures/states'
import type { Lens } from '../../src/domain/board'
import type { Ref, State } from '../../src/domain/state'
import { render, recordingActions, settle, type Rendered } from './harness'

const TODAY = '2026-09-15'
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

function sweep(state: State = mainState()) {
  const saved: Ref[][] = []
  let cancelled = 0
  const r = show(
    render(SetPriorities, {
      sweep: buildSweep(state, TODAY),
      onsave: (refs: Ref[]) => saved.push(refs),
      oncancel: () => (cancelled += 1),
    }),
  )
  return { r, saved, cancelled: () => cancelled }
}

describe('UC-3030 — the sweep', () => {
  it('starts with everything kept, so letting go is the deliberate act', () => {
    const { r } = sweep()
    const keeps = r.all('button').filter((b) => b.textContent?.trim() === 'Keeping')
    expect(keeps).toHaveLength(4)
    // Not `r.text`: textContent cannot contain angle brackets, so the original check here
    // could never have failed. Count the buttons instead.
    expect(r.all('button').filter((b) => b.textContent?.trim() === 'Keep')).toHaveLength(0)
  })

  it('lets one go and saves the rest in a single step', async () => {
    const s = sweep()
    // Drop "Fix the back gate".
    const row = s.r.all('button').find((b) => b.textContent?.trim() === 'Keeping')!
    row.click()
    await settle()

    s.r.button('these are my priorities')?.click()
    await settle()
    expect(s.saved).toHaveLength(1)
    expect(s.saved[0]).toHaveLength(3)
  })

  it('cancelling changes nothing', async () => {
    const s = sweep()
    s.r
      .all('button')
      .find((b) => b.textContent?.trim() === 'Keeping')!
      .click()
    await settle()
    const cancel = s.r.all('button').find((b) => b.textContent?.trim() === 'Cancel')
    expect(cancel).toBeDefined()
    cancel!.click()
    await settle()
    expect(s.saved).toEqual([])
    expect(s.cancelled()).toBe(1)
  })

  it('adds something from the browse column without leaving the view', async () => {
    const s = sweep()
    const before = buildSweep(mainState(), TODAY).current.length
    s.r.button('Hire a second engineer')?.click()
    await settle()
    s.r.button('these are my priorities')?.click()
    await settle()
    expect(s.saved[0]).toHaveLength(before + 1)
  })

  it('never tallies what was not finished, or how long anything sat', () => {
    const { r } = sweep()
    expect(r.text.toLowerCase()).not.toMatch(
      /overdue|missed|streak|behind|last set|days ago|weeks ago starred|you (have|only|still)/,
    )
  })

  it('what is being let go goes quiet, and is never crossed out or marked', async () => {
    const s = sweep()
    const keeping = s.r.all('button').find((b) => b.textContent?.trim() === 'Keeping')!
    keeping.click()
    await settle()
    expect(s.r.text).toContain('Keep')
    const rows = s.r.all('.letting-go')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.textContent).not.toMatch(/dropped|removed|lost|failed/i)
  })
})

describe('UC-3050 — Coming up', () => {
  it('shows what has a date, how far out, and what is left', () => {
    const { r } = sweep()
    expect(r.text).toContain('Coming up')
    expect(r.text).toContain('Hire a second engineer')
    expect(r.text).toContain('30 Nov')
    expect(r.text).toContain('11 weeks away')
    expect(r.text).toContain('3 tasks left')
  })

  it('can be starred straight from the band', async () => {
    const s = sweep()
    s.r.button('Star Hire a second engineer')?.click()
    await settle()
    s.r.button('these are my priorities')?.click()
    await settle()
    expect(s.saved[0]?.some((ref) => ref.id === 'g-hire')).toBe(true)
  })

  it('a date that has passed is stated, not scolded about', () => {
    const state = reduce(mainState(), {
      kind: 'setDeadline',
      ref: { type: 'goal', id: 'g-garage' },
      deadline: '2026-09-01',
      at: AT,
    })
    const { r } = sweep(state)
    expect(r.text).toContain('was 2 weeks ago')
    // Only the Coming up band — the intro copy legitimately contains the word "late",
    // in the sentence promising that nothing is marked as such.
    const band = r.query('.upcoming')!
    expect((band.textContent ?? '').toLowerCase()).not.toMatch(/overdue|late|missed|should/)
  })

  it('is absent entirely when nothing has a date', () => {
    let state = mainState()
    for (const goal of Object.values(state.goals)) {
      if (goal.deadline !== null) {
        state = reduce(state, {
          kind: 'setDeadline',
          ref: { type: 'goal', id: goal.id },
          deadline: null,
          at: AT,
        })
      }
    }
    const { r } = sweep(state)
    expect(r.text).not.toContain('Coming up')
  })
})

describe('UC-3050 — and nowhere else', () => {
  /**
   * The load-bearing claim of PRD §8.2: the app raises a date on its own in exactly one
   * place. This walks every other surface and checks none of them does.
   */
  const dated = () =>
    reduce(mainState(), {
      kind: 'setDeadline',
      ref: { type: 'goal', id: 'g-invoicing' },
      deadline: '2026-09-16',
      at: AT,
    })

  it('the board states a date but never how near it is', () => {
    const board = buildBoard(dated(), LENS)
    const r = show(render(Board, { board }))
    expect(r.text).toContain('16 Sep')
    expect(r.text.toLowerCase()).not.toMatch(/tomorrow|this week|days|weeks away|coming up|due/)
  })

  // The top bar's own "no count" assertion moved to `shell.test.ts`, where the app is
  // mounted with a stocked pile. Rendered in isolation TopBar is handed no numbers at
  // all, so the test could not fail however loudly a badge were added.

  it('the Pile has no dates at all', () => {
    const r = show(
      render(Pile, {
        pile: buildPile(dated(), null),
        onfilter: () => {},
        oncapture: () => {},
        onedit: () => {},
        onpromote: () => {},
        ondelete: () => {},
      }),
    )
    expect(r.text.toLowerCase()).not.toMatch(/due|tomorrow|weeks away|coming up/)
  })

  it('the Archive shows when something was put away, never when it was due', () => {
    const archived = reduce(dated(), { kind: 'archiveGoal', id: 'g-invoicing', at: AT })
    const r = show(
      render(Archive, { archive: buildArchive(archived), onrestore: () => {}, onremove: () => {} }),
    )
    expect(r.text).not.toContain('16 Sep')
    expect(r.text.toLowerCase()).not.toMatch(/due|deadline|weeks away/)
  })
})

describe('UC-2090 — deadlines are optional', () => {
  it('offers a date on a goal, and asks for one nowhere', () => {
    const card = buildBoard(mainState(), LENS)
      .lanes.flatMap((l) => l.cards)
      .find((c) => c.goalId === 'g-invoicing')!
    const r = show(render(GoalCard, { card }))
    expect(r.text).toContain('add a date')
    // The meta line only. Task titles are the user's words, and one of theirs is
    // "Find the missing March receipts".
    const meta = r.query('.meta')!
    expect((meta.textContent ?? '').toLowerCase()).not.toMatch(/required|needs|missing|deadline/)
  })

  it('reports a date being cleared', async () => {
    const { actions, calls } = recordingActions()
    const card = buildBoard(mainState(), LENS)
      .lanes.flatMap((l) => l.cards)
      .find((c) => c.goalId === 'g-trip')!
    const r = show(render(GoalCard, { card }, { actions }))
    expect(r.text).toContain('1 Dec')
    r.button('Remove the date')?.click()
    await settle()
    expect(calls).toEqual(['setDeadline({"type":"goal","id":"g-trip"}, null)'])
  })
})
