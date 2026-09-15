/**
 * The generator is a test tool, so it gets tested (M8).
 *
 * Its first version silently produced near-empty states, which left four other suites
 * asserting things about data that was never there. A generator nobody checks is a
 * generator that can quietly stop generating.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GENERATED_KINDS, census, generateTrace } from './support/generate'
import { MUTATION_KINDS } from '../src/domain/mutations'

describe('the generator covers the vocabulary', () => {
  it('can emit every mutation a user can cause', () => {
    // replaceAll is the one exception: it discards the history being built.
    const expected = MUTATION_KINDS.filter((k) => k !== 'replaceAll').sort()
    expect([...GENERATED_KINDS].sort()).toEqual([...expected])
  })

  it('actually emits them, not merely lists them', () => {
    const seen = new Set<string>()
    for (let seed = 1; seed <= 40; seed++) {
      for (const m of generateTrace(seed).trace.applied) seen.add(m.kind)
    }
    expect([...GENERATED_KINDS].filter((k) => !seen.has(k))).toEqual([])
  })
})

describe('generated states are worth asserting on', () => {
  const totals = (): Record<string, number> => {
    const sum: Record<string, number> = {}
    for (let seed = 1; seed <= 40; seed++) {
      for (const [k, v] of Object.entries(census(generateTrace(seed).state))) {
        sum[k] = (sum[k] ?? 0) + v
      }
    }
    return sum
  }

  it('reach every part of the document, across the seeds the suites use', () => {
    const sum = totals()
    // Each of these was zero for every seed before M8, which is what hollowed out the
    // schema, round-trip and invariant suites.
    for (const key of ['pile', 'tags', 'priorities', 'archived', 'notes', 'deadlines', 'done']) {
      expect({ [key]: sum[key] }).toEqual({ [key]: expect.any(Number) })
      expect(sum[key]).toBeGreaterThan(0)
    }
  })

  /**
   * Coverage keyed to the schema, not to a list someone wrote down.
   *
   * `DESIGN.md` §10.1 claims generated states exercise every `$defs`, and the assertion
   * above checks seven hand-picked names against eleven definitions — nothing asserted
   * that a generated state ever contained a plan, or a task with a size. So the drift
   * guard could quietly stop guarding half the schema. Reading the definitions out of the
   * file makes a new `$def` with no coverage a failure here rather than a silence.
   */
  it('exercises every definition the schema declares', () => {
    const schema = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../schema/state.schema.json'), 'utf8'),
    ) as { $defs: Record<string, unknown> }
    const defs = Object.keys(schema.$defs)
    expect(defs.length).toBeGreaterThan(5)

    const sum = totals()
    const uncovered = defs.filter((d) => !(d in sum) || (sum[d] ?? 0) === 0)
    expect(uncovered).toEqual([])
  })

  it('is not mostly refusals — a generator that steers into walls tests nothing', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const { trace } = generateTrace(seed)
      expect(trace.applied.length).toBeGreaterThan(trace.refused)
    }
  })

  it('produces a populated state for every seed', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const c = census(generateTrace(seed).state)
      expect(c.swimlanes).toBeGreaterThan(0)
      expect(c.tasks).toBeGreaterThan(3)
    }
  })

  it('is deterministic — the same seed gives the same state', () => {
    expect(generateTrace(7).state).toEqual(generateTrace(7).state)
  })
})
