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

export function downloadExport(state: State, now: string): void {
  const blob = new Blob([toEnvelope(state, now)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = exportFilename(now)
  link.click()
  URL.revokeObjectURL(url)
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
