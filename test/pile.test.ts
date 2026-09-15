/**
 * Capture and The Pile (UC-1010 through UC-1070, UC-2026).
 */
import { describe, expect, it } from 'vitest'
import { reduce } from '../src/domain/reduce'
import { descendants } from '../src/domain/state'
import { RuleError } from '../src/domain/errors'
import { parseTags, tagCounts } from '../src/domain/tags'
import { buildPile } from '../src/domain/select/pile'
import { checkInvariants } from '../src/domain/invariants'
import { emptyState, type State } from '../src/domain/state'
import type { Mutation } from '../src/domain/mutations'
import { mainState } from '../src/fixtures/states'
import { deepFreeze } from './support/freeze'

const AT = '2026-09-14T10:00:00.000Z'
const run = (state: State, ...ms: Mutation[]): State =>
  ms.reduce((s, m) => reduce(deepFreeze(s), m), state)

/** Captures happen at different moments; the pile's only order is newest first. */
let tick = 0
const capture = (id: string, text: string): Mutation => {
  // Minutes and seconds, not a padded counter: past 60 the counter alone produced
  // `10:00:100`, which is neither a time nor in the order it looks like it is in.
  const n = tick++
  const stamp = `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`
  return {
    kind: 'capture',
    id,
    text,
    destination: { kind: 'pile' },
    at: `2026-09-14T10:${stamp}.000Z`,
  }
}

describe('UC-1030 — hashtags', () => {
  it('lifts tags out so the item reads as a plain sentence', () => {
    expect(parseTags('#house replace the gutters')).toEqual({
      text: 'replace the gutters',
      tags: ['house'],
    })
    expect(parseTags('read #reading #someday the Mythical Man-Month')).toEqual({
      text: 'read the Mythical Man-Month',
      tags: ['reading', 'someday'],
    })
  })

  it('leaves text with no tags entirely alone', () => {
    expect(parseTags('look into a new dentist')).toEqual({
      text: 'look into a new dentist',
      tags: [],
    })
  })

  it('normalises case and never repeats a tag', () => {
    expect(parseTags('#House gutters #house again #HOUSE').tags).toEqual(['house'])
  })

  it('does not treat a mid-word hash as a tag', () => {
    expect(parseTags('buy a C#book').tags).toEqual([])
  })

  it('counts tags by use, so the filter row reflects the pile', () => {
    expect(tagCounts([{ tags: ['a', 'b'] }, { tags: ['b'] }, { tags: [] }])).toEqual([
      { tag: 'b', count: 2 },
      { tag: 'a', count: 1 },
    ])
  })
})

describe('UC-1010 — capture', () => {
  it('lands in the Pile with no destination and no required fields', () => {
    const state = run(emptyState(), capture('p1', '#house replace the gutters'))
    expect(state.pile['p1']).toMatchObject({ text: 'replace the gutters', tags: ['house'] })
    expect(checkInvariants(state)).toEqual([])
  })

  it('refuses text that is only tags, rather than filing something unreadable', () => {
    expect(() => run(emptyState(), capture('p1', '#house #someday'))).toThrow(RuleError)
  })

  it('UC-1020 — into a swimlane it becomes a loose task with no size and not done', () => {
    const state = run(mainState(), {
      kind: 'capture',
      id: 'new-task',
      text: 'renew the passport',
      destination: { kind: 'swimlane', swimlaneId: 'l-stuff', as: 'task' },
      at: AT,
    })
    expect(state.tasks['new-task']).toMatchObject({
      title: 'renew the passport',
      size: null,
      done: false,
      parent: { type: 'swimlane', id: 'l-stuff' },
    })
  })

  it('UC-2026 — the as-a-goal toggle makes a goal, not a task', () => {
    const state = run(mainState(), {
      kind: 'capture',
      id: 'new-goal',
      text: 'get the house ready to sell',
      destination: { kind: 'swimlane', swimlaneId: 'l-stuff', as: 'goal' },
      at: AT,
    })
    expect(state.goals['new-goal']?.title).toBe('get the house ready to sell')
    expect(state.tasks['new-goal']).toBeUndefined()
  })

  it('strips tags once something has a home — its home is its category', () => {
    const state = run(mainState(), {
      kind: 'capture',
      id: 'new-task',
      text: '#house replace the gutters',
      destination: { kind: 'swimlane', swimlaneId: 'l-stuff', as: 'task' },
      at: AT,
    })
    expect(state.tasks['new-task']?.title).toBe('replace the gutters')
  })
})

