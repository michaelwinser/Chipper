<script lang="ts">
  /**
   * The ritual (UC-3030, UC-3050).
   *
   * Keep what still matters; everything else just goes back to where it lives. There is
   * no tally of what was finished, no elapsed-time nag, and nothing anywhere marked late
   * — letting something go is a decision, not a failure, and the app has no opinion on it.
   *
   * "Coming up" is the one place in the whole app that raises a date on its own, because
   * this is the moment you asked to look ahead (PRD §8.2).
   */
  import type { SweepModel } from '../domain/select/sweep'
  import type { Ref } from '../domain/state'
  import Icon from './Icon.svelte'

  let {
    sweep,
    onsave,
    oncancel,
  }: {
    sweep: SweepModel
    onsave: (refs: Ref[]) => void
    oncancel: () => void
  } = $props()

  const key = (ref: Ref) => `${ref.type}:${ref.id}`

  /**
   * What the new set will be. Starts as what is starred now, so keeping is the default
   * and letting go is the deliberate act — not the other way round.
   *
   * Read once, deliberately: this is the starting point of a decision in progress, not a
   * live mirror of the set it is going to replace.
   */
  const startingPoint = () => sweep.current.map((c) => key(c.ref))
  let chosen = $state<string[]>(startingPoint())

  const refs = $derived(
    new Map<string, Ref>([
      ...sweep.current.map((c) => [key(c.ref), c.ref] as const),
      ...sweep.comingUp.map((u) => [key(u.ref), u.ref] as const),
      ...sweep.browse.flatMap((l) => l.items.map((i) => [key(i.ref), i.ref] as const)),
    ]),
  )

  const has = (ref: Ref) => chosen.includes(key(ref))

  function toggle(ref: Ref) {
    const k = key(ref)
    chosen = chosen.includes(k) ? chosen.filter((x) => x !== k) : [...chosen, k]
  }

  function save() {
    onsave(chosen.flatMap((k) => (refs.has(k) ? [refs.get(k)!] : [])))
  }
</script>

