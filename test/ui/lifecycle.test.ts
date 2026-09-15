// @vitest-environment happy-dom
/**
 * The removal dialog and the Archive, rendered (UC-2105, UC-2106, UC-2014, UC-2131).
 */
import { describe, expect, it, afterEach } from 'vitest'
import RemoveDialog from '../../src/ui/RemoveDialog.svelte'
import Archive from '../../src/ui/Archive.svelte'
import GoalCard from '../../src/ui/GoalCard.svelte'
import { buildRemoval, type Removal } from '../../src/domain/select/removal'
import { buildArchive } from '../../src/domain/select/archive'
import { buildBoard } from '../../src/domain/select/board'
import { reduce } from '../../src/domain/reduce'
import { mainState } from '../../src/fixtures/states'
import type { Lens } from '../../src/domain/board'
import type { State } from '../../src/domain/state'
import { render, recordingActions, settle, type Rendered } from './harness'

const AT = '2026-09-14T10:00:00.000Z'
const LENS: Lens = { focus: 'priorities', size: 'any', expanded: [] }

let open: Rendered[] = []
const show = (r: Rendered) => {
  open.push(r)
  return r
}
afterEach(() => {
  for (const r of open) r.destroy()
  open = []
})

function dialog(kind: Removal['kind'], id: string, state: State = mainState()) {
  const calls: string[] = []
  const removal = buildRemoval(state, kind, id)!
  const r = show(
    render(RemoveDialog, {
      removal,
      ondelete: (d: string) => calls.push(`delete(${d})`),
      onarchive: () => calls.push('archive'),
      onmove: (to: string) => calls.push(`move(${to})`),
      onclose: () => calls.push('close'),
    }),
  )
  return { r, calls, removal }
}

