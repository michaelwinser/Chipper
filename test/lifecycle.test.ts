/**
 * The four exits (PRD §5.8): done, the Pile, Archive, delete.
 *
 * The cascades are checked clause for clause against the PRD, because "the code is
 * reasonable" is not the standard here — a cascade that differs from the spec is a
 * finding even when it seems sensible.
 */
import { describe, expect, it } from 'vitest'
import { reduce } from '../src/domain/reduce'
import { RuleError } from '../src/domain/errors'
import { checkInvariants } from '../src/domain/invariants'
import { buildArchive } from '../src/domain/select/archive'
import { buildBoard } from '../src/domain/select/board'
import { childPlans, childTasks, descendants, type State } from '../src/domain/state'
import type { Mutation } from '../src/domain/mutations'
import type { Lens } from '../src/domain/board'
import { mainState } from '../src/fixtures/states'
import { deepFreeze } from './support/freeze'

const AT = '2026-09-14T10:00:00.000Z'
const LENS: Lens = { focus: 'everything', size: 'any', expanded: [] }
const run = (state: State, ...ms: Mutation[]): State =>
  ms.reduce((s, m) => reduce(deepFreeze(s), m), state)

describe('UC-2105 — deleting a Goal', () => {
  const before = mainState()
  const below = descendants(before, { type: 'goal', id: 'g-invoicing' })
  const after = () => run(before, { kind: 'deleteGoal', id: 'g-invoicing', at: AT })

  it('destroys its plans and tasks, completed ones included', () => {
    expect(below.tasks.filter((t) => t.done).length).toBeGreaterThan(0)
    const state = after()
    expect(state.goals['g-invoicing']).toBeUndefined()
    for (const plan of below.plans) expect(state.plans[plan.id]).toBeUndefined()
    for (const task of below.tasks) expect(state.tasks[task.id]).toBeUndefined()
  })

  it('leaves nothing dangling — no star, no orphan', () => {
    const state = after()
    expect(checkInvariants(state)).toEqual([])
    expect(state.priorities.some((r) => r.id === 'g-invoicing')).toBe(false)
  })

  it('touches nothing outside it', () => {
    const state = after()
    expect(Object.keys(state.goals)).toContain('g-chipper')
    expect(state.tasks['t-flights']).toBeDefined()
  })
})

describe('UC-2106 / D11 — deleting a Plan keeps the work', () => {
  const planId = 'p-prototype'
  const kids = () => childTasks(mainState(), { type: 'plan', id: planId }).map((t) => t.id)

  it('moves its tasks up to its parent rather than destroying them', () => {
    const state = run(mainState(), {
      kind: 'deletePlan',
      id: planId,
      disposition: 'promote-children',
      at: AT,
    })
    expect(state.plans[planId]).toBeUndefined()
    const promoted = childTasks(state, { type: 'goal', id: 'g-chipper' }).map((t) => t.id)
    for (const id of kids()) expect(promoted).toContain(id)
    expect(checkInvariants(state)).toEqual([])
  })

  it('keeps their done state, sizes and stars intact on the way up', () => {
    const done = Object.values(mainState().tasks).filter(
      (t) => t.parent.type === 'plan' && t.parent.id === planId && t.done,
    )
    expect(done.length).toBeGreaterThan(0)
    const state = run(mainState(), {
      kind: 'deletePlan',
      id: planId,
      disposition: 'promote-children',
      at: AT,
    })
    for (const task of done) {
      expect(state.tasks[task.id]).toMatchObject({ done: true, size: task.size })
    }
  })

  it('destroys them only when asked explicitly', () => {
    const state = run(mainState(), {
      kind: 'deletePlan',
      id: planId,
      disposition: 'cascade',
      at: AT,
    })
    for (const id of kids()) expect(state.tasks[id]).toBeUndefined()
    expect(checkInvariants(state)).toEqual([])
  })
})