describe('UC-1040/1050 — promoting out of the Pile', () => {
  const withItem = () => run(mainState(), capture('p1', '#house get the house ready to sell'))

  it('becomes a goal and stops being an idea, in one step (invariant 6)', () => {
    const state = run(withItem(), {
      kind: 'promotePileItem',
      itemId: 'p1',
      to: { kind: 'goal', id: 'g-house', swimlaneId: 'l-stuff' },
      at: AT,
    })
    expect(state.goals['g-house']?.title).toBe('get the house ready to sell')
    expect(state.pile['p1']).toBeUndefined()
    expect(checkInvariants(state)).toEqual([])
  })

  it('becomes a task just as easily', () => {
    const state = run(withItem(), {
      kind: 'promotePileItem',
      itemId: 'p1',
      to: { kind: 'task', id: 't-house', parent: { type: 'swimlane', id: 'l-stuff' }, size: null },
      at: AT,
    })
    expect(state.tasks['t-house']?.title).toBe('get the house ready to sell')
    expect(state.pile['p1']).toBeUndefined()
  })

  it('leaves the pile untouched when the destination is nonsense', () => {
    expect(() =>
      run(withItem(), {
        kind: 'promotePileItem',
        itemId: 'p1',
        to: { kind: 'goal', id: 'g-house', swimlaneId: 'nowhere' },
        at: AT,
      }),
    ).toThrow(RuleError)
  })
})

describe('UC-1060 — sending something to the Pile', () => {
  it('takes a loose task off the board and its star with it', () => {
    const before = mainState()
    expect(before.priorities.some((r) => r.id === 't-gate')).toBe(true)

    const state = run(before, {
      kind: 'sendToPile',
      ref: { type: 'task', id: 't-gate' },
      pileId: 'p-gate',
      at: AT,
    })
    expect(state.tasks['t-gate']).toBeUndefined()
    expect(state.pile['p-gate']?.text).toBe('Fix the back gate')
    expect(state.priorities.some((r) => r.id === 't-gate')).toBe(false)
    expect(checkInvariants(state)).toEqual([])
  })

  it('refuses anything with structure under it, rather than destroying it', () => {
    expect(() =>
      run(mainState(), {
        kind: 'sendToPile',
        ref: { type: 'goal', id: 'g-invoicing' },
        pileId: 'p-x',
        at: AT,
      }),
    ).toThrow(/still has things under it/)
  })

  it('records nothing about it having been given up on', () => {
    const state = run(mainState(), {
      kind: 'sendToPile',
      ref: { type: 'task', id: 't-gate' },
      pileId: 'p-gate',
      at: AT,
    })
    expect(Object.keys(state.pile['p-gate']!)).toEqual(['id', 'text', 'tags', 'createdAt'])
  })
})

describe('UC-1070 — an item leaves the Pile when it is done with', () => {
  it('removes it, because done work belongs to structure and not to a backlog', () => {
    const state = run(mainState(), capture('p1', 'look into a new dentist'), {
      kind: 'deletePileItem',
      id: 'p1',
      at: AT,
    })
    expect(state.pile['p1']).toBeUndefined()
  })
})

describe('the Pile view', () => {
  const stocked = () =>
    run(
      mainState(),
      capture('p1', '#house replace the gutters'),
      capture('p2', 'look into a new dentist'),
      capture('p3', '#house solar quotes'),
    )

  it('is newest first, because it has no other order worth having', () => {
    const pile = buildPile(stocked())
    expect(pile.entries.map((e) => e.id)).toEqual(['p3', 'p2', 'p1'])
  })

  it('filters by tag', () => {
    const pile = buildPile(stocked(), 'house')
    expect(pile.entries.map((e) => e.text)).toEqual(['solar quotes', 'replace the gutters'])
    expect(pile.total).toBe(3)
  })

  it('offers somewhere to put things, taken from the swimlanes that exist', () => {
    expect(buildPile(stocked()).swimlanes.map((s) => s.name)).toEqual([
      'Work',
      'Family',
      'Health',
      'Stuff',
    ])
  })

  it('has no notion of age, staleness or how long anything has waited', () => {
    const text = JSON.stringify(buildPile(stocked()))
    expect(text).not.toMatch(/stale|age|days|old|waiting|since|overdue/i)
  })
})

