/**
 * The view model: what the board looks like, derived from state and a lens.
 *
 * This is the load-bearing type of the codebase (DESIGN.md §2.1). Every product
 * rule about what the board shows is a derivation into this shape, not logic in a
 * component. If a Svelte file contains an `if` about product behaviour, it belongs
 * here instead.
 */

export type Id = string
export type IsoDate = string
export type IsoTime = string

export type Size = 'S' | 'M' | 'L'
export type Focus = 'priorities' | 'everything'
export type SizeLens = 'any' | Size
export type Lens = {
  focus: Focus
  size: SizeLens
  /**
   * Goals opened to look inside (UC-5020: drilling in, without rendering everything at
   * once). Any number may be open: closing one you did not ask to close would be the
   * app quietly undoing your work, which is the thing this product is against. The
   * board stays calm because you open only what you ask for — and can shut them all.
   */
  expanded: Id[]
}

export type TaskRowModel = {
  kind: 'task'
  id: Id
  title: string
  size: Size | null
  starred: boolean
  done: boolean
  indent: number
}

export type PlanRowModel = {
  kind: 'plan'
  id: Id
  title: string
  starred: boolean
  progress: { done: number; total: number }
  indent: number
}

export type RowModel = TaskRowModel | PlanRowModel

export type CardModel = {
  goalId: Id
  /**
   * Whether this card is in play at all.
   *  - 'active' — something under it is starred
   *  - 'quiet'  — shown only because the focus is Everything; present, not competing
   */
  emphasis: 'active' | 'quiet'
  /**
   * `contextual` is true when this title is not itself a commitment — either the star
   * sits BELOW the goal, or nothing here is starred at all and the card is only being
   * shown because the focus is Everything. Either way the title reads as context.
   */
  header: { title: string; contextual: boolean; starred: boolean }
  /**
   * Dates carry their own label. Formatting lives in the model so that every
   * surface says "1 Dec" the same way, and so it can be tested without a DOM.
   */
  meta: {
    done: number
    total: number
    /** "3 of 7 done", or "no tasks yet" — a goal with nothing in it is not 0 of 0. */
    label: string
    deadline: { iso: IsoDate; label: string } | null
  }
  /** Opened to show everything inside, including plans with nothing under them. */
  expanded: boolean
  /**
   * Whether anything is under this goal at all — plans and finished tasks included.
   *
   * Stated, because the card used to infer it from `rows.length === 0`, which is a view
   * artefact: rows are empty for a title-only card, a quiet card, and a goal whose tasks
   * are all done. So "to the Pile" appeared on goals the reducer then refused.
   */
  holdsAnything: boolean
  /**
   * Finished work, shown as progress rather than mixed in with what is left (UC-5010).
   * Separate from `rows` so it is never both struck through in the list AND counted
   * below it — and so it reads as something achieved, not as clutter.
   */
  done: { tasks: { id: Id; title: string }[] } | null
  /**
   * Gentle guidance, never a warning or a block (PRD D5). Nothing here ever prevents
   * an action; it only says what the shape of the thing is starting to look like.
   */
  guidance: { text: string } | null
  /** Degrades to title-only when too much is starred to give anything room. */
  detail: 'tasks' | 'title-only'
  rows: RowModel[]
  /** What is under this goal but not shown, e.g. "2 other plans in this goal". */
  folded: { text: string } | null
  /** Shown instead of rows when the size lens matches nothing here. */
  empty: { text: string } | null
  /**
   * Where THIS goal could go if it turned out to be a step rather than an outcome
   * (UC-2059) — every other live goal, with itself already excluded.
   *
   * Per-card, not per-board. As a board field it was a list no consumer could use
   * unedited: every card filtered itself out in Svelte, which is `changeLevel`'s cycle
   * rule restated in a component, and untestable without mounting one. It also could not
   * appear in the golden fixtures, because no artboard draws a picker's contents — so
   * `board.test.ts` had to carve the field out of the comparison, and a field the
   * artboards cannot describe is a field on the wrong model.
   */
  demoteUnder: DemotionTarget[]
}

