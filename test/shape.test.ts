/**
 * Every view model's field list, pinned.
 *
 * The `Never` clauses were guarded by keyword blacklists — `/incomplete|abandoned|percent/`
 * and friends — and a blacklist only catches the words someone thought of. Review proved
 * it: adding `tally: 'some of it was finished'` to every Archive entry, which is UC-2131's
 * `Never` stated almost verbatim, passed all 549 tests. `completionRatio` passed every
 * keyword check too; "completion" does not contain "complete".
 *
 * A whitelist inverts that. Any field added to a view model fails here, and the person
 * adding it has to write it down — at which point they are looking straight at the
 * principle the field would break. `_noGuiltFields` catches the names we predicted; this
 * catches the ones we did not.
 *
 * When a test here fails because you added a legitimate field: add it to the list, and
 * read UC-2130 and PRD §3 on the way past.
 */
import { describe, expect, it } from 'vitest'
import { buildBoard } from '../src/domain/select/board'
import { buildArchive } from '../src/domain/select/archive'
import { buildSweep } from '../src/domain/select/sweep'
import { buildPile } from '../src/domain/select/pile'
import { buildRemoval } from '../src/domain/select/removal'
import { buildBlocked } from '../src/domain/select/blocked'
import { reduce } from '../src/domain/reduce'
import { mainState } from '../src/fixtures/states'
import type { Lens } from '../src/domain/board'
import type { State } from '../src/domain/state'

const AT = '2026-09-15T10:00:00.000Z'
const EVERYTHING: Lens = { focus: 'everything', size: 'any', expanded: [] }

/** A state exercising every optional shape at once, so no field is missing by accident. */
function rich(): State {
  let state = reduce(mainState(), { kind: 'archiveGoal', id: 'g-docs', at: AT })
  state = reduce(state, {
    kind: 'setDeadline',
    ref: { type: 'goal', id: 'g-trip' },
    deadline: '2026-12-01',
    at: AT,
  })
  state = reduce(state, { kind: 'setTaskDone', id: 't-may', done: true, at: AT })
  state = reduce(state, {
    kind: 'capture',
    id: 'pi-dentist',
    text: '#house look into a dentist',
    destination: { kind: 'pile' },
    at: AT,
  })
  state = reduce(state, {
    kind: 'capture',
    id: 'pi-plain',
    text: 'an idea with no tag',
    destination: { kind: 'pile' },
    at: AT,
  })
  return state
}

const keysOf = (o: object) => Object.keys(o).sort()

describe('the board model has exactly these fields', () => {
  const board = buildBoard(rich(), { ...EVERYTHING, expanded: ['g-invoicing'] })
  const cards = board.lanes.flatMap((l) => l.cards)
  const chips = board.lanes.flatMap((l) => l.chips)

  it('BoardModel', () => {
    expect(keysOf(board)).toEqual(['lanes', 'lens'])
  })

  it('Lens', () => {
    expect(keysOf(board.lens)).toEqual(['expanded', 'focus', 'size'])
  })

  it('LaneModel', () => {
    expect(board.lanes.length).toBeGreaterThan(0)
    for (const lane of board.lanes) {
      expect(keysOf(lane)).toEqual([
        'cards',
        'chips',
        'collapsed',
        'color',
        'id',
        'name',
        'resting',
      ])
    }
  })

  it('CardModel', () => {
    expect(cards.length).toBeGreaterThan(0)
    for (const card of cards) {
      expect(keysOf(card)).toEqual([
        'demoteUnder',
        'detail',
        'done',
        'emphasis',
        'empty',
        'expanded',
        'folded',
        'goalId',
        'guidance',
        'header',
        'holdsAnything',
        'meta',
        'rows',
      ])
      expect(keysOf(card.header)).toEqual(['contextual', 'starred', 'title'])
      // `meta` is the count-bearing part, so it is the one most worth pinning: `done`,
      // `total` and a label. Never a third number, and never a difference.
      expect(keysOf(card.meta)).toEqual(['deadline', 'done', 'label', 'total'])
    }
  })

  it('CardModel.done — finished work, as progress rather than as a shortfall', () => {
    const withDone = cards.filter((c) => c.done !== null)
    expect(withDone.length).toBeGreaterThan(0)
    for (const card of withDone) {
      expect(keysOf(card.done!)).toEqual(['tasks'])
      for (const t of card.done!.tasks) expect(keysOf(t)).toEqual(['id', 'title'])
    }
  })

  it('RowModel', () => {
    const rows = cards.flatMap((c) => c.rows)
    expect(rows.length).toBeGreaterThan(0)
    for (const row of rows) {
      if (row.kind === 'task') {
        expect(keysOf(row)).toEqual(['done', 'id', 'indent', 'kind', 'size', 'starred', 'title'])
      } else {
        expect(keysOf(row)).toEqual(['id', 'indent', 'kind', 'progress', 'starred', 'title'])
        expect(keysOf(row.progress)).toEqual(['done', 'total'])
      }
    }
  })

  it('ChipModel', () => {
    expect(chips.length).toBeGreaterThan(0)
    for (const chip of chips) {
      expect(keysOf(chip)).toEqual(['done', 'emphasis', 'size', 'starred', 'taskId', 'title'])
    }
  })

  it('DemotionTarget', () => {
    const targets = cards.flatMap((c) => c.demoteUnder)
    expect(targets.length).toBeGreaterThan(0)
    for (const t of targets) expect(keysOf(t)).toEqual(['goalId', 'label'])
  })
})

