<script lang="ts">
  import type { SyncStatus } from '../lib/contracts';

  export let state: SyncStatus['state'] = 'offline';
  export let peerCount = 0;
  export let compactDock = false;
  export let onOpenPalette: () => void = () => {};
  export let onToggleUtilityHub: () => void = () => {};

  $: dotClass =
    state === 'error' ? 'error' : state === 'syncing' ? 'syncing' : state === 'connected' ? 'connected' : 'offline';
</script>

<header class="top-bar">
  <h1>HYPERNOTE</h1>

  <button type="button" aria-label="open command palette" on:click={onOpenPalette}>⌘K</button>

  <div class={`utility-dock ${compactDock ? 'compact' : ''}`}>
    <span class={`status-dot ${dotClass}`} aria-hidden="true"></span>
    {#if !compactDock}
      <span class="peer-count">{peerCount} peers</span>
    {/if}
    <button type="button" class="dock-trigger" aria-label="open utility hub" on:click={onToggleUtilityHub}>⋯</button>
  </div>
</header>
