/**
 * The two clocks the app owns (DESIGN.md §7).
 *
 * `domain/days.ts` refuses to touch `Date` — "it reads the machine timezone, which would
 * make 'three weeks away' differ between two laptops" — and hands the question of what
 * today is to whoever knows. This is that whoever, and for seven milestones it answered
 * with the UTC date: `now().slice(0, 10)`. For a user in California the sweep rolled over
 * to tomorrow at 5pm; in Auckland it lagged half a day. Every "today", "tomorrow" and
 * "was yesterday" on the Set-priorities screen was wrong through those windows.
 *
 * No test could catch it, because every test injects the day. So this one does not.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { systemClock, systemToday } from '../src/app/deps'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllEnvs()
})

/** Runs a body with the process in a given zone, restoring whatever was there. */
function inZone<T>(tz: string, body: () => T): T {
  const before = process.env.TZ
  process.env.TZ = tz
  try {
    return body()
  } finally {
    if (before === undefined) delete process.env.TZ
    else process.env.TZ = before
  }
}

describe('systemToday is the user’s day, not UTC’s', () => {
  /** 22:30 on 15 September, UTC. Already the 16th in Auckland, still the 15th in LA. */
  const instant = new Date('2026-09-15T22:30:00.000Z')

  it('is the local date, which can differ from the UTC date', () => {
    vi.useFakeTimers()
    vi.setSystemTime(instant)

    const utcDay = systemClock().slice(0, 10)
    expect(utcDay).toBe('2026-09-15')

    // The offset the process is actually running at decides what today is here. Rather
    // than asserting a particular zone (CI runs in UTC), assert the RELATIONSHIP: the
    // local day must be whatever local time says, which is the whole point.
    const local = new Date()
    const pad = (n: number) => String(n).padStart(2, '0')
    const expected = `${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}`
    expect(systemToday()).toBe(expected)
  })

  it('reports the day before the UTC one for a zone behind it', () => {
    inZone('America/Los_Angeles', () => {
      vi.useFakeTimers()
      // 04:00 UTC on the 16th is 21:00 on the 15th in Los Angeles.
      vi.setSystemTime(new Date('2026-09-16T04:00:00.000Z'))

      // Assert the technique works BEFORE relying on it. This was `if (offset !== 0)`,
      // which meant that on any host where the runtime `TZ` write does not bite the test
      // skipped its only real assertion and passed having checked `systemClock` alone —
      // and CI runs in UTC, so that was the default path.
      expect(new Date().getTimezoneOffset()).not.toBe(0)

      expect(systemClock().slice(0, 10)).toBe('2026-09-16')
      expect(systemToday()).toBe('2026-09-15')
    })
  })

  it('reports the day after the UTC one for a zone ahead of it', () => {
    inZone('Pacific/Auckland', () => {
      vi.useFakeTimers()
      // 22:30 UTC on the 15th is already the 16th in Auckland.
      vi.setSystemTime(new Date('2026-09-15T22:30:00.000Z'))
      expect(new Date().getTimezoneOffset()).not.toBe(0)
      expect(systemClock().slice(0, 10)).toBe('2026-09-15')
      expect(systemToday()).toBe('2026-09-16')
    })
  })

  it('is always a well-formed calendar day', () => {
    vi.useFakeTimers()
    for (const iso of ['2026-01-01T00:00:00.000Z', '2026-12-31T23:59:59.000Z']) {
      vi.setSystemTime(new Date(iso))
      expect(systemToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('pads single-digit months and days, so it sorts as text', () => {
    // The whole domain compares dates with `<` on strings; an unpadded "2026-9-5" would
    // sort before "2026-10-01" and after "2026-1-01", silently.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-05T12:00:00.000Z'))
    expect(systemToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(systemToday().split('-')[1]).toHaveLength(2)
    expect(systemToday().split('-')[2]).toHaveLength(2)
  })
})

describe('systemClock is a moment, in UTC', () => {
  it('is a full ISO timestamp — what createdAt and every mutation carry', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-15T22:30:00.000Z'))
    expect(systemClock()).toBe('2026-09-15T22:30:00.000Z')
    expect(systemClock()).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
  })

  it('and never the value the sweep should be given', () => {
    // Stated as a test because the two are one `.slice()` apart, which is how they got
    // conflated: `now().slice(0, 10)` looks like a date and is the wrong one.
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-09-15T22:30:00.000Z'))
    expect(systemClock().slice(0, 10)).toBe('2026-09-15')
    expect(systemToday()).toMatch(/^\d{4}-\d{2}-\d{2}$/)
  })
})