describe('an idea is allowed to change its mind', () => {
  const withItem = () => run(mainState(), capture('p1', 'look into a dentist'))

  it('edits the text in place, keeping when it was caught', () => {
    const before = withItem()
    const state = run(before, {
      kind: 'editPileItem',
      id: 'p1',
      text: 'look into a new dentist, properly',
      at: AT,
    })
    expect(state.pile['p1']?.text).toBe('look into a new dentist, properly')
    expect(state.pile['p1']?.createdAt).toBe(before.pile['p1']?.createdAt)
  })

  it('re-parses tags, so adding one later is the same as typing it first time', () => {
    const state = run(withItem(), {
      kind: 'editPileItem',
      id: 'p1',
      text: '#health look into a dentist',
      at: AT,
    })
    expect(state.pile['p1']).toMatchObject({ text: 'look into a dentist', tags: ['health'] })
  })

  it('removes a tag when it is taken out of the text', () => {
    let state = run(withItem(), {
      kind: 'editPileItem',
      id: 'p1',
      text: '#health dentist',
      at: AT,
    })
    state = run(state, { kind: 'editPileItem', id: 'p1', text: 'dentist', at: AT })
    expect(state.pile['p1']?.tags).toEqual([])
  })

  it('refuses to leave an item with no words at all', () => {
    expect(() =>
      run(withItem(), { kind: 'editPileItem', id: 'p1', text: '  #health ', at: AT }),
    ).toThrow(RuleError)
  })
})

describe('the Pile is not a way out of the archive, or into it', () => {
  const archived = () => reduce(mainState(), { kind: 'archiveGoal', id: 'g-chipper', at: AT })

  it('refuses to pile a task out of an archived goal', () => {
    // The SECOND side door. `changeLevel` was closed at M8 and this was not, so DESIGN
    // §3.3's claim that the ladder "was the one route out" was wrong when written:
    // piling a task out of an archived goal destroyed it and left a bare line in the
    // Pile, emptying a goal the Archive still lists with its date.
    expect(() =>
      run(archived(), {
        kind: 'sendToPile',
        ref: { type: 'task', id: 't-model' },
        pileId: 'pi-x',
        at: AT,
      }),
    ).toThrow(/archived/)
  })

  it('refuses to pile a plan out of an archived goal', () => {
    expect(() =>
      run(archived(), {
        kind: 'sendToPile',
        ref: { type: 'plan', id: 'p-ship' },
        pileId: 'pi-x',
        at: AT,
      }),
    ).toThrow(/archived|has-children|still has things/)
  })

  it('refuses to pile a task that is already done', () => {
    // The rule lived in `Chip.svelte` as a comment explaining why that component hid the
    // button, while `TaskRow` rendered the same button with no guard at all.
    const done = run(mainState(), { kind: 'setTaskDone', id: 't-may', done: true, at: AT })
    expect(() =>
      run(done, { kind: 'sendToPile', ref: { type: 'task', id: 't-may' }, pileId: 'p1', at: AT }),
    ).toThrow(/already done/)
    expect(done.tasks['t-may']).toMatchObject({ done: true, doneAt: AT })
  })

  it('refuses to promote an idea INTO an archived goal', () => {
    // The route back in. The task would land where nothing renders it: not the board,
    // which filters archived; not the Archive, which lists goals; not the Pile, which it
    // has left. Gone until the goal is restored, with no invariant reporting it.
    const withIdea = run(archived(), {
      kind: 'capture',
      id: 'pi-cable',
      text: 'buy the cable',
      destination: { kind: 'pile' },
      at: AT,
    })
    expect(() =>
      run(withIdea, {
        kind: 'promotePileItem',
        itemId: 'pi-cable',
        to: { kind: 'task', id: 't-cable', parent: { type: 'goal', id: 'g-chipper' }, size: null },
        at: AT,
      }),
    ).toThrow(/archived/)
    // And the idea is still in the Pile — a refusal, not a half-move.
    expect(withIdea.pile['pi-cable']).toBeDefined()
  })

  it('refuses to create a task or a plan inside an archived goal', () => {
    for (const m of [
      {
        kind: 'createTask' as const,
        id: 't-new',
        parent: { type: 'goal' as const, id: 'g-chipper' },
        title: 'Something',
        size: null,
        at: AT,
      },
      {
        kind: 'createPlan' as const,
        id: 'p-new',
        parent: { type: 'goal' as const, id: 'g-chipper' },
        title: 'Something',
        at: AT,
      },
    ]) {
      expect(() => run(archived(), m)).toThrow(/archived/)
    }
  })

  it('an archived goal keeps every child — DESIGN §3.3 invariant 8, as a property', () => {
    const before = descendants(mainState(), { type: 'goal', id: 'g-chipper' })
    const after = descendants(archived(), { type: 'goal', id: 'g-chipper' })
    expect(after.plans.map((p) => p.id).sort()).toEqual(before.plans.map((p) => p.id).sort())
    expect(after.tasks.map((t) => t.id).sort()).toEqual(before.tasks.map((t) => t.id).sort())
  })
})
