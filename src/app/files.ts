/**
 * Getting data in and out of the browser. The only place that touches the DOM outside
 * the UI layer, and deliberately thin — the format itself is the domain's business.
 */
import { toEnvelope } from '../domain/transfer'
import type { State } from '../domain/state'

/** `chipper-2026-09-14.json` — sorts chronologically in a downloads folder. */
export function exportFilename(now: string): string {
  return `chipper-${now.slice(0, 10)}.json`
}

/**
 * Hand a file to the browser, and say whether it was accepted.
 *
 * All three details matter and all three were wrong here. The anchor is attached before
 * it is clicked, because a synthetic click on a detached anchor downloads nothing in
 * Firefox. The object URL is revoked on a later task, because revoking in the same tick
 * races the download's start in Safari. And the whole thing is wrapped, because a
 * `file://` page — a mode PRD §7 promises — throws rather than downloading.
 *
 * `Blocked.svelte` fixed exactly this for its own download and left the app's only export
 * route on the old spelling, which is the route that screen tells people to rely on.
 */
export function downloadExport(state: State, now: string): boolean {
  try {
    const blob = new Blob([toEnvelope(state, now)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = exportFilename(now)
    link.style.display = 'none'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 30_000)
    return true
  } catch {
    return false
  }
}

export function pickFile(): Promise<string | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = 'application/json,.json'
    input.onchange = () => {
      const file = input.files?.[0]
      if (!file) return resolve(null)
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => resolve(null)
      reader.readAsText(file)
    }
    input.click()
  })
}
