/**
 * buildBoard — the view is a pure function (DESIGN.md §2.1, PRD §5.7).
 *
 * One rule decides everything here: **the card is always the Goal, and the star
 * renders where you put it.** The Goal is the context that explains why a task is
 * worth doing, so it is always the frame; what you starred decides what is inside it.
 *
 * The second rule is that the app has a fixed amount of room and hands it to whatever
 * is starred. Star a few things and each gets its tasks shown; star a dozen and there
 * is no room left for any of them. Nothing counts your priorities back at you — the
 * calm simply runs out, which is the only honest way to show an overload.
 */
import type { BoardModel, CardModel, ChipModel, LaneModel, Lens, RowModel } from '../board'
import { formatDeadline } from '../format'
import { layout } from '../layout'
import type { Id } from '../primitives'
import type { Goal, Plan, Ref, State, Task } from '../state'
import { childPlans, childTasks, goalsInSwimlane, orderedSwimlanes, progressOf } from '../state'

const byCreation = <T extends { createdAt: string; id: string }>(a: T, b: T): number =>
  a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)

/** Where a starred ref sits: the goal that frames it, and the plans in between. */
type Placement = { goal: Goal; chain: Plan[]; ref: Ref }

function placementOf(state: State, ref: Ref): Placement | null {
  const chain: Plan[] = []
  let cursor: { type: 'swimlane' | 'goal' | 'plan'; id: Id }

  if (ref.type === 'goal') {
    const goal = state.goals[ref.id]
    return goal && !goal.archived ? { goal, chain, ref } : null
  }
  if (ref.type === 'plan') {
    const plan = state.plans[ref.id]
    if (!plan) return null
    chain.unshift(plan)
    cursor = plan.parent
  } else {
    const task = state.tasks[ref.id]
    if (!task) return null
    cursor = task.parent
  }

  while (cursor.type === 'plan') {
    const plan = state.plans[cursor.id]
    if (!plan) return null
    chain.unshift(plan)
    cursor = plan.parent
  }
  if (cursor.type !== 'goal') return null // loose task in a swimlane — a chip, not a card
  const goal = state.goals[cursor.id]
  return goal && !goal.archived ? { goal, chain, ref } : null
}

/** Every open task beneath something, flattened: starring X puts all of X in play. */
function openTasksUnder(state: State, parent: { type: 'goal' | 'plan'; id: Id }): Task[] {
  const direct = childTasks(state, parent).filter((t) => !t.done)
  const nested = childPlans(state, parent).flatMap((p) =>
    openTasksUnder(state, { type: 'plan', id: p.id }),
  )
  return [...direct, ...nested].sort(byCreation)
}

function taskRow(task: Task, indent: number, starred: boolean): RowModel {
  return {
    kind: 'task',
    id: task.id,
    title: task.title,
    size: task.size,
    starred,
    done: task.done,
    indent,
  }
}

function planRow(state: State, plan: Plan, indent: number, starred: boolean): RowModel {
  return {
    kind: 'plan',
    id: plan.id,
    title: plan.title,
    starred,
    progress: progressOf(state, { type: 'plan', id: plan.id }),
    indent,
  }
}

function plural(n: number, one: string, many: string): string {
  return n === 1 ? one : many
}

/** A goal holding only empty plans has no progress to report — it is not 0 of 0. */
function progressLabel(done: number, total: number): string {
  return total === 0 ? 'no tasks yet' : `${done} of ${total} done`
}

function metaFor(state: State, goal: Goal): CardModel['meta'] {
  const progress = progressOf(state, { type: 'goal', id: goal.id })
  const label = goal.deadline === null ? null : formatDeadline(goal.deadline)
  return {
    done: progress.done,
    total: progress.total,
    label: progressLabel(progress.done, progress.total),
    deadline: goal.deadline !== null && label !== null ? { iso: goal.deadline, label } : null,
  }
}

/**
 * Everything under a goal, plans included — even plans with nothing in them yet, which
 * are otherwise unreachable, and which are usually the thing most in need of attention.
 * Done tasks come too: looking inside means looking at all of it.
 */
function fullContents(
  state: State,
  parent: { type: 'goal' | 'plan'; id: Id },
  indent: number,
): RowModel[] {
  const rows: RowModel[] = []
  for (const task of childTasks(state, parent).sort(byCreation)) {
    rows.push(taskRow(task, indent, false))
  }
  for (const plan of childPlans(state, parent).sort(byCreation)) {
    rows.push(planRow(state, plan, indent, false))
    rows.push(...fullContents(state, { type: 'plan', id: plan.id }, indent + 1))
  }
  return rows
}

