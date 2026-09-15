/**
 * The mutation vocabulary (DESIGN.md §5.3).
 *
 * Plain serializable data — no functions, no class instances, no Date objects — so
 * these replay, round-trip, and become HTTP request bodies unchanged when the server
 * arrives. Ids and timestamps are supplied by the caller, never generated in here.
 *
 * M1 covers the structural set. Priorities land in M2, the Pile in M3, the ladder in
 * M4, and deletion with its real cascades in M5.
 */
import type { Id, IsoDate, IsoTime, Size } from './primitives'
import type { EntityRef, Parent, Ref, State } from './state'

export type CaptureDestination =
  { kind: 'pile' } | { kind: 'swimlane'; swimlaneId: Id; as: 'task' | 'goal' }

export type PromotionTarget =
  | { kind: 'goal'; id: Id; swimlaneId: Id }
  | { kind: 'plan'; id: Id; parent: Parent }
  | { kind: 'task'; id: Id; parent: Parent; size: Size | null }

export type Mutation =
  /* --- swimlanes --- */
  | { kind: 'createSwimlane'; id: Id; name: string; color: string; at: IsoTime }
  | { kind: 'setSwimlaneColor'; id: Id; color: string; at: IsoTime }
  | { kind: 'reorderSwimlanes'; order: Id[]; at: IsoTime }
  /* --- structure --- */
  | { kind: 'createGoal'; id: Id; swimlaneId: Id; title: string; at: IsoTime }
  | { kind: 'createPlan'; id: Id; parent: Parent; title: string; at: IsoTime }
  | { kind: 'createTask'; id: Id; parent: Parent; title: string; size: Size | null; at: IsoTime }
  /* --- editing --- */
  | { kind: 'renameEntity'; ref: EntityRef; title: string; at: IsoTime }
  | { kind: 'setNotes'; ref: EntityRef; notes: string; at: IsoTime }
  | { kind: 'setTaskSize'; id: Id; size: Size | null; at: IsoTime }
  | { kind: 'setDeadline'; ref: EntityRef; deadline: IsoDate | null; at: IsoTime }
  | { kind: 'setTaskDone'; id: Id; done: boolean; at: IsoTime }
  /* --- the four exits (PRD §5.8) --- */
  /**
   * Destroys the goal and everything under it, completed work included. The DIALOG
   * offers Archive beside it (UC-2105); this mutation does not, because a mutation
   * that sometimes does something else cannot be tested or replayed.
   */
  | { kind: 'deleteGoal'; id: Id; at: IsoTime }
  /**
   * Un-breaking-down should not cost you the work, so the default moves the plan's
   * tasks up to its parent (UC-2106, PRD D11). Cascade is available and explicit.
   */
  | { kind: 'deletePlan'; id: Id; disposition: 'promote-children' | 'cascade'; at: IsoTime }
  | { kind: 'deleteTask'; id: Id; at: IsoTime }
  /**
   * A destination is required BY THE TYPE, so a silent cascade is not expressible
   * (UC-2014). `move` relocates everything; `archive` puts the goals away intact and
   * turns loose tasks into pile items, which loses only their size.
   */
  | {
      kind: 'deleteSwimlane'
      id: Id
      disposition: { kind: 'move'; toSwimlaneId: Id } | { kind: 'archive'; pileIds: Id[] }
      at: IsoTime
    }
  /**
   * It is over — finished, or given up on, and the two are deliberately identical
   * (UC-2130). Clears any stars pointing into the goal in the same mutation, so no
   * priority is ever left aimed at something off the board.
   */
  | { kind: 'archiveGoal'; id: Id; at: IsoTime }
  /**
   * Back on the board, unstarred: priorities are a current choice, not history.
   * `swimlaneId` is needed only when the lane it came from is gone (UC-2132).
   */
  | { kind: 'restoreGoal'; id: Id; swimlaneId?: Id; at: IsoTime }
  /* --- the ladder (PRD §5.8) --- */
  /**
   * Nothing is stuck at the level you first gave it. A task that turns out to be too
   * big climbs to a plan (UC-2050, the signature move); a plan that turns out to be the
   * outcome itself climbs to a goal; a goal that turns out to be a step descends.
   *
   * One mechanism, not four. Title, notes, deadline, star and children all carry over —
   * nothing is deleted and nothing is retyped. `parent` is only needed where it cannot
   * be worked out from where the thing already is.
   */
  | {
      kind: 'changeLevel'
      ref: { type: 'goal' | 'plan' | 'task'; id: Id }
      to: 'goal' | 'plan' | 'task'
      newId: Id
      parent?: Parent
      at: IsoTime
    }
  /* --- the pile --- */
  /**
   * Two seconds, no required fields (UC-1010). Destination is optional: with none, it
   * lands in The Pile, which is the whole point of having one.
   */
  | { kind: 'capture'; id: Id; text: string; destination: CaptureDestination; at: IsoTime }
  /** Out of the backlog and into structure. Deletes the pile item in the same
   *  mutation, so nothing is ever both an idea and a thing (invariant 6). */
  | { kind: 'promotePileItem'; itemId: Id; to: PromotionTarget; at: IsoTime }
  /** The blameless exit (UC-1060). Takes its star with it and says nothing. */
  | { kind: 'sendToPile'; ref: EntityRef; pileId: Id; at: IsoTime }
  /**
   * An idea is allowed to change its mind. Re-parses tags, so editing works exactly
   * like capturing — adding `#house` later is the same gesture as typing it first time.
   */
  | { kind: 'editPileItem'; id: Id; text: string; at: IsoTime }
  | { kind: 'deletePileItem'; id: Id; at: IsoTime }
  /* --- priorities --- */
  /**
   * A star is placed at a level, and the level IS the commitment: a starred Goal puts
   * all its open tasks in play, a starred Plan only that plan's, a starred Task only
   * itself (PRD §5.6).
   */
  | { kind: 'addPriority'; ref: Ref; at: IsoTime }
  | { kind: 'removePriority'; ref: Ref; at: IsoTime }
  /**
   * The sweep (UC-3030): the whole set is replaced in one step. Atomic because it is one
   * decision — "these are my priorities now" — and because a half-applied sweep would
   * leave the board in a state the user never chose. Nothing is recorded about what the
   * previous set contained or how much of it was finished.
   */
  | { kind: 'setPriorities'; refs: Ref[]; at: IsoTime }
  /* --- data --- */
  | { kind: 'replaceAll'; state: State; at: IsoTime }

export type MutationKind = Mutation['kind']

/** Every kind, for exhaustiveness tests. Keep in step with the union above. */
export const MUTATION_KINDS = [
  'createSwimlane',
  'setSwimlaneColor',
  'reorderSwimlanes',
  'createGoal',
  'createPlan',
  'createTask',
  'renameEntity',
  'setNotes',
  'setTaskSize',
  'setDeadline',
  'setTaskDone',
  'capture',
  'promotePileItem',
  'sendToPile',
  'editPileItem',
  'deletePileItem',
  'addPriority',
  'removePriority',
  'setPriorities',
  'deleteGoal',
  'deletePlan',
  'deleteTask',
  'deleteSwimlane',
  'archiveGoal',
  'restoreGoal',
  'changeLevel',
  'replaceAll',
] as const satisfies readonly MutationKind[]

/** Fails to compile if the union gains a kind the list above does not mention. */
type Missing = Exclude<MutationKind, (typeof MUTATION_KINDS)[number]>
export const _allKindsListed: Missing extends never ? true : never = true
