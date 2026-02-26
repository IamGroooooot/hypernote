<script lang="ts">
  import type { SyncStatus } from '../lib/contracts';

  export let state: SyncStatus['state'] = 'offline';
  export let peerCount = 0;

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
  <button type="button" aria-label="open command palette">⌘K</button>
  <span class={`status ${state}`}>{lanText}</span>
</header>
