/**
 * Board fixtures, transcribed from the artboards in `mocks/`.
 *
 * These are golden fixtures: they are what `buildBoard` must produce once it exists
 * (M2), and until then they are what the components are developed against. Each one
 * names the artboard and the use cases it stands for, so the mockups, the PRD and the
 * test suite cannot drift apart silently.
 */
import type { BoardModel, CardModel, ChipModel, LaneModel, RowModel, Size } from '../domain/board'
import { formatDeadline } from '../domain/format'

const COLOR = {
  work: '#5A7391',
  family: '#A0684E',
  health: '#5E8A72',
  fun: '#7A6E9E',
  stuff: '#8A8279',
}

function task(
  id: string,
  title: string,
  size: Size | null,
  opts: { starred?: boolean; done?: boolean; indent?: number } = {},
): RowModel {
  return {
    kind: 'task',
    id,
    title,
    size,
    starred: opts.starred ?? false,
    done: opts.done ?? false,
    indent: opts.indent ?? 0,
  }
}

function plan(
  id: string,
  title: string,
  done: number,
  total: number,
  opts: { starred?: boolean; indent?: number } = {},
): RowModel {
  return {
    kind: 'plan',
    id,
    title,
    starred: opts.starred ?? false,
    progress: { done, total },
    indent: opts.indent ?? 0,
  }
}

function progressLabel(done: number, total: number): string {
  return total === 0 ? 'no tasks yet' : `${done} of ${total} done`
}

function deadline(iso: string) {
  const label = formatDeadline(iso)
  return label === null ? null : { iso, label }
}

function card(
  goalId: string,
  title: string,
  done: number,
  total: number,
  opts: Partial<Omit<CardModel, 'goalId' | 'meta'>> & { deadline?: string } = {},
): CardModel {
  return {
    goalId,
    emphasis: opts.emphasis ?? 'active',
    header: opts.header ?? { title, contextual: false, starred: true },
    meta: {
      done,
      total,
      label: progressLabel(done, total),
      deadline: opts.deadline ? deadline(opts.deadline) : null,
    },
    expanded: opts.expanded ?? false,
    done: opts.done ?? null,
    guidance: opts.guidance ?? null,
    detail: opts.detail ?? 'tasks',
    rows: opts.rows ?? [],
    folded: opts.folded ?? null,
    empty: opts.empty ?? null,
  }
}

function chip(
  taskId: string,
  title: string,
  size: ChipModel['size'],
  emphasis: ChipModel['emphasis'] = 'active',
): ChipModel {
  return { taskId, title, size, emphasis, starred: emphasis === 'active', done: false }
}

function lane(id: string, name: string, color: string, rest: Partial<LaneModel> = {}): LaneModel {
  return {
    id,
    name,
    color,
    cards: rest.cards ?? [],
    chips: rest.chips ?? [],
    collapsed: rest.collapsed ?? null,
    resting: rest.resting ?? null,
  }
}

/* --- the four card shapes (artboard: StarDepth) ------------------------- */

/** The Goal is starred: full ink, star beside it, its open tasks in play. */
export const goalStarred = card('g-invoicing', 'Catch up on invoicing', 3, 7, {
  header: { title: 'Catch up on invoicing', contextual: false, starred: true },
  rows: [
    task('t-may', 'Invoice May', 'M'),
    task('t-receipts', 'Find the missing March receipts', 'M'),
    task('t-vat', 'Ask the accountant about VAT', 'S'),
  ],
  folded: { text: '1 more open' },
})

/** A Plan is starred: the goal goes contextual, the plan and its tasks show. */
export const planStarred = card('g-chipper', 'Ship Chipper v1', 2, 11, {
  header: { title: 'Ship Chipper v1', contextual: true, starred: false },
  rows: [
    plan('p-prototype', 'Build the prototype', 2, 5, { starred: true }),
    task('t-model', 'Draft the data model', 'M', { indent: 1 }),
    task('t-sketch', 'Sketch the swimlane view', 'L', { indent: 1 }),
    task('t-colours', 'Name the swimlane colours', 'S', { indent: 1 }),
  ],
  folded: { text: '2 other plans in this goal' },
})

