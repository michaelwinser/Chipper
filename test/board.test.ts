/**
 * buildBoard against the artboards (DESIGN.md §2.1).
 *
 * The first two tests are the point of the whole architecture: one state, two lenses,
 * deep-equal to pictures drawn before any of this was written.
 */
import { describe, expect, it } from 'vitest'
import { buildBoard } from '../src/domain/select/board'
import type { Lens } from '../src/domain/board'
import { layout } from '../src/domain/layout'
import {
  everything as everythingFixture,
  main as mainFixture,
  sizeLensS as sizeLensFixture,
} from '../src/fixtures/boards'
import { mainState } from '../src/fixtures/states'
import { reduce } from '../src/domain/reduce'
import type { State } from '../src/domain/state'
import { deepFreeze } from './support/freeze'

const PRIORITIES: Lens = { focus: 'priorities', size: 'any', expanded: [] }
const EVERYTHING: Lens = { focus: 'everything', size: 'any', expanded: [] }
const AT = '2026-09-14T10:00:00.000Z'

describe('the artboards are reproducible from state', () => {
  it('matches the Main artboard exactly', () => {
    expect(buildBoard(deepFreeze(mainState()), PRIORITIES)).toEqual(mainFixture)
  })

  it('matches the Everything artboard exactly, from the same state', () => {
    expect(buildBoard(deepFreeze(mainState()), EVERYTHING)).toEqual(everythingFixture)
  })

  it('matches the SizeLens artboard exactly, from the same state again', () => {
    const lens: Lens = { focus: 'priorities', size: 'S', expanded: [] }
    expect(buildBoard(deepFreeze(mainState()), lens)).toEqual(sizeLensFixture)
  })
})

describe('UC-3020/3021/3022/3023 — the star renders where you put it', () => {
  const board = buildBoard(mainState(), PRIORITIES)
  const card = (goalId: string) =>
    board.lanes.flatMap((l) => l.cards).find((c) => c.goalId === goalId)!

  it('a starred Goal: full ink, its own star, its open tasks flattened', () => {
    const c = card('g-invoicing')
    expect(c.header).toEqual({ title: 'Catch up on invoicing', contextual: false, starred: true })
    expect(c.rows.every((r) => r.kind === 'task')).toBe(true)
    expect(c.folded?.text).toBe('1 more open')
  })

  it('a starred Plan: the goal goes contextual and loses its star', () => {
    const c = card('g-chipper')
    expect(c.header.starred).toBe(false)
    expect(c.header.contextual).toBe(true)
    const plan = c.rows.find((r) => r.kind === 'plan')!
    expect(plan.starred).toBe(true)
    expect(plan.indent).toBe(0)
    expect(c.rows.filter((r) => r.kind === 'task').every((r) => r.indent === 1)).toBe(true)
    expect(c.folded?.text).toBe('2 other plans in this goal')
  })

  it('a starred Task under a Goal: one task, the rest folded', () => {
    const c = card('g-trip')
    expect(c.header.contextual).toBe(true)
    expect(c.rows).toHaveLength(1)
    expect(c.rows[0]!.starred).toBe(true)
    expect(c.folded?.text).toBe('3 more open')
  })

  it('a starred Task inside a Plan keeps both levels and folds at both', () => {
    // Only this task starred in the goal, so "this plan" has exactly one plan to mean.
    let state = reduce(mainState(), {
      kind: 'removePriority',
      ref: { type: 'plan', id: 'p-prototype' },
      at: AT,
    })
    state = reduce(state, { kind: 'addPriority', ref: { type: 'task', id: 't-ship-0' }, at: AT })

    const c = buildBoard(state, PRIORITIES)
      .lanes.flatMap((l) => l.cards)
      .find((x) => x.goalId === 'g-chipper')!
    const kinds = c.rows.map((r) => `${r.kind}@${r.indent}`)
    expect(kinds).toEqual(['plan@0', 'task@1'])
    expect(c.folded?.text).toBe('2 more in this plan · 2 other plans in this goal')
  })

  it('two stars in one goal account for both scopes, and stop saying "this plan"', () => {
    // p-prototype (nothing hidden) plus a task inside p-ship (2 hidden behind it).
    const state = reduce(mainState(), {
      kind: 'addPriority',
      ref: { type: 'task', id: 't-ship-0' },
      at: AT,
    })
    const c = buildBoard(state, PRIORITIES)
      .lanes.flatMap((l) => l.cards)
      .find((x) => x.goalId === 'g-chipper')!
    // Both plans are shown, so only one other plan remains folded.
    expect(c.folded?.text).toBe('2 more open · 1 other plan')
    expect(c.folded?.text).not.toMatch(/this plan/)
  })

  it('UC-3023 a starred loose Task is a chip, never a card', () => {
    const stuff = board.lanes.find((l) => l.name === 'Stuff')!
    expect(stuff.cards).toHaveLength(0)
    expect(stuff.chips.map((c) => c.title)).toEqual(['Fix the back gate'])
  })
})

