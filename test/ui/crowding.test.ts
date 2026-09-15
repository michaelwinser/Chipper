// @vitest-environment happy-dom
/**
 * UC-2080 — the Rule of 3 (PRD §3, decision D1).
 *
 * "Pre: Swimlane with 3 active Goals. Do: add a 4th. Then: it is created; the Swimlane
 * renders in a way that makes the crowding visible. Never: a warning dialog, a red
 * state, or a refusal."
 *
 * The implementation is the layout: cards are a fixed 296px and the lane wraps, so a
 * fourth goal pushes the lane onto a second row — PRD §5.7's "lanes wrap onto second
 * rows, and the page stops fitting on one screen", with `layout.goalsPerLane` the number
 * those widths were chosen around.
 *
 * That sounds like nothing, so this file is mostly about what must NOT happen, and about
 * the specific wrong turn M8 took: a `.crowded` rule narrowing cards to 244px, which made
 * four crowded goals occupy less width than four uncrowded ones. A crowding signal that
 * buys back room is worse than no signal, because it delays the wrap that was the real
 * one. The width assertions below exist to stop that coming back.
 */
import { describe, expect, it, afterEach } from 'vitest'
import Lane from '../../src/ui/Lane.svelte'
import GoalCard from '../../src/ui/GoalCard.svelte'
import { buildBoard } from '../../src/domain/select/board'
import { reduce } from '../../src/domain/reduce'
import { checkInvariants } from '../../src/domain/invariants'
import { layout } from '../../src/domain/layout'
import { mainState } from '../../src/fixtures/states'
import type { CardModel, LaneModel, Lens } from '../../src/domain/board'
import type { State } from '../../src/domain/state'
import { render, recordingActions, type Rendered } from './harness'

const AT = '2026-09-15T10:00:00.000Z'
const LENS: Lens = { focus: 'everything', size: 'any', expanded: [] }

let open: Rendered[] = []
const show = (r: Rendered) => {
  open.push(r)
  return r
}
afterEach(() => {
  for (const r of open) r.destroy()
  open = []
})

const laneNamed = (state: State, name: string, lens: Lens = LENS): LaneModel =>
  buildBoard(state, lens).lanes.find((l) => l.name === name)!

/** Health starts with one goal; bring it to exactly what the lane is laid out for. */
function comfortable(): State {
  let state = mainState()
  for (let i = 0; laneNamed(state, 'Health').cards.length < layout.goalsPerLane; i++) {
    state = reduce(state, {
      kind: 'createGoal',
      id: `g-extra-${i}`,
      swimlaneId: 'l-health',
      title: `Another health goal ${i}`,
      at: AT,
    })
  }
  return state
}

const overfull = () =>
  reduce(comfortable(), {
    kind: 'createGoal',
    id: 'g-fourth',
    swimlaneId: 'l-health',
    title: 'Swim on Tuesdays',
    at: AT,
  })

const widthOf = (el: Element) => parseInt(getComputedStyle(el).getPropertyValue('width'), 10)

