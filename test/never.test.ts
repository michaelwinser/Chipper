// @vitest-environment happy-dom
/**
 * The `Never` clauses, as tests (M8).
 *
 * Every use case in the PRD ends in a `Never` line, and those lines are the product
 * principles made checkable — they say what the app must not become, which is the half
 * that erodes quietly. Most were already covered where their feature was built. These
 * five were named in the M8 review as asserted nowhere.
 *
 * They read as absence assertions, and absence assertions are the easiest kind to write
 * badly: `expect(text).not.toContain('streak')` passes on a blank page. So each one here
 * first proves the surface it is checking actually rendered the thing it is about.
 */
import { describe, expect, it, afterEach } from 'vitest'
import Board from '../src/ui/Board.svelte'
import GoalCard from '../src/ui/GoalCard.svelte'
import Lane from '../src/ui/Lane.svelte'
import BreakDownDialog from '../src/ui/BreakDownDialog.svelte'
import { buildBoard } from '../src/domain/select/board'
import { buildArchive } from '../src/domain/select/archive'
import { reduce } from '../src/domain/reduce'
import { mainState } from '../src/fixtures/states'
import type { BoardModel, Lens } from '../src/domain/board'
import type { State } from '../src/domain/state'
import { render, recordingActions, settle, type Rendered } from './ui/harness'

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

const board = (state: State = mainState(), lens: Lens = LENS) => buildBoard(state, lens)
const laneNamed = (b: BoardModel, name: string) => b.lanes.find((l) => l.name === name)!

describe('UC-2025 — Never: leaving the board to create a goal', () => {
  it('offers the control inside the lane itself', () => {
    const r = show(render(Lane, { lane: laneNamed(board(), 'Health') }))
    expect(r.button('Add a goal')).not.toBeNull()
  })

  it('creates it in place, with no navigation and no dialog', async () => {
    const { actions, calls } = recordingActions()
    const r = show(render(Lane, { lane: laneNamed(board(), 'Health') }, { actions }))
    r.button('Add a goal')!.click()
    await settle()

    const field = r.query<HTMLInputElement>('input')!
    field.value = 'Sleep properly'
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle()

    expect(calls).toEqual(['addGoal("l-health", "Sleep properly")'])
    // Nothing asked to change page, and nothing opened over the lane.
    expect(calls.some((c) => c.startsWith('setFocus'))).toBe(false)
    expect(r.query('[role="dialog"]')).toBeNull()
  })

  it('the new goal is not flagged for having no plans, tasks or deadline', () => {
    const state = reduce(mainState(), {
      kind: 'createGoal',
      id: 'g-new',
      swimlaneId: 'l-health',
      title: 'Sleep properly',
      at: AT,
    })
    const card = board(state, { ...LENS, focus: 'everything' })
      .lanes.flatMap((l) => l.cards)
      .find((c) => c.goalId === 'g-new')!
    const r = show(render(GoalCard, { card }))
    expect(r.text).toContain('Sleep properly')
    expect(r.text).toContain('no tasks yet')
    expect(r.text).not.toMatch(/incomplete|unfinished|missing|needs a|set a deadline!|empty goal/i)
    expect(r.text).not.toContain('0 of 0')
  })
})