/** A goal opened to be looked inside. Stars are still shown, but nothing is hidden. */
function expandedCard(state: State, goal: Goal, starredKeys: Set<string>): CardModel {
  const rows = fullContents(state, { type: 'goal', id: goal.id }, 0).map((row) =>
    starredKeys.has(`${row.kind}:${row.id}`) ? { ...row, starred: true } : row,
  )
  return {
    goalId: goal.id,
    emphasis: 'active',
    header: {
      title: goal.title,
      contextual: !starredKeys.has(`goal:${goal.id}`),
      starred: starredKeys.has(`goal:${goal.id}`),
    },
    meta: metaFor(state, goal),
    detail: 'tasks',
    expanded: true,
    rows,
    folded: null,
    empty: rows.length === 0 ? { text: 'Nothing in here yet — add a task or a plan' } : null,
  }
}

/** A card for one Goal, given everything starred beneath it. */
function activeCard(
  state: State,
  goal: Goal,
  placements: Placement[],
  detailed: boolean,
): CardModel {
  const goalStarred = placements.some((p) => p.ref.type === 'goal')
  const header = {
    title: goal.title,
    contextual: !goalStarred,
    starred: goalStarred,
  }
  const meta = metaFor(state, goal)

  if (!detailed) {
    // Too much is starred to give anything room. The tasks fall out of the cards.
    return {
      goalId: goal.id,
      emphasis: 'active',
      header,
      meta,
      detail: 'title-only',
      expanded: false,
      rows: [],
      folded: null,
      empty: null,
    }
  }

  const rows: RowModel[] = []
  const seen = new Set<string>()
  const push = (row: RowModel) => {
    if (seen.has(row.id)) return
    seen.add(row.id)
    rows.push(row)
  }

  /**
   * Several things can be starred inside one goal, each drawing its tasks from a
   * different scope. Hidden work is counted per scope and then combined, so two stars
   * in one goal cannot quietly overwrite each other's accounting.
   */
  type Scope = { kind: 'goal' | 'plan'; id: Id }
  const scopes = new Map<string, { scope: Scope; shown: Set<Id> }>()
  const noteShown = (scope: Scope, taskId: Id | null) => {
    const key = `${scope.kind}:${scope.id}`
    const entry = scopes.get(key) ?? { scope, shown: new Set<Id>() }
    if (taskId !== null) entry.shown.add(taskId)
    scopes.set(key, entry)
  }

  for (const placement of placements) {
    placement.chain.forEach((plan, i) =>
      push(planRow(state, plan, i, placement.ref.type === 'plan' && plan.id === placement.ref.id)),
    )
    const indent = placement.chain.length

    if (placement.ref.type === 'task') {
      const task = state.tasks[placement.ref.id]
      if (task) push(taskRow(task, indent, true))
      const enclosing = placement.chain.at(-1)
      const scope: Scope = enclosing
        ? { kind: 'plan', id: enclosing.id }
        : { kind: 'goal', id: goal.id }
      noteShown(scope, placement.ref.id)
    } else {
      const scope: Scope =
        placement.ref.type === 'plan'
          ? { kind: 'plan', id: placement.ref.id }
          : { kind: 'goal', id: goal.id }
      noteShown(scope, null)
      for (const task of openTasksUnder(state, { type: scope.kind, id: scope.id }).slice(
        0,
        layout.rowsPerCard,
      )) {
        push(taskRow(task, indent, false))
        noteShown(scope, task.id)
      }
    }
  }

  // What is hidden, described at the level it is hidden from.
  const parts: string[] = []
  let hidden = 0
  for (const { scope, shown } of scopes.values()) {
    const open = openTasksUnder(state, { type: scope.kind, id: scope.id })
    hidden += Math.max(0, open.length - open.filter((t) => shown.has(t.id)).length)
  }
  if (hidden > 0) {
    const only = scopes.size === 1 ? [...scopes.values()][0]!.scope : null
    // "this plan" only reads correctly when there is exactly one plan to mean.
    parts.push(only?.kind === 'plan' ? `${hidden} more in this plan` : `${hidden} more open`)
  }
  if (!goalStarred) {
    const shownPlanIds = new Set(rows.filter((r) => r.kind === 'plan').map((r) => r.id))
    const otherPlans = childPlans(state, { type: 'goal', id: goal.id }).filter(
      (p) => !shownPlanIds.has(p.id),
    ).length
    if (otherPlans > 0) {
      parts.push(otherPlans === 1 ? '1 other plan' : `${otherPlans} other plans in this goal`)
    }
  }

  return {
    goalId: goal.id,
    emphasis: 'active',
    header,
    meta,
    detail: 'tasks',
    expanded: false,
    rows,
    folded: parts.length > 0 ? { text: parts.join(' · ') } : null,
    // Starred, but there is nothing to do in it — usually a goal waiting to be broken
    // down, which is the one thing worth saying out loud here.
    empty:
      rows.length === 0
        ? { text: 'Nothing to do in here yet — open it to add a task or a plan' }
        : null,
  }
}

