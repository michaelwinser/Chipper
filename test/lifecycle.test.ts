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
import { buildRemoval } from '../src/domain/select/removal'
import { checkInvariants } from '../src/domain/invariants'
import { buildArchive } from '../src/domain/select/archive'
import { buildBoard } from '../src/domain/select/board'
import { childPlans, childTasks, descendants, type State } from '../src/domain/state'
import type { DeleteSwimlaneDisposition, Mutation } from '../src/domain/mutations'
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
  /**
   * The guarantee is the type: there is no shape of this mutation meaning "delete it and
   * whatever is inside".
   *
   * Two earlier attempts at asserting that were tautologies — reading `.kind` back off a
   * literal, then counting the array literal's own length. Review checked the comment's
   * claim that "a `cascade` variant added later would fail to compile here" and found it
   * false: widening a union does not break a two-element array literal.
   *
   * This is the real exhaustiveness guard. `never` is only inhabited when every member
   * has been handled, so a third variant makes the assignment at the bottom a compile
   * error — and the `default` arm makes it one in the right place, naming the variant.
   */
  it('cannot be expressed without one — every disposition says where things go', () => {
    const destinationOf = (d: DeleteSwimlaneDisposition): string => {
      switch (d.kind) {
        case 'move':
          return d.toSwimlaneId
        case 'archive':
          return 'the archive, and the Pile for unfinished loose tasks'
        default: {
          const unhandled: never = d
          throw new Error(`a disposition with no destination: ${JSON.stringify(unhandled)}`)
        }
      }
    }

    expect(destinationOf({ kind: 'move', toSwimlaneId: 'l-family' })).toBe('l-family')
    expect(destinationOf({ kind: 'archive', pileIds: {} })).toContain('archive')
  })

  it('refuses a disposition the reducer does not know, rather than cascading', () => {
    // The type is the guarantee for callers that compile. This is the guarantee for the
    // import path and a future server, which do not.
    const before = mainState()
    expect(Object.values(before.goals).some((g) => g.swimlaneId === 'l-work')).toBe(true)

    expect(() =>
      run(before, {
        kind: 'deleteSwimlane',
        id: 'l-work',
        disposition: { kind: 'cascade' } as unknown as DeleteSwimlaneDisposition,
        at: AT,
      }),
    ).toThrow()

    // And the lane and its contents are still there — a refusal, not a partial delete.
    expect(before).toEqual(mainState())
    expect(before.swimlanes['l-work']).toBeDefined()
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
      disposition: { kind: 'archive', pileIds: {} },
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
      disposition: {
        kind: 'archive',
        pileIds: { 't-gate': 'pi-a', 't-passport': 'pi-b', 't-domain': 'pi-c' },
      },
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

    // The WHOLE key set, not the archive-prefixed subset, and not `typeof`. The narrow
    // version passed when `archiveGoal` was made to write `outcome: 'abandoned'` and
    // `finishedCount` onto the goal — UC-2130's `Never` clause verbatim, invisible to the
    // test named for it, because neither key starts with "archiv".
    expect(Object.keys(finished).sort()).toEqual(Object.keys(abandoned).sort())
    expect(Object.keys(finished).sort()).toEqual([
      'archived',
      'archivedAt',
      'createdAt',
      'deadline',
      'id',
      'notes',
      'swimlaneId',
      'title',
      'updatedAt',
    ])

    // And every field but the goal's own identity holds the same KIND of value, with the
    // two flags identical — one archived goal cannot be told from another by its shape.
    expect(finished.archived).toBe(abandoned.archived)
    expect(typeof finished.archivedAt).toBe(typeof abandoned.archivedAt)
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
      disposition: { kind: 'archive', pileIds: {} },
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
      disposition: { kind: 'archive', pileIds: {} },
      at: AT,
    })
    const after = run(state, { kind: 'deleteGoal', id: 'g-invoicing', at: AT })
    expect(after.goals['g-invoicing']).toBeUndefined()
    expect(checkInvariants(after)).toEqual([])
  })
})