describe('UC-2013 / UC-2014 — deleting a Swimlane needs a destination', () => {
  it('cannot be expressed without one — a silent cascade is not in the type', () => {
    // This is the guarantee: there is no shape of this mutation that means "just delete
    // it and whatever is inside". The compiler enforces it; this records why.
    const move: Mutation = {
      kind: 'deleteSwimlane',
      id: 'l-work',
      disposition: { kind: 'move', toSwimlaneId: 'l-family' },
      at: AT,
    }
    expect(move.kind).toBe('deleteSwimlane')
  })

  it('moves everything to another lane, keeping it all', () => {
    const before = mainState()
    const goals = Object.values(before.goals).filter((g) => g.swimlaneId === 'l-work')
    const loose = childTasks(before, { type: 'swimlane', id: 'l-work' })

    const state = run(before, {
      kind: 'deleteSwimlane',
      id: 'l-work',
      disposition: { kind: 'move', toSwimlaneId: 'l-family' },
      at: AT,
    })
    expect(state.swimlanes['l-work']).toBeUndefined()
    for (const goal of goals) expect(state.goals[goal.id]?.swimlaneId).toBe('l-family')
    for (const task of loose) {
      expect(state.tasks[task.id]?.parent).toEqual({ type: 'swimlane', id: 'l-family' })
    }
    expect(checkInvariants(state)).toEqual([])
  })

  it('archives the goals instead, if you would rather put them away than move them', () => {
    const state = run(mainState(), {
      kind: 'deleteSwimlane',
      id: 'l-work',
      disposition: { kind: 'archive', pileIds: [] },
      at: AT,
    })
    expect(state.swimlanes['l-work']).toBeUndefined()
    expect(state.goals['g-invoicing']?.archived).toBe(true)
    // Its contents survive whole — archiving is not deleting.
    expect(childPlans(state, { type: 'goal', id: 'g-invoicing' }).length).toBeGreaterThan(0)
    expect(checkInvariants(state)).toEqual([])
  })

  it('turns loose tasks into pile items, losing only their size', () => {
    const state = run(mainState(), {
      kind: 'deleteSwimlane',
      id: 'l-stuff',
      disposition: { kind: 'archive', pileIds: ['pi-a', 'pi-b', 'pi-c'] },
      at: AT,
    })
    expect(Object.values(state.pile).map((p) => p.text)).toContain('Fix the back gate')
    expect(state.tasks['t-gate']).toBeUndefined()
    expect(checkInvariants(state)).toEqual([])
  })

  it('refuses to move a lane into itself', () => {
    expect(() =>
      run(mainState(), {
        kind: 'deleteSwimlane',
        id: 'l-work',
        disposition: { kind: 'move', toSwimlaneId: 'l-work' },
        at: AT,
      }),
    ).toThrow(RuleError)
  })
})

describe('UC-2130 — archiving a Goal', () => {
  const archive = (id: string) => run(mainState(), { kind: 'archiveGoal', id, at: AT })

  it('takes it off the board with everything intact', () => {
    const state = archive('g-invoicing')
    expect(state.goals['g-invoicing']?.archived).toBe(true)
    expect(state.goals['g-invoicing']?.archivedAt).toBe(AT)
    expect(childPlans(state, { type: 'goal', id: 'g-invoicing' }).length).toBeGreaterThan(0)

    const board = buildBoard(state, LENS)
    expect(board.lanes.flatMap((l) => l.cards).some((c) => c.goalId === 'g-invoicing')).toBe(false)
  })

  it('clears every star pointing into it, at any depth', () => {
    const starredInside = run(mainState(), {
      kind: 'addPriority',
      ref: { type: 'task', id: 't-model' },
      at: AT,
    })
    const state = run(starredInside, { kind: 'archiveGoal', id: 'g-chipper', at: AT })
    expect(state.priorities.some((r) => r.id === 'g-chipper')).toBe(false)
    expect(state.priorities.some((r) => r.id === 'p-prototype')).toBe(false)
    expect(state.priorities.some((r) => r.id === 't-model')).toBe(false)
    expect(checkInvariants(state)).toEqual([])
  })

  it('an abandoned goal is indistinguishable from a finished one', () => {
    // g-docs has nothing done; g-invoicing has three. After archiving, the only thing
    // either carries is a date — nothing records which was finished.
    const finished = archive('g-invoicing').goals['g-invoicing']!
    const abandoned = archive('g-docs').goals['g-docs']!
    const shape = (g: typeof finished) =>
      Object.entries(g)
        .filter(([k]) => k.startsWith('archiv'))
        .map(([k, v]) => `${k}=${typeof v}`)
        .sort()
    expect(shape(finished)).toEqual(shape(abandoned))
  })

  it('archiving twice changes nothing', () => {
    const once = archive('g-invoicing')
    expect(
      run(once, { kind: 'archiveGoal', id: 'g-invoicing', at: '2027-01-01T00:00:00.000Z' }),
    ).toEqual(once)
  })
})

