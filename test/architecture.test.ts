/**
 * Layering as a contract, not a convention (DESIGN.md §2, §9.5).
 *
 * A layering rule nobody checks is a preference. This is the check.
 */
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve, dirname } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

const SRC = resolve(import.meta.dirname, '../src')

/** Who may import whom. `domain` importing anything else is the violation that matters. */
/**
 * Packages each layer may import.
 *
 * The rules above govern our own files; this governs what comes in from outside, which
 * was invisible entirely — `importsOf` matched only relative specifiers. The live
 * consequence: `src/store/conformance.ts` imports `vitest`, and `store` is an allowed
 * target for `app`, `ui` and `shell`, so one ordinary import could have pulled the test
 * runner into the production bundle past the layer check, the purity check and the build.
 *
 * `svelte` is the framework, so every layer that renders may have it. `domain` may have
 * nothing at all — that is the claim `DESIGN.md` §2 makes about it.
 */
const PACKAGES: Record<string, readonly string[]> = {
  domain: [],
  store: [],
  app: ['svelte'],
  ui: ['svelte'],
  fixtures: [],
  shell: ['svelte'],
}

/** Test-only packages, which may not appear anywhere under `src/`. */
const TEST_ONLY = ['vitest', 'happy-dom', 'ajv', 'ajv-formats', '@types/node', 'node:']

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
function layerOf(file: string, root: string = SRC): string {
  const rel = relative(root, file)
  const segments = rel.split('/')
  return segments.length === 1 ? 'shell' : (segments[0] as string)
}

/**
 * Every relative specifier a file pulls in, static and dynamic.
 *
 * The dynamic half is not hypothetical tidiness: `import('./x')` was invisible to this
 * check, so the one import syntax a person reaches for precisely when they want to
 * dodge a dependency was the one syntax the dependency rule did not see.
 */
function specifiersOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const found: string[] = []
  const patterns = [
    /(?:from|import)\s+['"]([^'"]+)['"]/g, // import x from 'y'  ·  import 'y'
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // await import('y')
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // require('y')
  ]
  for (const re of patterns) {
    let match: RegExpExecArray | null
    while ((match = re.exec(source)) !== null) found.push(match[1] as string)
  }
  return found
}

/** Our own files. */
function importsOf(file: string): string[] {
  return specifiersOf(file).filter((s) => s.startsWith('.'))
}

/** Everything else — the packages, which were not being looked at at all. */
function packagesOf(file: string): string[] {
  return specifiersOf(file)
    .filter((s) => !s.startsWith('.'))
    .map((s) =>
      s.startsWith('node:')
        ? 'node:'
        : s
            .split('/')
            .slice(0, s.startsWith('@') ? 2 : 1)
            .join('/'),
    )
}

/**
 * Every import that crosses a layer in a direction the rules forbid.
 *
 * A function rather than a loop inside one test, so the canaries below can run the real
 * thing over a deliberate breach instead of re-deriving the verdict from its parts.
 */
function violations(files: string[], root: string = SRC): string[] {
  const found: string[] = []
  for (const file of files) {
    const from = layerOf(file, root)
    const allowed = ALLOWED[from]
    if (!allowed) {
      found.push(`${relative(root, file)}: unknown layer "${from}"`)
      continue
    }
    for (const specifier of importsOf(file)) {
      const target = resolve(dirname(file), specifier)
      // A relative path that climbs OUT of src/ is an offence, not something to skip.
      // Skipping it reopened the hole the conformance move was done to close, under a
      // different spelling: `import { sampleSequence } from '../../test/support/...'`
      // was examined by neither this check nor the package allowlist, so vitest and ajv
      // could re-enter the shipped bundle past every guard and the build.
      if (!target.startsWith(root + '/')) {
        found.push(
          `${relative(root, file)} (${layerOf(file, root)}) imports outside src: ${specifier}`,
        )
        continue
      }
      const to = layerOf(target, root)
      if (to === from) continue
      // The shell is NOT exempt as a target. It was, which inverted the rule at the top
      // of the stack: any layer could import `App.svelte` and the check waved it through.
      // Nothing may reach up into the shell — that is what makes it the shell.
      if (!allowed.includes(to)) {
        found.push(`${relative(root, file)} (${from}) imports ${to}`)
      }
    }
  }
  return found
}

