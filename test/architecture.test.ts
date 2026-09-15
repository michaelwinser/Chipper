/**
 * Layering as a contract, not a convention (DESIGN.md §2, §9.5).
 *
 * A layering rule nobody checks is a preference. This is the check.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, dirname } from 'node:path'
import { describe, expect, it } from 'vitest'

const SRC = resolve(import.meta.dirname, '../src')

/** Who may import whom. `domain` importing anything else is the violation that matters. */
const ALLOWED: Record<string, readonly string[]> = {
  domain: [],
  store: ['domain'],
  app: ['domain', 'store'],
  ui: ['domain', 'app'],
  fixtures: ['domain'],
  shell: ['domain', 'store', 'app', 'ui', 'fixtures'],
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry: string) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(ts|svelte)$/.test(full) && !full.endsWith('.test.ts') ? [full] : []
  })
}

/** Files directly under src/ (main.ts, App.svelte) are the shell: they wire it together. */
function layerOf(file: string): string {
  const rel = relative(SRC, file)
  const segments = rel.split('/')
  return segments.length === 1 ? 'shell' : (segments[0] as string)
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const specifiers: string[] = []
  const re = /(?:from|import)\s+['"](\.[^'"]+)['"]/g
  let match: RegExpExecArray | null
  while ((match = re.exec(source)) !== null) specifiers.push(match[1] as string)
  return specifiers
}

describe('architecture', () => {
  const files = walk(SRC)

  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('no file imports across a layer boundary in the wrong direction', () => {
    const violations: string[] = []

    for (const file of files) {
      const from = layerOf(file)
      const allowed = ALLOWED[from]
      if (!allowed) {
        violations.push(`${relative(SRC, file)}: unknown layer "${from}"`)
        continue
      }
      for (const specifier of importsOf(file)) {
        const target = resolve(dirname(file), specifier)
        if (!target.startsWith(SRC)) continue
        const to = layerOf(target)
        if (to === from || to === 'shell') continue
        if (!allowed.includes(to)) {
          violations.push(`${relative(SRC, file)} (${from}) imports ${to}`)
        }
      }
    }

    expect(violations).toEqual([])
  })
})
