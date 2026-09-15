/**
 * The ladder (PRD §5.8, UC-2050, UC-2057, UC-2058, UC-2059).
 *
 * One mechanism, four directions. The thing every case has to prove is the same: the
 * move is non-destructive. Title, notes, deadline, star and children all survive it,
 * and nothing has to be retyped.
 */
import { describe, expect, it } from 'vitest'
import { reduce } from '../src/domain/reduce'
import { RuleError } from '../src/domain/errors'
import { checkInvariants } from '../src/domain/invariants'
import { childPlans, childTasks, type State } from '../src/domain/state'
import type { Mutation } from '../src/domain/mutations'
import { mainState } from '../src/fixtures/states'
import { deepFreeze } from './support/freeze'

const AT = '2026-09-14T10:00:00.000Z'
const run = (state: State, ...ms: Mutation[]): State =>
  ms.reduce((s, m) => reduce(deepFreeze(s), m), state)

/** Gives the thing under test notes, a deadline and a star, so loss shows up. */
function decorated(ref: { type: 'goal' | 'plan' | 'task'; id: string }): State {
  return run(
    mainState(),
    { kind: 'setNotes', ref, notes: 'the shoebox in the office', at: AT },
    { kind: 'setDeadline', ref, deadline: '2026-11-30', at: AT },
    ...(mainState().priorities.some((r) => r.type === ref.type && r.id === ref.id)
      ? []
      : [{ kind: 'addPriority' as const, ref, at: AT }]),
  )
}

describe('UC-2050 — a Task that turns out to be too big', () => {
  const before = () => decorated({ type: 'task', id: 't-receipts' })
  const after = () =>
    run(before(), {
      kind: 'changeLevel',
      ref: { type: 'task', id: 't-receipts' },
      to: 'plan',
      newId: 'p-new',
      at: AT,
    })

  it('becomes a plan in the same place, carrying everything it had', () => {
    const state = after()
    expect(state.plans['p-new']).toMatchObject({
      title: 'Find the missing March receipts',
      notes: 'the shoebox in the office',
      deadline: '2026-11-30',
      parent: { type: 'goal', id: 'g-invoicing' },
    })
    expect(state.tasks['t-receipts']).toBeUndefined()
    expect(checkInvariants(state)).toEqual([])
  })

  it('the star comes with it, in the same place in the set', () => {
    const b = before()
    const index = b.priorities.findIndex((r) => r.id === 't-receipts')
    expect(index).toBeGreaterThanOrEqual(0)

    const state = after()
    expect(state.priorities[index]).toEqual({ type: 'plan', id: 'p-new' })
    expect(state.priorities).toHaveLength(b.priorities.length)
  })

  it('the goal keeps its count — nothing was destroyed, only reshaped', () => {
    // The task itself stops being a task, so the goal has one fewer; everything else
    // is untouched. This is the number a user would notice if a move lost something.
    const b = before()
    const a = after()
    expect(Object.keys(a.tasks)).toHaveLength(Object.keys(b.tasks).length - 1)
    expect(Object.keys(a.goals)).toHaveLength(Object.keys(b.goals).length)
  })

  it('refuses a loose task, because a plan cannot hang off a swimlane', () => {
    expect(() =>
      run(mainState(), {
        kind: 'changeLevel',
        ref: { type: 'task', id: 't-gate' },
        to: 'plan',
        newId: 'p-new',
        at: AT,
      }),
    ).toThrow(/make this a goal instead/)
  })
})

