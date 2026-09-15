/**
 * The same logical state must reduce to the same result, whatever order its records
 * happen to be in (M8).
 *
 * This is the property the shared-reducer design rests on: `DESIGN.md` §5.2 says a future
 * server runs this exact function, so a mutation whose outcome depends on `Object.values`
 * enumeration order would diverge between client and server while both "worked".
 */
import { describe, expect, it } from 'vitest'
import { reduce } from '../src/domain/reduce'
import { buildBoard } from '../src/domain/select/board'
import { buildSweep } from '../src/domain/select/sweep'
import { buildPile } from '../src/domain/select/pile'
import { buildArchive } from '../src/domain/select/archive'
import { buildRemoval } from '../src/domain/select/removal'
import type { Lens } from '../src/domain/board'
import type { State } from '../src/domain/state'
import { generateState } from './support/generate'

const AT = '2026-09-15T10:00:00.000Z'
const LENS: Lens = { focus: 'priorities', size: 'any', expanded: [] }

/** The same state with every collection's keys inserted in the opposite order. */
function shuffled(state: State): State {
  const flip = <T>(map: Record<string, T>): Record<string, T> =>
    Object.fromEntries(Object.entries(map).reverse())
  return {
    ...state,
    swimlanes: flip(state.swimlanes),
    goals: flip(state.goals),
    plans: flip(state.plans),
    tasks: flip(state.tasks),
    pile: flip(state.pile),
  }
}

describe('record order does not change what the app does', () => {
  it('every selector produces the same model', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const state = generateState(seed)
      const twin = shuffled(state)
      expect({ seed, board: buildBoard(twin, LENS) }).toEqual({
        seed,
        board: buildBoard(state, LENS),
      })
      expect(buildSweep(twin, '2026-09-15')).toEqual(buildSweep(state, '2026-09-15'))
      expect(buildPile(twin, null)).toEqual(buildPile(state, null))
      expect(buildArchive(twin)).toEqual(buildArchive(state))

      // `buildRemoval` was absent from this list, which is why its `looseTaskIds` stayed
      // in record order — a selector whose output decides which task becomes which pile
      // item, ordered by insertion history. Every kind, over every id that exists.
      for (const [kind, ids] of [
        ['swimlane', Object.keys(state.swimlanes)],
        ['goal', Object.keys(state.goals)],
        ['plan', Object.keys(state.plans)],
        ['task', Object.keys(state.tasks)],
      ] as const) {
        for (const id of ids) {
          expect({ seed, kind, id, removal: buildRemoval(twin, kind, id) }).toEqual({
            seed,
            kind,
            id,
            removal: buildRemoval(state, kind, id),
          })
        }
      }
    }
  })

  it('archiving a swimlane pairs the same task with the same new idea', () => {
    // The bug this pins: pile ids were zipped positionally over `Object.values(tasks)`,
    // so which task became which idea depended on insertion history — and duplicate ids
    // silently destroyed tasks rather than being refused.
    let state = reduce(
      { ...generateState(3) },
      { kind: 'createSwimlane', id: 'l-x', name: 'Loose', color: '#000', at: AT },
    )
    state = reduce(state, {
      kind: 'createTask',
      id: 'alpha',
      parent: { type: 'swimlane', id: 'l-x' },
      title: 'ALPHA',
      size: null,
      at: AT,
    })
    state = reduce(state, {
      kind: 'createTask',
      id: 'beta',
      parent: { type: 'swimlane', id: 'l-x' },
      title: 'BETA',
      size: null,
      at: AT,
    })

    const remove = {
      kind: 'deleteSwimlane' as const,
      id: 'l-x',
      disposition: { kind: 'archive' as const, pileIds: { alpha: 'p-alpha', beta: 'p-beta' } },
      at: AT,
    }
    const a = reduce(state, remove)
    const b = reduce(shuffled(state), remove)

    expect(a.pile['p-alpha']?.text).toBe('ALPHA')
    expect(a.pile['p-beta']?.text).toBe('BETA')
    expect(b.pile['p-alpha']?.text).toBe('ALPHA')
    expect(b.pile['p-beta']?.text).toBe('BETA')
  })

  it('refuses to give two tasks the same new id, rather than destroying one', () => {
    let state = reduce(
      { ...generateState(4) },
      { kind: 'createSwimlane', id: 'l-x', name: 'Loose', color: '#000', at: AT },
    )
    for (const id of ['one', 'two']) {
      state = reduce(state, {
        kind: 'createTask',
        id,
        parent: { type: 'swimlane', id: 'l-x' },
        title: id,
        size: null,
        at: AT,
      })
    }
    expect(() =>
      reduce(state, {
        kind: 'deleteSwimlane',
        id: 'l-x',
        disposition: { kind: 'archive', pileIds: { one: 'dup', two: 'dup' } },
        at: AT,
      }),
    ).toThrow(/same new id/)
  })
})
