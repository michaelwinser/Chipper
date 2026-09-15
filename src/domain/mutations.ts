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
  /**
   * M1 stopgap: removes something that has nothing under it, so a typo can be undone
   * without pre-empting the cascade decisions that belong to M5 (PRD §5.8). Refuses
   * anything with children rather than guessing what should happen to them.
   */
  | { kind: 'deleteEmpty'; ref: EntityRef; at: IsoTime }
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
  'deleteEmpty',
  'replaceAll',
] as const satisfies readonly MutationKind[]

/** Fails to compile if the union gains a kind the list above does not mention. */
type Missing = Exclude<MutationKind, (typeof MUTATION_KINDS)[number]>
export const _allKindsListed: Missing extends never ? true : never = true
