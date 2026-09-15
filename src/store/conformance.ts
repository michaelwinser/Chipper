/**
 * The store contract, as an executable suite (DESIGN.md §5.4).
 *
 * Every adapter imports this and runs it against itself. When HttpStore is written,
 * it is finished when this is green — that is what makes the contract real rather
 * than a paragraph in a design document.
 */
import { describe, expect, it } from 'vitest'
import type { Mutation } from '../domain/mutations'
import { MUTATION_KINDS } from '../domain/mutations'
import { emptyState, type State } from '../domain/state'
import type { Store } from './port'

/**
 * What an adapter must provide to be tested: a way to make a store, and a way to make
 * another one over the same backing so durability can be checked.
 */
export type StoreHarness = {
  /** A store over the harness's backing. Calling twice models reopening the app. */
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
    { kind: 'changeLevel', ref: { type: 'task', id: 't2' }, to: 'plan', newId: 'p2', at: AT },
    { kind: 'setTaskDone', id: 't1', done: true, at: AT },
    { kind: 'deleteEmpty', ref: { type: 'task', id: 't3' }, at: AT },
    { kind: 'replaceAll', state: emptyState(), at: AT },
  ]
}

export function describeStoreConformance(name: string, makeHarness: () => StoreHarness): void {
  describe(`store conformance: ${name}`, () => {
    it('reads an empty state before anything has been written', async () => {
      const harness = makeHarness()
      harness.reset()
      const state = await harness.create().read()
      expect(state).toEqual(emptyState())
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

    it('reaches the same state as any other adapter given the same sequence', async () => {
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
  })
}