describe('UC-4010 — Never: a picker screen, a forced suggestion, a timer', () => {
  const sized = () => board(mainState(), { ...LENS, size: 'S' })

  it('is the same board in the same places — nothing navigates', () => {
    const before = board()
    const after = sized()
    expect(after.lanes.map((l) => l.id)).toEqual(before.lanes.map((l) => l.id))
    expect(after.lanes.map((l) => l.cards.map((c) => c.goalId))).toEqual(
      before.lanes.map((l) => l.cards.map((c) => c.goalId)),
    )
  })

  it('each surviving task still shows what it serves', () => {
    const card = sized()
      .lanes.flatMap((l) => l.cards)
      .find((c) => c.rows.some((row) => row.kind === 'task'))!
    // The Goal is the card; a Plan, where there is one, is a row above its tasks.
    expect(card.header.title).toBeTruthy()
    const r = show(render(GoalCard, { card }))
    expect(r.text).toContain(card.header.title)
  })

  it('offers no timer, countdown or single forced choice anywhere on the board', () => {
    const board = sized()
    const r = show(render(Board, { board }))
    const tasks = board.lanes
      .flatMap((l) => l.cards)
      .flatMap((c) => c.rows)
      .filter((row) => row.kind === 'task')
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks.every((t) => t.size === 'S')).toBe(true)

    // Anchor on the RENDER, not the model. The three assertions above are about `board`
    // and say nothing about `r` — so this test passed against a Board component whose
    // template had been emptied, cheerfully reporting the absence of a countdown on a
    // blank page. The file's own docstring promises otherwise; now it is true.
    for (const title of board.lanes.flatMap((l) => l.cards.map((c) => c.header.title))) {
      expect(r.text).toContain(title)
    }
    expect(r.all('.card').length).toBeGreaterThan(0)

    expect(r.text.toLowerCase()).not.toMatch(
      /timer|countdown|start now|minutes left|do this next|we suggest|recommended/,
    )
    expect(r.query('[role="dialog"]')).toBeNull()
  })
})

describe('UC-4040 — Never: a score, a streak, a celebration to dismiss', () => {
  const finished = () =>
    reduce(mainState(), { kind: 'setTaskDone', id: 't-may', done: true, at: AT })

  it('records the completion', () => {
    const state = finished()
    expect(state.tasks['t-may']).toMatchObject({ done: true, doneAt: AT })
  })

  it('takes it out of the open list and moves the count', () => {
    const before = board()
      .lanes.flatMap((l) => l.cards)
      .find((c) => c.goalId === 'g-invoicing')!
    const after = board(finished())
      .lanes.flatMap((l) => l.cards)
      .find((c) => c.goalId === 'g-invoicing')!
    expect(after.meta.done).toBe(before.meta.done + 1)
    expect(after.rows.map((r) => r.id)).not.toContain('t-may')
  })

  it('says nothing celebratory, and opens nothing to dismiss', () => {
    const r = show(render(Board, { board: board(finished()) }))
    expect(r.text).toContain('4 of 7 done')
    // Scoped to app copy: a goal titled "Improve the score" would otherwise fail this.
    const titles = board(finished())
      .lanes.flatMap((l) => l.cards)
      .map((c) => c.header.title)
    const appText = titles
      .reduce((text, title) => text.split(title).join(' '), r.text)
      .toLowerCase()
    expect(appText).not.toMatch(
      /streak|nice work|well done|congratulations|great job|🎉|points|score|you're on a roll/,
    )
    expect(r.query('[role="dialog"]')).toBeNull()
    expect(r.query('[role="alert"]')).toBeNull()
  })

  it('does not re-sort the card under the cursor', () => {
    // The order a person is looking at has to survive them ticking something in it.
    const ids = (b: BoardModel) => b.lanes.flatMap((l) => l.cards.map((c) => c.goalId))
    expect(ids(board(finished()))).toEqual(ids(board()))
  })
})

