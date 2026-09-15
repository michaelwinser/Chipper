// @vitest-environment happy-dom
/**
 * The blocking screen for unreadable saved data.
 *
 * This is the last thing between a person and the permanent loss of their work, so the
 * tests are about what it must never do as much as what it says. Two of its failures
 * shipped in M8 and are pinned below: it told the user nothing had been deleted after the
 * data was already gone, and it described their own browser storage as "this file".
 */
import { describe, expect, it, afterEach, vi } from 'vitest'
import Blocked from '../../src/ui/Blocked.svelte'
import { buildBlocked } from '../../src/domain/select/blocked'
import { render, settle, type Rendered } from './harness'

let open: Rendered[] = []
const show = (r: Rendered) => {
  open.push(r)
  return r
}
afterEach(() => {
  for (const r of open) r.destroy()
  open = []
  vi.unstubAllGlobals()
})

function screen(raw = '{"app":"chipper","schemaVersion":99}', error: string | null = null) {
  let fresh = 0
  const r = show(
    render(Blocked, {
      blocked: buildBlocked({
        reason: 'The data saved in this browser was written by a newer version of Chipper.',
        raw,
      }),
      onstartfresh: () => (fresh += 1),
      error,
    }),
  )
  return { r, fresh: () => fresh }
}

describe('UC-6050 — unreadable saved data', () => {
  it('says what happened and that nothing has been lost', () => {
    const { r } = screen()
    expect(r.text).toContain('cannot read')
    expect(r.text).toContain('newer version of Chipper')
    expect(r.text).toContain('Nothing has been changed and nothing has been deleted')
  })

  it('offers the data back before it offers to erase it', () => {
    const { r } = screen()
    const labels = r.all('button').map((b) => b.textContent?.trim())
    expect(labels[0]).toBe('Download the raw data')
    expect(labels).toContain('Start fresh')
  })

  it('never erases on one click', async () => {
    const s = screen()
    s.r.button('Start fresh')?.click()
    await settle()
    expect(s.fresh()).toBe(0)
    expect(s.r.text).toContain('erases the unreadable data permanently')

    s.r.button('Yes, erase it')?.click()
    await settle()
    expect(s.fresh()).toBe(1)
  })

  it('offers nothing that would edit the board', () => {
    const { r } = screen()
    const labels = r.all('button').map((b) => (b.textContent ?? '').toLowerCase())
    for (const word of ['swimlane', 'goal', 'capture']) {
      expect(labels.some((l) => l.includes(word))).toBe(false)
    }
  })
})

describe('UC-6050 — the size it reports', () => {
  it('states it on screen, in the unit a person reads', () => {
    // `formatBytes` itself is tested in `test/format.test.ts`, where the other formatters
    // are and where no DOM is needed. This is the one thing only a render can show: that
    // the number reaches the screen.
    const { r } = screen('x'.repeat(4096))
    expect(r.text).toContain('4 KB')
  })
})

describe('UC-6050 — the data is recoverable by more than one route', () => {
  it('shows the raw bytes on request, so a blocked download is survivable', async () => {
    // The download is the only exit that loses nothing, and it can silently do nothing:
    // `file://` pages block downloads in several browsers. Without a second route the
    // remaining button is the destructive one.
    const { r } = screen('{"broken":true}')
    expect(r.query('textarea')).toBeNull()
    r.button('Show it here')?.click()
    await settle()
    expect(r.query<HTMLTextAreaElement>('textarea')?.value).toBe('{"broken":true}')
  })

  it('says so, and reveals the bytes, when the download itself throws', async () => {
    vi.stubGlobal('URL', {
      createObjectURL: () => {
        throw new Error('blocked on this page')
      },
      revokeObjectURL: () => {},
    })
    const { r } = screen('{"broken":true}')
    r.button('Download the raw data')?.click()
    await settle()
    expect(r.text).toContain('would not start the download')
    expect(r.query<HTMLTextAreaElement>('textarea')?.value).toBe('{"broken":true}')
  })

  it('attaches the anchor before clicking it, and does not revoke in the same tick', async () => {
    // A synthetic click on a detached anchor downloads nothing in Firefox, and revoking
    // the object URL immediately races the download's start in Safari.
    let attached = false
    let revokedEarly = false
    let url: string | null = null
    vi.stubGlobal('URL', {
      createObjectURL: () => {
        url = 'blob:probe'
        return url
      },
      revokeObjectURL: () => {
        revokedEarly = true
      },
    })
    const realClick = HTMLAnchorElement.prototype.click
    HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
      attached = this.isConnected
    }
    try {
      const { r } = screen()
      r.button('Download the raw data')?.click()
      await settle()
      expect(attached).toBe(true)
      expect(revokedEarly).toBe(false)
      expect(r.text).toContain('handed to your browser')
    } finally {
      HTMLAnchorElement.prototype.click = realClick
    }
  })

  it('points at Import as the route that loses nothing', () => {
    const { r } = screen()
    expect(r.text).toContain('Import')
    expect(r.text).toMatch(/without erasing|loses nothing/)
  })

  it('shows an error when starting fresh fails, rather than looking like it worked', () => {
    const { r } = screen('{"broken', 'Could not write to this browser.')
    expect(r.query('[role="alert"]')?.textContent).toContain('Could not write')
  })
})
