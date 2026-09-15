/**
 * The schema is the source of truth for the data (DESIGN.md §10.1).
 *
 * Types are hand-written rather than generated, so drift is caught here instead: with
 * `additionalProperties: false` and full `required` lists, validating real generated
 * states catches a field the schema does not know about AND a field the types dropped.
 */
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'
import { emptyState } from '../src/domain/state'
import { toEnvelope } from '../src/domain/transfer'
import { generateState } from './support/generate'

const SCHEMA_DIR = resolve(import.meta.dirname, '../schema')
const read = (name: string) => JSON.parse(readFileSync(join(SCHEMA_DIR, name), 'utf8'))

function validator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  ajv.addSchema(read('state.schema.json'))
  return {
    state: ajv.getSchema('https://chipper.local/schema/state.schema.json')!,
    envelope: ajv.compile(read('export.schema.json')),
  }
}

describe('schema', () => {
  const { state: validateState, envelope: validateEnvelope } = validator()

  it('accepts an empty state', () => {
    expect(validateState(emptyState())).toBe(true)
  })

  it('accepts every generated state, so types and schema cannot drift apart', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const generated = generateState(seed)
      const ok = validateState(generated)
      if (!ok) {
        throw new Error(`seed ${seed}: ${JSON.stringify(validateState.errors, null, 2)}`)
      }
      expect(ok).toBe(true)
    }
  })

  it('accepts a real export envelope', () => {
    const envelope = JSON.parse(toEnvelope(generateState(7), '2026-09-14T10:00:00.000Z'))
    const ok = validateEnvelope(envelope)
    if (!ok) throw new Error(JSON.stringify(validateEnvelope.errors, null, 2))
    expect(ok).toBe(true)
  })

  it('rejects a state carrying a field nothing knows about', () => {
    expect(validateState({ ...emptyState(), surprise: 1 })).toBe(false)
  })

  it('rejects an envelope from another app', () => {
    const envelope = JSON.parse(toEnvelope(emptyState(), '2026-09-14T10:00:00.000Z'))
    expect(validateEnvelope({ ...envelope, app: 'something-else' })).toBe(false)
  })
})