describe('UC-2057 — a Plan that turns out to be the outcome itself', () => {
  const after = () =>
    run(decorated({ type: 'plan', id: 'p-prototype' }), {
      kind: 'changeLevel',
      ref: { type: 'plan', id: 'p-prototype' },
      to: 'goal',
      newId: 'g-new',
      at: AT,
    })

  it('becomes a goal in the swimlane it was already inside', () => {
    const state = after()
    expect(state.goals['g-new']).toMatchObject({
      title: 'Build the prototype',
      swimlaneId: 'l-work',
      deadline: '2026-11-30',
    })
    expect(state.plans['p-prototype']).toBeUndefined()
  })

  it('every child comes with it, at every level', () => {
    const before = decorated({ type: 'plan', id: 'p-prototype' })
    const kidsBefore = childTasks(before, { type: 'plan', id: 'p-prototype' }).map((t) => t.id)
    expect(kidsBefore.length).toBeGreaterThan(0)

    const state = after()
    const kidsAfter = childTasks(state, { type: 'goal', id: 'g-new' }).map((t) => t.id)
    expect(kidsAfter.sort()).toEqual(kidsBefore.sort())
    expect(checkInvariants(state)).toEqual([])
  })

  it('its old goal loses it, and its counts follow', () => {
    const state = after()
    expect(
      childPlans(state, { type: 'goal', id: 'g-chipper' })
        .map((p) => p.id)
        .sort(),
    ).toEqual(['p-ship', 'p-tell'])
  })
})

describe('UC-2058 — a Task that turns out to be an outcome', () => {
  it('climbs straight to a goal in its own swimlane', () => {
    const state = run(decorated({ type: 'task', id: 't-gate' }), {
      kind: 'changeLevel',
      ref: { type: 'task', id: 't-gate' },
      to: 'goal',
      newId: 'g-gate',
      at: AT,
    })
    expect(state.goals['g-gate']).toMatchObject({
      title: 'Fix the back gate',
      swimlaneId: 'l-stuff',
    })
    expect(state.priorities.some((r) => r.type === 'goal' && r.id === 'g-gate')).toBe(true)
    expect(checkInvariants(state)).toEqual([])
  })
})

describe('UC-2059 — a Goal that turns out to be a step', () => {
  it('descends into a plan under the goal it belongs to, children intact', () => {
    const before = decorated({ type: 'goal', id: 'g-garage' })
    const kids = childTasks(before, { type: 'goal', id: 'g-garage' }).map((t) => t.id)
    expect(kids.length).toBeGreaterThan(0)

    const state = run(before, {
      kind: 'changeLevel',
      ref: { type: 'goal', id: 'g-garage' },
      to: 'plan',
      newId: 'p-garage',
      parent: { type: 'goal', id: 'g-trip' },
      at: AT,
    })
    expect(state.plans['p-garage']).toMatchObject({
      title: 'Sort out the garage',
      parent: { type: 'goal', id: 'g-trip' },
    })
    expect(
      childTasks(state, { type: 'plan', id: 'p-garage' })
        .map((t) => t.id)
        .sort(),
    ).toEqual(kids.sort())
    expect(state.goals['g-garage']).toBeUndefined()
    expect(checkInvariants(state)).toEqual([])
  })
})

describe('what the ladder refuses', () => {
  it('will not make a task out of something holding work', () => {
    expect(() =>
      run(mainState(), {
        kind: 'changeLevel',
        ref: { type: 'goal', id: 'g-invoicing' },
        to: 'task',
        newId: 't-new',
        at: AT,
      }),
    ).toThrow(/a task holds nothing/)
  })

  it('but will, once it is empty — an idea that shrank is still allowed to shrink', () => {
    const state = run(
      mainState(),
      {
        kind: 'createGoal',
        id: 'g-small',
        swimlaneId: 'l-health',
        title: 'Book the physio',
        at: AT,
      },
      {
        kind: 'changeLevel',
        ref: { type: 'goal', id: 'g-small' },
        to: 'task',
        newId: 't-physio',
        at: AT,
      },
    )
    expect(state.tasks['t-physio']).toMatchObject({
      title: 'Book the physio',
      parent: { type: 'swimlane', id: 'l-health' },
      size: null,
      done: false,
    })
  })

  it('refuses to change something into what it already is', () => {
    expect(() =>
      run(mainState(), {
        kind: 'changeLevel',
        ref: { type: 'goal', id: 'g-invoicing' },
        to: 'goal',
        newId: 'g-new',
        at: AT,
      }),
    ).toThrow(RuleError)
  })

  it('leaves the state untouched when it refuses', () => {
    const before = mainState()
    try {
      run(before, {
        kind: 'changeLevel',
        ref: { type: 'task', id: 't-gate' },
        to: 'plan',
        newId: 'p-new',
        at: AT,
      })
    } catch {
      /* expected */
    }
    expect(mainState()).toEqual(before)
  })
})