describe('UC-3060 — overload is a layout consequence, never a warning', () => {
  /** Stars every goal, which is exactly how a person overloads themselves. */
  function starEverything(): State {
    let state = mainState()
    for (const id of Object.keys(state.goals)) {
      state = reduce(state, { kind: 'addPriority', ref: { type: 'goal', id }, at: AT })
    }
    return state
  }

  it('gives tasks room while the budget holds', () => {
    const board = buildBoard(mainState(), PRIORITIES)
    expect(mainState().priorities.length).toBeLessThanOrEqual(layout.detailBudget)
    expect(board.lanes.flatMap((l) => l.cards).some((c) => c.detail === 'tasks')).toBe(true)
  })

  it('takes the task lists away once too much is starred', () => {
    const state = starEverything()
    expect(state.priorities.length).toBeGreaterThan(layout.detailBudget)
    const cards = buildBoard(state, PRIORITIES).lanes.flatMap((l) => l.cards)
    expect(cards.length).toBeGreaterThan(0)
    expect(cards.every((c) => c.detail === 'title-only')).toBe(true)
    expect(cards.every((c) => c.rows.length === 0)).toBe(true)
  })

  it('says nothing about it — no count, no warning, no copy anywhere', () => {
    const text = JSON.stringify(buildBoard(starEverything(), PRIORITIES))
    expect(text).not.toMatch(/too many|too much|slow down|over.?committed|limit|warning/i)
  })

  it('the boundary is behaviour, not the constant — one more star flips it', () => {
    let state = mainState()
    const goals = Object.keys(state.goals)
    // Star up to exactly the budget.
    while (state.priorities.length < layout.detailBudget) {
      const next = goals.find((id) => !state.priorities.some((r) => r.id === id))!
      state = reduce(state, { kind: 'addPriority', ref: { type: 'goal', id: next }, at: AT })
    }
    const atBudget = buildBoard(state, PRIORITIES).lanes.flatMap((l) => l.cards)
    expect(atBudget.some((c) => c.detail === 'tasks')).toBe(true)

    const over = reduce(state, {
      kind: 'addPriority',
      ref: { type: 'task', id: 't-passport' },
      at: AT,
    })
    const past = buildBoard(over, PRIORITIES).lanes.flatMap((l) => l.cards)
    expect(past.every((c) => c.detail === 'title-only')).toBe(true)
  })
})

describe('UC-5015 — a lane at rest', () => {
  it('says what is waiting, without an empty state or a nudge', () => {
    const health = buildBoard(mainState(), PRIORITIES).lanes.find((l) => l.name === 'Health')!
    expect(health.cards).toHaveLength(0)
    expect(health.resting?.summary).toBe('1 goal, nothing prioritised right now')
    expect(health.collapsed).toBeNull()
    expect(health.resting!.summary).not.toMatch(/empty|add|start|should/i)
  })

  it('a lane with nothing in it at all says so plainly', () => {
    const state = reduce(mainState(), {
      kind: 'createSwimlane',
      id: 'l-new',
      name: 'Fun',
      color: '#7A6E9E',
      at: AT,
    })
    const fun = buildBoard(state, PRIORITIES).lanes.find((l) => l.name === 'Fun')!
    expect(fun.resting?.summary).toBe('Nothing here yet')
  })
})

