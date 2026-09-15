/**
 * What the fixture file itself has to hold (DESIGN.md §2.1).
 *
 * The fixtures earn their keep in `board.test.ts`, where `buildBoard` must reproduce
 * the artboards exactly. What is left here is the part only this file can check: that
 * the hand-written fixtures are well-formed, and that nothing in any of them — drawn
 * from state or not — expresses a shortfall.
 *
 * Seven tests were removed at M8. They asserted things like "a starred Plan makes its
 * Goal contextual" against literals typed into `boards.ts` by hand, which proves what
 * was typed and nothing about the code. Every one of those rules is now asserted in
 * `board.test.ts` against real `buildBoard` output, where it can actually fail.
 */
import { describe, expect, it } from 'vitest'
import { boards } from '../src/fixtures/boards'
import { buildBoard } from '../src/domain/select/board'
import { mainState } from '../src/fixtures/states'

describe('every fixture', () => {
  it.each(Object.entries(boards))('%s has unique lane and card ids', (_name, board) => {
    const laneIds = board.lanes.map((l) => l.id)
    expect(new Set(laneIds).size).toBe(laneIds.length)
    for (const lane of board.lanes) {
      const goalIds = lane.cards.map((c) => c.goalId)
      expect(new Set(goalIds).size).toBe(goalIds.length)
    }
  })

  it.each(Object.entries(boards))('%s reports no shortfall anywhere (PRD §3)', (_n, board) => {
    // The compile-time guarantee covers the TYPE; this covers the VALUES, including
    // anything a future selector might attach dynamically.
    const forbidden = /overdue|missed|streak|completionrate|abandoned|behind|score|velocity/i
    const offenders: string[] = []
    const scan = (value: unknown, path: string): void => {
      if (value === null || typeof value !== 'object') return
      for (const [key, child] of Object.entries(value)) {
        if (forbidden.test(key)) offenders.push(`${path}.${key}`)
        scan(child, `${path}.${key}`)
      }
    }
    scan(board, 'board')
    expect(offenders).toEqual([])
  })

  it.each(Object.entries(boards))('%s never states the load in words', (_n, board) => {
    expect(JSON.stringify(board)).not.toMatch(
      /too many|too much|slow down|over.?committed|you should|falling/i,
    )
  })

  /**
   * Every fixture card is a shape `buildBoard` could actually emit.
   *
   * There was a "carries every field of the model" test here. It compared each fixture's
   * key set against `main`'s — which for `main` is `expect(x).toEqual(x)`, and for the
   * rest is a job `tsc` already does, since every fixture is annotated `: BoardModel`.
   * It also could not catch what it named: an OPTIONAL field added to the model and to
   * the selector but to no fixture passes both the compiler and that comparison.
   *
   * This asks a question the compiler cannot: does anything actually produce a card like
   * this? `overloaded` and `starDepth` draw shapes no single state produces, so they are
   * checked field-by-field against the vocabulary a real card uses rather than against a
   * sibling fixture.
   */
  it.each(Object.entries(boards))('%s holds cards a selector could produce', (_n, board) => {
    const realCards = buildBoard(mainState(), {
      focus: 'everything',
      size: 'any',
      expanded: ['g-invoicing'],
    }).lanes.flatMap((l) => l.cards)
    expect(realCards.length).toBeGreaterThan(0)
    const realKeys = new Set(realCards.flatMap((c) => Object.keys(c)))

    for (const lane of board.lanes) {
      for (const card of lane.cards) {
        // No field the selector never emits, and none of the selector's fields missing.
        expect({ id: card.goalId, keys: Object.keys(card).sort() }).toEqual({
          id: card.goalId,
          keys: [...realKeys].sort(),
        })
        expect(['active', 'quiet']).toContain(card.emphasis)
        expect(['tasks', 'title-only']).toContain(card.detail)
        expect(card.meta.done).toBeLessThanOrEqual(card.meta.total)
        expect(card.meta.label).toBeTruthy()
        // A title-only card carries no rows, which is what "title-only" means.
        if (card.detail === 'title-only') expect(card.rows).toEqual([])
        // And a card never offers itself as its own demotion target.
        expect(card.demoteUnder.some((t) => t.goalId === card.goalId)).toBe(false)
      }
    }
  })
})
