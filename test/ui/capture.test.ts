// @vitest-environment happy-dom
/**
 * The capture overlay and the Pile, rendered.
 */
import { describe, expect, it, afterEach } from 'vitest'
import CaptureOverlay from '../../src/ui/CaptureOverlay.svelte'
import Pile from '../../src/ui/Pile.svelte'
import { buildPile } from '../../src/domain/select/pile'
import { reduce } from '../../src/domain/reduce'
import { mainState } from '../../src/fixtures/states'
import { render, settle, type Rendered } from './harness'

const LANES = [
  { id: 'l-work', name: 'Work', color: '#5A7391' },
  { id: 'l-stuff', name: 'Stuff', color: '#8A8279' },
]

let open: Rendered[] = []
const show = (r: Rendered) => {
  open.push(r)
  return r
}
afterEach(() => {
  for (const r of open) r.destroy()
  open = []
})

function overlay() {
  const captured: [string, unknown][] = []
  let closed = false
  const r = show(
    render(CaptureOverlay, {
      swimlanes: LANES,
      oncapture: (text: string, destination: unknown) => captured.push([text, destination]),
      onclose: () => (closed = true),
    }),
  )
  const input = r.query<HTMLInputElement>('input')!
  const type = async (value: string) => {
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await settle()
  }
  const enter = async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle()
  }
  return { r, input, type, enter, captured, closed: () => closed }
}

describe('UC-1010 — capture', () => {
  it('takes one line and files it in the Pile with no other decision', async () => {
    const o = overlay()
    await o.type('look into a new dentist')
    await o.enter()
    expect(o.captured).toEqual([['look into a new dentist', { kind: 'pile' }]])
    expect(o.closed()).toBe(true)
  })

  it('does nothing on an empty line, rather than filing a blank', async () => {
    const o = overlay()
    await o.enter()
    expect(o.captured).toEqual([])
  })

  it('escapes without filing anything', async () => {
    const o = overlay()
    await o.type('never mind')
    o.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await settle()
    expect(o.captured).toEqual([])
    expect(o.closed()).toBe(true)
  })

  it('UC-1030 — shows what it understood from the tags as you type', async () => {
    const o = overlay()
    await o.type('#house replace the gutters')
    expect(o.r.text).toContain('#house')
    expect(o.r.text).toContain('replace the gutters')
  })

  it('UC-2026 — the as-a-goal toggle appears only once it has a home', async () => {
    const o = overlay()
    expect(o.r.text).not.toContain('a goal')

    o.r.button('Stuff')?.click()
    await settle()
    expect(o.r.text).toContain('a goal')

    o.r.button('a goal')?.click()
    await o.type('get the house ready to sell')
    await o.enter()
    expect(o.captured).toEqual([
      ['get the house ready to sell', { kind: 'swimlane', swimlaneId: 'l-stuff', as: 'goal' }],
    ])
  })
})

describe('the Pile', () => {
  const stocked = () => {
    let state = mainState()
    const add = (id: string, text: string, n: number) => {
      state = reduce(state, {
        kind: 'capture',
        id,
        text,
        destination: { kind: 'pile' },
        at: `2026-09-14T10:00:0${n}.000Z`,
      })
    }
    add('p1', '#house replace the gutters', 1)
    add('p2', 'look into a new dentist', 2)
    return state
  }

  function pile(filter: string | null = null) {
    const calls: string[] = []
    const r = show(
      render(Pile, {
        pile: buildPile(stocked(), filter),
        onfilter: (t: string | null) => calls.push(`filter(${t})`),
        oncapture: (t: string) => calls.push(`capture(${t})`),
        onedit: (id: string, text: string) => calls.push(`edit(${id},${text})`),
        onpromote: (id: string, to: { kind: string; swimlaneId: string }) =>
          calls.push(`promote(${id},${to.kind},${to.swimlaneId})`),
        ondelete: (id: string) => calls.push(`delete(${id})`),
      }),
    )
    return { r, calls }
  }

  it('lists what is in it, newest first, with its tags', () => {
    const { r } = pile()
    expect(r.text).toContain('look into a new dentist')
    expect(r.text).toContain('replace the gutters')
    expect(r.text).toContain('#house')
  })

  it('says nothing anywhere about anything being late or stale', () => {
    const { r } = pile()
    expect(r.text.toLowerCase()).not.toMatch(/stale|overdue|days ago|still|waiting|neglect/)
  })

  it('UC-1040 — promoting asks where it should go before doing anything', async () => {
    const { r, calls } = pile()
    r.button('Make a goal')?.click()
    await settle()
    expect(calls).toEqual([])
    expect(r.text).toContain('Into')

    r.button('Stuff')?.click()
    await settle()
    expect(calls).toEqual(['promote(p2,goal,l-stuff)'])
  })

  it('filters by tag', async () => {
    const { r, calls } = pile()
    r.button('#house')?.click()
    await settle()
    expect(calls).toEqual(['filter(house)'])
  })

  it('an empty pile explains itself rather than looking broken', () => {
    const r = show(
      render(Pile, {
        pile: buildPile(mainState(), null),
        onfilter: () => {},
        oncapture: () => {},
        onedit: () => {},
        onpromote: () => {},
        ondelete: () => {},
      }),
    )
    expect(r.text).toContain('Nothing in the pile')
    expect(r.text).toContain('⌘K')
  })
})

// The top bar's "never shows a count of the Pile" assertion lives in `shell.test.ts`,
// against the mounted app with nine items in the pile. A version of it lived here,
// rendering a TopBar that is handed no numbers and then asserting no number appeared —
// it named a use case and tested the pile selector's arithmetic.

describe('editing an idea', () => {
  it('turns the text into a field and reports the change', async () => {
    const calls: string[] = []
    const r = show(
      render(Pile, {
        pile: buildPile(
          reduce(mainState(), {
            kind: 'capture',
            id: 'p1',
            text: 'look into a dentist',
            destination: { kind: 'pile' },
            at: '2026-09-14T10:00:00.000Z',
          }),
          null,
        ),
        onfilter: () => {},
        oncapture: () => {},
        onedit: (id: string, text: string) => calls.push(`edit(${id},${text})`),
        onpromote: () => {},
        ondelete: () => {},
      }),
    )

    const text = [...r.el.querySelectorAll('[role="button"]')].find((e) =>
      (e.textContent ?? '').includes('dentist'),
    ) as HTMLElement
    expect(text).toBeTruthy()
    text.click()
    await settle()

    const field = r.query<HTMLInputElement>('input')!
    field.value = 'look into a new dentist'
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle()

    expect(calls).toEqual(['edit(p1,look into a new dentist)'])
  })
})
