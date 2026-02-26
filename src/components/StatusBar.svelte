<script lang="ts">
  export let text = '';
  export let peerCount = 0;
  export let state: 'offline' | 'syncing' | 'connected' | 'error' = 'offline';
  export let trashNotes: Array<{ id: string; title: string }> = [];
  export let trashOpen = false;
  export let onToggleTrash: () => void = () => {};
  export let onCloseTrash: () => void = () => {};
  export let onRestoreTrash: (noteId: string) => void = () => {};

  $: lines = text.length === 0 ? 1 : text.split('\n').length;
  $: columns = text.length === 0 ? 1 : text.split('\n').at(-1)?.length ?? 1;
  $: syncToken = state === 'connected' ? 'synced' : state;
  $: trashPreview = trashNotes.slice(0, 8);
  $: trashCount = Math.min(trashNotes.length, 99);
</script>

<footer class="bottom-bar">
  <span>Ln {lines} Col {columns} UTF-8</span>
  <div class="status-tools">
    <span>CRDT: {syncToken} peers: {peerCount}</span>
    <div class="trash-menu">
      {#if trashOpen}
        <div class="trash-menu-panel" role="dialog" aria-label="trash restore panel">
          <div class="trash-menu-header">
            <span>trash</span>
            <button type="button" class="ghost" on:click={onCloseTrash}>close</button>
          </div>
          {#if trashPreview.length === 0}
            <p>trash is empty</p>
          {:else}
            <ul>
              {#each trashPreview as note}
                <li>
                  <button type="button" class="trash-menu-item" on:click={() => onRestoreTrash(note.id)}>
                    {note.title}
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      {/if}
      <button type="button" class="trash-menu-trigger" aria-label="open trash restore panel" on:click={onToggleTrash}>
        <span>trash</span>
        {#if trashNotes.length > 0}
          <span class="trash-menu-count">{trashCount}</span>
        {/if}
      </button>
    </div>
  </div>
</footer>

<style>
  .status-tools {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .trash-menu {
    position: relative;
  }

  .trash-menu-trigger {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    border: var(--border);
    border-radius: var(--radius-round);
    background: transparent;
    color: var(--text-dim);
    font: inherit;
    font-size: 11px;
    letter-spacing: 0.04em;
    text-transform: lowercase;
    min-height: 22px;
    padding: 2px 7px;
  }

  .trash-menu-trigger:hover {
    border-color: var(--accent-muted);
    color: var(--accent);
  }

  .trash-menu-count {
    min-width: 14px;
    height: 14px;
    border-radius: var(--radius-round);
    border: var(--border);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--accent);
    font-size: 9px;
    line-height: 1;
    padding: 0 2px;
    font-weight: 600;
  }

  .trash-menu-panel {
    position: absolute;
    right: 0;
    bottom: calc(100% + 6px);
    width: min(230px, calc(100vw - 24px));
    max-height: 240px;
    overflow: auto;
    border: var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-elevated);
    box-shadow: var(--shadow-elevated);
    padding: 8px;
    display: grid;
    gap: 6px;
    z-index: 160;
  }

  .trash-menu-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    color: var(--text-dim);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .trash-menu-header button {
    border: var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text-dim);
    font: inherit;
    font-size: 10px;
    padding: 3px 6px;
  }

  .trash-menu-panel p {
    margin: 0;
    color: var(--text-dim);
    font-size: 12px;
  }

  .trash-menu-panel ul {
    margin: 0;
    padding: 0;
    list-style: none;
    display: grid;
    gap: 4px;
  }

  .trash-menu-item {
    width: 100%;
    text-align: left;
    border: var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--text);
    font: inherit;
    font-size: 12px;
    padding: 6px 7px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trash-menu-item:hover {
    border-color: var(--accent-muted);
    color: var(--accent);
  }
</style>
