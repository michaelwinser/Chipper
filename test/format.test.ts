import { describe, expect, it } from 'vitest'
import { formatDeadline } from '../src/domain/format'

describe('formatDeadline', () => {
  it('formats a plain ISO date', () => {
    expect(formatDeadline('2026-12-01')).toBe('1 Dec')
    expect(formatDeadline('2026-11-30')).toBe('30 Nov')
    expect(formatDeadline('2026-01-09')).toBe('9 Jan')
  })

  it('returns null rather than guessing at anything else', () => {
    for (const bad of ['', 'tomorrow', '2026-13-01', '2026-12-32', '2026-12-01T10:00:00Z']) {
      expect(formatDeadline(bad)).toBeNull()
    }
  })

  it('does not depend on the machine timezone', () => {
    // A Date-based implementation would shift the day either side of UTC. This is
    // the regression that would make the same state render differently on two laptops.
    const original = process.env.TZ
    const results: (string | null)[] = []
    for (const tz of ['UTC', 'Pacific/Kiritimati', 'Pacific/Niue']) {
      process.env.TZ = tz
      results.push(formatDeadline('2026-12-01'))
    }
    process.env.TZ = original
    expect(new Set(results).size).toBe(1)
  })
})