describe('UC-2131 — the Archive', () => {
  const stocked = () =>
    run(
      mainState(),
      { kind: 'archiveGoal', id: 'g-invoicing', at: '2026-09-10T10:00:00.000Z' },
      { kind: 'archiveGoal', id: 'g-docs', at: '2026-09-12T10:00:00.000Z' },
    )

  it('lists them most recent first, with a lane, a title and a date', () => {
    const archive = buildArchive(stocked())
    expect(archive.entries.map((e) => e.goalId)).toEqual(['g-docs', 'g-invoicing'])
    expect(archive.entries[0]).toMatchObject({
      title: 'Rewrite the onboarding docs',
      archivedLabel: '12 Sep',
    })
    expect(archive.entries[0]?.swimlane?.name).toBe('Work')
  })

  it('carries nothing that could distinguish finished from given up on', () => {
    const text = JSON.stringify(buildArchive(stocked()))
    expect(text).not.toMatch(/complete|abandon|unfinished|percent|progress|done|left/i)
  })

  it('has no tally of the archive itself', () => {
    const archive = buildArchive(stocked())
    expect(Object.keys(archive)).toEqual(['entries', 'swimlanes'])
  })
})

describe('UC-2132 — restoring', () => {
  const archived = () => run(mainState(), { kind: 'archiveGoal', id: 'g-invoicing', at: AT })

  it('puts it back in its lane with its history intact', () => {
    const state = run(archived(), { kind: 'restoreGoal', id: 'g-invoicing', at: AT })
    expect(state.goals['g-invoicing']).toMatchObject({
      archived: false,
      archivedAt: null,
      swimlaneId: 'l-work',
    })
    const done = childTasks(state, { type: 'plan', id: 'p-invoice' }).filter((t) => t.done)
    expect(done.length).toBeGreaterThan(0)
  })

  it('comes back unstarred — priorities are a current choice, not history', () => {
    const state = run(archived(), { kind: 'restoreGoal', id: 'g-invoicing', at: AT })
    expect(state.priorities.some((r) => r.id === 'g-invoicing')).toBe(false)
  })

  it('asks which lane when the original is gone, rather than failing or inventing one', () => {
    const laneGone = run(archived(), {
      kind: 'deleteSwimlane',
      id: 'l-work',
      disposition: { kind: 'archive', pileIds: [] },
      at: AT,
    })
    expect(
      buildArchive(laneGone).entries.find((e) => e.goalId === 'g-invoicing')?.swimlane,
    ).toBeNull()

    expect(() => run(laneGone, { kind: 'restoreGoal', id: 'g-invoicing', at: AT })).toThrow(
      /no longer exists/,
    )

    const placed = run(laneGone, {
      kind: 'restoreGoal',
      id: 'g-invoicing',
      swimlaneId: 'l-family',
      at: AT,
    })
    expect(placed.goals['g-invoicing']).toMatchObject({ archived: false, swimlaneId: 'l-family' })
    expect(checkInvariants(placed)).toEqual([])
  })

  it('refuses to restore something that was never archived', () => {
    expect(() => run(mainState(), { kind: 'restoreGoal', id: 'g-chipper', at: AT })).toThrow(
      RuleError,
    )
  })
})

describe('deleting an archived Goal', () => {
  it('destroys it and everything it was keeping', () => {
    const archived = run(mainState(), { kind: 'archiveGoal', id: 'g-invoicing', at: AT })
    const below = descendants(archived, { type: 'goal', id: 'g-invoicing' })
    expect(below.tasks.length).toBeGreaterThan(0)

    const state = run(archived, { kind: 'deleteGoal', id: 'g-invoicing', at: AT })
    expect(state.goals['g-invoicing']).toBeUndefined()
    for (const task of below.tasks) expect(state.tasks[task.id]).toBeUndefined()
    expect(checkInvariants(state)).toEqual([])
  })

  it('works even when the swimlane it came from is gone', () => {
    let state = run(mainState(), { kind: 'archiveGoal', id: 'g-invoicing', at: AT })
    state = run(state, {
      kind: 'deleteSwimlane',
      id: 'l-work',
      disposition: { kind: 'archive', pileIds: [] },
      at: AT,
    })
    const after = run(state, { kind: 'deleteGoal', id: 'g-invoicing', at: AT })
    expect(after.goals['g-invoicing']).toBeUndefined()
    expect(checkInvariants(after)).toEqual([])
  })
})
