/**
 * The app must work offline and from file:// (PRD §7). A CDN reference anywhere in
 * the shipped source breaks that on first paint — which is exactly how the fonts
 * were loaded before they were self-hosted, and exactly how they could come back.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = resolve(import.meta.dirname, '..')
const SRC = join(ROOT, 'src')

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry: string) => {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) return walk(full)
    return /\.(ts|svelte|css|html)$/.test(full) ? [full] : []
  })
}

/** Comments may reference a URL; shipped code may not. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('offline', () => {
  const files = [join(ROOT, 'index.html'), ...walk(SRC)]

  it('has files to check', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('references no remote origin in shipped code', () => {
    const hits: string[] = []
    for (const file of files) {
      const lines = stripComments(readFileSync(file, 'utf8')).split('\n')
      lines.forEach((line: string, i: number) => {
        if (/https?:\/\//.test(line)) hits.push(`${relative(ROOT, file)}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(hits).toEqual([])
  })

  it('bundles the fonts it uses', () => {
    const css = readFileSync(join(SRC, 'ui/tokens.css'), 'utf8')
    const families = [...css.matchAll(/font-family:\s*'([^']+)'/g)].map((m) => m[1])
    expect(families).toContain('Newsreader')
    expect(families).toContain('IBM Plex Sans')
    const fonts = readdirSync(join(SRC, 'ui/fonts')).filter((f) => f.endsWith('.woff2'))
    expect(fonts).toHaveLength(2)
  })
})
