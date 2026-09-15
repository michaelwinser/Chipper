/**
 * Export and import (DESIGN.md §10.2, UC-6010/6020/6030).
 *
 * The envelope is a public surface the moment a file leaves the app, so it is
 * versioned, pretty-printed, and written with a stable key order — a diff between two
 * exports should be legible, which makes it useful for debugging and for keeping your
 * own data in git if you want to.
 *
 * Import refuses rather than guesses. A file from a newer version of the app is a
 * data-loss trap, not something to partially apply.
 */
import { checkInvariants } from './invariants'
import { SCHEMA_VERSION, emptyState, type State } from './state'
import { migrate, type RawEnvelope } from './migrations'

export type Envelope = {
  app: 'chipper'
  schemaVersion: number
  exportedAt: string
  state: State
}

export type ParseResult = { ok: true; state: State } | { ok: false; error: string }

/** Recursively sorts object keys so two exports of the same data diff cleanly. */
function stable(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stable)
  if (value === null || typeof value !== 'object') return value
  const sorted: Record<string, unknown> = {}
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    sorted[key] = stable((value as Record<string, unknown>)[key])
  }
  return sorted
}

export function toEnvelope(state: State, exportedAt: string): string {
  const envelope: Envelope = {
    app: 'chipper',
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    state,
  }
  return JSON.stringify(stable(envelope), null, 2) + '\n'
}

export function parseEnvelope(raw: string): ParseResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'This file is not valid JSON.' }
  }

  if (parsed === null || typeof parsed !== 'object') {
    return { ok: false, error: 'This file does not contain a Chipper export.' }
  }
  const envelope = parsed as Partial<RawEnvelope>

  if (envelope.app !== 'chipper') {
    return { ok: false, error: 'This file was not exported by Chipper.' }
  }
  if (typeof envelope.schemaVersion !== 'number') {
    return { ok: false, error: 'This export has no version, so it cannot be read safely.' }
  }
  if (envelope.schemaVersion > SCHEMA_VERSION) {
    return {
      ok: false,
      error:
        `This file was written by a newer version of Chipper (format ${envelope.schemaVersion}; ` +
        `this app reads up to ${SCHEMA_VERSION}). Update the app rather than importing it here — ` +
        `opening it with an older version would quietly drop whatever it does not understand.`,
    }
  }

  const migrated = migrate(envelope as RawEnvelope)
  if (!migrated.ok) return migrated

  const problems = checkInvariants(migrated.state)
  if (problems.length > 0) {
    const first = problems.slice(0, 3).map((p) => p.detail)
    const more = problems.length > 3 ? ` (and ${problems.length - 3} more)` : ''
    return { ok: false, error: `This export is inconsistent: ${first.join('; ')}${more}.` }
  }

  return { ok: true, state: migrated.state }
}

export { emptyState }