describe('architecture', () => {
  const files = walk(SRC)
  /** Probes are written here, never into `src/`. Removed wholesale afterwards. */
  const sandbox = mkdtempSync(join(tmpdir(), 'chipper-arch-'))
  afterAll(() => rmSync(sandbox, { recursive: true, force: true }))

  it('finds source files to check', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  /**
   * The canary. Everything above is a regex over text, and a regex that matches nothing
   * reports a clean codebase — the exact failure this whole file exists to prevent. So
   * prove the parser sees real imports before trusting it to say there are no bad ones.
   */
  it('actually reads imports, including the dynamic form', () => {
    const seen = files.flatMap((f) => importsOf(f))
    expect(seen.length).toBeGreaterThan(20)
    expect(seen.some((s) => s.endsWith('.svelte'))).toBe(true)

    const probe = `
      import { a } from './static'
      const b = await import('./dynamic')
      const c = require('./required')
    `
    const tmp = join(sandbox, '__import-probe.ts')
    writeFileSync(tmp, probe)
    expect(importsOf(tmp).sort()).toEqual(['./dynamic', './required', './static'])
  })

  it('every layer a file can land in has a rule', () => {
    // Wrapped, not passed by reference: `map` supplies the index as a second argument,
    // which lands in `layerOf`'s optional `root`.
    const layers = new Set(files.map((f) => layerOf(f)))
    for (const layer of layers) expect(Object.keys(ALLOWED)).toContain(layer)
  })

  /**
   * The canary runs the REAL rule over a deliberate breach.
   *
   * The first version asserted `layerOf`, `ALLOWED` and `importsOf` separately — it
   * re-derived the verdict inline instead of invoking the loop, so the loop itself was
   * never exercised. Review demonstrated the cost: restoring the shell-as-target
   * exemption (the exact M7 regression this milestone removed) left all five tests
   * green. A canary that tests the ingredients is not a canary.
   *
   * The probes live in a temp directory rather than in `src/`. Writing them into the
   * tree meant a hard abort left `src/domain/__layering-probe.ts` behind — a file that
   * is itself a layering violation and does not compile — and raced `purity.test.ts`
   * walking the same directory in another worker.
   */
  it('catches a violation when there is one', () => {
    const probe = join(sandbox, 'domain', '__layering-probe.ts')
    mkdirSync(dirname(probe), { recursive: true })
    writeFileSync(probe, `import { createLocalStore } from '../store/local'\n`)

    const found = violations([probe], sandbox)
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('domain')
    expect(found[0]).toContain('store')
  })

  it('catches a file reaching up into the shell', () => {
    // The specific regression: the shell was exempt as a TARGET, so any layer could
    // import App.svelte and the rule waved it through.
    const probe = join(sandbox, 'domain', '__shell-probe.ts')
    mkdirSync(dirname(probe), { recursive: true })
    writeFileSync(probe, `import App from '../App.svelte'\n`)
    expect(violations([probe], sandbox)).toHaveLength(1)
  })

  it('catches a dynamic import too', () => {
    const probe = join(sandbox, 'ui', '__dynamic-probe.ts')
    mkdirSync(dirname(probe), { recursive: true })
    writeFileSync(probe, `export const f = () => import('../store/local')\n`)
    expect(violations([probe], sandbox)).toHaveLength(1)
  })

  it('catches a relative import that climbs out of src/', () => {
    // The specific escape: `test/support/conformance.ts` imports vitest, and reaching it
    // by relative path bypasses both the layer rule and the package allowlist.
    const probe = join(sandbox, 'ui', '__escape-probe.ts')
    mkdirSync(dirname(probe), { recursive: true })
    writeFileSync(probe, `import { x } from '../../test/support/conformance'\n`)
    const found = violations([probe], sandbox)
    expect(found).toHaveLength(1)
    expect(found[0]).toContain('outside src')
  })

  it('says nothing about a file that obeys the rule', () => {
    const probe = join(sandbox, 'ui', '__ok-probe.ts')
    mkdirSync(dirname(probe), { recursive: true })
    writeFileSync(probe, `import { buildBoard } from '../domain/select/board'\n`)
    expect(violations([probe], sandbox)).toEqual([])
  })

  it('no file imports across a layer boundary in the wrong direction', () => {
    expect(violations(files)).toEqual([])
  })

  it('no layer pulls in a package it is not allowed', () => {
    const offences: string[] = []
    for (const file of files) {
      const layer = layerOf(file)
      const allowed = PACKAGES[layer] ?? []
      for (const pkg of packagesOf(file)) {
        if (!allowed.includes(pkg))
          offences.push(`${relative(SRC, file)} (${layer}) imports ${pkg}`)
      }
    }
    expect(offences).toEqual([])
  })

  it('nothing under src/ imports a test-only package', () => {
    // `store/conformance.ts` is the live risk: it imports vitest, and `store` is a legal
    // target for app, ui and shell — so one import away from the shipped bundle.
    const offences = files.flatMap((file) =>
      packagesOf(file)
        .filter((pkg) => TEST_ONLY.includes(pkg))
        .map((pkg) => `${relative(SRC, file)} imports ${pkg}`),
    )
    expect(offences).toEqual([])
  })

  it('sees bare specifiers at all', () => {
    // The canary for the two above: they are absence assertions over a regex, and a
    // regex matching nothing reports a clean codebase.
    const probe = join(sandbox, '__package-probe.ts')
    writeFileSync(probe, `import { it } from 'vitest'\nimport { mount } from 'svelte'\n`)
    expect(packagesOf(probe).sort()).toEqual(['svelte', 'vitest'])
  })
})

/**
 * Every view-model module carries the compile-time shortfall guard.
 *
 * `_noGuiltFields` lived in `board.ts` alone for three milestones while `select/archive.ts`
 * and `select/sweep.ts` argued in prose that their models "cannot express" a tally — the
 * mechanism behind that claim was a private type in another file, so the claim was a
 * comment. `NoGuilt` is exported now, and this is what makes a new selector inherit it.
 *
 * Deliberately crude: it asks whether the module asserts the guard at all, not which types
 * it covers. `Guilt<T>` recurses, so one assertion over a module's root model reaches
 * everything that model contains — working out which root reaches which type is exactly
 * the job the compiler does, and reimplementing it here in a regex is how a guard grows a
 * hole shaped like its own cleverness.
 */
describe('the shortfall guard reaches every view-model module', () => {
  const modelFiles = [join(SRC, 'domain', 'board.ts'), ...walk(join(SRC, 'domain', 'select'))]

  it('finds the view-model modules', () => {
    expect(modelFiles.length).toBeGreaterThan(4)
  })

  it.each(modelFiles.map((f) => [relative(SRC, f), f] as const))(
    '%s asserts NoGuilt over what it exports',
    (_name, file) => {
      const source = readFileSync(file, 'utf8')
      const exportsAModel = /export type \w*(Model|Entry|Removal|Target)\b/.test(source)
      if (!exportsAModel) return
      expect({ file: _name, guarded: /NoGuilt</.test(source) }).toEqual({
        file: _name,
        guarded: true,
      })
    },
  )
})
