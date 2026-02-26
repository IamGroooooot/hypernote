<script lang="ts">
  export let text = '';
  export let peerCount = 0;
  export let state: 'offline' | 'syncing' | 'connected' | 'error' = 'offline';

  $: lines = text.length === 0 ? 1 : text.split('\n').length;
  $: columns = text.length === 0 ? 1 : text.split('\n').at(-1)?.length ?? 1;
  $: syncToken = state === 'connected' ? 'synced' : state;
</script>

<footer class="bottom-bar">
  <span>Ln {lines} Col {columns} UTF-8</span>
  <span>CRDT: {syncToken} peers: {peerCount}</span>
</footer>
