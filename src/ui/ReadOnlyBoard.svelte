<script lang="ts">
  /**
   * A board you can only look at. Sets read-only for its own subtree, so the fixture
   * views cannot offer edits that would act on ids the live state has never heard of.
   */
  import type { BoardModel } from '../domain/board'
  import Board from './Board.svelte'
  import { setReadOnly, setBoardActions, readOnlyActions } from './actions'

  let { board }: { board: BoardModel } = $props()

  setReadOnly(true)
  setBoardActions(readOnlyActions)
</script>

<Board {board} />
