/**
 * The store contract, as an executable suite (DESIGN.md §5.4).
 *
 * Every adapter runs this against itself. When HttpStore is written, it is finished when
 * this is green — that is what makes the contract real rather than a paragraph in a
 * design document.
 *
 * It lives under `test/` and not in `src/store/` because it imports `vitest`. Inside
 * `src/` it was one ordinary import away from the shipped bundle: `store` is a legal
 * target for `app`, `ui` and `shell`, and the architecture guard could not see package
 * imports at all, so nothing would have objected. The guard sees them now, and this file
 * moved rather than being exempted — an exemption is a hole with a comment on it.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Ajv2020 from 'ajv/dist/2020'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'
import type { Mutation } from '../../src/domain/mutations'
import { MUTATION_KINDS } from '../../src/domain/mutations'
import { checkInvariants } from '../../src/domain/invariants'
import { emptyState, type State } from '../../src/domain/state'
import type { Store } from '../../src/store/port'

/**
 * What an adapter must provide to be tested: a way to make a store, and a way to make
 * another one over the same backing so durability can be checked.
 */
export type StoreHarness = {
  /**
   * A store over the harness's backing. Calling twice models reopening the app, so it
   * must return a NEW instance — an adapter that caches everything and never re-reads
   * would otherwise pass the durability case without being durable at all.
   */
  create(): Store
  /** Throw away the backing entirely. */
  reset(): void
}

const AT = '2026-09-14T10:00:00.000Z'

/** A sequence touching every mutation a store must survive. */
export function sampleSequence(): Mutation[] {
  return [
    { kind: 'createSwimlane', id: 'sw1', name: 'Work', color: '#5A7391', at: AT },
    { kind: 'createSwimlane', id: 'sw2', name: 'Family', color: '#A0684E', at: AT },
    { kind: 'setSwimlaneColor', id: 'sw2', color: '#A0684E', at: AT },
    { kind: 'reorderSwimlanes', order: ['sw2', 'sw1'], at: AT },
    { kind: 'createGoal', id: 'g1', swimlaneId: 'sw1', title: 'Catch up on invoicing', at: AT },
    {
      kind: 'createPlan',
      id: 'p1',
      parent: { type: 'goal', id: 'g1' },
      title: 'One month a week',
      at: AT,
    },
    {
      kind: 'createTask',
      id: 't1',
      parent: { type: 'plan', id: 'p1' },
      title: 'Invoice March',
      size: 'M',
      at: AT,
    },
    {
      kind: 'createTask',
      id: 't2',
      parent: { type: 'goal', id: 'g1' },
      title: 'Find receipts',
      size: 'S',
      at: AT,
    },
    {
      kind: 'createTask',
      id: 't3',
      parent: { type: 'swimlane', id: 'sw2' },
      title: 'Book flights',
      size: null,
      at: AT,
    },
    {
      kind: 'renameEntity',
      ref: { type: 'goal', id: 'g1' },
      title: 'Catch up on invoicing properly',
      at: AT,
    },
    { kind: 'setNotes', ref: { type: 'task', id: 't2' }, notes: 'shoebox in the office', at: AT },
    { kind: 'setTaskSize', id: 't3', size: 'M', at: AT },
    { kind: 'setDeadline', ref: { type: 'goal', id: 'g1' }, deadline: '2026-11-30', at: AT },
    {
      kind: 'capture',
      id: 'pi1',
      text: '#house replace the gutters',
      destination: { kind: 'pile' },
      at: AT,
    },
    {
      kind: 'capture',
      id: 't4',
      text: 'renew the passport',
      destination: { kind: 'swimlane', swimlaneId: 'sw2', as: 'task' },
      at: AT,
    },
    {
      kind: 'capture',
      id: 'g2',
      text: 'get the house ready to sell',
      destination: { kind: 'swimlane', swimlaneId: 'sw2', as: 'goal' },
      at: AT,
    },
    {
      kind: 'promotePileItem',
      itemId: 'pi1',
      to: { kind: 'task', id: 't5', parent: { type: 'swimlane', id: 'sw2' }, size: 'M' },
      at: AT,
    },
    {
      kind: 'capture',
      id: 'pi2',
      text: 'look into a new dentist',
      destination: { kind: 'pile' },
      at: AT,
    },
    { kind: 'editPileItem', id: 'pi2', text: '#health look into a new dentist', at: AT },
    { kind: 'deletePileItem', id: 'pi2', at: AT },
    { kind: 'sendToPile', ref: { type: 'task', id: 't5' }, pileId: 'pi3', at: AT },
    { kind: 'addPriority', ref: { type: 'goal', id: 'g1' }, at: AT },
    { kind: 'addPriority', ref: { type: 'task', id: 't2' }, at: AT },
    { kind: 'removePriority', ref: { type: 'task', id: 't2' }, at: AT },
    { kind: 'setPriorities', refs: [{ type: 'goal', id: 'g1' }], at: AT },
    { kind: 'changeLevel', ref: { type: 'task', id: 't2' }, to: 'plan', newId: 'p2', at: AT },
    { kind: 'setTaskDone', id: 't1', done: true, at: AT },
    { kind: 'deleteTask', id: 't3', at: AT },
    { kind: 'deletePlan', id: 'p2', disposition: 'promote-children', at: AT },
    { kind: 'archiveGoal', id: 'g2', at: AT },
    { kind: 'restoreGoal', id: 'g2', at: AT },
    { kind: 'deleteGoal', id: 'g2', at: AT },
    {
      kind: 'deleteSwimlane',
      id: 'sw2',
      disposition: { kind: 'archive', pileIds: { t4: 'pi4' } },
      at: AT,
    },
    { kind: 'replaceAll', state: emptyState(), at: AT },
  ]
}

