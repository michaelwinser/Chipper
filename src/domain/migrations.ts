/**
 * The migration chain (DESIGN.md §4).
 *
 * Present from the first commit because retrofitting versioning onto data you care
 * about is miserable. Every migration ships with a test carrying a real fixture of
 * the version before it.
 *
 * Migrations run in order. Each takes the shape the previous one produced and returns
 * the next. They must be pure and must not depend on anything outside their input.
 */
import { SCHEMA_VERSION, type State } from './state'

/** An envelope as it arrives: version known, contents not yet trusted. */
export type RawEnvelope = {
  app: string
  schemaVersion: number
  exportedAt?: string
  state: unknown
}

export type MigrateResult = { ok: true; state: State } | { ok: false; error: string }

export type Migration = {
  /** Applied to an envelope at this version, producing `from + 1`. */
  from: number
  describe: string
  up: (state: unknown) => unknown
}

/**
 * Nothing to migrate yet — version 1 is the first shape. The chain exists so that the
 * second one is a five-line addition rather than a design problem.
 */
export const MIGRATIONS: Migration[] = []

/** Shape check for the current version. Deliberately structural, not exhaustive: the
 *  invariant pass in transfer.ts does the semantic work. */
function looksLikeState(value: unknown): value is State {
  if (value === null || typeof value !== 'object') return false
  const s = value as Partial<State>
  const maps: (keyof State)[] = ['swimlanes', 'goals', 'plans', 'tasks', 'pile']
  for (const key of maps) {
    const map = s[key]
    if (map === null || typeof map !== 'object' || Array.isArray(map)) return false
  }
  return Array.isArray(s.priorities) && typeof s.schemaVersion === 'number'
}

export function migrate(envelope: RawEnvelope): MigrateResult {
  return migrateWith(envelope, MIGRATIONS, SCHEMA_VERSION)
}

/**
 * The chain, with its steps passed in. Split out so the machinery can be tested with a
 * real sequence of migrations before there is one — the first genuine migration should
 * not also be the first test of whether migrating works at all.
 */
export function migrateWith(
  envelope: RawEnvelope,
  migrations: Migration[],
  target: number,
): MigrateResult {
  let version = envelope.schemaVersion
  let state = envelope.state

  while (version < target) {
    const step = migrations.find((m) => m.from === version)
    if (!step) {
      return {
        ok: false,
        error: `No way to upgrade this export from format ${version} to ${target}.`,
      }
    }
    state = step.up(state)
    version += 1
  }

  if (!looksLikeState(state)) {
    return { ok: false, error: 'This export is missing parts of its structure.' }
  }
  return { ok: true, state: { ...state, schemaVersion: SCHEMA_VERSION } }
}
