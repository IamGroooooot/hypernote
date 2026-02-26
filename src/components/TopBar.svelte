<script lang="ts">
  import type { SyncStatus } from '../lib/contracts';
  import { formatModShortcut } from '../lib/ui/actions';

  export let state: SyncStatus['state'] = 'offline';
  export let peerCount = 0;
  export let compactDock = false;
  export let tocOpen = false;
  export let onOpenPalette: () => void = () => {};
  export let onToggleToc: () => void = () => {};
  export let onToggleUtilityHub: () => void = () => {};
  const OPEN_PALETTE_SHORTCUT = formatModShortcut('K');

  $: dotClass =
    state === 'error' ? 'error' : state === 'syncing' ? 'syncing' : state === 'connected' ? 'connected' : 'offline';
</script>

<header class="top-bar">
  <h1>HYPERNOTE</h1>

  <button type="button" aria-label="open command palette" on:click={onOpenPalette}
    >{OPEN_PALETTE_SHORTCUT}</button
  >

  <div class={`utility-dock ${compactDock ? 'compact' : ''}`}>
    <span class={`status-dot ${dotClass}`} aria-hidden="true"></span>
    {#if !compactDock}
      <span class="peer-count">{peerCount} peers</span>
    {/if}
    <button
      type="button"
      class="dock-toc"
      class:active={tocOpen}
      aria-label="toggle table of contents"
      on:click={onToggleToc}
    >
      toc
    </button>
    <button type="button" class="dock-trigger" aria-label="open utility hub" on:click={onToggleUtilityHub}>⋯</button>
  </div>
</header>
