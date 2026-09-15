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

type NoGuilt<T> = Extract<keyof T, GuiltField> extends never ? true : never

export const _noGuiltFields: [
  NoGuilt<BoardModel>,
  NoGuilt<LaneModel>,
  NoGuilt<CardModel>,
  NoGuilt<CardModel['meta']>,
  NoGuilt<ChipModel>,
  NoGuilt<TaskRowModel>,
  NoGuilt<PlanRowModel>,
] = [true, true, true, true, true, true, true]