describe('UC-4020 — widening to Everything', () => {
  const board = buildBoard(mainState(), EVERYTHING)

  it('brings unstarred goals back quietly, and drops the collapsed lines', () => {
    expect(board.lanes.every((l) => l.collapsed === null)).toBe(true)
    const quiet = board.lanes.flatMap((l) => l.cards).filter((c) => c.emphasis === 'quiet')
    expect(quiet.length).toBeGreaterThan(0)
    expect(quiet.every((c) => !c.header.starred && c.detail === 'title-only')).toBe(true)
  })

  it('keeps the starred cards exactly as they were — it is the same view', () => {
    const focused = buildBoard(mainState(), PRIORITIES)
    const active = (b: typeof board) =>
      b.lanes.flatMap((l) => l.cards).filter((c) => c.emphasis === 'active')
    expect(active(board)).toEqual(active(focused))
  })

  it('shows loose tasks that are not starred, quietly', () => {
    const stuff = board.lanes.find((l) => l.name === 'Stuff')!
    expect(stuff.chips).toHaveLength(3)
    expect(stuff.chips.filter((c) => c.emphasis === 'quiet')).toHaveLength(2)
  })
})

describe('starring and unstarring', () => {
  it('UC-3010 a star puts something in play and taking it away removes it', () => {
    const state = mainState()
    const without = reduce(state, {
      kind: 'removePriority',
      ref: { type: 'task', id: 't-flights' },
      at: AT,
    })
    const family = buildBoard(without, PRIORITIES).lanes.find((l) => l.name === 'Family')!
    expect(family.cards).toHaveLength(0)
    expect(family.resting?.summary).toMatch(/nothing prioritised/)
  })

  it('finishing a task takes its star with it, silently', () => {
    const state = reduce(mainState(), { kind: 'setTaskDone', id: 't-flights', done: true, at: AT })
    expect(state.priorities.some((r) => r.id === 't-flights')).toBe(false)
    const family = buildBoard(state, PRIORITIES).lanes.find((l) => l.name === 'Family')!
    expect(family.cards).toHaveLength(0)
  })

  it('never shows a done task as something still to do', () => {
    const board = buildBoard(mainState(), PRIORITIES)
    const rows = board.lanes.flatMap((l) => l.cards).flatMap((c) => c.rows)
    expect(rows.filter((r) => r.kind === 'task').every((r) => !r.done)).toBe(true)
  })
})

describe('the view model cannot express a shortfall (DESIGN.md §2.1)', () => {
  it('reports no count of unfinished work in any lens, at any load', () => {
    let state = mainState()
    for (const id of Object.keys(state.goals)) {
      state = reduce(state, { kind: 'addPriority', ref: { type: 'goal', id }, at: AT })
    }
    const forbidden = /overdue|missed|streak|completionrate|abandoned|behind|score|velocity|late/i
    for (const lens of [PRIORITIES, EVERYTHING]) {
      for (const source of [mainState(), state]) {
        const offenders: string[] = []
        const scan = (value: unknown, path: string): void => {
          if (value === null || typeof value !== 'object') return
          for (const [key, child] of Object.entries(value)) {
            if (forbidden.test(key)) offenders.push(`${path}.${key}`)
            scan(child, `${path}.${key}`)
          }
        }
        scan(buildBoard(source, lens), 'board')
        expect(offenders).toEqual([])
      }
    }
  })

  it('never changes state on its own — building the board twice gives the same board', () => {
    const state = mainState()
    expect(buildBoard(state, PRIORITIES)).toEqual(buildBoard(state, PRIORITIES))
  })
})

