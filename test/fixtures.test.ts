/**
 * The mockups as golden fixtures (DESIGN.md §2.1).
 *
 * These assert what the board must look like in each state. When `buildBoard` lands
 * at M2 it has to produce exactly these shapes, so the artboards, the PRD and the
 * code cannot drift apart quietly.
 */
import { describe, expect, it } from 'vitest'
import { boards, main, overloaded, sizeLensS, everything, starDepth } from '../src/fixtures/boards'
import type { BoardModel, CardModel } from '../src/domain/board'
import { layout } from '../src/domain/layout'

const cardsOf = (b: BoardModel): CardModel[] => b.lanes.flatMap((l) => l.cards)
const starredCount = (b: BoardModel): number =>
  cardsOf(b).length + b.lanes.flatMap((l) => l.chips).length

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
})

describe('UC-3020/3021/3022 — the card is always the Goal, the star renders where you put it', () => {
  it('a starred Goal shows in full ink with its own star', () => {
    const card = starDepth.lanes[0]!.cards[0]!
    expect(card.header.starred).toBe(true)
    expect(card.header.contextual).toBe(false)
    expect(card.rows.length).toBeGreaterThan(0)
  })

  it('a starred Plan makes its Goal contextual and unstarred', () => {
    const card = starDepth.lanes[0]!.cards[1]!
    expect(card.header.starred).toBe(false)
    expect(card.header.contextual).toBe(true)
    const starredRows = card.rows.filter((r) => r.starred)
    expect(starredRows).toHaveLength(1)
    expect(starredRows[0]!.kind).toBe('plan')
    expect(card.folded).not.toBeNull()
  })

  it('a starred Task inside a Plan keeps both levels of context and folds both', () => {
    const card = starDepth.lanes[0]!.cards[3]!
    expect(card.header.contextual).toBe(true)
    expect(card.rows.map((r) => r.kind)).toEqual(['plan', 'task'])
    expect(card.rows[1]!.indent).toBe(1)
    expect(card.folded?.text).toMatch(/plan/)
  })

  it('UC-3023 — a loose starred Task is a chip, not a card', () => {
    const stuff = main.lanes.find((l) => l.name === 'Stuff')!
    expect(stuff.chips).toHaveLength(1)
    expect(stuff.cards).toHaveLength(0)
  })
})

describe('UC-3060 — overload is legible without being stated', () => {
  it('every card degrades to title-only once too much is starred', () => {
    expect(starredCount(overloaded)).toBeGreaterThan(layout.detailBudget)
    expect(cardsOf(overloaded).every((c) => c.detail === 'title-only')).toBe(true)
  })

  it('the calm board stays under the budget and keeps its task lists', () => {
    expect(starredCount(main)).toBeLessThanOrEqual(layout.detailBudget)
    expect(cardsOf(main).some((c) => c.rows.length > 0)).toBe(true)
  })

  it('never states the overload — no copy anywhere counts what is starred', () => {
    const text = JSON.stringify(overloaded)
    expect(text).not.toMatch(/too many|too much|slow down|over.?committed|limit/i)
  })
})

describe('UC-5015 — a Swimlane at rest', () => {
  it('shows one quiet line rather than an empty state', () => {
    const health = main.lanes.find((l) => l.name === 'Health')!
    expect(health.cards).toHaveLength(0)
    expect(health.resting?.summary).toBeTruthy()
    expect(health.resting!.summary).not.toMatch(/empty|nothing to do|add|0 /i)
  })
})

describe('UC-4030 — a lens that matches nothing', () => {
  it('keeps the card and explains, rather than making it vanish', () => {
    const family = sizeLensS.lanes.find((l) => l.name === 'Family')!
    expect(family.cards).toHaveLength(1)
    expect(family.cards[0]!.rows).toHaveLength(0)
    expect(family.cards[0]!.empty?.text).toBeTruthy()
  })

  it('UC-4010 — every row surviving the S lens is an S', () => {
    const rows = cardsOf(sizeLensS).flatMap((c) => c.rows)
    const tasks = rows.filter((r) => r.kind === 'task')
    expect(tasks.length).toBeGreaterThan(0)
    expect(tasks.every((t) => t.size === 'S')).toBe(true)
  })
})

describe('UC-4020 — widening to Everything', () => {
  it('brings unstarred goals back as quiet cards rather than a new screen', () => {
    expect(everything.lens.focus).toBe('everything')
    const quiet = cardsOf(everything).filter((c) => c.emphasis === 'quiet')
    expect(quiet.length).toBeGreaterThan(0)
    expect(quiet.every((c) => !c.header.starred)).toBe(true)
    expect(everything.lanes.every((l) => l.collapsed === null)).toBe(true)
  })
})
