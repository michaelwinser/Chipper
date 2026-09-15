/**
 * Mounting real components against view-model fixtures.
 *
 * Added at M3 because three bugs reached the user through the UI layer while the
 * domain produced none — a lifecycle mistake, an unreachable affordance, and a CSS
 * class collision that rendered an opened card at `opacity: 0`. None of those are
 * reachable from a pure function; all three are reachable from here.
 *
 * Deliberately no testing-library: Svelte's own `mount` plus DOM queries is enough,
 * and it is one fewer dependency to keep in step.
 */
import { mount, unmount, type Component } from 'svelte'
import { boardContext, type BoardActions } from '../../src/ui/actions'

export type Rendered = {
  el: HTMLElement
  text: string
  /** Every element carrying a class, so a collision shows up as a shared name. */
  query<T extends Element = HTMLElement>(selector: string): T | null
  all<T extends Element = HTMLElement>(selector: string): T[]
  /** A button whose accessible name or text contains this, case-insensitively. */
  button(label: string): HTMLButtonElement | null
  destroy(): void
}

/** Records what a component asked for, so intents can be asserted without a store. */
export function recordingActions(): { actions: BoardActions; calls: string[] } {
  const calls: string[] = []
  const note =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(`${name}(${args.map((a) => JSON.stringify(a)).join(', ')})`)
    }
  return {
    calls,
    actions: {
      addSwimlane: note('addSwimlane'),
      moveSwimlane: note('moveSwimlane'),
      addGoal: note('addGoal'),
      addPlan: note('addPlan'),
      addTask: note('addTask'),
      rename: note('rename'),
      setDone: note('setDone'),
      setSize: note('setSize'),
      remove: note('remove'),
      sendToPile: note('sendToPile'),
      toggleStar: note('toggleStar'),
      setFocus: note('setFocus'),
      toggleExpanded: note('toggleExpanded'),
      closeAll: note('closeAll'),
    },
  }
}

export function render<P extends Record<string, unknown>>(
  component: Component<P>,
  props: P,
  options: { actions?: BoardActions; readOnly?: boolean } = {},
): Rendered {
  const target = document.createElement('div')
  document.body.appendChild(target)
  const instance = mount(component, {
    target,
    props,
    context: boardContext(options.actions, options.readOnly ?? false),
  })

  return {
    el: target,
    get text() {
      return target.textContent ?? ''
    },
    query: <T extends Element = HTMLElement>(selector: string) =>
      target.querySelector(selector) as T | null,
    all: <T extends Element = HTMLElement>(selector: string) =>
      [...target.querySelectorAll(selector)] as T[],
    button(label: string) {
      const wanted = label.toLowerCase()
      return (
        [...target.querySelectorAll('button')].find((b) =>
          `${b.getAttribute('aria-label') ?? ''} ${b.textContent ?? ''}`
            .toLowerCase()
            .includes(wanted),
        ) ?? null
      )
    },
    destroy() {
      void unmount(instance)
      target.remove()
    },
  }
}

/** Svelte batches updates; this lets the DOM catch up before asserting. */
export const settle = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0))