describe('UC-5020 — opening a goal to look inside it', () => {
  const opened = (goalId: string) =>
    buildBoard(mainState(), { ...PRIORITIES, expanded: [goalId] })
      .lanes.flatMap((l) => l.cards)
      .find((c) => c.goalId === goalId)!

  it('shows everything under it, including plans with nothing in them', () => {
    // g-chipper holds p-prototype, p-ship and p-tell. Unopened and starred at the plan
    // level, only p-prototype is visible; opened, all three are.
    const card = opened('g-chipper')
    expect(card.expanded).toBe(true)
    const plans = card.rows.filter((r) => r.kind === 'plan').map((r) => r.title)
    expect(plans).toEqual(['Build the prototype', 'Ship it', 'Tell people'])
    expect(card.folded).toBeNull()
  })

  it('UC-5010 — shows finished work as progress, separately from what is left', () => {
    const card = opened('g-invoicing')
    const tasks = card.rows.filter((r) => r.kind === 'task')
    expect(card.meta.label).toBe('3 of 7 done')
    expect(card.done?.tasks).toHaveLength(3)
    expect(tasks).toHaveLength(4)
    // Never both: struck through in the list AND counted underneath it.
    const inRows = new Set(tasks.map((t) => t.id))
    expect(card.done!.tasks.some((t) => inRows.has(t.id))).toBe(false)
  })

  it('opens a goal nothing is starred in, which is otherwise unreachable', () => {
    const card = opened('g-docs')
    expect(card.emphasis).toBe('active')
    expect(card.rows.length).toBeGreaterThan(0)
  })

  it('keeps stars visible on what is inside', () => {
    const card = opened('g-chipper')
    const starred = card.rows.filter((r) => r.starred)
    expect(starred.map((r) => r.id)).toEqual(['p-prototype'])
  })

  it('opens as many as you ask for, and closes none you did not', () => {
    const board = buildBoard(mainState(), {
      ...EVERYTHING,
      expanded: ['g-docs', 'g-garage', 'g-runs'],
    })
    const expanded = board.lanes.flatMap((l) => l.cards).filter((c) => c.expanded)
    expect(expanded.map((c) => c.goalId).sort()).toEqual(['g-docs', 'g-garage', 'g-runs'])
  })

  it('closes them all at once when asked', () => {
    const board = buildBoard(mainState(), { ...EVERYTHING, expanded: [] })
    expect(board.lanes.flatMap((l) => l.cards).some((c) => c.expanded)).toBe(false)
  })

  it('says so plainly when there is genuinely nothing inside', () => {
    let state = reduce(mainState(), {
      kind: 'createGoal',
      id: 'g-new',
      swimlaneId: 'l-health',
      title: 'Something new',
      at: AT,
    })
    state = reduce(state, { kind: 'addPriority', ref: { type: 'goal', id: 'g-new' }, at: AT })
    const card = buildBoard(state, { ...PRIORITIES, expanded: ['g-new'] })
      .lanes.flatMap((l) => l.cards)
      .find((c) => c.goalId === 'g-new')!
    expect(card.rows).toHaveLength(0)
    expect(card.empty?.text).toMatch(/Nothing in here yet/)
  })
})

describe('a goal with no tasks is not "0 of 0"', () => {
  it('says it has no tasks yet, whatever plans it holds', () => {
    let state = reduce(mainState(), {
      kind: 'createGoal',
      id: 'g-plans',
      swimlaneId: 'l-health',
      title: 'Only plans',
      at: AT,
    })
    state = reduce(state, {
      kind: 'createPlan',
      id: 'p-a',
      parent: { type: 'goal', id: 'g-plans' },
      title: 'First',
      at: AT,
    })
    const card = buildBoard(state, { ...EVERYTHING, expanded: [] })
      .lanes.flatMap((l) => l.cards)
      .find((c) => c.goalId === 'g-plans')!
    expect(card.meta.label).toBe('no tasks yet')
    expect(card.meta.total).toBe(0)
  })

  it('still counts normally once there is something to count', () => {
    const card = buildBoard(mainState(), PRIORITIES)
      .lanes.flatMap((l) => l.cards)
      .find((c) => c.goalId === 'g-invoicing')!
    expect(card.meta.label).toBe('3 of 7 done')
  })

  it('a starred goal with nothing to do says so instead of looking blank', () => {
    let state = reduce(mainState(), {
      kind: 'createGoal',
      id: 'g-empty',
      swimlaneId: 'l-health',
      title: 'Nothing in it',
      at: AT,
    })
    state = reduce(state, { kind: 'addPriority', ref: { type: 'goal', id: 'g-empty' }, at: AT })
    const card = buildBoard(state, PRIORITIES)
      .lanes.flatMap((l) => l.cards)
      .find((c) => c.goalId === 'g-empty')!
    expect(card.empty?.text).toMatch(/Nothing to do in here yet/)
  })
})