/** A Task is starred: the tightest commitment, and the least room taken. */
export const taskStarred = card('g-trip', 'Plan the December trip', 2, 6, {
  header: { title: 'Plan the December trip', contextual: true, starred: false },
  deadline: '2026-12-01',
  rows: [task('t-flights', 'Book the flights', 'M', { starred: true })],
  folded: { text: '3 more open' },
})

/** A Task inside a Plan: both levels of context kept, siblings folded at both. */
export const taskInPlanStarred = card('g-garage', 'Sort out the garage', 1, 8, {
  header: { title: 'Sort out the garage', contextual: true, starred: false },
  rows: [
    plan('p-backwall', 'Clear the back wall', 0, 4),
    task('t-skip', 'Hire the skip', 'S', { starred: true, indent: 1 }),
  ],
  folded: { text: '3 more in this plan · 1 other plan' },
})

/* --- boards -------------------------------------------------------------- */

/** artboard: Main — four priorities, starred at three different levels. */
export const main: BoardModel = {
  lens: { focus: 'priorities', size: 'any', expanded: [] },
  lanes: [
    lane('l-work', 'Work', COLOR.work, {
      cards: [goalStarred, planStarred],
      collapsed: { count: 2 },
    }),
    lane('l-family', 'Family', COLOR.family, {
      cards: [taskStarred],
      collapsed: { count: 1 },
    }),
    lane('l-health', 'Health', COLOR.health, {
      resting: { summary: '1 goal, nothing prioritised right now' },
    }),
    lane('l-stuff', 'Stuff', COLOR.stuff, {
      chips: [chip('t-gate', 'Fix the back gate', 'S')],
      collapsed: { count: 2 },
    }),
  ],
}

/** artboard: StarDepth — every card shape at once, plus the chip. */
export const starDepth: BoardModel = {
  lens: { focus: 'priorities', size: 'any', expanded: [] },
  lanes: [
    lane('l-all', 'Every shape', COLOR.work, {
      cards: [goalStarred, planStarred, taskStarred, taskInPlanStarred],
      chips: [chip('t-gate', 'Fix the back gate', 'S')],
    }),
  ],
}

/** artboard: Overloaded — UC-3060. Thirteen starred, so nothing gets room. */
export const overloaded: BoardModel = {
  lens: { focus: 'priorities', size: 'any', expanded: [] },
  lanes: [
    lane('l-work', 'Work', COLOR.work, {
      cards: [
        card('g-invoicing', 'Catch up on invoicing', 3, 7, { detail: 'title-only' }),
        card('g-chipper', 'Ship Chipper v1', 2, 11, { detail: 'title-only' }),
        card('g-hire', 'Hire a second engineer', 1, 4, {
          detail: 'title-only',
          deadline: '2026-11-30',
        }),
        card('g-docs', 'Rewrite the onboarding docs', 0, 5, { detail: 'title-only' }),
      ],
    }),
    lane('l-family', 'Family', COLOR.family, {
      cards: [
        card('g-trip', 'Plan the December trip', 2, 6, {
          detail: 'title-only',
          deadline: '2026-12-01',
        }),
        card('g-garage', 'Sort out the garage', 1, 8, { detail: 'title-only' }),
        card('g-forms', 'Sort the school forms', 0, 3, { detail: 'title-only' }),
      ],
    }),
    lane('l-health', 'Health', COLOR.health, {
      cards: [
        card('g-runs', 'Get back to three runs a week', 3, 5, { detail: 'title-only' }),
        card('g-physio', 'Book the physio', 0, 2, { detail: 'title-only' }),
      ],
    }),
    lane('l-fun', 'Fun', COLOR.fun, {
      cards: [
        card('g-obrian', "Finish the Patrick O'Brian run", 4, 20, { detail: 'title-only' }),
        card('g-guitar', 'Restring the guitar properly', 0, 3, { detail: 'title-only' }),
      ],
    }),
    lane('l-stuff', 'Stuff', COLOR.stuff, {
      chips: [
        chip('t-gate', 'Fix the back gate', 'S'),
        chip('t-passport', 'Renew the passport', 'M'),
      ],
    }),
  ],
}