<main>
  <div class="intro">
    <h1>Set new priorities</h1>
    <p>
      Keep anything that still matters to you. Everything else just goes back to where it lives —
      nothing is marked late, nothing is counted.
    </p>
  </div>

  {#if sweep.comingUp.length > 0}
    <section>
      <div class="eyebrow-row">
        <span class="eyebrow">Coming up</span>
        <span class="aside">the one place the app brings a date to you</span>
      </div>
      <div class="upcoming">
        {#each sweep.comingUp as item (key(item.ref))}
          <div class="dated">
            <div class="lane-row">
              {#if item.swimlane}
                <span class="dot" style="background: {item.swimlane.color}"></span>
                <span class="lane">{item.swimlane.name}</span>
              {/if}
              <button
                class="star"
                class:on={has(item.ref)}
                aria-label={has(item.ref) ? `Unstar ${item.title}` : `Star ${item.title}`}
                aria-pressed={has(item.ref)}
                onclick={() => toggle(item.ref)}
              >
                <Icon
                  name="star"
                  size={14}
                  filled={has(item.ref)}
                  color={has(item.ref) ? 'var(--cherry)' : '#c3baab'}
                />
              </button>
            </div>
            <span class="title">{item.title}</span>
            <!-- How far out, drawn rather than counted down. -->
            <div class="pips" aria-hidden="true">
              {#each Array(12) as _, i (i)}
                <span
                  class="pip"
                  class:filled={i < Math.min(12, Math.max(0, Math.round(item.days / 7)))}
                ></span>
              {/each}
            </div>
            <div class="meta">
              <span class="date">{item.date}</span>
              <span class="sep">·</span><span>{item.distance}</span>
              {#if item.left}<span class="sep">·</span><span>{item.left}</span>{/if}
            </div>
          </div>
        {/each}
      </div>
    </section>
  {/if}

  <div class="columns">
    <section class="column">
      <div class="eyebrow-row">
        <span class="eyebrow">Starred right now</span>
        <span class="aside">{sweep.current.length}</span>
      </div>
      {#if sweep.current.length === 0}
        <p class="none">Nothing starred. Pick something from the right.</p>
      {:else}
        <div class="list">
          {#each sweep.current as item (key(item.ref))}
            <div class="row" class:letting-go={!has(item.ref)}>
              <Icon
                name="star"
                size={14}
                filled={has(item.ref)}
                color={has(item.ref) ? 'var(--cherry)' : '#c3baab'}
              />
              <div class="text">
                <span class="title">{item.title}</span>
                <span class="context">{item.context}</span>
              </div>
              <button class="keep" class:on={has(item.ref)} onclick={() => toggle(item.ref)}>
                {has(item.ref) ? 'Keeping' : 'Keep'}
              </button>
            </div>
          {/each}
        </div>
      {/if}
    </section>

    <section class="column">
      <div class="eyebrow-row"><span class="eyebrow">Add something</span></div>
      <div class="list">
        {#each sweep.browse as lane (lane.id)}
          <div class="lane-head">
            <span class="dot" style="background: {lane.color}"></span>
            <span>{lane.name}</span>
          </div>
          {#each lane.items as item (key(item.ref))}
            <button
              class="row pick"
              style="padding-left: {16 + item.indent * 22}px"
              aria-pressed={has(item.ref)}
              onclick={() => toggle(item.ref)}
            >
              <Icon
                name="star"
                size={14}
                filled={has(item.ref)}
                color={has(item.ref) ? 'var(--cherry)' : '#c3baab'}
              />
              <div class="text">
                <span class="title">{item.title}</span>
                <span class="context">{item.detail}</span>
              </div>
            </button>
          {/each}
        {/each}
      </div>
    </section>
  </div>

  <div class="actions">
    <button class="primary" onclick={save}>Done, these are my priorities</button>
    <button class="plain" onclick={oncancel}>Cancel</button>
  </div>
</main>

<style>
  main {
    flex: 1;
    min-width: 0;
    padding: 38px 40px;
    display: flex;
    flex-direction: column;
    gap: 24px;
  }
  .intro {
    max-width: 720px;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  h1 {
    margin: 0;
    font-family: var(--serif);
    font-size: 30px;
    font-weight: 400;
    line-height: 1.2;
  }
  .intro p {
    margin: 0;
    font-size: 14px;
    color: var(--muted-2);
    line-height: 1.55;
  }
  section {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }
  .eyebrow-row {
    display: flex;
    align-items: baseline;
    gap: 10px;
  }
  .eyebrow {
    font-size: 11px;
    letter-spacing: 0.07em;
    text-transform: uppercase;
    color: var(--faint);
    font-weight: 500;
  }
  .aside {
    font-size: 11.5px;
    color: var(--faint);
  }
  .upcoming {
    display: flex;
    gap: 14px;
    flex-wrap: wrap;
  }
  .dated {
    width: 320px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    padding: 14px 15px;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }
  .lane-row {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex: none;
  }
  .lane {
    font-size: 11px;
    color: var(--faint);
  }
  .star {
    margin-left: auto;
    display: flex;
    border: none;
    background: none;
    padding: 0;
    cursor: pointer;
  }
  .dated .title {
    font-family: var(--serif);
    font-size: 16.5px;
    line-height: 1.25;
  }
  .pips {
    display: flex;
    gap: 3px;
  }
  .pip {
    flex: 1;
    height: 4px;
    border-radius: 2px;
    background: #efe9dd;
  }
  .pip.filled {
    background: #d9cfbe;
  }
  .meta {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11.5px;
    color: var(--muted-2);
    flex-wrap: wrap;
  }
  .date {
    color: var(--ink-2);
  }
  .sep {
    color: #d6cdbe;
  }
  .columns {
    display: flex;
    gap: 32px;
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .column {
    flex: 1;
    min-width: 320px;
  }
  .list {
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-card);
    box-shadow: var(--shadow-card);
    overflow: hidden;
    max-height: 420px;
    overflow-y: auto;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 11px;
    padding: 12px 16px;
    border-top: 1px solid var(--divider);
    width: 100%;
    text-align: left;
  }
  .list > :global(*:first-child) {
    border-top: none;
  }
  /* Not chosen for the new set. Quiet, never crossed out. */
  .letting-go {
    opacity: 0.55;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }
  .row .title {
    font-size: 13.5px;
  }
  .context {
    font-size: 11.5px;
    color: var(--faint);
  }
  .keep {
    margin-left: auto;
    font: inherit;
    font-size: 11.5px;
    color: var(--muted-2);
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: var(--radius-pill);
    padding: 5px 13px;
    cursor: pointer;
    white-space: nowrap;
  }
  .keep.on {
    background: var(--cherry);
    border-color: var(--cherry);
    color: var(--paper);
  }
  .pick {
    font: inherit;
    background: none;
    border-left: none;
    border-right: none;
    border-bottom: none;
    cursor: pointer;
  }
  .pick:hover {
    background: var(--headfill);
  }
  .lane-head {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 10px 16px;
    background: var(--headfill);
    border-top: 1px solid var(--divider);
    font-family: var(--serif);
    font-size: 15px;
  }
  .none {
    margin: 0;
    padding: 14px 2px;
    font-size: 13px;
    color: var(--faint);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .primary {
    font: inherit;
    font-size: 13.5px;
    color: var(--paper);
    background: var(--ink);
    border: 1px solid var(--ink);
    border-radius: var(--radius-control);
    padding: 11px 22px;
    cursor: pointer;
  }
  .plain {
    font: inherit;
    font-size: 13px;
    color: var(--muted-2);
    background: none;
    border: none;
    cursor: pointer;
  }
</style>