/**
 * Two adapters must agree, not merely each be self-consistent. The suite below can only
 * check one adapter at a time; this is the case that compares them, and it is the one
 * `DESIGN.md` §5.4 actually meant. Without it, `LocalStore` could round-trip through JSON
 * and lose `doneAt: null` while every other case stayed green.
 */
export function expectAdaptersAgree(a: Store, b: Store): Promise<void> {
  return (async () => {
    for (const mutation of sampleSequence().slice(0, -1)) {
      await a.apply(mutation)
      await b.apply(mutation)
    }
    expect(await a.read()).toEqual(await b.read())
  })()
}

/**
 * Validates a state against `schema/state.schema.json`.
 *
 * Built here, because the suite now lives under `test/` where importing `ajv` is legal.
 * It could not before: the suite sat in `src/store/`, so §5.4's "checked against the JSON
 * Schema" was in fact `toEqual(emptyState())` — a tautology against the very constructor
 * the store uses. An adapter that round-tripped through a serializer dropping
 * `doneAt: null`, or coercing `order` to a string, passed every case.
 */
function schemaValidator(): (state: unknown) => string[] {
  const ajv = new Ajv2020({ allErrors: true, strict: true })
  addFormats(ajv)
  const schema = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../schema/state.schema.json'), 'utf8'),
  ) as object
  const validate = ajv.compile(schema)
  return (state: unknown) => {
    if (validate(state)) return []
    return (validate.errors ?? []).map((e) => `${e.instancePath || '/'} ${e.message ?? ''}`)
  }
}

/**
 * The contract every adapter must pass.
 *
 * `reference` is the adapter to agree WITH — the cross-adapter case is part of the suite
 * rather than something each caller remembers to run. §5.4 says "when HttpStore is
 * written, it is finished when this suite is green"; while agreement lived outside the
 * suite, that sentence was false for the one case that catches serialization loss.
 */