/** artboard: SizeLens — UC-4010, UC-4030. The lens set to S, including a card it misses. */
export const sizeLensS: BoardModel = {
  lens: { focus: 'priorities', size: 'S', expanded: [] },
  lanes: [
    lane('l-work', 'Work', COLOR.work, {
      cards: [
        card('g-invoicing', 'Catch up on invoicing', 3, 7, {
          rows: [task('t-vat', 'Ask the accountant about VAT', 'S')],
        }),
        card('g-chipper', 'Ship Chipper v1', 2, 11, {
          header: { title: 'Ship Chipper v1', contextual: true, starred: false },
          rows: [
            plan('p-prototype', 'Build the prototype', 2, 5, { starred: true }),
            task('t-colours', 'Name the swimlane colours', 'S', { indent: 1 }),
          ],
        }),
      ],
      collapsed: { count: 2 },
    }),
    lane('l-family', 'Family', COLOR.family, {
      cards: [
        card('g-trip', 'Plan the December trip', 2, 6, {
          header: { title: 'Plan the December trip', contextual: true, starred: false },
          deadline: '2026-12-01',
          empty: { text: 'nothing small here — your starred task is an M' },
        }),
      ],
      collapsed: { count: 1 },
    }),
    lane('l-health', 'Health', COLOR.health, {
      resting: { summary: '1 goal, nothing prioritised right now' },
    }),
    lane('l-stuff', 'Stuff', COLOR.stuff, {
      chips: [chip('t-gate', 'Fix the back gate', 'S')],
      collapsed: { count: 2 },
    }),
  ],
}

/** artboard: Everything — UC-4020. Unstarred work returns, quiet rather than gone. */
export const everything: BoardModel = {
  lens: { focus: 'everything', size: 'any', expanded: [] },
  lanes: [
    lane('l-work', 'Work', COLOR.work, {
      cards: [
        goalStarred,
        planStarred,
        card('g-hire', 'Hire a second engineer', 1, 4, {
          emphasis: 'quiet',
          header: { title: 'Hire a second engineer', contextual: true, starred: false },
          detail: 'title-only',
          deadline: '2026-11-30',
        }),
        card('g-docs', 'Rewrite the onboarding docs', 0, 5, {
          emphasis: 'quiet',
          header: { title: 'Rewrite the onboarding docs', contextual: true, starred: false },
          detail: 'title-only',
        }),
      ],
    }),
    lane('l-family', 'Family', COLOR.family, {
      cards: [
        taskStarred,
        card('g-garage', 'Sort out the garage', 1, 8, {
          emphasis: 'quiet',
          header: { title: 'Sort out the garage', contextual: true, starred: false },
          detail: 'title-only',
        }),
      ],
    }),
    lane('l-health', 'Health', COLOR.health, {
      cards: [
        card('g-runs', 'Get back to three runs a week', 3, 5, {
          emphasis: 'quiet',
          header: { title: 'Get back to three runs a week', contextual: true, starred: false },
          detail: 'title-only',
        }),
      ],
    }),
    lane('l-stuff', 'Stuff', COLOR.stuff, {
      chips: [
        chip('t-gate', 'Fix the back gate', 'S'),
        chip('t-passport', 'Renew the passport', null, 'quiet'),
        chip('t-domain', 'Cancel the old domain', 'S', 'quiet'),
      ],
    }),
  ],
}

/** First run: nothing exists at all. M7 owns this properly; here so it cannot crash. */
export const empty: BoardModel = {
  lens: { focus: 'priorities', size: 'any', expanded: [] },
  lanes: [],
}

export const boards = {
  main,
  starDepth,
  overloaded,
  sizeLensS,
  everything,
  empty,
} satisfies Record<string, BoardModel>

export type BoardName = keyof typeof boards
