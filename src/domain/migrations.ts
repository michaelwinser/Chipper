/**
 * The migration chain (DESIGN.md §4).
 *
 * Present from the first commit because retrofitting versioning onto data you care
 * about is miserable. Every migration ships with a test carrying a real fixture of
 * the version before it.
 *
 * Migrations run in order. Each takes the shape the previous one produced and returns
 * the next. They must be pure and must not depend on anything outside their input.
 */
import { SCHEMA_VERSION, type State } from './state'
import type { Subject } from './transfer'

/** An envelope as it arrives: version known, contents not yet trusted. */
export type RawEnvelope = {
  app: string
  schemaVersion: number
  exportedAt?: string
  state: unknown
}

export type MigrateResult = { ok: true; state: State } | { ok: false; error: string }

export type Migration = {
  /** Applied to an envelope at this version, producing `from + 1`. */
  from: number
  describe: string
  up: (state: unknown) => unknown
}

/**
 * v1 → v2: drop stars that point inside an archived goal.
 *
 * Nothing about the SHAPE changed here, which is what makes this migration unusual and
 * why it has to exist. M8 tightened invariant 7 to what DESIGN.md §3.3 has said since the
 * first commit — no priority resolves anywhere inside an archived goal's subtree — where
 * the code had only ever checked the goal ref itself. So a document M7 wrote, validated
 * and called clean can be one M8 refuses to load.
 *
 * That refusal is not cosmetic. `createLocalStore` marks such a document `blocked`, which
 * means the user opens the app after a deploy to a screen instead of their board. Review
 * measured it by replaying the mutation vocabulary through the M7 reducer: 29 of 364
 * valid M7 documents, about 8%, are refused.
 *
 * Dropping the stars is the right repair, and it is NOT invisible — this comment used to
 * claim it was. Review measured the 29 affected documents: all 38 dropped stars appear in
 * M7's "Starred right now" column on the Set-priorities screen, and 8 in "Coming up". Only
 * the board omitted them. So a user opening M8 finds their priority set shorter by one to
 * three, with nothing said.
 *
 * It is still the right repair, because the alternative is the blocked screen — a board
 * they cannot reach at all. And the stars point into work that is over: `archiveGoal`
 * removes exactly these when the archiving happens through the app, so this applies the
 * same rule to documents written before the rule was enforced. Restoring the goal later
 * does not bring them back, which is also true of stars cleared by `archiveGoal` itself
 * (PRD §5.8: priorities are a current choice, not history).
 *
 * The hole that produced these documents is closed separately: `select/sweep.ts` no longer
 * offers a star on anything inside an archived goal, which is where the button was.
 */
const dropStarsInsideArchivedGoals: Migration = {
  from: 1,
  describe: 'remove priorities that point inside an archived goal',
  up: (value) => {
    if (value === null || typeof value !== 'object') return value
    const state = value as State
    const goals = state.goals ?? {}
    const plans = state.plans ?? {}
    const tasks = state.tasks ?? {}

    /** Walks parents without trusting the document — it has not been validated yet. */
    const archivedOwner = (parent: unknown, depth = 0): boolean => {
      if (depth > 100 || parent === null || typeof parent !== 'object') return false
      const { type, id } = parent as { type?: string; id?: string }
      if (typeof type !== 'string' || typeof id !== 'string') return false
      if (type === 'goal') return goals[id]?.archived === true
      if (type === 'plan') return archivedOwner(plans[id]?.parent, depth + 1)
      return false
    }

    // Only well-formed refs pointing into an archived goal are dropped. Anything this
    // does not understand is passed through untouched for `checkInvariants` to refuse —
    // a migration that also quietly repairs malformed data turns "this file is broken"
    // into "this file is fine now", which is not a judgement a migration gets to make.
    if (!Array.isArray(state.priorities)) return state
    const priorities = state.priorities.filter((ref) => {
      if (ref === null || typeof ref !== 'object') return true
      const { type, id } = ref as { type?: string; id?: string }
      if (typeof type !== 'string' || typeof id !== 'string') return true
      if (type === 'goal') return goals[id]?.archived !== true
      if (type === 'plan') return !archivedOwner(plans[id]?.parent)
      if (type === 'task') return !archivedOwner(tasks[id]?.parent)
      return true
    })

    return { ...state, priorities }
  },
}

export const MIGRATIONS: Migration[] = [dropStarsInsideArchivedGoals]

/** Shape check for the current version. Deliberately structural, not exhaustive: the
 *  invariant pass in transfer.ts does the semantic work. */
function looksLikeState(value: unknown): value is State {
  if (value === null || typeof value !== 'object') return false
  const s = value as Partial<State>
  const maps: (keyof State)[] = ['swimlanes', 'goals', 'plans', 'tasks', 'pile']
  for (const key of maps) {
    const map = s[key]
    if (map === null || typeof map !== 'object' || Array.isArray(map)) return false
  }
  return Array.isArray(s.priorities) && typeof s.schemaVersion === 'number'
}

export function migrate(envelope: RawEnvelope, subject: Subject = 'file'): MigrateResult {
  return migrateWith(envelope, MIGRATIONS, SCHEMA_VERSION, subject)
}

/**
 * The chain, with its steps passed in. Split out so the machinery can be tested with a
 * real sequence of migrations before there is one — the first genuine migration should
 * not also be the first test of whether migrating works at all.
 */
export function migrateWith(
  envelope: RawEnvelope,
  migrations: Migration[],
  target: number,
  subject: Subject = 'file',
): MigrateResult {
  // The same distinction `parseEnvelope` makes. It was threaded through four of the
  // seven branches that can refuse a document and not through these three — so the
  // partly-completed write that UC-6050 names as a cause produced "This export is
  // missing parts of its structure" on a screen about the user's own browser.
  const it = subject === 'file' ? 'This file' : 'The data saved in this browser'
  let version = envelope.schemaVersion
  let state = envelope.state

  // A document from the future is refused here as well as in `parseEnvelope`. The loop
  // below simply does not run for it, so without this the chain returned `ok` and
  // re-stamped it downward — silently relabelling a newer document as an older one for
  // any caller that reaches `migrate` directly rather than through `parseEnvelope`.
  if (version > target) {
    return {
      ok: false,
      error: `${it} was written in format ${version}; this app reads up to ${target}.`,
    }
  }

  while (version < target) {
    const step = migrations.find((m) => m.from === version)
    if (!step) {
      return {
        ok: false,
        error: `${it} is in format ${version}, and there is no way to upgrade it to ${target}.`,
      }
    }
    state = step.up(state)
    version += 1
  }

  if (!looksLikeState(state)) {
    return { ok: false, error: `${it} is missing parts of its structure.` }
  }
  // `target`, not SCHEMA_VERSION. Stamping the module constant meant a chain asked to
  // stop at an intermediate version returned a document labelled with the app's current
  // one — mislabelled the moment there is more than one step to walk.
  return { ok: true, state: { ...state, schemaVersion: target } }
}