describe('UC-2070 — nesting depth is guidance, never a block', () => {
  /** Builds a chain of plans n deep under one goal. */
  function nested(depth: number): State {
    let state = reduce(mainState(), {
      kind: 'createGoal',
      id: 'g-deep',
      swimlaneId: 'l-health',
      title: 'Deep',
      at: AT,
    })
    let parent: { type: 'goal' | 'plan'; id: string } = { type: 'goal', id: 'g-deep' }
    for (let i = 0; i < depth; i++) {
      state = reduce(state, {
        kind: 'createPlan',
        id: `p-deep-${i}`,
        parent,
        title: `Level ${i + 1}`,
        at: AT,
      })
      parent = { type: 'plan', id: `p-deep-${i}` }
    }
    return state
  }

  const card = (state: State) =>
    buildBoard(state, { ...EVERYTHING, expanded: ['g-deep'] })
      .lanes.flatMap((l) => l.cards)
      .find((c) => c.goalId === 'g-deep')!

  it('says nothing at three levels', () => {
    expect(card(nested(3)).guidance).toBeNull()
  })

  it('offers a way out at four, without refusing anything', () => {
    const deep = card(nested(4))
    expect(deep.guidance?.text).toMatch(/four plans deep/)
    expect(deep.guidance!.text).toMatch(/simplify|Pile/)
    // The fourth plan exists regardless — guidance never blocks.
    expect(deep.rows.filter((r) => r.kind === 'plan')).toHaveLength(4)
  })

  it('never scolds about it', () => {
    const text = card(nested(5)).guidance!.text
    expect(text.toLowerCase()).not.toMatch(/too deep|should not|error|cannot|wrong|stop/)
  })
})

describe('starring something inside a goal that is already starred', () => {
  const invoicing = (state: State) =>
    buildBoard(state, PRIORITIES)
      .lanes.flatMap((l) => l.cards)
      .find((c) => c.goalId === 'g-invoicing')!

  const star = (taskId: string): State =>
    reduce(mainState(), { kind: 'addPriority', ref: { type: 'task', id: taskId }, at: AT })

  it('shows the star on the task — a click that renders nothing looks broken', () => {
    // g-invoicing is starred, so t-vat is already on the card unstarred. Starring it
    // reaches the same row a second time, and that visit carries the star.
    expect(invoicing(mainState()).rows.find((r) => r.id === 't-vat')?.starred).toBe(false)
    expect(invoicing(star('t-vat')).rows.find((r) => r.id === 't-vat')?.starred).toBe(true)
  })

  it('keeps the goal starred too — one star does not replace the other', () => {
    const card = invoicing(star('t-vat'))
    expect(card.header.starred).toBe(true)
    expect(card.rows.filter((r) => r.starred)).toHaveLength(1)
  })

  it('brings a task that was below the fold into view, and the count follows', () => {
    // t-june is the one folded away at rowsPerCard. Naming it should surface it.
    const before = invoicing(mainState())
    expect(before.rows.some((r) => r.id === 't-june')).toBe(false)
    expect(before.folded?.text).toBe('1 more open')

    const after = invoicing(star('t-june'))
    const june = after.rows.find((r) => r.id === 't-june')
    expect(june?.starred).toBe(true)
    expect(after.rows[0]?.id).toBe('t-june')
    // Still four open, three shown — the number stays honest as the contents change.
    expect(after.rows.filter((r) => r.kind === 'task')).toHaveLength(3)
    expect(after.folded?.text).toBe('1 more open')
  })

  it('never shows the same task twice', () => {
    const rows = invoicing(star('t-vat')).rows
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
  })
})