export function describeStoreConformance(
  name: string,
  makeHarness: () => StoreHarness,
  reference: () => Store,
): void {
  describe(`store conformance: ${name}`, () => {
    const validate = schemaValidator()

    it('reads an empty state before anything has been written', async () => {
      const harness = makeHarness()
      harness.reset()
      const state = await harness.create().read()
      expect(state).toEqual(emptyState())
      // And it is a valid document, not merely an empty-looking object.
      expect(validate(state)).toEqual([])
    })

    it('exercises every mutation in the vocabulary', async () => {
      const harness = makeHarness()
      harness.reset()
      const store = harness.create()
      const covered = new Set(sampleSequence().map((m) => m.kind))
      // A mutation nobody exercises is a mutation nobody tested.
      expect([...MUTATION_KINDS].filter((k) => !covered.has(k))).toEqual([])
      for (const mutation of sampleSequence()) await store.apply(mutation)
    })

    it('makes each mutation observable through read()', async () => {
      const harness = makeHarness()
      harness.reset()
      const store = harness.create()
      await store.apply({ kind: 'createSwimlane', id: 'sw1', name: 'Work', color: '#000', at: AT })
      expect((await store.read()).swimlanes['sw1']?.name).toBe('Work')
      await store.apply({
        kind: 'createGoal',
        id: 'g1',
        swimlaneId: 'sw1',
        title: 'A goal',
        at: AT,
      })
      expect((await store.read()).goals['g1']?.title).toBe('A goal')
    })

    it('survives being reconstructed over the same backing', async () => {
      const harness = makeHarness()
      harness.reset()
      const first = harness.create()
      // Reopening must actually reopen. Without this the case is satisfiable by a
      // singleton, which is exactly what the memory harness used to return.
      expect(harness.create()).not.toBe(first)
      await first.apply({ kind: 'createSwimlane', id: 'sw1', name: 'Work', color: '#000', at: AT })
      await first.apply({
        kind: 'createGoal',
        id: 'g1',
        swimlaneId: 'sw1',
        title: 'Survives',
        at: AT,
      })

      const reopened = harness.create()
      const state = await reopened.read()
      expect(state.goals['g1']?.title).toBe('Survives')
    })

    it('notifies subscribers exactly once per applied mutation', async () => {
      const harness = makeHarness()
      harness.reset()
      const store = harness.create()
      const seen: State[] = []
      const off = store.subscribe((s) => seen.push(s))

      await store.apply({ kind: 'createSwimlane', id: 'sw1', name: 'Work', color: '#000', at: AT })
      await store.apply({
        kind: 'createGoal',
        id: 'g1',
        swimlaneId: 'sw1',
        title: 'A goal',
        at: AT,
      })
      expect(seen).toHaveLength(2)

      off()
      await store.apply({ kind: 'createGoal', id: 'g2', swimlaneId: 'sw1', title: 'Quiet', at: AT })
      expect(seen).toHaveLength(2)
    })

    it('rejects a broken mutation without corrupting what is already there', async () => {
      const harness = makeHarness()
      harness.reset()
      const store = harness.create()
      await store.apply({ kind: 'createSwimlane', id: 'sw1', name: 'Work', color: '#000', at: AT })
      const before = await store.read()

      await expect(
        store.apply({ kind: 'createGoal', id: 'g1', swimlaneId: 'nope', title: 'Orphan', at: AT }),
      ).rejects.toThrow()

      expect(await store.read()).toEqual(before)
    })

    it('is deterministic — the same sequence twice gives the same state', async () => {
      const harness = makeHarness()
      harness.reset()
      const a = harness.create()
      harness.reset()
      const b = harness.create()
      const sequence = sampleSequence().slice(0, -1) // keep the data, skip replaceAll
      for (const mutation of sequence) await a.apply(mutation)
      for (const mutation of sequence) await b.apply(mutation)
      expect(await a.read()).toEqual(await b.read())
    })

    it('produces a state that satisfies the schema after real work, not merely on open', async () => {
      const harness = makeHarness()
      harness.reset()
      const store = harness.create()
      for (const mutation of sampleSequence().slice(0, -1)) await store.apply(mutation)
      const state = await store.read()
      expect(validate(state)).toEqual([])
      expect(checkInvariants(state)).toEqual([])
      expect(state.schemaVersion).toBeGreaterThan(0)
    })

    it('agrees with another adapter over the same sequence', async () => {
      // Required, not optional. It was `reference?` with an early return, so an adapter
      // author who called the suite with two arguments got a green test named for the one
      // case that catches serialization loss, having compared nothing.
      const harness = makeHarness()
      harness.reset()
      await expectAdaptersAgree(harness.create(), reference())
    })

    it('refuses a document that breaks an invariant, rather than storing it', async () => {
      // `replaceAll` is the only mutation that takes a whole document, which makes it the
      // one that most needs this. The guard is `parseEnvelope` on the import path — but
      // the mutation vocabulary is also a future server's API, and this states what an
      // adapter owes regardless of who calls it.
      const harness = makeHarness()
      harness.reset()
      const store = harness.create()
      const broken = {
        ...emptyState(),
        priorities: [{ type: 'goal' as const, id: 'never-existed' }],
      }
      expect(checkInvariants(broken).length).toBeGreaterThan(0)

      // Stored WHOLE or refused WHOLE — the point is that neither answer is a quiet
      // rewrite. Asserting only that the result is schema-valid proved nothing: a
      // dangling ref is an invariant violation, not a schema one, so the broken document
      // satisfies the schema and both branches passed.
      let refused = false
      try {
        await store.apply({ kind: 'replaceAll', state: broken, at: AT })
      } catch {
        refused = true
      }
      const after = await store.read()
      expect(validate(after)).toEqual([])
      if (refused) {
        expect(after).toEqual(emptyState())
      } else {
        // Stored, byte for byte. An adapter that dropped the dangling ref on the way in
        // would be deciding what the document means, which adapters do not do.
        expect(after.priorities).toEqual(broken.priorities)
      }
    })
  })
}