describe('UC-2014 — deleting a lane keeps what it held, and says what it does not', () => {
  /** A lane holding one finished loose task and two unfinished ones. */
  const mixed = () => {
    let state = reduce(mainState(), {
      kind: 'createSwimlane',
      id: 'l-odds',
      name: 'Odds',
      color: '#8a8f7a',
      at: AT,
    })
    for (const [id, title] of [
      ['t-a', 'Cancel the old domain'],
      ['t-b', 'Renew the passport'],
      ['t-c', 'Book the boiler service'],
    ] as const) {
      state = reduce(state, {
        kind: 'createTask',
        id,
        parent: { type: 'swimlane', id: 'l-odds' },
        title,
        size: 'M',
        at: AT,
      })
    }
    return reduce(state, { kind: 'setTaskDone', id: 't-a', done: true, at: AT })
  }

  it('does not turn finished work into an open idea', () => {
    // Every layer said "losing only their size": the code comment, the mutation type,
    // DESIGN §5.3 and this test's own predecessor, which used three not-done tasks so
    // the case never ran. The path routed done tasks through the Pile, dropping done,
    // doneAt, notes and deadline and putting finished work back in the backlog.
    const before = mixed()
    const removal = buildRemoval(before, 'swimlane', 'l-odds')!
    const state = run(before, {
      kind: 'deleteSwimlane',
      id: 'l-odds',
      disposition: {
        kind: 'archive',
        pileIds: Object.fromEntries(removal.looseTaskIds.map((id, i) => [id, `pi-${i}`])),
      },
      at: AT,
    })

    const ideas = Object.values(state.pile).map((p) => p.text)
    expect(ideas).toContain('Renew the passport')
    expect(ideas).toContain('Book the boiler service')
    expect(ideas).not.toContain('Cancel the old domain')
    expect(checkInvariants(state)).toEqual([])
  })

  it('states that the finished one is destroyed, before it happens', () => {
    const removal = buildRemoval(mixed(), 'swimlane', 'l-odds')!
    expect(removal.alternative?.text).toMatch(/already finished/)
    expect(removal.alternative?.text).not.toMatch(/Nothing is destroyed/)
    // And it asks for new ids only for the ones that are actually going to the Pile.
    expect(removal.looseTaskIds).toEqual(['t-b', 't-c'])
  })

  it('still says nothing is destroyed when nothing is finished', () => {
    const state = reduce(mixed(), { kind: 'setTaskDone', id: 't-a', done: false, at: AT })
    expect(buildRemoval(state, 'swimlane', 'l-odds')!.alternative?.text).toMatch(
      /Nothing is destroyed/,
    )
  })

  it('refuses when a task is given no new id, rather than dropping it', () => {
    // The rules that exist because the pre-M8 positional zip destroyed tasks silently.
    expect(() =>
      run(mixed(), {
        kind: 'deleteSwimlane',
        id: 'l-odds',
        disposition: { kind: 'archive', pileIds: {} },
        at: AT,
      }),
    ).toThrow(/no new id/)
  })

  it('refuses when two tasks are given the same new id', () => {
    expect(() =>
      run(mixed(), {
        kind: 'deleteSwimlane',
        id: 'l-odds',
        disposition: { kind: 'archive', pileIds: { 't-b': 'same', 't-c': 'same' } },
        at: AT,
      }),
    ).toThrow(/same new id/)
  })

  it('gives the same answer however the record happens to be ordered', () => {
    // `looseTaskIds` decided which task got which new id off `Object.values`, which is
    // insertion history rather than state — so the same logical document produced
    // different pile contents on two machines.
    const forward = mixed()
    const shuffled = {
      ...forward,
      tasks: Object.fromEntries(Object.entries(forward.tasks).reverse()),
    }
    expect(buildRemoval(shuffled, 'swimlane', 'l-odds')!.looseTaskIds).toEqual(
      buildRemoval(forward, 'swimlane', 'l-odds')!.looseTaskIds,
    )
  })
})