describe('the archive model has exactly these fields', () => {
  /**
   * The place a tally would be most tempting and most wrong. UC-2130: archiving a goal
   * with nothing done produces an identical result to archiving a finished one — "no
   * marker distinguishing abandoned from finished". A field is a marker.
   */
  const archive = buildArchive(rich())

  it('ArchiveModel', () => {
    expect(keysOf(archive)).toEqual(['entries', 'swimlanes'])
  })

  it('ArchiveEntry', () => {
    expect(archive.entries.length).toBeGreaterThan(0)
    for (const entry of archive.entries) {
      expect(keysOf(entry)).toEqual(['archivedAt', 'archivedLabel', 'goalId', 'swimlane', 'title'])
    }
  })

  it('carries nothing that could distinguish abandoned from finished', () => {
    // Stated as a property rather than a word list: an entry for a goal with everything
    // done and one for a goal with nothing done differ ONLY in identity.
    let done = mainState()
    for (const id of Object.keys(done.tasks)) {
      const task = done.tasks[id]!
      if (task.parent.type === 'goal' && task.parent.id === 'g-runs' && !task.done) {
        done = reduce(done, { kind: 'setTaskDone', id, done: true, at: AT })
      }
    }
    const finished = buildArchive(reduce(done, { kind: 'archiveGoal', id: 'g-runs', at: AT }))
    const given = buildArchive(reduce(mainState(), { kind: 'archiveGoal', id: 'g-docs', at: AT }))

    const a = finished.entries.find((e) => e.goalId === 'g-runs')!
    const b = given.entries.find((e) => e.goalId === 'g-docs')!
    expect(keysOf(a)).toEqual(keysOf(b))
    for (const key of keysOf(a)) {
      if (key === 'goalId' || key === 'title' || key === 'swimlane') continue
      expect({ key, value: a[key as keyof typeof a] }).toEqual({
        key,
        value: b[key as keyof typeof b],
      })
    }
  })
})

describe('the other models have exactly these fields', () => {
  it('SweepModel', () => {
    const sweep = buildSweep(rich(), '2026-09-15')
    expect(keysOf(sweep)).toEqual(['browse', 'comingUp', 'current'])
    expect(sweep.current.length).toBeGreaterThan(0)
    for (const c of sweep.current) expect(keysOf(c)).toEqual(['context', 'ref', 'title'])
    expect(sweep.comingUp.length).toBeGreaterThan(0)
    for (const u of sweep.comingUp) {
      expect(keysOf(u)).toEqual([
        'date',
        'days',
        'distance',
        'left',
        'ref',
        'starred',
        'swimlane',
        'title',
      ])
    }
    for (const lane of sweep.browse) {
      expect(keysOf(lane)).toEqual(['color', 'id', 'items', 'name'])
      for (const i of lane.items) {
        expect(keysOf(i)).toEqual(['detail', 'indent', 'ref', 'starred', 'title'])
      }
    }
  })

  it('PileModel', () => {
    const pile = buildPile(rich(), null)
    expect(keysOf(pile)).toEqual(['entries', 'filter', 'swimlanes', 'tags', 'total', 'untagged'])
    expect(pile.entries.length).toBeGreaterThan(0)
    for (const e of pile.entries) expect(keysOf(e)).toEqual(['createdAt', 'id', 'tags', 'text'])
  })

  it('Removal', () => {
    for (const [kind, id] of [
      ['swimlane', 'l-work'],
      ['goal', 'g-invoicing'],
      ['plan', 'p-invoice'],
      ['task', 't-receipts'],
    ] as const) {
      const removal = buildRemoval(rich(), kind, id)!
      expect({ kind, keys: keysOf(removal) }).toEqual({
        kind,
        keys: [
          'alternative',
          'cascadeCost',
          'cost',
          'holdsAnything',
          'id',
          'kind',
          'looseTaskIds',
          'swimlanes',
          'title',
        ],
      })
    }
  })

  it('BlockedModel', () => {
    expect(keysOf(buildBlocked({ reason: 'x', raw: '{}' }))).toEqual(['raw', 'reason', 'sizeLabel'])
  })
})
