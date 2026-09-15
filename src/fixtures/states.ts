/**
 * The state behind the artboards.
 *
 * `mainState` is built so that `buildBoard` over it must produce the `main` fixture in
 * Priorities focus and the `everything` fixture in Everything focus — the same data,
 * two lenses, both matching pictures drawn long before the code existed. That pairing
 * is the strongest test in the project: it says the implementation agrees with the
 * design rather than with itself.
 */
import type { Mutation } from '../domain/mutations'
import type { Size } from '../domain/primitives'
import { reduce } from '../domain/reduce'
import { emptyState, type Parent, type State } from '../domain/state'

let clock = 0
const at = () => {
  clock += 1
  return `2026-09-01T00:00:${String(clock).padStart(2, '0')}.000Z`
}

function build(steps: (add: (m: Mutation) => void) => void): State {
  clock = 0
  let state = emptyState()
  steps((m) => {
    state = reduce(state, m)
  })
  return state
}

export function mainState(): State {
  return build((add) => {
    const lane = (id: string, name: string, color: string) =>
      add({ kind: 'createSwimlane', id, name, color, at: at() })
    const goal = (id: string, swimlaneId: string, title: string) =>
      add({ kind: 'createGoal', id, swimlaneId, title, at: at() })
    const plan = (id: string, parent: Parent, title: string) =>
      add({ kind: 'createPlan', id, parent, title, at: at() })
    const task = (id: string, parent: Parent, title: string, size: Size | null = 'M') =>
      add({ kind: 'createTask', id, parent, title, size, at: at() })
    const done = (id: string) => add({ kind: 'setTaskDone', id, done: true, at: at() })
    const star = (ref: { type: 'goal' | 'plan' | 'task'; id: string }) =>
      add({ kind: 'addPriority', ref, at: at() })
    /** Padding, created last so it never displaces a named task in creation order. */
    const filler = (prefix: string, parent: Parent, count: number, doneCount = 0) => {
      for (let i = 0; i < count; i++) {
        const id = `${prefix}-${i}`
        task(id, parent, `${prefix} item ${i}`, 'M')
        if (i < doneCount) done(id)
      }
    }

    lane('l-work', 'Work', '#5A7391')
    lane('l-family', 'Family', '#A0684E')
    lane('l-health', 'Health', '#5E8A72')
    lane('l-stuff', 'Stuff', '#8A8279')

    /* --- Work: a starred goal, and a starred plan inside an unstarred goal --- */
    goal('g-invoicing', 'l-work', 'Catch up on invoicing')
    plan('p-invoice', { type: 'goal', id: 'g-invoicing' }, 'Invoice one past month per week')
    // Open, in the order the card shows them.
    task('t-may', { type: 'plan', id: 'p-invoice' }, 'Invoice May', 'M')
    task('t-receipts', { type: 'goal', id: 'g-invoicing' }, 'Find the missing March receipts', 'M')
    task('t-vat', { type: 'goal', id: 'g-invoicing' }, 'Ask the accountant about VAT', 'S')
    task('t-june', { type: 'plan', id: 'p-invoice' }, 'Invoice June', 'M') // the folded one
    // Done: 3 of 7.
    task('t-march', { type: 'plan', id: 'p-invoice' }, 'Invoice March', 'M')
    task('t-april', { type: 'plan', id: 'p-invoice' }, 'Invoice April', 'M')
    task('t-po', { type: 'goal', id: 'g-invoicing' }, 'Chase the two open POs', 'S')
    done('t-march')
    done('t-april')
    done('t-po')

    goal('g-chipper', 'l-work', 'Ship Chipper v1')
    plan('p-prototype', { type: 'goal', id: 'g-chipper' }, 'Build the prototype')
    task('t-model', { type: 'plan', id: 'p-prototype' }, 'Draft the data model', 'M')
    task('t-sketch', { type: 'plan', id: 'p-prototype' }, 'Sketch the swimlane view', 'L')
    task('t-colours', { type: 'plan', id: 'p-prototype' }, 'Name the swimlane colours', 'S')
    task('t-proto-a', { type: 'plan', id: 'p-prototype' }, 'Spike localStorage', 'M')
    task('t-proto-b', { type: 'plan', id: 'p-prototype' }, 'Pick the fonts', 'S')
    done('t-proto-a')
    done('t-proto-b')
    plan('p-ship', { type: 'goal', id: 'g-chipper' }, 'Ship it')
    plan('p-tell', { type: 'goal', id: 'g-chipper' }, 'Tell people')
    filler('t-ship', { type: 'plan', id: 'p-ship' }, 3)
    filler('t-tell', { type: 'plan', id: 'p-tell' }, 3)

    goal('g-hire', 'l-work', 'Hire a second engineer')
    add({
      kind: 'setDeadline',
      ref: { type: 'goal', id: 'g-hire' },
      deadline: '2026-11-30',
      at: at(),
    })
    goal('g-docs', 'l-work', 'Rewrite the onboarding docs')

    /* --- Family: a starred task inside an unstarred goal --- */
    goal('g-trip', 'l-family', 'Plan the December trip')
    add({
      kind: 'setDeadline',
      ref: { type: 'goal', id: 'g-trip' },
      deadline: '2026-12-01',
      at: at(),
    })
    task('t-flights', { type: 'goal', id: 'g-trip' }, 'Book the flights', 'M')
    goal('g-garage', 'l-family', 'Sort out the garage')

    /* --- Health: a lane at rest --- */
    goal('g-runs', 'l-health', 'Get back to three runs a week')

    /* --- Stuff: loose tasks, one of them starred --- */
    task('t-gate', { type: 'swimlane', id: 'l-stuff' }, 'Fix the back gate', 'S')
    task('t-passport', { type: 'swimlane', id: 'l-stuff' }, 'Renew the passport', null)
    task('t-domain', { type: 'swimlane', id: 'l-stuff' }, 'Cancel the old domain', 'S')

    // Padding to reach the counts the artboards show. Created last, so ordering holds.
    filler('t-hire', { type: 'goal', id: 'g-hire' }, 4, 1)
    filler('t-docs', { type: 'goal', id: 'g-docs' }, 5)
    filler('t-trip', { type: 'goal', id: 'g-trip' }, 5, 2)
    filler('t-garage', { type: 'goal', id: 'g-garage' }, 8, 1)
    filler('t-runs', { type: 'goal', id: 'g-runs' }, 5, 3)

    /* --- four stars, at three different levels --- */
    star({ type: 'goal', id: 'g-invoicing' })
    star({ type: 'plan', id: 'p-prototype' })
    star({ type: 'task', id: 't-flights' })
    star({ type: 'task', id: 't-gate' })
  })
}