describe('UC-4050 — Never: an unprompted dialog asking how it went', () => {
  it('the three outs appear only once break-down is asked for', async () => {
    const { actions, calls } = recordingActions()
    const card = board()
      .lanes.flatMap((l) => l.cards)
      .find((c) => c.goalId === 'g-invoicing')!
    const r = show(render(GoalCard, { card }, { actions }))

    // Rendering a card with work in it opens nothing on its own.
    expect(r.query('[role="dialog"]')).toBeNull()
    expect(calls).toEqual([])

    r.button('too big')!.click()
    await settle()
    expect(calls.some((c) => c.startsWith('breakDown'))).toBe(true)
  })

  it('records nothing about time spent, whichever out is taken', async () => {
    const calls: string[] = []
    const r = show(
      render(BreakDownDialog, {
        title: 'Find the missing March receipts',
        starred: true,
        onbreakdown: () => calls.push('breakdown'),
        ondone: () => calls.push('done'),
        onclose: () => calls.push('close'),
      }),
    )
    expect(r.text).toContain('Find the missing March receipts')
    expect(r.text.toLowerCase()).not.toMatch(
      /how did it go|how long|time spent|minutes|hours worked|rate this/,
    )

    // One button, clicked once. This was `a?.click() ?? b!.click()` — and `click()`
    // returns undefined, so `??` always evaluated the right side too. Both selectors
    // happen to resolve to the same element today, so it clicked one button twice and
    // looked fine; a second "Done" button would have had it silently exercising two
    // different outs while asserting on one.
    const out = r.button('good enough')
    expect(out).not.toBeNull()
    out!.click()
    await settle()
    // done THEN close: taking an out also dismisses the dialog, which is the behaviour
    // the old `?? ` spelling was hiding by clicking twice and asserting with toContain.
    expect(calls).toEqual(['done', 'close'])

    // Nothing about duration is recorded ANYWHERE on the task — checked as a whitelist
    // of the fields that may exist, not a blacklist of two names someone thought of.
    const after = reduce(mainState(), { kind: 'setTaskDone', id: 't-receipts', done: true, at: AT })
    const task = after.tasks['t-receipts']!
    expect(Object.keys(task).sort()).toEqual([
      'createdAt',
      'deadline',
      'done',
      'doneAt',
      'id',
      'notes',
      'parent',
      'size',
      'title',
      'updatedAt',
    ])
  })
})

describe('UC-2130 — Never: an incomplete badge, a percentage, a count of what was left', () => {
  /** Archived with six of seven done, and archived with none done. */
  const done = () =>
    reduce(reduce(mainState(), { kind: 'setTaskDone', id: 't-may', done: true, at: AT }), {
      kind: 'archiveGoal',
      id: 'g-invoicing',
      at: AT,
    })
  const abandoned = () => reduce(mainState(), { kind: 'archiveGoal', id: 'g-docs', at: AT })

  it('leaves the board with its subtree, and clears stars pointing into it', () => {
    const state = abandoned()
    expect(state.goals['g-docs']!.archived).toBe(true)
    expect(
      buildBoard(state, LENS)
        .lanes.flatMap((l) => l.cards)
        .map((c) => c.goalId),
    ).not.toContain('g-docs')
    expect(state.priorities.some((r) => r.type === 'goal' && r.id === 'g-docs')).toBe(false)
  })

  it('gives the abandoned goal the same entry SHAPE as the finished one', () => {
    // The original test compared the two entries' TYPES, which are identical by
    // construction — it would have passed with a completion percentage on one of them.
    // This compares the VALUES: every field but the goal's own identity must match.
    const finished = buildArchive(done()).entries.find((e) => e.goalId === 'g-invoicing')!
    const given = buildArchive(abandoned()).entries.find((e) => e.goalId === 'g-docs')!

    expect(Object.keys(given).sort()).toEqual(Object.keys(finished).sort())
    const identity = new Set(['goalId', 'title'])
    for (const key of Object.keys(finished)) {
      if (identity.has(key)) continue
      expect({ key, value: given[key as keyof typeof given] }).toEqual({
        key,
        value: finished[key as keyof typeof finished],
      })
    }
  })

  it('carries no tally, percentage or marker in any archive entry', () => {
    const entries = buildArchive(done()).entries
    expect(entries.length).toBeGreaterThan(0)
    const text = JSON.stringify(entries)
    expect(text).not.toMatch(/incomplete|abandoned|percent|%|remaining|left over|unfinished/i)
    for (const entry of entries) {
      expect(Object.keys(entry)).not.toContain('done')
      expect(Object.keys(entry)).not.toContain('total')
    }
  })
})
