import { defineConfig } from 'vitest/config'
import { svelte } from '@sveltejs/vite-plugin-svelte'

/**
 * Port 2447 is CHIP on a phone keypad. Not Vite's 5173, deliberately — that one is
 * shared with every other Vite project on the machine. Override with PORT=xxxx.
 */
const port = Number(process.env.PORT ?? 2447)

/**
 * Under Vitest, Svelte must resolve to its BROWSER build: the default server build has
 * no lifecycle, so mount() fails with `lifecycle_function_unavailable` and component
 * tests cannot run at all.
 */
const underTest = process.env.VITEST !== undefined

export default defineConfig({
  plugins: [svelte()],
  resolve: underTest ? { conditions: ['browser'] } : {},
  base: './',
  server: { port, strictPort: true },
  preview: { port, strictPort: true },
  build: { outDir: 'dist', emptyOutDir: true },
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    /**
     * Component styles must reach the test document. With the default (`false`) Vitest
     * stubs Svelte's style imports, so no <style> element exists — which made the
     * regression test written for the invisible-card bug unable to fail, and meant every
     * `textContent` assertion included text inside `display: none` subtrees.
     */
    css: true,
  },
})
