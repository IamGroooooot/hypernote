<script lang="ts">
  import type { SyncStatus } from '../lib/contracts';

  export let state: SyncStatus['state'] = 'offline';
  export let peerCount = 0;
  export let onOpenPalette: () => void = () => {};

  $: lanText =
    state === 'error'
      ? 'LAN: ERR'
      : state === 'offline'
        ? 'LAN: offline'
        : state === 'syncing'
          ? `LAN: ${peerCount}● syncing`
          : `LAN: ${peerCount}●`;
</script>

<header class="top-bar">
  <h1>HYPERNOTE</h1>
  <button type="button" aria-label="open command palette" on:click={onOpenPalette}>⌘K</button>
  <span class={`status ${state}`}>{lanText}</span>
</header>
