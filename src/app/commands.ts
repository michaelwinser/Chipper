/**
 * Intent in, exactly one mutation out (DESIGN.md §7).
 *
 * Commands validate, build a mutation, and apply it. Anything more interesting than
 * that belongs in the domain — if a command starts deciding what the board shows, the
 * rule has escaped to a layer that cannot be tested without a store.
 */
import type { Size } from '../domain/primitives'
import type { CaptureDestination, PromotionTarget } from '../domain/mutations'
import type { EntityRef, Parent, Ref, State } from '../domain/state'
import type { Deps } from './deps'

/** The lane palette. Muted and low-chroma so lanes read as areas, not as status. */
export const LANE_COLORS = ['#5A7391', '#A0684E', '#5E8A72', '#7A6E9E', '#8A8279'] as const

export function nextLaneColor(state: State): string {
  const used = Object.values(state.swimlanes).length
  return LANE_COLORS[used % LANE_COLORS.length] as string
}

export function createCommands(deps: Deps) {
  const { store, now, newId } = deps

  return {
    async addSwimlane(name: string, color: string) {
      const id = newId()
      await store.apply({ kind: 'createSwimlane', id, name, color, at: now() })
      return id
    },

    async reorderSwimlanes(order: string[]) {
      await store.apply({ kind: 'reorderSwimlanes', order, at: now() })
    },

    async addGoal(swimlaneId: string, title: string) {
      const id = newId()
      await store.apply({ kind: 'createGoal', id, swimlaneId, title, at: now() })
      return id
    },

    async addPlan(parent: Parent, title: string) {
      const id = newId()
      await store.apply({ kind: 'createPlan', id, parent, title, at: now() })
      return id
    },

    async addTask(parent: Parent, title: string, size: Size | null = null) {
      const id = newId()
      await store.apply({ kind: 'createTask', id, parent, title, size, at: now() })
      return id
    },

    async rename(ref: EntityRef, title: string) {
      await store.apply({ kind: 'renameEntity', ref, title, at: now() })
    },

    async setTaskSize(id: string, size: Size | null) {
      await store.apply({ kind: 'setTaskSize', id, size, at: now() })
    },

    async setDeadline(ref: EntityRef, deadline: string | null) {
      await store.apply({ kind: 'setDeadline', ref, deadline, at: now() })
    },

    async setDone(id: string, done: boolean) {
      await store.apply({ kind: 'setTaskDone', id, done, at: now() })
    },

    /** One gesture, two mutations — which one is decided from current state, not guessed. */
    async toggleStar(state: State, ref: Ref) {
      const starred = state.priorities.some((r) => r.type === ref.type && r.id === ref.id)
      await store.apply({ kind: starred ? 'removePriority' : 'addPriority', ref, at: now() })
    },

    async deleteEmpty(ref: EntityRef) {
      await store.apply({ kind: 'deleteEmpty', ref, at: now() })
    },

    async capture(text: string, destination: CaptureDestination) {
      const id = newId()
      await store.apply({ kind: 'capture', id, text, destination, at: now() })
      return id
    },

    /** The caller says where it should go; the new thing's id is made here, not there. */
    async promotePileItem(
      itemId: string,
      to: { kind: 'goal'; swimlaneId: string } | { kind: 'task' | 'plan'; parent: Parent },
    ) {
      const id = newId()
      const target: PromotionTarget =
        to.kind === 'goal'
          ? { kind: 'goal', id, swimlaneId: to.swimlaneId }
          : to.kind === 'plan'
            ? { kind: 'plan', id, parent: to.parent }
            : { kind: 'task', id, parent: to.parent, size: null }
      await store.apply({ kind: 'promotePileItem', itemId, to: target, at: now() })
      return id
    },

    async sendToPile(ref: EntityRef) {
      await store.apply({ kind: 'sendToPile', ref, pileId: newId(), at: now() })
    },

    async editPileItem(id: string, text: string) {
      await store.apply({ kind: 'editPileItem', id, text, at: now() })
    },

    async deletePileItem(id: string) {
      await store.apply({ kind: 'deletePileItem', id, at: now() })
    },

    async replaceAll(state: State) {
      await store.apply({ kind: 'replaceAll', state, at: now() })
    },
  }
}

export type Commands = ReturnType<typeof createCommands>
