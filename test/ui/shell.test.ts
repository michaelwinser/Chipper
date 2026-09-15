// @vitest-environment happy-dom
/**
 * The shell, mounted for real (M8).
 *
 * `App.svelte` is the one file in the project that is pure wiring, and it had no tests
 * at all through seven milestones — while being where every wiring bug shipped from.
 * Deleting an empty swimlane raised "no task <id>" because a dispatch fell through to
 * `deleteTask`, and the component test for that dialog passed, because the component
 * test stubbed the very callback that was broken.
 *
 * So these tests stub nothing below the app. They mount `App` against a real store over
 * a fake `localStorage`, click what a person clicks, and read what the DOM says.
 */
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { mount, unmount } from 'svelte'
import App from '../../src/App.svelte'

/**
 * `pickFile` opens a real file input, which no test can drive. Mocked at the module so the
 * shell's own import wiring is exercised for real — that wiring is where the recovery
 * path was dead.
 */
let picked: string | null = null
vi.mock('../../src/app/files', async (original) => ({
  ...(await original<typeof import('../../src/app/files')>()),
  pickFile: () => Promise.resolve(picked),
}))
import { STORAGE_KEY } from '../../src/store/local'
import { toEnvelope } from '../../src/domain/transfer'
import { mainState } from '../../src/fixtures/states'
import { reduce } from '../../src/domain/reduce'
import type { State } from '../../src/domain/state'

const AT = '2026-09-15T10:00:00.000Z'

/** The slice of Storage the app uses, backed by a plain map. */
function fakeStorage(seed: string | null) {
  const cells = new Map<string, string>()
  if (seed !== null) cells.set(STORAGE_KEY, seed)
  return {
    getItem: (k: string) => cells.get(k) ?? null,
    setItem: (k: string, v: string) => void cells.set(k, v),
    removeItem: (k: string) => void cells.delete(k),
    clear: () => cells.clear(),
    key: () => null,
    length: 0,
    raw: () => cells.get(STORAGE_KEY) ?? null,
  }
}

type Mounted = {
  el: HTMLElement
  text: string
  /**
   * Buttons matching a label, within a scope.
   *
   * The scope is not a nicety. Every lane carries a `×` labelled "Delete lane", so an
   * unscoped search for "Delete" finds a lane's own button before the dialog's — and
   * the test then clicks the board while believing it confirmed a dialog.
   */
  buttons(label: string, within?: string): HTMLButtonElement[]
  button(label: string, within?: string): HTMLButtonElement | null
  dialog(): HTMLElement | null
  destroy(): void
}

let mounted: Mounted[] = []

/** Lets mount's onMount promise chain and the resulting renders finish. */
const settle = async () => {
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0))
}

async function app(seed: State | string | null = mainState()): Promise<Mounted> {
  const raw = typeof seed === 'string' || seed === null ? seed : toEnvelope(seed, AT)
  vi.stubGlobal('localStorage', fakeStorage(raw))

  const target = document.createElement('div')
  document.body.appendChild(target)
  const instance = mount(App, { target })
  await settle()

  const find = (label: string, within?: string) => {
    const root = within ? target.querySelector(within) : target
    if (!root) return []
    const wanted = label.toLowerCase()
    return [...root.querySelectorAll('button')].filter((b) =>
      `${b.getAttribute('aria-label') ?? ''} ${b.textContent ?? ''}`.toLowerCase().includes(wanted),
    )
  }
  const it: Mounted = {
    el: target,
    get text() {
      return (target.textContent ?? '').replace(/\s+/g, ' ').trim()
    },
    buttons: find,
    button: (label, within) => find(label, within)[0] ?? null,
    dialog: () => target.querySelector('[role="dialog"]'),
    destroy() {
      void unmount(instance)
      target.remove()
    },
  }
  mounted.push(it)
  return it
}

beforeEach(() => {
  mounted = []
})
afterEach(() => {
  for (const a of mounted) a.destroy()
  vi.unstubAllGlobals()
})

describe('the shell opens what is stored', () => {
  it('renders the board from saved data', async () => {
    const a = await app()
    expect(a.text).toContain('Catch up on invoicing')
    expect(a.text).toContain('Work')
  })

  it('opens to a usable board on a completely fresh browser', async () => {
    const a = await app(null)
    expect(a.text).toContain('Chipper')
    // Nothing to show, so the first-run explanation and its one move are offered.
    expect(a.text).toContain('A swimlane is an area of your life or work')
    expect(a.button('Work')).not.toBeNull()
    expect(a.dialog()).toBeNull()
  })

  it('refuses to render the board over data it could not read', async () => {
    const a = await app('{"this is": "not a chipper export"')
    expect(a.text).toContain('cannot read')
    expect(a.text).toContain('nothing has been deleted')
    // The bug this replaces: an empty board that looked like a fresh install.
    expect(a.button('Add a goal')).toBeNull()
    expect(a.button('Work')).toBeNull()
  })
})

