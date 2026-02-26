<script lang="ts">
  export let open = false;
  export let onClose: () => void = () => {};
  export let onOpenNotes: () => void = () => {};
  export let onOpenToc: () => void = () => {};
  export let onJoinWorkspace: () => void = () => {};
  export let onShareWorkspace: () => void = () => {};
  export let onExportCurrent: () => void = () => {};
  export let onExportWorkspace: () => void = () => {};
  export let onShowGestureHelp: () => void = () => {};

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }
</script>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="mobile-action-backdrop" on:click={handleBackdropClick}>
    <div class="mobile-action-sheet" role="dialog" aria-modal="true" aria-labelledby="mobile-actions-title">
      <header>
        <h2 id="mobile-actions-title">Actions</h2>
        <button type="button" on:click={onClose}>close</button>
      </header>

      <button type="button" on:click={onOpenNotes}>open notes</button>
      <button type="button" on:click={onOpenToc}>open table of contents</button>
      <button type="button" on:click={onJoinWorkspace}>join workspace</button>
      <button type="button" on:click={onShareWorkspace}>share workspace</button>
      <button type="button" on:click={onExportCurrent}>export current note</button>
      <button type="button" on:click={onExportWorkspace}>export workspace</button>
      <button type="button" on:click={onShowGestureHelp}>gesture help</button>
    </div>
  </div>
{/if}

<style>
  .mobile-action-backdrop {
    position: fixed;
    inset: 0;
    background: var(--overlay-medium);
    z-index: 140;
    display: flex;
    align-items: flex-end;
    justify-content: stretch;
  }

  .mobile-action-sheet {
    width: 100%;
    border-top: var(--border);
    border-left: var(--border);
    border-right: var(--border);
    border-top-left-radius: var(--radius-lg);
    border-top-right-radius: var(--radius-lg);
    background: var(--surface-elevated);
    padding: 12px;
    display: grid;
    gap: 8px;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 4px;
  }

  h2 {
    margin: 0;
    font-size: 12px;
    color: var(--text-dim);
    letter-spacing: 0.08em;
  }

  button {
    border: var(--border);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text);
    padding: 10px 12px;
    font: inherit;
    text-align: left;
  }

  button:hover {
    border-color: var(--accent-muted);
    color: var(--accent);
  }
</style>
