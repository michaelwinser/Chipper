import { describe, expect, it } from 'vitest'
import { formatBytes, formatDeadline } from '../src/domain/format'

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

describe('formatBytes — a size a person reads', () => {
  it('states bytes for something small, singular at one', () => {
    expect(formatBytes('x'.repeat(15))).toBe('15 bytes')
    expect(formatBytes('x')).toBe('1 byte')
    expect(formatBytes('')).toBe('0 bytes')
  })

  it('states KB past a kilobyte', () => {
    expect(formatBytes('x'.repeat(1024))).toBe('1 KB')
    expect(formatBytes('x'.repeat(4096))).toBe('4 KB')
  })

  it('states MB past a megabyte, rather than a four-digit KB nobody reads', () => {
    // localStorage holds about 5 MB, which `scale.test.ts` treats as the design ceiling.
    // A document at that ceiling rendered as "4883 KB".
    expect(formatBytes('x'.repeat(5_000_000))).toBe('4.8 MB')
  })

  it('measures UTF-8 bytes, not characters', () => {
    // It is shown to someone deciding whether their work is recoverable.
    expect(formatBytes('🙂')).toBe('4 bytes')
    expect(formatBytes('é')).toBe('2 bytes')
  })
})