describe('UC-2013 / UC-2014 — deleting an empty swimlane, the dispatch that fell through', () => {
  /** A lane with nothing in it, which is the only lane a plain delete is offered for. */
  const withEmptyLane = () =>
    reduce(mainState(), {
      kind: 'createSwimlane',
      id: 'l-empty',
      name: 'Spare',
      color: '#8a8f7a',
      at: AT,
    })

  it('deletes it, rather than reporting a missing task', async () => {
    const a = await app(withEmptyLane())
    expect(a.text).toContain('Spare')

    // The lane's own × — the last one, since the spare lane is added at the end.
    const deletes = a.buttons('Delete lane')
    deletes[deletes.length - 1]!.click()
    await settle()
    expect(a.text).toContain('Delete the swimlane “Spare”?')

    a.button('Delete', '[role="dialog"]')!.click()
    await settle()

    expect(a.dialog()).toBeNull()
    expect(a.text).not.toContain('Spare')
    expect(a.text).not.toMatch(/no task|went wrong|something went/i)
  })

  it('does not ask where to move goals when there are none', async () => {
    const a = await app(withEmptyLane())
    const deletes = a.buttons('Delete lane')
    deletes[deletes.length - 1]!.click()
    await settle()
    expect(a.text).toContain('Nothing else goes with it')
    expect(a.button('Move it elsewhere', '[role="dialog"]')).toBeNull()
    expect(a.button('Archive', '[role="dialog"]')).toBeNull()
  })
})

describe('a refused rule reaches the user as words', () => {
  it('says why, instead of doing nothing', async () => {
    const a = await app()
    // Deleting a lane that holds goals: the dialog offers the safe routes, and the
    // reducer refuses the destructive one outright. Either way, no silent no-op.
    a.buttons('Delete lane')[0]!.click()
    await settle()
    expect(a.text).toMatch(/Delete the swimlane/)
    expect(a.text).toMatch(/goal|task/i)
  })
})

describe('the top bar never becomes a scoreboard', () => {
  it('shows no count beside the Pile, however much is in it', async () => {
    let state = mainState()
    for (let i = 0; i < 9; i++) {
      state = reduce(state, {
        kind: 'capture',
        id: `p${i}`,
        text: `idea ${i}`,
        destination: { kind: 'pile' },
        at: AT,
      })
    }
    const a = await app(state)
    // Scoped to the bar itself: the board below legitimately counts tasks in a goal.
    const bar = a.el.querySelector('header')!
    expect(bar.textContent).toContain('The Pile')
    expect(bar.textContent).not.toMatch(/\d/)
  })
})

describe('what the shell writes back', () => {
  it('saves an edit to storage, so a reload keeps it', async () => {
    const a = await app()
    const lane = a.el.querySelectorAll('.lane')[0]!
    ;[...lane.querySelectorAll('button')]
      .find((b) => (b.textContent ?? '').includes('Add a goal'))!
      .click()
    await settle()
    const field = lane.querySelector<HTMLInputElement>('input')!
    field.value = 'A brand new outcome'
    field.dispatchEvent(new Event('input', { bubbles: true }))
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    await settle()

    // It lands unstarred, so the priorities view folds it into the lane's quiet line
    // rather than putting it in play — that is UC-3010, not a failure to save it.
    expect(localStorage.getItem(STORAGE_KEY)).toContain('A brand new outcome')
    expect(a.text).toContain('3 more in Work')

    // And widening to Everything brings it back into view.
    a.button('Everything')!.click()
    await settle()
    expect(a.text).toContain('A brand new outcome')
  })

  it('writes nothing at all while the data is unreadable', async () => {
    const corrupt = '{"broken'
    const a = await app(corrupt)
    expect(a.text).toContain('cannot read')
    // Every key the shell could press must leave the original byte-for-byte.
    expect(localStorage.getItem(STORAGE_KEY)).toBe(corrupt)
  })
})

describe('UC-6050 — starting fresh from the blocked screen', () => {
  const corrupt = '{"this is": "not a chipper export"'

  it('actually re-renders once the data is gone', async () => {
    // THE bug. `App.svelte` poked the shell with `store = store`, which Svelte 5
    // discards — `$state` sources compare with `===` and `proxy()` hands back the same
    // proxy — so the block never re-evaluated. Review mounted the real app and clicked
    // through: localStorage held a fresh envelope, the user's bytes were gone, and the
    // screen still read "nothing has been changed and nothing has been deleted" with the
    // erase button still armed. The obvious response to a button that seems not to have
    // worked is to press it again.
    const a = await app(corrupt)
    expect(a.text).toContain('cannot read')

    a.button('Start fresh')!.click()
    await settle()
    a.button('Yes, erase it')!.click()
    await settle()

    expect(a.text).not.toContain('cannot read')
    expect(a.text).not.toContain('nothing has been deleted')
    expect(a.button('Yes, erase it')).toBeNull()
  })

  it('lands on a usable board', async () => {
    const a = await app(corrupt)
    a.button('Start fresh')!.click()
    await settle()
    a.button('Yes, erase it')!.click()
    await settle()
    expect(a.text).toContain('A swimlane is an area of your life or work')
    expect(a.button('Work')).not.toBeNull()
  })

  it('and only then is the storage replaced', async () => {
    const a = await app(corrupt)
    a.button('Start fresh')!.click()
    await settle()
    // Armed but not fired: the bytes are still the user's.
    expect(localStorage.getItem(STORAGE_KEY)).toBe(corrupt)

    a.button('Yes, erase it')!.click()
    await settle()
    expect(localStorage.getItem(STORAGE_KEY)).toContain('"app": "chipper"')
  })
})

