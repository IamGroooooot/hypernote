<script lang="ts">
  import type { PeerInfo, SyncStatus } from '../lib/contracts';

  export let open = false;
  export let state: SyncStatus['state'] = 'offline';
  export let peerCount = 0;
  export let inviteCode = '';
  export let peers: PeerInfo[] = [];
  export let onClose: () => void = () => {};
  export let onShareWorkspace: () => void = () => {};
  export let onExportCurrent: () => void = () => {};
  export let onExportWorkspace: () => void = () => {};
  export let onOpenPeers: () => void = () => {};
  export let onRefreshInvite: () => void = () => {};

  $: dotClass =
    state === 'error' ? 'error' : state === 'syncing' ? 'syncing' : state === 'connected' ? 'connected' : 'offline';

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="utility-hub-backdrop" on:click={handleBackdropClick}>
    <section class="utility-hub" aria-label="utility hub" role="dialog">
      <header>
        <div class="title-row">
          <span class={`status-dot ${dotClass}`}></span>
          <h2>Utility Hub</h2>
        </div>
        <button type="button" class="ghost" on:click={onClose}>close</button>
      </header>

      <div class="status-row">peers: {peerCount}</div>

      <div class="actions-grid">
        <button type="button" on:click={onShareWorkspace}>share workspace</button>
        <button type="button" on:click={onExportCurrent}>export current</button>
        <button type="button" on:click={onExportWorkspace}>export workspace</button>
        <button type="button" on:click={onOpenPeers}>trusted peers</button>
      </div>

      <div class="invite-card">
        <div class="invite-head">
          <span>invite code</span>
          <button type="button" class="ghost" on:click={onRefreshInvite}>refresh</button>
        </div>
        <code>{inviteCode}</code>
      </div>

      <div class="peer-list">
        <h3>active peers</h3>
        {#if peers.length === 0}
          <p>no active peers</p>
        {:else}
          <ul>
            {#each peers as peer}
              <li>
                <span>{peer.peerId.slice(0, 8)}</span>
                <span>{peer.status.toLowerCase()}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </section>
  </div>
{/if}

<style>
  .utility-hub-backdrop {
    position: fixed;
    inset: 0;
    background: var(--overlay-medium);
    backdrop-filter: blur(2px);
    z-index: 120;
  }

  .utility-hub {
    position: absolute;
    top: 56px;
    right: max(8px, env(safe-area-inset-right));
    left: auto;
    width: min(340px, calc(100vw - 16px));
    max-width: calc(100vw - 16px);
    border: var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface-elevated);
    box-shadow: var(--shadow-elevated);
    padding: 12px;
    display: grid;
    gap: 12px;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  h2 {
    margin: 0;
    font-size: 12px;
    color: var(--text-dim);
    letter-spacing: 0.08em;
  }

  .ghost {
    border: var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-dim);
    font: inherit;
    font-size: 11px;
    padding: 3px 8px;
  }

  .status-row {
    font-size: 12px;
    color: var(--text-dim);
  }

  .actions-grid {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .actions-grid button {
    border: var(--border);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 12px;
    padding: 8px;
    text-align: left;
  }

  .actions-grid button:hover,
  .ghost:hover {
    border-color: var(--accent-muted);
    color: var(--accent);
  }

  .invite-card {
    border: var(--border);
    border-radius: var(--radius-md);
    padding: 8px;
    display: grid;
    gap: 6px;
  }

  .invite-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    color: var(--text-dim);
  }

  code {
    display: inline-block;
    padding: 4px 6px;
    border-radius: var(--radius-sm);
    background: var(--surface-muted);
    color: var(--accent);
    font-size: 14px;
  }

  .peer-list h3 {
    margin: 0 0 6px;
    font-size: 11px;
    color: var(--text-dim);
    letter-spacing: 0.08em;
  }

  .peer-list p {
    margin: 0;
    color: var(--text-dim);
    font-size: 12px;
  }

  .peer-list ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 4px;
  }

  .peer-list li {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    border: var(--border);
    border-radius: var(--radius-sm);
    padding: 6px 8px;
  }

  .status-dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-round);
    display: inline-block;
    background: var(--text-dim);
  }

  .status-dot.connected {
    background: var(--accent);
  }

  .status-dot.syncing {
    background: var(--accent);
    animation: pulse 1.1s infinite;
  }

  .status-dot.error {
    background: var(--danger);
  }

  @keyframes pulse {
    0% {
      opacity: 0.35;
    }

    50% {
      opacity: 1;
    }

    100% {
      opacity: 0.35;
    }
  }

  @media (max-width: 800px) {
    .utility-hub {
      top: auto;
      right: max(8px, env(safe-area-inset-right));
      left: max(8px, env(safe-area-inset-left));
      bottom: 8px;
      width: auto;
      max-height: calc(100vh - 16px);
      overflow-y: auto;
    }
  }
</style>