describe('UC-2080 — the fourth goal is created like the third', () => {
  it('exists, with nothing marking it out', () => {
    const state = overfull()
    expect(state.goals['g-fourth']).toMatchObject({
      title: 'Swim on Tuesdays',
      swimlaneId: 'l-health',
      archived: false,
    })
    expect(checkInvariants(state)).toEqual([])
  })

  it('is on the board rather than withheld', () => {
    const lane = laneNamed(overfull(), 'Health')
    expect(lane.cards).toHaveLength(layout.goalsPerLane + 1)
    expect(lane.cards.map((c) => c.header.title)).toContain('Swim on Tuesdays')
  })

  it('Never: a refusal — Add a goal is still offered, and still does nothing on its own', () => {
    const { actions, calls } = recordingActions()
    const r = show(render(Lane, { lane: laneNamed(overfull(), 'Health') }, { actions }))
    expect(r.text).toContain('Add a goal')
    expect(calls).toEqual([])
  })

  it('Never: a dialog or a red state', () => {
    const lane = laneNamed(overfull(), 'Health')
    const r = show(render(Lane, { lane }))

    // Anchor first: an absence assertion over an empty render proves nothing.
    expect(r.text).toContain('Swim on Tuesdays')
    expect(r.all('.card')).toHaveLength(lane.cards.length)

    expect(r.query('[role="dialog"]')).toBeNull()
    expect(r.query('[role="alert"]')).toBeNull()
    expect(r.query('[aria-live]')).toBeNull()
  })

  it('Never: a sentence, a badge or a tally about the count', () => {
    const crowded = laneNamed(overfull(), 'Health')
    const calm = laneNamed(comfortable(), 'Health')

    // Compare the app's OWN copy, not the rendered text — a goal titled "Swim on
    // Tuesdays" must never be what makes a "no warning copy" assertion pass or fail.
    const copy = (m: LaneModel) =>
      [m.resting?.summary, m.collapsed ? `${m.collapsed.count} more in ${m.name}` : null]
        .filter((x): x is string => x !== null && x !== undefined)
        .join(' ')
    expect(copy(crowded)).toEqual(copy(calm))

    const r = show(render(Lane, { lane: crowded }))
    const titles = crowded.cards.map((c) => c.header.title)
    const appText = titles.reduce((t, title) => t.split(title).join(' '), r.text).toLowerCase()
    expect(appText).not.toMatch(
      /too many|crowd|limit|rule of|slow down|capacity|over|\d+\s*\/\s*\d+|⚠/,
    )
  })
})

describe('UC-2080 — the crowding is the layout, and the layout must not flinch', () => {
  const cardIn = (lane: LaneModel): CardModel => lane.cards[0]!

  it('a crowded lane gives each card exactly as much room as a calm one', () => {
    // THE regression. M8 shipped `.crowded .items { --card-width: 244px }`, so four
    // crowded goals came to 4×244 + 3×8 = 1000px where four uncrowded ones came to
    // 4×296 + 3×14 = 1226px — the signal bought back 226px and delayed the wrap by one
    // to two goals, at exactly the count where the strain was supposed to start showing.
    const crowded = show(render(Lane, { lane: laneNamed(overfull(), 'Health') }))
    const calm = show(render(Lane, { lane: laneNamed(comfortable(), 'Health') }))
    expect(widthOf(crowded.query('.card')!)).toBe(widthOf(calm.query('.card')!))
  })

  it('so the row a crowded lane needs is strictly wider than a calm one', () => {
    const width = (state: State) => {
      const lane = laneNamed(state, 'Health')
      const r = show(render(Lane, { lane }))
      const cards = r.all('.card')
      const gap = parseInt(getComputedStyle(r.query('.items')!).getPropertyValue('gap'), 10) || 0
      return cards.reduce((sum, el) => sum + widthOf(el), 0) + gap * (cards.length - 1)
    }
    expect(width(overfull())).toBeGreaterThan(width(comfortable()))
  })

  it('and the cards keep their contents — the artboards draw four goals in full', () => {
    // Degrading a crowded lane's cards to bare titles was the other candidate fix. It is
    // wrong here: `mocks/Main.dc.html` draws the Work lane, which holds four goals, with
    // full task lists on the starred ones, and `test/board.test.ts` pins that.
    const work = laneNamed(mainState(), 'Work', { ...LENS, focus: 'priorities' })
    const goals = Object.values(mainState().goals).filter(
      (g) => g.swimlaneId === 'l-work' && !g.archived,
    )
    expect(goals.length).toBeGreaterThan(layout.goalsPerLane)
    expect(work.cards.some((c) => c.rows.length > 0)).toBe(true)
    expect(work.cards.every((c) => c.detail === 'title-only')).toBe(false)
  })

  it('the card width is the same whatever the lane holds, at the card itself', () => {
    // Belt and braces: the width lives in GoalCard and takes no input from the lane, so
    // there is no channel through which crowding could reach it.
    const a = show(render(GoalCard, { card: cardIn(laneNamed(overfull(), 'Health')) }))
    const b = show(render(GoalCard, { card: cardIn(laneNamed(comfortable(), 'Health')) }))
    expect(widthOf(a.query('.card')!)).toBe(widthOf(b.query('.card')!))
    expect(widthOf(a.query('.card')!)).toBeGreaterThan(0)
  })
})
