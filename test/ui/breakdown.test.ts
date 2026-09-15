// @vitest-environment happy-dom
/**
 * The break-down dialog and the size lens, rendered (UC-2050, UC-4050, UC-4010).
 */
import { describe, expect, it, afterEach } from 'vitest'
import BreakDownDialog from '../../src/ui/BreakDownDialog.svelte'
import LensControls from '../../src/ui/LensControls.svelte'
import GoalCard from '../../src/ui/GoalCard.svelte'
import type { Lens, Size } from '../../src/domain/board'
import { buildBoard } from '../../src/domain/select/board'
import { mainState } from '../../src/fixtures/states'
import { render, recordingActions, settle, type Rendered } from './harness'

let open: Rendered[] = []
const show = (r: Rendered) => {
  open.push(r)
  return r
}
afterEach(() => {
  for (const r of open) r.destroy()
  open = []
})

function dialog() {
  const broken: { title: string; size: Size | null }[][] = []
  let doneCalled = 0
  let closed = 0
  const r = show(
    render(BreakDownDialog, {
      title: 'Find the missing March receipts',
      starred: true,
      onbreakdown: (pieces: { title: string; size: Size | null }[]) => broken.push(pieces),
      ondone: () => (doneCalled += 1),
      onclose: () => (closed += 1),
    }),
  )
  const input = r.query<HTMLInputElement>('input')!
  const type = async (value: string) => {
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
  }
  const enter = async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle()
  }
  return { r, input, type, enter, broken, done: () => doneCalled, closed: () => closed }
}

describe('UC-2050 — breaking a task down', () => {
  it('shows what it is becoming, and that nothing is lost', () => {
    const d = dialog()
    expect(d.r.text).toContain('This one is too big')
    expect(d.r.text).toContain('Find the missing March receipts')
    expect(d.r.text).toContain('Nothing is deleted')
  })

  it('collects the pieces, one Enter at a time', async () => {
    const d = dialog()
    await d.type('Check the shoebox')
    await d.enter()
    await d.type('Email Dana for her copies')
    await d.enter()
    expect(d.r.text).toContain('Check the shoebox')
    expect(d.r.text).toContain('Email Dana for her copies')

    d.r.button('Make it a plan')?.click()
    await settle()
    expect(d.broken).toEqual([
      [
        { title: 'Check the shoebox', size: 'M' },
        { title: 'Email Dana for her copies', size: 'M' },
      ],
    ])
  })

  it('keeps a half-typed piece rather than punishing you for not pressing Enter', async () => {
    const d = dialog()
    await d.type('Reconstruct from bank statements')
    d.r.button('Make it a plan')?.click()
    await settle()
    expect(d.broken).toEqual([[{ title: 'Reconstruct from bank statements', size: 'M' }]])
  })

  it('carries the size you chose onto the pieces', async () => {
    const d = dialog()
    d.r.button('S')?.click()
    await settle()
    await d.type('a quick one')
    d.r.button('Make it a plan')?.click()
    await settle()
    expect(d.broken).toEqual([[{ title: 'a quick one', size: 'S' }]])
  })
})

describe('UC-4050 — the three outs', () => {
  it('offers all three, and none of them is styled as the right answer', () => {
    const d = dialog()
    expect(d.r.text).toContain('Make it a plan')
    expect(d.r.text).toContain('Leave it open for now')
    expect(d.r.text).toContain('good enough')
  })

  it('"good enough" marks it done and closes', async () => {
    const d = dialog()
    d.r.button('good enough')?.click()
    await settle()
    expect(d.done()).toBe(1)
    expect(d.closed()).toBe(1)
    expect(d.broken).toEqual([])
  })

  it('"leave it open" changes nothing at all', async () => {
    const d = dialog()
    await d.type('a piece I typed and then thought better of')
    d.r.button('Leave it open')?.click()
    await settle()
    expect(d.broken).toEqual([])
    expect(d.done()).toBe(0)
    expect(d.closed()).toBe(1)
  })

  it('never asks how it went, or how long it took', () => {
    const d = dialog()
    expect(d.r.text.toLowerCase()).not.toMatch(/how long|minutes|spent|took|progress|why/)
  })
})

describe('UC-4010 — the size lens is a filter, not a mode', () => {
  const lens: Lens = { focus: 'priorities', size: 'any', expanded: [] }

  it('asks to narrow the view, and decides nothing itself', async () => {
    const { actions, calls } = recordingActions()
    const r = show(render(LensControls, { lens }, { actions }))
    r.button('15m')?.click()
    await settle()
    expect(calls).toEqual(['setSizeLens("S")'])
  })

  it('UC-4030 — a card the lens misses keeps its context and says why', () => {
    const board = buildBoard(mainState(), { ...lens, size: 'S' })
    const card = board.lanes.flatMap((l) => l.cards).find((c) => c.goalId === 'g-trip')!
    const r = show(render(GoalCard, { card }))
    // The goal is still there — vanishing cards would read as the app hiding things.
    expect(r.text).toContain('Plan the December trip')
    expect(r.text).toContain('nothing small here')
    expect(r.text).toContain('your starred task is an M')
  })
})
