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
    // Deep-frozen, and the refusal asserted. Comparing two pristine `mainState()` calls
    // — which is what this did — never looks at the reducer at all: it passed even with
    // the refusal deleted outright, because the fixture builds the same thing twice.
    const before = deepFreeze(mainState())
    expect(() =>
      run(before, {
        kind: 'changeLevel',
        ref: { type: 'task', id: 't-gate' },
        to: 'plan',
        newId: 'p-new',
        at: AT,
      }),
    ).toThrow(RuleError)
    expect(before).toEqual(mainState())
  })
})

describe('UC-2059 — a Goal that turns out to be a step towards something bigger', () => {
  const after = () =>
    run(decorated({ type: 'goal', id: 'g-garage' }), {
      kind: 'changeLevel',
      ref: { type: 'goal', id: 'g-garage' },
      to: 'plan',
      newId: 'p-garage',
      parent: { type: 'goal', id: 'g-trip' },
      at: AT,
    })

  it('lands under the goal that was chosen, carrying everything it had', () => {
    const state = after()
    expect(state.plans['p-garage']).toMatchObject({
      title: 'Sort out the garage',
      notes: 'the shoebox in the office',
      deadline: '2026-11-30',
      parent: { type: 'goal', id: 'g-trip' },
    })
    expect(state.goals['g-garage']).toBeUndefined()
    expect(checkInvariants(state)).toEqual([])
  })

  it('brings its contents with it rather than orphaning them', () => {
    const before = mainState()
    const held = [
      ...Object.values(before.plans).filter(
        (p) => p.parent.type === 'goal' && p.parent.id === 'g-garage',
      ),
      ...Object.values(before.tasks).filter(
        (t) => t.parent.type === 'goal' && t.parent.id === 'g-garage',
      ),
    ]
    expect(held.length).toBeGreaterThan(0)

    const state = after()
    for (const item of held) {
      const now = state.plans[item.id] ?? state.tasks[item.id]
      expect(now?.parent).toEqual({ type: 'plan', id: 'p-garage' })
    }
  })

  it('refuses a parent that sits inside the goal being demoted', () => {
    // Without this the goal becomes a plan under its own child, and every walk of
    // the tree — delete, archive, the board itself — recurses until the stack ends.
    const inside = Object.values(mainState().plans).find(
      (p) => p.parent.type === 'goal' && p.parent.id === 'g-invoicing',
    )!
    expect(inside).toBeDefined()
    expect(() =>
      run(mainState(), {
        kind: 'changeLevel',
        ref: { type: 'goal', id: 'g-invoicing' },
        to: 'plan',
        newId: 'p-invoicing',
        parent: { type: 'plan', id: inside.id },
        at: AT,
      }),
    ).toThrow(/inside itself/)
  })

  it('refuses a parent that does not exist, rather than crashing on it', () => {
    // The picker can only offer live goals, but the mutation vocabulary is shared with
    // import and with a future server, and neither is bound by what a button offered.
    expect(() =>
      run(mainState(), {
        kind: 'changeLevel',
        ref: { type: 'goal', id: 'g-garage' },
        to: 'plan',
        newId: 'p-garage',
        parent: { type: 'goal', id: 'g-vanished' },
        at: AT,
      }),
    ).toThrow(RuleError)
  })

  it('refuses with no parent at all, because a plan cannot hang off a swimlane', () => {
    expect(() =>
      run(mainState(), {
        kind: 'changeLevel',
        ref: { type: 'goal', id: 'g-garage' },
        to: 'plan',
        newId: 'p-garage',
        at: AT,
      }),
    ).toThrow(RuleError)
  })
})

describe('what the ladder refuses about the archive and about finished work', () => {
  const archived = () => run(mainState(), { kind: 'archiveGoal', id: 'g-chipper', at: AT })

  it('refuses an archived goal — restore is the way back, not the ladder', () => {
    expect(() =>
      run(archived(), {
        kind: 'changeLevel',
        ref: { type: 'goal', id: 'g-chipper' },
        to: 'plan',
        newId: 'p-x',
        parent: { type: 'goal', id: 'g-trip' },
        at: AT,
      }),
    ).toThrow(/restore it first/)
  })

  it('refuses a PLAN inside an archived goal — the half that was a side door out', () => {
    // `changeLevel(plan → goal)` on an archived goal's plan produced a live goal on the
    // board carrying every child task with it, silently emptying the archived goal. The
    // rule checked `ref.type === 'goal'` only; `archivedOwnerOf` asks the real question.
    expect(() =>
      run(archived(), {
        kind: 'changeLevel',
        ref: { type: 'plan', id: 'p-prototype' },
        to: 'goal',
        newId: 'g-escaped',
        at: AT,
      }),
    ).toThrow(/restore it first/)
  })

  it('refuses a TASK inside an archived goal for the same reason', () => {
    expect(() =>
      run(archived(), {
        kind: 'changeLevel',
        ref: { type: 'task', id: 't-model' },
        to: 'goal',
        newId: 'g-escaped',
        at: AT,
      }),
    ).toThrow(/restore it first/)
  })

  it('refuses a DESTINATION inside an archived goal', () => {
    // The one that made a document unopenable: demoting a starred item under an archived
    // goal was accepted, broke invariant 7, and the loader then refused the whole file.
    expect(() =>
      run(archived(), {
        kind: 'changeLevel',
        ref: { type: 'task', id: 't-flights' },
        to: 'plan',
        newId: 'p-x',
        parent: { type: 'plan', id: 'p-prototype' },
        at: AT,
      }),
    ).toThrow(/archived/)
  })

  it('refuses a task that is already done', () => {
    const done = run(mainState(), { kind: 'setTaskDone', id: 't-may', done: true, at: AT })
    expect(() =>
      run(done, {
        kind: 'changeLevel',
        ref: { type: 'task', id: 't-may' },
        to: 'plan',
        newId: 'p-x',
        at: AT,
      }),
    ).toThrow(/already done/)
  })

  it('refuses a new id that is already an idea in the Pile', () => {
    const withIdea = run(mainState(), {
      kind: 'capture',
      id: 'p-taken',
      text: 'look into a dentist',
      destination: { kind: 'pile' },
      at: AT,
    })
    expect(() =>
      run(withIdea, {
        kind: 'changeLevel',
        ref: { type: 'task', id: 't-receipts' },
        to: 'plan',
        newId: 'p-taken',
        at: AT,
      }),
    ).toThrow(/already exists/)
  })

  it('keeps createdAt — a thing changing shape is not a new thing', () => {
    // Stated in a comment as PRD §8.2 behaviour and asserted nowhere, so dropping the
    // line would have been silent. It matters because createdAt is the board's ordering.
    const before = mainState().tasks['t-receipts']!.createdAt
    const after = run(mainState(), {
      kind: 'changeLevel',
      ref: { type: 'task', id: 't-receipts' },
      to: 'plan',
      newId: 'p-new',
      at: AT,
    })
    expect(after.plans['p-new']!.createdAt).toBe(before)
    expect(after.plans['p-new']!.updatedAt).toBe(AT)
  })

  it('keeps done state when a done task climbs — or rather, refuses to let it', () => {
    // There is no shape of this that loses a completion, because the move is refused.
    const done = run(mainState(), { kind: 'setTaskDone', id: 't-may', done: true, at: AT })
    expect(() =>
      run(done, {
        kind: 'changeLevel',
        ref: { type: 'task', id: 't-may' },
        to: 'goal',
        newId: 'g-x',
        at: AT,
      }),
    ).toThrow()
    expect(done.tasks['t-may']).toMatchObject({ done: true, doneAt: AT })
  })
})