describe('UC-6060 — storage the browser will not open at all', () => {
  it('says so, instead of sitting on “Opening…” for ever', async () => {
    // Chrome throws SecurityError for localStorage on a file:// page — a way of running
    // the app PRD §7 promises. The constructor threw out of onMount, the promise rejected
    // with nobody listening, and the app rendered "Opening…" indefinitely.
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new DOMException('Access is denied for this document.', 'SecurityError')
      },
      setItem: () => {},
    })
    const target = document.createElement('div')
    document.body.appendChild(target)
    const instance = mount(App, { target })
    await settle()
    const text = (target.textContent ?? '').replace(/\s+/g, ' ')

    expect(text).not.toContain('Opening…')
    expect(text).toContain('will not let Chipper save anything')
    expect(text).toContain('SecurityError')

    void unmount(instance)
    target.remove()
  })
})

describe('UC-6050 — an empty cell is an empty app, not an unreadable one', () => {
  it('opens normally on an empty string, rather than blocking over 0 bytes', async () => {
    // Reachable from a truncated write or a storage shim that returns ''. The blocking
    // screen offered to download an empty file and to erase nothing.
    const a = await app('')
    expect(a.text).not.toContain('cannot read')
    expect(a.text).toContain('A swimlane is an area of your life or work')
  })
})

describe('UC-6050 — the three ways out are all actually on screen', () => {
  const corrupt = '{"this is": "not a chipper export"'

  it('renders Import, which is the only exit that loses nothing', async () => {
    // The copy told the user to use Import; `TopBar` gated it on `onexport`, which the
    // blocked branch does not pass. So the sentence pointed at a control that was not
    // there, leaving permanent erase as the only state-changing way off the screen.
    const a = await app(corrupt)
    expect(a.text).toContain('cannot read')
    expect(a.button('Import')).not.toBeNull()
  })

  it('does not offer Export, because nothing is loaded to export', async () => {
    const a = await app(corrupt)
    expect(a.button('Export')).toBeNull()
  })

  it('offers all three routes the use case promises', async () => {
    const a = await app(corrupt)
    expect(a.button('Download the raw data')).not.toBeNull()
    expect(a.button('Show it here')).not.toBeNull()
    expect(a.button('Import')).not.toBeNull()
  })

  it('and a normal session still has both Export and Import', async () => {
    const a = await app()
    expect(a.button('Export')).not.toBeNull()
    expect(a.button('Import')).not.toBeNull()
  })
})

describe('UC-6050 — importing a good export is the exit that loses nothing', () => {
  const corrupt = '{"this is": "not a chipper export"'

  /** A real export, as `pickFile` would hand it back. */
  const goodExport = () =>
    toEnvelope(
      reduce(mainState(), {
        kind: 'createGoal',
        id: 'g-rescued',
        swimlaneId: 'l-work',
        title: 'Rescued from a file',
        at: AT,
      }),
      AT,
    )

  async function importInto(a: Mounted) {
    picked = goodExport()
    a.button('Import')!.click()
    await settle()
    a.button('Import', '[role="dialog"]')!.click()
    await settle()
  }

  it('replaces the unreadable data and opens the board', async () => {
    // `adopt()` and this whole branch were dead code: `onMount` built a session even over
    // a blocked store, so `adopt` took the ordinary mutation route, `replaceAll` was
    // refused by the blocked store, and the RuleError went to a notice the blocked screen
    // does not render. The user clicked Import and nothing happened at all — leaving
    // "Start fresh", which erases, as the only button that did anything.
    const a = await app(corrupt)
    await importInto(a)
    expect(a.text).not.toContain('cannot read')
    expect(a.text).toContain('Catch up on invoicing')

    // The rescued goal is unstarred, so Priorities folds it away — widening shows it.
    a.button('Everything')!.click()
    await settle()
    expect(a.text).toContain('Rescued from a file')
  })

  it('and the recovered document is what is in storage afterwards', async () => {
    const a = await app(corrupt)
    await importInto(a)
    const stored = localStorage.getItem(STORAGE_KEY)!
    expect(stored).toContain('Rescued from a file')
    expect(stored).not.toContain('not a chipper export')
  })

  it('leaves the unreadable bytes alone until the user confirms', async () => {
    const a = await app(corrupt)
    picked = goodExport()
    a.button('Import')!.click()
    await settle()
    expect(a.dialog()).not.toBeNull()
    expect(localStorage.getItem(STORAGE_KEY)).toBe(corrupt)
  })

  it('does not offer to export first, because there is nothing loaded to export', async () => {
    const a = await app(corrupt)
    picked = goodExport()
    a.button('Import')!.click()
    await settle()
    expect(a.button('Export what is here first', '[role="dialog"]')).toBeNull()
  })
})
