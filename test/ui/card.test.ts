// @vitest-environment happy-dom
/**
 * The three bugs that reached the user, as tests.
 *
 * Every case here is one the pure view-model suite structurally cannot catch: they are
 * about what ends up in the DOM and whether it can actually be seen and used.
 */
import { describe, expect, it, afterEach } from 'vitest'
import GoalCard from '../../src/ui/GoalCard.svelte'
import Lane from '../../src/ui/Lane.svelte'
import type { CardModel, LaneModel, Lens } from '../../src/domain/board'
import { buildBoard } from '../../src/domain/select/board'
import { mainState } from '../../src/fixtures/states'
import { render, recordingActions, settle, type Rendered } from './harness'

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

function cards(expanded: string[] = []): CardModel[] {
  return buildBoard(mainState(), { ...LENS, expanded }).lanes.flatMap((l) => l.cards)
}
const card = (goalId: string, expanded: string[] = []) =>
  cards(expanded).find((c) => c.goalId === goalId)!

/** Everything that would make an element invisible while still taking up space. */
function hiddenBy(el: Element, styles: string): string[] {
  const reasons: string[] = []
  const classes = [...el.classList]
  for (const rule of styles.split('}')) {
    const [selectorPart, body = ''] = rule.split('{')
    if (!/opacity:\s*0(?!\.)|visibility:\s*hidden|display:\s*none/.test(body)) continue
    for (const selector of (selectorPart ?? '').split(',')) {
      const bare = selector.trim()
      if (!bare || bare.includes(' ') || bare.includes(':')) continue
      const wanted = bare.split('.').filter(Boolean)
      if (wanted.length > 0 && wanted.every((c) => classes.includes(c))) {
        reasons.push(`${bare} → ${body.trim()}`)
      }
    }
  }
  return reasons
}

describe('a goal card renders what the view model says', () => {
  it('shows the title, the progress label and the tasks in play', () => {
    const r = show(render(GoalCard, { card: card('g-invoicing') }))
    expect(r.text).toContain('Catch up on invoicing')
    expect(r.text).toContain('3 of 7 done')
    expect(r.text).toContain('Invoice May')
    expect(r.text).toContain('1 more open')
  })

  it('a goal with no tasks says so, rather than 0 of 0', () => {
    const c = {
      ...card('g-invoicing'),
      meta: { ...card('g-invoicing').meta, total: 0, done: 0, label: 'no tasks yet' },
    }
    const r = show(render(GoalCard, { card: c }))
    expect(r.text).toContain('no tasks yet')
    expect(r.text).not.toContain('0 of 0')
  })
})

describe('the opened card is actually visible (the opacity:0 regression)', () => {
  it('renders its contents when open', () => {
    const r = show(render(GoalCard, { card: card('g-chipper', ['g-chipper']) }))
    expect(r.text).toContain('Build the prototype')
    expect(r.text).toContain('Ship it')
    expect(r.text).toContain('Tell people')
  })

  it('is not hidden by any rule that matches the card element itself', async () => {
    const r = show(render(GoalCard, { card: card('g-chipper', ['g-chipper']) }))
    await settle()
    const el = r.query('article')!
    expect(el).not.toBeNull()
    // The bug: `.open` styled the toggle button AND matched the card, which carries the
    // same class. Any bare selector that both matches this element and hides it is one.
    const styles = [...document.querySelectorAll('style')].map((s) => s.textContent ?? '').join('')
    expect(hiddenBy(el, styles)).toEqual([])
  })

  it('shows plans that have nothing under them — otherwise unreachable', () => {
    const r = show(render(GoalCard, { card: card('g-chipper', ['g-chipper']) }))
    const planTitles = r.all('article *').map((e) => e.textContent ?? '')
    expect(planTitles.some((t) => t.includes('Tell people'))).toBe(true)
  })
})

describe('a card asks for things rather than deciding them', () => {
  it('the star reports a toggle at the level it was drawn', async () => {
    const { actions, calls } = recordingActions()
    const r = show(render(GoalCard, { card: card('g-invoicing') }, { actions }))
    r.button('priorities')?.click()
    await settle()
    expect(calls).toEqual(['toggleStar({"type":"goal","id":"g-invoicing"})'])
  })

  it('opening asks to open, and does not decide anything itself', async () => {
    const { actions, calls } = recordingActions()
    const r = show(render(GoalCard, { card: card('g-invoicing') }, { actions }))
    r.button('open')?.click()
    await settle()
    expect(calls).toEqual(['toggleExpanded("g-invoicing")'])
  })

  it('offers nothing to press when it is only being looked at', () => {
    const r = show(render(GoalCard, { card: card('g-invoicing') }, { readOnly: true }))
    const leftover = r.all('button').map((b) => b.outerHTML.slice(0, 120))
    expect(leftover).toEqual([])
  })
})

describe('a lane at rest (UC-5015)', () => {
  const lane = (): LaneModel =>
    buildBoard(mainState(), LENS).lanes.find((l) => l.name === 'Health')!

  it('shows one quiet line and offers to widen, with no empty state', () => {
    const r = show(render(Lane, { lane: lane() }))
    expect(r.text).toContain('1 goal, nothing prioritised right now')
    expect(r.text.toLowerCase()).not.toMatch(/empty|you have|get started/)
  })

  it('clicking that line asks to show everything', async () => {
    const { actions, calls } = recordingActions()
    const r = show(render(Lane, { lane: lane() }, { actions }))
    r.button('nothing prioritised')?.click()
    await settle()
    expect(calls).toEqual(['setFocus("everything")'])
  })
})

describe('a read-only board offers no controls at all', () => {
  it('renders no button anywhere, in any card shape', () => {
    for (const goalId of ['g-invoicing', 'g-chipper', 'g-trip']) {
      const r = show(render(GoalCard, { card: card(goalId) }, { readOnly: true }))
      expect(r.all('button')).toEqual([])
    }
  })

  it('renders no button in a lane, chips included', () => {
    const stuff = buildBoard(mainState(), LENS).lanes.find((l) => l.name === 'Stuff')!
    const r = show(render(Lane, { lane: stuff }, { readOnly: true }))
    expect(r.text).toContain('Fix the back gate')
    expect(r.all('button')).toEqual([])
  })
})

describe('UC-5010 — finished work reads as progress', () => {
  const opened = (goalId: string) =>
    buildBoard(mainState(), { ...LENS, expanded: [goalId] })
      .lanes.flatMap((l) => l.cards)
      .find((c) => c.goalId === goalId)!

  it('shows what was finished, under its own heading', () => {
    const r = show(render(GoalCard, { card: opened('g-invoicing') }))
    expect(r.text).toContain('Done so far (3)')
    expect(r.text).toContain('Invoice March')
    expect(r.text).toContain('3 of 7 done')
  })

  it('never says anything about what is left undone', () => {
    const r = show(render(GoalCard, { card: opened('g-invoicing') }))
    expect(r.text.toLowerCase()).not.toMatch(/remaining|outstanding|still|behind|only \d/)
  })

  it('a finished task can be put back, because finishing is not a trap', async () => {
    const { actions, calls } = recordingActions()
    const r = show(render(GoalCard, { card: opened('g-invoicing') }, { actions }))
    r.button('Invoice March')?.click()
    await settle()
    expect(calls).toEqual(['setDone("t-march", false)'])
  })
})
