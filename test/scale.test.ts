/**
 * What happens at 10x and 100x the expected amount (edge-state review, M7).
 *
 * Chipper is deliberately small — a handful of swimlanes, the rule of three — but "the
 * user is not supposed to have that much" is not a reason for the app to fall over when
 * they do. These numbers are far past reasonable on purpose.
 */
import { describe, expect, it } from 'vitest'
import { buildBoard } from '../src/domain/select/board'
import { buildSweep } from '../src/domain/select/sweep'
import { buildPile } from '../src/domain/select/pile'
import { buildArchive } from '../src/domain/select/archive'
import { checkInvariants } from '../src/domain/invariants'
import { reduce } from '../src/domain/reduce'
import { toEnvelope, parseEnvelope } from '../src/domain/transfer'
import { emptyState, type State } from '../src/domain/state'
import type { Lens } from '../src/domain/board'

const AT = '2026-09-15T10:00:00.000Z'
const LENS: Lens = { focus: 'priorities', size: 'any', expanded: [] }

/** lanes × goals × plans × tasks-per-plan, plus a star on every goal. */
function big(lanes: number, goalsPer: number, plansPer: number, tasksPer: number): State {
  let state = emptyState()
  let n = 0
  const at = () => `2026-09-${String(1 + (n % 28)).padStart(2, '0')}T00:00:00.000Z`

  for (let l = 0; l < lanes; l++) {
    state = reduce(state, {
      kind: 'createSwimlane',
      id: `l${l}`,
      name: `Lane ${l}`,
      color: '#5A7391',
      at: at(),
    })
    for (let g = 0; g < goalsPer; g++) {
      n++
      const goalId = `g${l}-${g}`
      state = reduce(state, {
        kind: 'createGoal',
        id: goalId,
        swimlaneId: `l${l}`,
        title: `Goal ${g}`,
        at: at(),
      })
      for (let p = 0; p < plansPer; p++) {
        n++
        const planId = `p${l}-${g}-${p}`
        state = reduce(state, {
          kind: 'createPlan',
          id: planId,
          parent: { type: 'goal', id: goalId },
          title: `Plan ${p}`,
          at: at(),
        })
        for (let t = 0; t < tasksPer; t++) {
          n++
          state = reduce(state, {
            kind: 'createTask',
            id: `t${l}-${g}-${p}-${t}`,
            parent: { type: 'plan', id: planId },
            title: `Task ${t}`,
            size: 'M',
            at: at(),
          })
        }
      }
      state = reduce(state, { kind: 'addPriority', ref: { type: 'goal', id: goalId }, at: at() })
    }
  }
  return state
}

function ms(work: () => unknown): number {
  const start = performance.now()
  work()
  return performance.now() - start
}

describe('a board far larger than anyone should have', () => {
  // 10 lanes × 10 goals × 5 plans × 8 tasks = 4,000 tasks, 500 plans, 100 starred goals.
  const state = big(10, 10, 5, 8)

  it('is the size it claims to be', () => {
    expect(Object.keys(state.tasks)).toHaveLength(4000)
    expect(Object.keys(state.plans)).toHaveLength(500)
    expect(state.priorities).toHaveLength(100)
  })

  it('builds the board in a blink', () => {
    const elapsed = ms(() => buildBoard(state, LENS))
    expect(elapsed).toBeLessThan(500)
  })

  it('degrades rather than drowning — everything is title-only at this load', () => {
    const cards = buildBoard(state, LENS).lanes.flatMap((l) => l.cards)
    expect(cards).toHaveLength(100)
    expect(cards.every((c) => c.detail === 'title-only')).toBe(true)
  })

  it('opens one goal without rendering the other ninety-nine', () => {
    const board = buildBoard(state, { ...LENS, expanded: ['g0-0'] })
    const opened = board.lanes.flatMap((l) => l.cards).filter((c) => c.expanded)
    expect(opened).toHaveLength(1)
    expect(opened[0]?.rows.length).toBe(45) // 5 plans + 40 tasks
  })

  it('builds every other surface too', () => {
    expect(ms(() => buildSweep(state, '2026-09-15'))).toBeLessThan(500)
    expect(ms(() => buildPile(state, null))).toBeLessThan(100)
    expect(ms(() => buildArchive(state))).toBeLessThan(100)
  })

  it('holds its invariants', () => {
    expect(checkInvariants(state)).toEqual([])
  })

  it('exports and imports without losing anything', () => {
    const text = toEnvelope(state, AT)
    const result = parseEnvelope(text)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.state).toEqual(state)
  })

  it('fits in browser storage with room to spare', () => {
    // localStorage is about 5 MB per origin. This is the number that decides whether
    // the durability story holds, so it is measured rather than assumed.
    const bytes = new TextEncoder().encode(toEnvelope(state, AT)).length
    expect(bytes).toBeLessThan(5_000_000)
  })
})

describe('exactly one of everything', () => {
  it('reads sensibly rather than looking broken', () => {
    const state = big(1, 1, 1, 1)
    const board = buildBoard(state, LENS)
    expect(board.lanes).toHaveLength(1)
    const card = board.lanes[0]!.cards[0]!
    expect(card.meta.label).toBe('0 of 1 done')
    expect(card.folded).toBeNull()
    expect(board.lanes[0]!.collapsed).toBeNull()
  })
})
