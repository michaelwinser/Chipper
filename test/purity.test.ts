/**
 * The domain claims to be pure (DESIGN.md §2, §3.2): no I/O, no DOM, and no hidden
 * inputs. A clock or a random source in here makes the reducer non-deterministic and
 * every test downstream of it unreliable. Timestamps and ids are passed IN.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const DOMAIN = resolve(import.meta.dirname, '../src/domain')

const FORBIDDEN: { pattern: RegExp; why: string }[] = [
  { pattern: /\bDate\.now\b/, why: 'reads the clock — pass the time in' },
  { pattern: /\bnew Date\b/, why: 'reads the clock — pass the time in' },
  { pattern: /\bMath\.random\b/, why: 'non-deterministic — pass the value in' },
  { pattern: /\bcrypto\./, why: 'generates ids — pass ids in' },
  { pattern: /\bwindow\b/, why: 'DOM access in the domain layer' },
  { pattern: /\bdocument\b/, why: 'DOM access in the domain layer' },
  { pattern: /\blocalStorage\b/, why: 'storage access belongs in store/' },
  { pattern: /\bfetch\s*\(/, why: 'I/O in the domain layer' },
  { pattern: /\btoLocaleDateString\b|\btoLocaleString\b/, why: 'locale-dependent output' },
  { pattern: /\basync\s|\bawait\s/, why: 'the domain must stay synchronous and total' },
]

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry: string) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : []
  })
}

describe('domain purity', () => {
  const files = walk(DOMAIN)

  it('has domain files to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it.each(FORBIDDEN)('contains no $pattern — $why', ({ pattern }) => {
    const hits = files.flatMap((file) => {
      const lines = readFileSync(file, 'utf8').split('\n')
      return lines.flatMap((line: string, i: number) => {
        const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')
        return pattern.test(code) ? [`${relative(DOMAIN, file)}:${i + 1}: ${line.trim()}`] : []
      })
    })
    expect(hits).toEqual([])
  })
})
