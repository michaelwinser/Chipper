/**
 * What the board can ask for. Components emit these; they never decide what they mean.
 *
 * Passed through context rather than threaded down four levels of props — the shape of
 * the board is nested, the set of things you can do to it is not.
 */
import { getContext, setContext } from 'svelte'
import type { Size } from '../domain/primitives'
import type { EntityRef, Parent, Ref } from '../domain/state'

export type BoardActions = {
  addSwimlane(name: string): void
  moveSwimlane(id: string, delta: number): void
  addGoal(swimlaneId: string, title: string): void
  addPlan(parent: Parent, title: string): void
  addTask(parent: Parent, title: string): void
  rename(ref: EntityRef, title: string): void
  setDone(taskId: string, done: boolean): void
  toggleStar(ref: Ref): void
  setFocus(focus: 'priorities' | 'everything'): void
  toggleExpanded(goalId: string): void
  breakDown(taskId: string, title: string, starred: boolean): void
  setSizeLens(size: 'any' | 'S' | 'M' | 'L'): void
  closeAll(): void
  setSize(taskId: string, size: Size | null): void
  remove(ref: EntityRef): void
  sendToPile(ref: EntityRef): void
}

const KEY = Symbol.for('chipper.board-actions')

/** A no-op set, so the fixture gallery can render the same components read-only. */
export const readOnlyActions: BoardActions = {
  addSwimlane: () => {},
  moveSwimlane: () => {},
  addGoal: () => {},
  addPlan: () => {},
  addTask: () => {},
  rename: () => {},
  setDone: () => {},
  toggleStar: () => {},
  setFocus: () => {},
  toggleExpanded: () => {},
  breakDown: () => {},
  setSizeLens: () => {},
  closeAll: () => {},
  setSize: () => {},
  remove: () => {},
  sendToPile: () => {},
}

export function setBoardActions(actions: BoardActions): void {
  setContext(KEY, actions)
}

/**
 * The same context a board lives in, as a plain Map — used by `mount()` in tests so a
 * single component can be rendered without standing up the whole app around it.
 */
export function boardContext(
  actions: BoardActions = readOnlyActions,
  readOnly = false,
): Map<unknown, unknown> {
  return new Map<unknown, unknown>([
    [KEY, actions],
    [READ_ONLY, readOnly],
  ])
}

export function getBoardActions(): BoardActions {
  return getContext<BoardActions>(KEY) ?? readOnlyActions
}

/** True when the board is only being looked at, so editing affordances stay hidden. */
export const READ_ONLY = Symbol.for('chipper.read-only')

export function setReadOnly(value: boolean): void {
  setContext(READ_ONLY, value)
}

export function isReadOnly(): boolean {
  return getContext<boolean>(READ_ONLY) ?? false
}