/** A goal shown only because the focus is Everything: present, never competing. */
function quietCard(state: State, goal: Goal): CardModel {
  return {
    goalId: goal.id,
    emphasis: 'quiet',
    header: { title: goal.title, contextual: true, starred: false },
    meta: metaFor(state, goal),
    detail: 'title-only',
    expanded: false,
    rows: [],
    folded: null,
    empty: null,
  }
}

function chipFor(task: Task, starred: boolean): ChipModel {
  return {
    taskId: task.id,
    title: task.title,
    size: task.size,
    emphasis: starred ? 'active' : 'quiet',
    starred,
    done: task.done,
  }
}

export function buildBoard(state: State, lens: Lens): BoardModel {
  const starredKeys = new Set(state.priorities.map((r) => `${r.type}:${r.id}`))
  const isStarred = (type: Ref['type'], id: Id) => starredKeys.has(`${type}:${id}`)

  // Group everything starred by the goal that frames it. Order follows the goal's own
  // place in its lane, not the order things happened to be starred in.
  const byGoal = new Map<Id, Placement[]>()
  const starredLooseTasks: Task[] = []
  for (const ref of state.priorities) {
    const placement = placementOf(state, ref)
    if (placement) {
      const list = byGoal.get(placement.goal.id) ?? []
      list.push(placement)
      byGoal.set(placement.goal.id, list)
    } else if (ref.type === 'task') {
      const task = state.tasks[ref.id]
      if (task && task.parent.type === 'swimlane') starredLooseTasks.push(task)
    }
  }

  const detailed = state.priorities.length <= layout.detailBudget
  const everything = lens.focus === 'everything'

  const lanes: LaneModel[] = orderedSwimlanes(state).map((lane) => {
    const goals = goalsInSwimlane(state, lane.id).sort(byCreation)
    const loose = childTasks(state, { type: 'swimlane', id: lane.id }).sort(byCreation)
    const starredLooseHere = loose.filter((t) => isStarred('task', t.id))

    const cards: CardModel[] = []
    for (const goal of goals) {
      const placements = byGoal.get(goal.id)
      // An opened goal shows its contents whatever the focus — that is what opening is.
      if (lens.expanded.includes(goal.id)) cards.push(expandedCard(state, goal, starredKeys))
      else if (placements) cards.push(activeCard(state, goal, placements, detailed))
      else if (everything) cards.push(quietCard(state, goal))
    }

    const chips = (everything ? loose : starredLooseHere).map((t) =>
      chipFor(t, isStarred('task', t.id)),
    )

    const hasAnything = goals.length > 0 || loose.length > 0
    const inPlay = cards.some((c) => c.emphasis === 'active') || starredLooseHere.length > 0

    // Everything that is here but not in play, folded into one line — or, when nothing
    // in the lane is in play at all, a single quiet line saying what is waiting.
    const hiddenGoals = goals.length - cards.filter((c) => c.emphasis === 'active').length
    const hiddenLoose = loose.length - starredLooseHere.length
    const hidden = hiddenGoals + hiddenLoose

    let collapsed: LaneModel['collapsed'] = null
    let resting: LaneModel['resting'] = null
    if (everything) {
      resting = hasAnything ? null : { summary: 'Nothing here yet' }
    } else if (inPlay) {
      collapsed = hidden > 0 ? { count: hidden } : null
    } else if (hasAnything) {
      const bits: string[] = []
      if (goals.length > 0) bits.push(`${goals.length} ${plural(goals.length, 'goal', 'goals')}`)
      if (loose.length > 0)
        bits.push(`${loose.length} loose ${plural(loose.length, 'task', 'tasks')}`)
      resting = { summary: `${bits.join(' and ')}, nothing prioritised right now` }
    } else {
      resting = { summary: 'Nothing here yet' }
    }

    return { id: lane.id, name: lane.name, color: lane.color, cards, chips, collapsed, resting }
  })

  return { lanes, lens }
}