/** A loose task with no goal above it: no card to draw, so it stays a chip. */
export type ChipModel = {
  taskId: Id
  title: string
  size: Size | null
  /** As for cards: 'quiet' means present because the focus is Everything, not in play. */
  emphasis: 'active' | 'quiet'
  starred: boolean
  done: boolean
}

export type LaneModel = {
  id: Id
  name: string
  color: string
  cards: CardModel[]
  chips: ChipModel[]
  /** "2 more in Work" — everything unstarred, folded into one line. */
  collapsed: { count: number } | null
  /** A lane with nothing in play. It still exists; it just isn't asking. */
  resting: { summary: string } | null
}

/**
 * Somewhere this goal could become a plan (UC-2059).
 *
 * `label` is assembled here, not in the component. Two goals can share a title, so the
 * lane is part of the name — and the separator was being retyped in `GoalCard` and again
 * in `board.test.ts`, which is a format living in two places and pinned in neither.
 */
export type DemotionTarget = { goalId: Id; label: string }

export type BoardModel = {
  lanes: LaneModel[]
  lens: Lens
}

/* ------------------------------------------------------------------------- *
 * Structural guarantee (DESIGN.md §2.1, §9.5)
 *
 * The product principles forbid reporting the user's shortfall back to them.
 * Rather than trusting a reviewer to notice, the model is asserted at COMPILE
 * TIME to have no field capable of expressing one. Adding `overdueCount` to a
 * model below does not fail review — it fails the build.
 * ------------------------------------------------------------------------- */

type GuiltField =
  | 'overdueCount'
  | 'missedCount'
  | 'missed'
  | 'overdue'
  | 'streak'
  | 'completionRate'
  | 'score'
  | 'velocity'
  | 'abandoned'
  | 'late'
  | 'behind'
  // The arithmetic of shortfall, not only its vocabulary. `crowding` is the field this
  // matters most for — its own doc says it must carry what is there and what the lane is
  // built for, never the difference — and `{ goals, laidOutFor, over: 2 }` compiled
  // cleanly under the old guard, because the guard only ever looked at top-level keys.
  | 'over'
  | 'excess'
  | 'shortfall'
  | 'deficit'
  | 'remaining'
  | 'outstanding'
  | 'unfinished'

/**
 * Every shortfall-named key anywhere in `T` — nested objects, array members, and the
 * non-null side of a union — collected as a union of the offending names.
 *
 * Accumulating offenders is the whole trick, and getting it wrong is silent. The first
 * attempt mapped each property to `true | never` and checked the result was `true`; but
 * `true | never` IS `true`, so every nested failure was absorbed and the guard passed on
 * exactly the shapes it was extended to cover. Collecting names instead makes the empty
 * case `never`, which is the only thing that cannot hide a member.
 */
export type Guilt<T> = Extract<keyof T, GuiltField> | { [K in keyof T]-?: GuiltIn<T[K]> }[keyof T]

/** Descends through arrays and unions; stops at primitives, which cannot carry a key. */
type GuiltIn<V> =
  NonNullable<V> extends readonly (infer E)[]
    ? GuiltIn<E>
    : NonNullable<V> extends object
      ? Guilt<NonNullable<V>>
      : never

/**
 * `never` means nothing was found; anything else fails to satisfy `true`.
 *
 * Exported, because for a while it was not — and a guard that cannot be reused does not
 * spread. §6.5 claimed the Archive got "the same §2.1 argument, applied to the place it
 * matters most", and `select/sweep.ts` claimed in prose what its model "deliberately
 * cannot express", while the mechanism behind both claims lived here as a private type.
 * Each selector that makes the claim now asserts it.
 */
export type NoGuilt<T> = [Guilt<T>] extends [never] ? true : never

export const _noGuiltFields: [
  NoGuilt<BoardModel>,
  NoGuilt<LaneModel>,
  NoGuilt<CardModel>,
  NoGuilt<ChipModel>,
  NoGuilt<TaskRowModel>,
  NoGuilt<PlanRowModel>,
  NoGuilt<DemotionTarget>,
  NoGuilt<Lens>,
] = [true, true, true, true, true, true, true, true]
