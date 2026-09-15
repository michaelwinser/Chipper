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
  // `Date()` called as a function, no `new`. One character from a banned spelling and
  // missed by all three of the Date rules around it — the shape of hole this file exists
  // to prevent, found in its own list by the M8 review.
  { pattern: /(?<![.\w])Date\s*\(/, why: 'reads the clock — pass the time in' },
  // The near neighbours of `new Date`. The original list banned the two obvious spellings
  // and left the rest reachable, which is the shape of hole this file exists to prevent.
  { pattern: /\bDate\.(parse|UTC)\b/, why: 'date arithmetic — use domain/days.ts' },
  { pattern: /\bperformance\.now\b/, why: 'reads a clock' },
  { pattern: /\bprocess\.hrtime\b/, why: 'reads a clock' },
  {
    pattern: /\bsetTimeout\b|\bsetInterval\b|\bqueueMicrotask\b/,
    why: 'scheduling in a layer that must be synchronous and total',
  },
  { pattern: /\bMath\.random\b/, why: 'non-deterministic — pass the value in' },
  { pattern: /\bcrypto\./, why: 'generates ids — pass ids in' },
  { pattern: /\bwindow\b/, why: 'DOM access in the domain layer' },
  { pattern: /\bdocument\b/, why: 'DOM access in the domain layer' },
  { pattern: /\bglobalThis\b/, why: 'ambient state in the domain layer' },
  { pattern: /\bnavigator\b|\blocation\b/, why: 'ambient host state in the domain layer' },
  { pattern: /\bprocess\.env\b|\bimport\.meta\.env\b/, why: 'ambient configuration' },
  { pattern: /\blocalStorage\b/, why: 'storage access belongs in store/' },
  { pattern: /\bfetch\s*\(/, why: 'I/O in the domain layer' },
  {
    // Every `toLocale*` at once. The list named two of them and left
    // `toLocaleTimeString` and the `toLocale{Upper,Lower}Case` pair reachable — the last
    // two being locale-dependent in exactly the way `localeCompare` is banned for
    // (Turkish dotless i), which is the rule two lines down.
    pattern: /\btoLocale[A-Z]\w*\s*\(/,
    why: 'locale-dependent output — the host locale is a hidden input',
  },
  {
    // The same hidden input as toLocaleString, under a different name: it reads the host
    // locale and the ICU build, so the same state sorts differently on another machine.
    pattern: /\.localeCompare\s*\(/,
    why: 'locale-dependent ordering — use compareText from primitives',
  },
  { pattern: /\bIntl\./, why: 'locale-dependent behaviour' },
  { pattern: /\basync\s|\bawait\s/, why: 'the domain must stay synchronous and total' },
]

/**
 * Comments may name a forbidden thing while explaining why it is forbidden. Blank them
 * out while keeping the line count, so reported line numbers still point at real code.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, (block) => block.replace(/[^\n]/g, ' '))
    .replace(/\/\/[^\n]*/g, '')
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry: string) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return full.endsWith('.ts') && !full.endsWith('.test.ts') ? [full] : []
  })
}

/** One sample per rule, keyed by the pattern's own source so the pairing cannot drift. */
const SAMPLES: Record<string, string> = Object.fromEntries(
  (
    [
      [/\bDate\.now\b/, 'const t = Date.now()'],
      [/\bnew Date\b/, 'const d = new Date()'],
      [/(?<![.\w])Date\s*\(/, 'const s = Date()'],
      [/\bDate\.(parse|UTC)\b/, 'const d = Date.parse(x)'],
      [/\bperformance\.now\b/, 'const t = performance.now()'],
      [/\bprocess\.hrtime\b/, 'const t = process.hrtime()'],
      [/\bsetTimeout\b|\bsetInterval\b|\bqueueMicrotask\b/, 'setTimeout(f, 0)'],
      [/\bMath\.random\b/, 'const r = Math.random()'],
      [/\bcrypto\./, 'const id = crypto.randomUUID()'],
      [/\bwindow\b/, 'window.alert(1)'],
      [/\bdocument\b/, 'document.body'],
      [/\bglobalThis\b/, 'globalThis.x'],
      [/\bnavigator\b|\blocation\b/, 'navigator.language'],
      [/\bprocess\.env\b|\bimport\.meta\.env\b/, 'process.env.HOME'],
      [/\blocalStorage\b/, 'localStorage.getItem(k)'],
      [/\bfetch\s*\(/, 'await fetch("/x")'],
      [/\btoLocale[A-Z]\w*\s*\(/, 'name.toLocaleUpperCase()'],
      [/\.localeCompare\s*\(/, 'a.localeCompare(b)'],
      [/\bIntl\./, 'new Intl.Collator()'],
      [/\basync\s|\bawait\s/, 'async function f() {}'],
    ] as [RegExp, string][]
  ).map(([re, sample]) => [re.source, sample]),
)

describe('domain purity', () => {
  const files = walk(DOMAIN)

  it('has domain files to check', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  /**
   * The canary. Everything here is a regex over text, and a regex that matches nothing
   * reports a pure codebase — so prove each pattern still recognises the thing it bans
   * before trusting the sweep that says the domain is clean.
   */
  /**
   * Each rule against its OWN sample, keyed by the pattern's source.
   *
   * The first version asked whether SOME rule matched each sample, which lets one rule
   * cover for another's breakage: widen `Date.now` to `/\bDate\b/` and losing
   * `Date.parse` entirely goes unnoticed. Keying by source also means adding a rule
   * without a sample fails the count assertion rather than passing silently.
   */
  it.each(FORBIDDEN)('the rule $pattern still recognises what it forbids', ({ pattern }) => {
    const sample = SAMPLES[pattern.source]
    expect({ pattern: pattern.source, sample }).toEqual({
      pattern: pattern.source,
      sample: expect.any(String),
    })
    expect(pattern.test(sample!)).toBe(true)
  })

  it('has a sample for every rule and no orphans', () => {
    expect(Object.keys(SAMPLES).sort()).toEqual(FORBIDDEN.map((f) => f.pattern.source).sort())
  })

  it('does not fire on ordinary domain code', () => {
    // The other half: a rule that matches everything is as useless as one that matches
    // nothing, and would make the sweep below unfalsifiable in the opposite direction.
    const innocent = [
      'const updated = { ...task, updatedAt: m.at }',
      'export function compareText(a: string, b: string) { return a < b ? -1 : 1 }',
      'const sorted = [...items].sort(byCreation)',
      'return state.goals[id]?.archived === true',
    ]
    for (const line of innocent) {
      const firing = FORBIDDEN.filter(({ pattern }) => pattern.test(line)).map(
        (f) => f.pattern.source,
      )
      expect({ line, firing }).toEqual({ line, firing: [] })
    }
  })

  it('reads real source, not an empty list', () => {
    const total = files.reduce((n, f) => n + readFileSync(f, 'utf8').length, 0)
    expect(total).toBeGreaterThan(10_000)
    // And the comment stripper keeps line numbers honest.
    const sample = '/* a\n b */\ncode()\n// tail'
    expect(stripComments(sample).split('\n')).toHaveLength(4)
  })

  it.each(FORBIDDEN)('contains no $pattern — $why', ({ pattern }) => {
    const hits = files.flatMap((file) => {
      const lines = stripComments(readFileSync(file, 'utf8')).split('\n')
      return lines.flatMap((line: string, i: number) =>
        pattern.test(line) ? [`${relative(DOMAIN, file)}:${i + 1}: ${line.trim()}`] : [],
      )
    })
    expect(hits).toEqual([])
  })
})
