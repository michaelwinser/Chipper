/**
 * The ritual (UC-2090, UC-3030, UC-3040, UC-3050).
 */
import { describe, expect, it } from 'vitest'
import { reduce } from '../src/domain/reduce'
import { RuleError } from '../src/domain/errors'
import { checkInvariants } from '../src/domain/invariants'
import { buildSweep } from '../src/domain/select/sweep'
import { daysUntil, distanceLabel, toDayNumber } from '../src/domain/days'
import type { Mutation } from '../src/domain/mutations'
import type { Ref, State } from '../src/domain/state'
import { mainState } from '../src/fixtures/states'
import { deepFreeze } from './support/freeze'

const AT = '2026-09-15T10:00:00.000Z'
const TODAY = '2026-09-15'
const run = (state: State, ...ms: Mutation[]): State =>
  ms.reduce((s, m) => reduce(deepFreeze(s), m), state)

describe('calendar arithmetic without a clock', () => {
  it('counts days across months, years and a leap day', () => {
    expect(daysUntil('2026-09-15', '2026-09-15')).toBe(0)
    expect(daysUntil('2026-09-15', '2026-09-16')).toBe(1)
    expect(daysUntil('2026-09-15', '2026-11-30')).toBe(76)
    expect(daysUntil('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysUntil('2028-02-28', '2028-03-01')).toBe(2) // 2028 is a leap year
    expect(daysUntil('2027-02-28', '2027-03-01')).toBe(1)
  })

  it('gives the same answer wherever it runs', () => {
    const original = process.env.TZ
    const results: (number | null)[] = []
    for (const tz of ['UTC', 'Pacific/Kiritimati', 'Pacific/Niue']) {
      process.env.TZ = tz
      results.push(daysUntil('2026-09-15', '2026-12-01'))
    }
    process.env.TZ = original
    expect(new Set(results).size).toBe(1)
  })

  it('refuses nonsense rather than guessing', () => {
    expect(toDayNumber('tomorrow')).toBeNull()
    expect(toDayNumber('2026-13-01')).toBeNull()
    expect(daysUntil('2026-09-15', 'soon')).toBeNull()
  })

  it('says how far away in plain words, and never scolds about a date that passed', () => {
    expect(distanceLabel(0)).toBe('today')
    expect(distanceLabel(1)).toBe('tomorrow')
    expect(distanceLabel(4)).toBe('this week')
    expect(distanceLabel(10)).toBe('next week')
    expect(distanceLabel(76)).toBe('11 weeks away')
    expect(distanceLabel(-1)).toBe('was yesterday')
    expect(distanceLabel(-20)).toBe('was 3 weeks ago')
    for (const d of [-1, -8, -40]) {
      expect(distanceLabel(d)).not.toMatch(/overdue|late|missed|behind|should/i)
    }
  })
})

describe('UC-3050 — Coming up', () => {
  const sweep = (state: State = mainState()) => buildSweep(state, TODAY)

  it('lists what has a date, nearest first, with how far out and what is left', () => {
    const up = sweep().comingUp
    expect(up.map((u) => u.title)).toEqual(['Hire a second engineer', 'Plan the December trip'])
    expect(up[0]).toMatchObject({
      date: '30 Nov',
      distance: '11 weeks away',
      left: '3 tasks left',
    })
    expect(up[0]?.swimlane?.name).toBe('Work')
  })

  it('can be starred straight from here, without leaving the view', () => {
    expect(sweep().comingUp.find((u) => u.title === 'Plan the December trip')?.starred).toBe(false)
    const state = run(mainState(), {
      kind: 'addPriority',
      ref: { type: 'goal', id: 'g-trip' },
      at: AT,
    })
    expect(sweep(state).comingUp.find((u) => u.title === 'Plan the December trip')?.starred).toBe(
      true,
    )
  })

  it('drops something once there is nothing open under it — finished is not upcoming', () => {
    let state = mainState()
    for (const task of Object.values(state.tasks)) {
      if (task.parent.type === 'goal' && task.parent.id === 'g-hire' && !task.done) {
        state = reduce(state, { kind: 'setTaskDone', id: task.id, done: true, at: AT })
      }
    }
    expect(sweep(state).comingUp.map((u) => u.title)).not.toContain('Hire a second engineer')
  })

  it('shows a date that has passed, factually, without a word against it', () => {
    const state = run(mainState(), {
      kind: 'setDeadline',
      ref: { type: 'goal', id: 'g-garage' },
      deadline: '2026-09-01',
      at: AT,
    })
    const up = sweep(state).comingUp
    expect(up[0]?.title).toBe('Sort out the garage')
    expect(up[0]?.distance).toBe('was 2 weeks ago')
    expect(JSON.stringify(up)).not.toMatch(/overdue|late|missed|behind/i)
  })

  it('never counts what was not finished', () => {
    const text = JSON.stringify(sweep())
    expect(text).not.toMatch(/overdue|missed|streak|behind|slipped|again/i)
  })

  it('has no notion of how long anything has been starred', () => {
    const one = sweep().current[0]
    expect(Object.keys(one ?? {})).toEqual(['ref', 'title', 'context'])
  })
})

describe('UC-3030 — the sweep', () => {
  it('replaces the whole set in one step', () => {
    const before = mainState()
    expect(before.priorities).toHaveLength(4)

    const kept: Ref[] = [
      { type: 'goal', id: 'g-invoicing' },
      { type: 'goal', id: 'g-trip' },
    ]
    const state = run(before, { kind: 'setPriorities', refs: kept, at: AT })
    expect(state.priorities).toEqual(kept)
    expect(checkInvariants(state)).toEqual([])
  })

  it('records nothing about what was dropped', () => {
    const state = run(mainState(), { kind: 'setPriorities', refs: [], at: AT })
    expect(state.priorities).toEqual([])
    // Nothing anywhere remembers that four things were let go.
    expect(JSON.stringify(state)).not.toMatch(/dropped|previous|lastSet|carried|kept/i)
  })

  it('refuses a set naming something that does not exist, and changes nothing', () => {
    const before = mainState()
    expect(() =>
      run(before, { kind: 'setPriorities', refs: [{ type: 'goal', id: 'nope' }], at: AT }),
    ).toThrow(RuleError)
    expect(mainState()).toEqual(before)
  })

  it('refuses to star something already done or archived', () => {
    const done = run(mainState(), { kind: 'setTaskDone', id: 't-flights', done: true, at: AT })
    expect(() =>
      run(done, { kind: 'setPriorities', refs: [{ type: 'task', id: 't-flights' }], at: AT }),
    ).toThrow(RuleError)

    const archived = run(mainState(), { kind: 'archiveGoal', id: 'g-docs', at: AT })
    expect(() =>
      run(archived, { kind: 'setPriorities', refs: [{ type: 'goal', id: 'g-docs' }], at: AT }),
    ).toThrow(RuleError)
  })

  it('never lets the same thing be starred twice', () => {
    const state = run(mainState(), {
      kind: 'setPriorities',
      refs: [
        { type: 'goal', id: 'g-invoicing' },
        { type: 'goal', id: 'g-invoicing' },
      ],
      at: AT,
    })
    expect(state.priorities).toHaveLength(1)
    expect(checkInvariants(state)).toEqual([])
  })

  it('shows what is starred with enough context to choose', () => {
    const current = buildSweep(mainState(), TODAY).current
    expect(current.map((c) => `${c.title} — ${c.context}`)).toEqual([
      'Catch up on invoicing — Work · goal',
      'Build the prototype — Work · Ship Chipper v1',
      'Book the flights — Family · Plan the December trip',
      'Fix the back gate — Stuff · task',
    ])
  })
})

describe('UC-3040 — priorities never change by themselves', () => {
  it('a day passing changes nothing at all', () => {
    const state = mainState()
    const monday = buildSweep(state, '2026-09-14')
    const sunday = buildSweep(state, '2026-09-20')
    expect(monday.current).toEqual(sunday.current)
    expect(state.priorities).toEqual(mainState().priorities)
  })

  it('only the distances move — the set is untouched by time', () => {
    const near = buildSweep(mainState(), '2026-11-20')
    expect(near.comingUp[0]?.distance).toBe('next week')
    expect(near.current).toHaveLength(4)
  })
})

describe('UC-2090 — deadlines are optional everywhere', () => {
  it('can be set and cleared on a goal, a plan or a task', () => {
    for (const ref of [
      { type: 'goal' as const, id: 'g-chipper' },
      { type: 'plan' as const, id: 'p-prototype' },
      { type: 'task' as const, id: 't-model' },
    ]) {
      const set = run(mainState(), { kind: 'setDeadline', ref, deadline: '2026-10-01', at: AT })
      const key = `${ref.type}s` as 'goals' | 'plans' | 'tasks'
      expect(set[key][ref.id]?.deadline).toBe('2026-10-01')

      const cleared = run(set, { kind: 'setDeadline', ref, deadline: null, at: AT })
      expect(cleared[key][ref.id]?.deadline).toBeNull()
    }
  })

  it('a dated plan or task shows up in Coming up alongside goals', () => {
    const state = run(mainState(), {
      kind: 'setDeadline',
      ref: { type: 'task', id: 't-may' },
      deadline: '2026-09-18',
      at: AT,
    })
    const up = buildSweep(state, TODAY).comingUp
    expect(up[0]).toMatchObject({ title: 'Invoice May', distance: 'this week' })
  })

  it('having no deadline is never flagged as incomplete', () => {
    const items = buildSweep(mainState(), TODAY).browse.flatMap((l) => l.items)
    const undated = items.find((i) => i.title === 'Ship Chipper v1')
    expect(undated).toBeDefined()
    // Only the app's own words are checked here. Titles are the user's, and one of
    // theirs is "Find the missing March receipts" — their vocabulary is not ours to police.
    const copy = items.map((i) => i.detail).join(' ')
    expect(copy).not.toMatch(/no deadline|missing|needs a date|undated|should/i)
    expect(undated?.detail).toBe('goal · 2 of 11 done')
  })
})
