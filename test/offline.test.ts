/**
 * The app must work offline and from file:// (PRD §7). A CDN reference anywhere in
 * the shipped source breaks that on first paint — which is exactly how the fonts
 * were loaded before they were self-hosted, and exactly how they could come back.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { join, relative, resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

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

/**
 * The shipped build, not the config (M8).
 *
 * `base: './'` is the single line the `file://` promise rests on, and nothing tested
 * it. Asserting the config value would be a tautology — it would pass by restating
 * itself — so this builds the app and reads what Vite actually emitted.
 */
describe('the built output opens from a file:// path', () => {
  const dist = join(ROOT, 'dist')

  beforeAll(() => {
    execFileSync('npx', ['vite', 'build'], { cwd: ROOT, stdio: 'pipe' })
  }, 120_000)

  const index = () => readFileSync(join(dist, 'index.html'), 'utf8')

  it('emits an index.html that loads something', () => {
    expect(index()).toMatch(/<script[^>]+src=/)
  })

  it('references every asset relatively — a leading slash is a blank page on file://', () => {
    const refs = [...index().matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!)
    expect(refs.length).toBeGreaterThan(1)
    for (const ref of refs) {
      expect(ref.startsWith('/')).toBe(false)
      expect(ref).not.toMatch(/^https?:/)
    }
    // And they are relative in the explicit form, not bare names that resolve by luck.
    expect(refs.some((r) => r.startsWith('./'))).toBe(true)
  })

  it('resolves each of those references to a file that exists', () => {
    const refs = [...index().matchAll(/(?:src|href)="([^"]+)"/g)].map((m) => m[1]!)
    for (const ref of refs) {
      expect(existsSync(join(dist, ref.replace(/^\.\//, '')))).toBe(true)
    }
  })

  it('keeps the fonts relative too, inside the emitted CSS', () => {
    const css = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.css'))
    expect(css.length).toBeGreaterThan(0)
    for (const file of css) {
      const urls = [...readFileSync(join(dist, 'assets', file), 'utf8').matchAll(/url\(([^)]+)\)/g)]
      expect(urls.length).toBeGreaterThan(0)
      for (const [, raw] of urls) {
        const url = raw!.replace(/['"]/g, '')
        expect(url.startsWith('/')).toBe(false)
        expect(url).not.toMatch(/^https?:/)
      }
    }
  })
})