describe('UC-2105 — deleting a goal says exactly what goes', () => {
  it('names the plans, the tasks, and the ones already finished', () => {
    const { r } = dialog('goal', 'g-invoicing')
    expect(r.text).toContain('Catch up on invoicing')
    expect(r.text).toMatch(/1 plan and 7 tasks/)
    expect(r.text).toMatch(/including 3 you've completed/)
    expect(r.text).toContain('cannot be undone')
  })

  it('offers Archive beside it, and Archive reads first', () => {
    const { r } = dialog('goal', 'g-invoicing')
    expect(r.text).toContain('Archive it instead')
    const body = r.el.textContent ?? ''
    expect(body.indexOf('Archive it instead')).toBeLessThan(body.indexOf('Delete everything'))
  })

  it('archiving from here archives rather than deletes', async () => {
    const { r, calls } = dialog('goal', 'g-invoicing')
    r.button('Archive')?.click()
    await settle()
    expect(calls).toEqual(['archive'])
  })

  it('a goal with nothing under it says so plainly', () => {
    const state = reduce(mainState(), {
      kind: 'createGoal',
      id: 'g-bare',
      swimlaneId: 'l-health',
      title: 'Bare',
      at: AT,
    })
    const { r } = dialog('goal', 'g-bare', state)
    expect(r.text).toContain('Nothing else goes with it')
  })
})

describe('UC-2106 — deleting a plan keeps the work by default', () => {
  it('says where its contents will go', () => {
    const { r } = dialog('plan', 'p-prototype')
    expect(r.text).toMatch(/move up to “Ship Chipper v1”/)
    expect(r.text).toMatch(/keep their sizes, stars and done state/)
  })

  it('the main action promotes; destroying them is the separate, red one', async () => {
    const { r, calls } = dialog('plan', 'p-prototype')
    r.button('Delete the plan')?.click()
    await settle()
    expect(calls).toEqual(['delete(promote-children)'])

    const second = dialog('plan', 'p-prototype')
    second.r.button('Delete its tasks too')?.click()
    await settle()
    expect(second.calls).toEqual(['delete(cascade)'])
  })
})

describe('UC-2014 — deleting a swimlane needs a destination', () => {
  it('says what is inside, and offers both ways out', () => {
    const { r } = dialog('swimlane', 'l-work')
    expect(r.text).toMatch(/It holds 4 goals/)
    expect(r.text).toContain('Put its contents away instead')
    expect(r.text).toContain('Move it elsewhere')
  })

  it('never offers plain deletion for a lane with contents', () => {
    const { r } = dialog('swimlane', 'l-work')
    expect(r.button('Delete everything')).toBeNull()
  })

  it('moving asks which lane before doing anything', async () => {
    const { r, calls } = dialog('swimlane', 'l-work')
    r.button('Move it elsewhere')?.click()
    await settle()
    expect(calls).toEqual([])
    expect(r.text).toContain('Move everything to')

    r.button('Family')?.click()
    await settle()
    expect(calls).toEqual(['move(l-family)'])
  })

  it('does not offer the lane being deleted as a destination', async () => {
    const { r } = dialog('swimlane', 'l-work')
    r.button('Move it elsewhere')?.click()
    await settle()
    const picks = r.all('button').map((b) => b.textContent?.trim())
    expect(picks).not.toContain('Work')
  })
})

describe('the goal card offers the reversible choice first', () => {
  it('archive comes before delete', () => {
    const card = buildBoard(mainState(), LENS)
      .lanes.flatMap((l) => l.cards)
      .find((c) => c.goalId === 'g-invoicing')!
    const r = show(render(GoalCard, { card }))
    const labels = r.all('button').map((b) => b.getAttribute('aria-label') ?? b.textContent ?? '')
    const archive = labels.findIndex((l) => l.includes('archive'))
    const del = labels.findIndex((l) => l.includes('Delete goal'))
    expect(archive).toBeGreaterThanOrEqual(0)
    expect(archive).toBeLessThan(del)
  })

  it('deleting opens the dialog rather than removing anything', async () => {
    const { actions, calls } = recordingActions()
    const card = buildBoard(mainState(), LENS)
      .lanes.flatMap((l) => l.cards)
      .find((c) => c.goalId === 'g-invoicing')!
    const r = show(render(GoalCard, { card }, { actions }))
    r.button('Delete goal')?.click()
    await settle()
    expect(calls).toEqual(['remove("goal", "g-invoicing")'])
  })
})

describe('UC-2131 — the Archive', () => {
  const stocked = () =>
    reduce(
      reduce(mainState(), {
        kind: 'archiveGoal',
        id: 'g-invoicing',
        at: '2026-09-10T10:00:00.000Z',
      }),
      { kind: 'archiveGoal', id: 'g-docs', at: '2026-09-12T10:00:00.000Z' },
    )

  function archive(state: State = stocked()) {
    const calls: string[] = []
    const r = show(
      render(Archive, {
        archive: buildArchive(state),
        onrestore: (id: string, lane?: string) => calls.push(`restore(${id},${lane ?? ''})`),
        onremove: (id: string) => calls.push(`remove(${id})`),
      }),
    )
    return { r, calls }
  }

  it('shows a lane, a title and a date — and nothing else', () => {
    const { r } = archive()
    expect(r.text).toContain('Rewrite the onboarding docs')
    expect(r.text).toContain('12 Sep')
    expect(r.text).toContain('Work')
  })

  it('gives no sign of which were finished and which were given up on', () => {
    // g-invoicing had three tasks done; g-docs had none. Nothing here says so.
    const { r } = archive()
    expect(r.text.toLowerCase()).not.toMatch(
      /complete|abandon|unfinished|gave up|%|of \d|progress|left/,
    )
  })

  it('restores in one click when its lane still exists', async () => {
    const { r, calls } = archive()
    r.button('Restore')?.click()
    await settle()
    expect(calls).toEqual(['restore(g-docs,)'])
  })

  it('UC-2132 — asks where to put it when its lane is gone', async () => {
    const laneGone = reduce(stocked(), {
      kind: 'deleteSwimlane',
      id: 'l-work',
      disposition: { kind: 'archive', pileIds: {} },
      at: AT,
    })
    const { r, calls } = archive(laneGone)
    expect(r.text).toContain('no lane')
    // Deleting the lane archived everything in it, so take whichever is listed first.
    const first = buildArchive(laneGone).entries[0]!
    expect(first.swimlane).toBeNull()

    r.button('Restore')?.click()
    await settle()
    expect(calls).toEqual([])
    expect(r.text).toContain('Put it in')

    r.button('Family')?.click()
    await settle()
    expect(calls).toEqual([`restore(${first.goalId},l-family)`])
  })

  it('an empty archive says so without making it a lecture', () => {
    const { r } = archive(mainState())
    expect(r.text).toContain('Nothing archived yet')
    expect(r.text.toLowerCase()).not.toMatch(/should|try|start by|why not/)
  })
})

describe('deleting from the Archive', () => {
  const archived = () =>
    reduce(mainState(), { kind: 'archiveGoal', id: 'g-invoicing', at: '2026-09-10T10:00:00.000Z' })

  it('offers it, so putting something away is not keeping it forever', async () => {
    const calls: string[] = []
    const r = show(
      render(Archive, {
        archive: buildArchive(archived()),
        onrestore: () => {},
        onremove: (id: string) => calls.push(`remove(${id})`),
      }),
    )
    r.button('Delete Catch up on invoicing permanently')?.click()
    await settle()
    expect(calls).toEqual(['remove(g-invoicing)'])
  })

  it('asks first, and still says what would go', () => {
    const { r } = dialog('goal', 'g-invoicing', archived())
    expect(r.text).toMatch(/1 plan and 7 tasks/)
    expect(r.text).toMatch(/including 3 you've completed/)
  })

  it('does not offer to archive something that is already archived', () => {
    const { r, removal } = dialog('goal', 'g-invoicing', archived())
    expect(removal.alternative).toBeNull()
    expect(r.text).not.toContain('Archive it instead')
    expect(r.button('Archive')).toBeNull()
  })

  it('still offers archive for a goal on the board', () => {
    const { removal } = dialog('goal', 'g-invoicing')
    expect(removal.alternative?.kind).toBe('archive')
  })
})

describe('UC-2013 — something empty just goes', () => {
  const withEmptyLane = () =>
    reduce(mainState(), {
      kind: 'createSwimlane',
      id: 'l-empty',
      name: 'Fun',
      color: '#7A6E9E',
      at: AT,
    })

  it('an empty swimlane can actually be deleted', async () => {
    const { r, calls } = dialog('swimlane', 'l-empty', withEmptyLane())
    const del = r.button('Delete')
    expect(del).not.toBeNull()
    del!.click()
    await settle()
    expect(calls).toEqual(['delete(cascade)'])
  })

  it('never asks where to move nothing', () => {
    const { r, removal } = dialog('swimlane', 'l-empty', withEmptyLane())
    expect(removal.holdsAnything).toBe(false)
    expect(r.button('Move it elsewhere')).toBeNull()
    expect(r.button('Archive its contents')).toBeNull()
    expect(r.text).toContain('Nothing else goes with it')
  })

  it('a lane with contents still requires a destination', () => {
    const { r, removal } = dialog('swimlane', 'l-work')
    expect(removal.holdsAnything).toBe(true)
    expect(r.button('Move it elsewhere')).not.toBeNull()
    expect(r.button('Archive its contents')).not.toBeNull()
    // And there is still no way to simply destroy a lane that holds something.
    expect(r.all('button').some((b) => b.className.includes('danger'))).toBe(false)
  })

  it('an empty goal and an empty plan say Delete, not Delete everything', () => {
    // Two separate goals: one truly empty, and one only there to hold the empty plan.
    let state = reduce(mainState(), {
      kind: 'createGoal',
      id: 'g-bare',
      swimlaneId: 'l-health',
      title: 'Bare',
      at: AT,
    })
    state = reduce(state, {
      kind: 'createPlan',
      id: 'p-bare',
      parent: { type: 'goal', id: 'g-chipper' },
      title: 'Also bare',
      at: AT,
    })
    expect(dialog('goal', 'g-bare', state).r.button('Delete')?.textContent?.trim()).toBe('Delete')
    expect(dialog('plan', 'p-bare', state).r.button('Delete')?.textContent?.trim()).toBe('Delete')
  })
})

describe('UC-2059 — a goal that turned out to be a step towards something bigger', () => {
  const cardFor = (goalId: string, state: State = mainState()) =>
    buildBoard(state, LENS)
      .lanes.flatMap((l) => l.cards)
      .find((c) => c.goalId === goalId)!

  it('asks which goal before it moves anything', async () => {
    const { actions, calls } = recordingActions()
    const r = show(render(GoalCard, { card: cardFor('g-invoicing') }, { actions }))
    r.button('↓ plan')?.click()
    await settle()

    // The whole bug: the old button called changeLevel immediately, with no target,
    // and the reducer refused it. Opening the picker must dispatch nothing at all.
    expect(calls).toEqual([])
    expect(r.text).toContain('Make it a plan under')
    expect(r.text).toContain('Family · Sort out the garage')
  })

  it('demotes under the goal that was chosen', async () => {
    const { actions, calls } = recordingActions()
    const r = show(render(GoalCard, { card: cardFor('g-invoicing') }, { actions }))
    r.button('↓ plan')?.click()
    await settle()
    r.button('Sort out the garage')?.click()
    await settle()
    expect(calls).toEqual([
      'changeLevel({"type":"goal","id":"g-invoicing"}, "plan", {"type":"goal","id":"g-garage"})',
    ])
  })

  it('renders exactly what the model offers, and nothing of its own', async () => {
    // The self-exclusion used to be a `.filter()` here in the component. The component
    // now renders the list it is handed, so this asserts the rendering matches the model
    // rather than re-asserting the rule the model already owns.
    const card = cardFor('g-invoicing')
    const r = show(render(GoalCard, { card }))
    r.button('↓ plan')?.click()
    await settle()
    const picks = r.all('.picks .pick').map((b) => b.textContent?.trim())
    expect(picks).toEqual(card.demoteUnder.map((t) => t.label))
    expect(picks.some((p) => p?.includes('Catch up on invoicing'))).toBe(false)
  })

  it('hides the button entirely when there is nowhere to go', () => {
    const card = { ...cardFor('g-invoicing'), demoteUnder: [] }
    const r = show(render(GoalCard, { card }))
    expect(r.button('↓ plan')).toBeNull()
  })

  it('keeps a long list inside the card rather than growing without limit', async () => {
    // Measured at 200 goals: 200 buttons, unbounded, inside a card. `SetPriorities` gives
    // its browse list a scroll budget; this had none.
    const card = {
      ...cardFor('g-invoicing'),
      demoteUnder: Array.from({ length: 200 }, (_, i) => ({
        goalId: `g${i}`,
        label: `Work · Goal number ${i}`,
      })),
    }
    const r = show(render(GoalCard, { card }))
    r.button('↓ plan')?.click()
    await settle()
    const picks = r.query('.picks')!
    expect(r.all('.picks .pick')).toHaveLength(200)
    expect(getComputedStyle(picks).overflowY).toBe('auto')
    expect(parseInt(getComputedStyle(picks).maxHeight, 10)).toBeGreaterThan(0)
  })
})
