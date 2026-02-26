<script lang="ts">
  import type { PeerInfo, SyncStatus } from '../lib/contracts';

  type JoinStatus = 'idle' | 'joining' | 'joined' | 'error';
  type ShareStatus = 'idle' | 'copied' | 'error';
  type JoinRequest = {
    peerId: string;
    addr: string;
    requestedAt: number;
  };

  export let open = false;
  export let state: SyncStatus['state'] = 'offline';
  export let runtimeRole = 'guest (web)';
  export let peerCount = 0;
  export let shareTarget = '';
  export let shareStatus: ShareStatus = 'idle';
  export let shareMessage = '';
  export let peers: PeerInfo[] = [];
  export let joinTarget = '';
  export let joinStatus: JoinStatus = 'idle';
  export let joinMessage = '';
  export let joinFocusNonce = 0;
  export let pendingJoinRequests: JoinRequest[] = [];
  export let peerDisplayNames: Record<string, string> = {};
  export let onClose: () => void = () => {};
  export let onShareWorkspace: () => void = () => {};
  export let onExportCurrent: () => void = () => {};
  export let onExportWorkspace: () => void = () => {};
  export let onOpenPeers: () => void = () => {};
  export let onJoinTargetChange: (value: string) => void = () => {};
  export let onJoinWorkspace: () => void = () => {};
  export let onRefreshShareTarget: () => void = () => {};
  export let onCopyShareTarget: () => void = () => {};
  export let onApproveJoin: (peerId: string) => void = () => {};
  export let onRejectJoin: (peerId: string) => void = () => {};
  export let onDisconnectPeer: (peerId: string) => void = () => {};

  let joinInputEl: HTMLInputElement | undefined;
  let previousJoinFocusNonce = 0;

  $: dotClass =
    state === 'error' ? 'error' : state === 'syncing' ? 'syncing' : state === 'connected' ? 'connected' : 'offline';
  $: runtimeRoleClass = runtimeRole.startsWith('host') ? 'host' : 'guest';

  $: if (open && joinFocusNonce > previousJoinFocusNonce) {
    previousJoinFocusNonce = joinFocusNonce;
    setTimeout(() => {
      joinInputEl?.focus();
      joinInputEl?.select();
    }, 0);
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function handleJoinTargetInput(event: Event) {
    const target = event.currentTarget as HTMLInputElement;
    onJoinTargetChange(target.value);
  }

  function handleJoinSubmit(event: Event) {
    event.preventDefault();
    onJoinWorkspace();
  }

  function isPeerConnected(status: string): boolean {
    return status.toUpperCase() === 'CONNECTED';
  }

  function peerLabel(peerId: string): string {
    return peerDisplayNames[peerId] ?? peerId.slice(0, 8);
  }
</script>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="utility-hub-backdrop" on:click={handleBackdropClick}>
    <div class="utility-hub" role="dialog" aria-modal="true" aria-labelledby="utility-hub-title">
      <header>
        <div class="title-row">
          <span class={`status-dot ${dotClass}`}></span>
          <h2 id="utility-hub-title">Utility Hub</h2>
        </div>
        <button type="button" class="ghost" on:click={onClose}>close</button>
      </header>

      <div class="status-row">
        <span class={`runtime-role ${runtimeRoleClass}`}>role: {runtimeRole}</span>
        <span>peers: {peerCount}</span>
      </div>

      <form class="join-form" on:submit={handleJoinSubmit}>
        <label for="join-workspace-target">join workspace</label>
        <div class="join-controls">
          <input
            id="join-workspace-target"
            bind:this={joinInputEl}
            type="text"
            placeholder="host:port or ws://host:port"
            value={joinTarget}
            on:input={handleJoinTargetInput}
            aria-invalid={joinStatus === 'error'}
          />
          <button type="submit" disabled={joinStatus === 'joining'}>
            {joinStatus === 'joining' ? 'joining…' : 'join'}
          </button>
        </div>
        <p class="join-feedback" class:error={joinStatus === 'error'} class:success={joinStatus === 'joined'}>
          {joinMessage}
        </p>
      </form>

      <div class="join-requests">
        <h3>pending join requests</h3>
        {#if pendingJoinRequests.length === 0}
          <p>no pending requests</p>
        {:else}
          <ul>
            {#each pendingJoinRequests as request}
              <li>
                <div class="join-request-info">
                  <span>{request.addr}</span>
                  <small>{peerLabel(request.peerId)}</small>
                </div>
                <div class="join-request-actions">
                  <button type="button" on:click={() => onApproveJoin(request.peerId)}>approve</button>
                  <button type="button" class="ghost danger" on:click={() => onRejectJoin(request.peerId)}
                    >reject</button
                  >
                </div>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

      <div class="actions-grid">
        <button type="button" on:click={onShareWorkspace}>share workspace</button>
        <button type="button" on:click={onExportCurrent}>export current</button>
        <button type="button" on:click={onExportWorkspace}>export workspace</button>
        <button type="button" on:click={onOpenPeers}>trusted peers</button>
      </div>

      <div class="share-card">
        <div class="share-head">
          <span>share target</span>
          <div class="share-actions">
            <button type="button" class="ghost" on:click={onRefreshShareTarget}>refresh</button>
            <button type="button" class="ghost" on:click={onCopyShareTarget} disabled={!shareTarget}>copy</button>
          </div>
        </div>
        <code>{shareTarget || 'unavailable'}</code>
        <p class="share-feedback" class:error={shareStatus === 'error'} class:success={shareStatus === 'copied'}>
          {shareMessage}
        </p>
      </div>

      <div class="peer-list">
        <h3>active peers</h3>
        {#if peers.length === 0}
          <p>no active peers</p>
        {:else}
          <ul>
            {#each peers as peer}
              <li>
                <div class="peer-entry">
                  {#if isPeerConnected(peer.status)}
                    <span class="peer-status-dot connected" aria-label="connected" title="connected"></span>
                    <span>{peerLabel(peer.peerId)}</span>
                  {:else}
                    <span>{peerLabel(peer.peerId)}</span>
                    <span>{peer.status.toLowerCase()}</span>
                  {/if}
                </div>
                {#if isPeerConnected(peer.status)}
                  <button type="button" class="ghost danger" on:click={() => onDisconnectPeer(peer.peerId)}
                    >disconnect</button
                  >
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    </div>
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

  .ghost:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .status-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    color: var(--text-dim);
  }

  .runtime-role {
    font-weight: 600;
    letter-spacing: 0.03em;
    text-transform: uppercase;
  }

  .runtime-role.host {
    color: var(--accent);
  }

  .runtime-role.guest {
    color: var(--text-dim);
  }

  .join-form {
    border: var(--border);
    border-radius: var(--radius-md);
    padding: 8px;
    display: grid;
    gap: 6px;
  }

  .join-form label {
    font-size: 11px;
    color: var(--text-dim);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .join-controls {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 6px;
    align-items: center;
  }

  .join-controls input {
    border: var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 12px;
    padding: 7px 8px;
    min-width: 0;
  }

  .join-controls input:focus {
    outline: none;
    border-color: var(--accent-muted);
  }

  .join-controls input[aria-invalid='true'] {
    border-color: var(--danger);
  }

  .join-controls button {
    border: var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 12px;
    padding: 7px 10px;
  }

  .join-controls button:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .join-controls button:hover:enabled {
    border-color: var(--accent-muted);
    color: var(--accent);
  }

  .join-feedback {
    margin: 0;
    min-height: 16px;
    font-size: 11px;
    color: var(--text-dim);
  }

  .join-feedback.error {
    color: var(--danger);
  }

  .join-feedback.success {
    color: var(--accent);
  }

  .actions-grid {
    display: grid;
    gap: 8px;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .join-requests {
    border: var(--border);
    border-radius: var(--radius-md);
    padding: 8px;
    display: grid;
    gap: 8px;
  }

  .join-requests h3 {
    margin: 0;
    font-size: 11px;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .join-requests p {
    margin: 0;
    font-size: 12px;
    color: var(--text-dim);
  }

  .join-requests ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }

  .join-requests li {
    border: var(--border);
    border-radius: var(--radius-sm);
    padding: 6px;
    display: grid;
    gap: 6px;
  }

  .join-request-info {
    display: grid;
    gap: 2px;
  }

  .join-request-info span {
    font-size: 12px;
    color: var(--text);
    word-break: break-all;
  }

  .join-request-info small {
    font-size: 10px;
    color: var(--text-dim);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .join-request-actions {
    display: inline-flex;
    gap: 6px;
  }

  .join-request-actions button {
    border: var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 11px;
    padding: 5px 8px;
  }

  .join-request-actions button:hover {
    border-color: var(--accent-muted);
    color: var(--accent);
  }

  .join-request-actions .danger:hover {
    border-color: var(--danger);
    color: var(--danger);
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

  .share-card {
    border: var(--border);
    border-radius: var(--radius-md);
    padding: 8px;
    display: grid;
    gap: 6px;
  }

  .share-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    color: var(--text-dim);
  }

  .share-actions {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .share-feedback {
    margin: 0;
    min-height: 16px;
    font-size: 11px;
    color: var(--text-dim);
  }

  .share-feedback.error {
    color: var(--danger);
  }

  .share-feedback.success {
    color: var(--accent);
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
    gap: 8px;
    font-size: 12px;
    border: var(--border);
    border-radius: var(--radius-sm);
    padding: 6px 8px;
  }

  .peer-entry {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .peer-status-dot {
    width: 8px;
    height: 8px;
    border-radius: var(--radius-round);
    display: inline-block;
  }

  .peer-status-dot.connected {
    background: var(--accent);
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
