<script lang="ts">
  import type { NoteMeta, PeerInfo } from '../lib/contracts';
  import {
    PALETTE_ACTIONS,
    filterActionByContext,
    matchesActionQuery,
    type PaletteActionDescriptor,
    type PaletteActionId,
  } from '../lib/ui/actions';

  export let open = false;
  export let notes: NoteMeta[] = [];
  export let trashNotes: NoteMeta[] = [];
  export let peers: PeerInfo[] = [];
  export let selectedNoteId = '';
  export let forceMode: 'none' | 'restore' | 'rename' = 'none';
  export let modeNonce = 0;
  export let onClose: () => void = () => {};
  export let onNewNote: () => void = () => {};
  export let onSelectNote: (noteId: string) => void = () => {};
  export let onDeleteNote: (noteId: string) => void = () => {};
  export let onRenameNote: (noteId: string, newTitle: string) => void = () => {};
  export let onRestoreNote: (noteId: string) => void = () => {};
  export let onOpenPeers: () => void = () => {};
  export let onToggleToc: () => void = () => {};
  export let onShareWorkspace: () => void = () => {};
  export let onExportCurrent: () => void = () => {};
  export let onExportWorkspace: () => void = () => {};

  let query = '';
  let focusedIndex = 0;
  let renaming = false;
  let renameValue = '';
  let renameNoteId = '';
  let restoreMode = false;
  let wasOpen = false;
  let inputEl: HTMLInputElement | undefined;
  let renameInputEl: HTMLInputElement | undefined;

  $: connectedPeers = peers.filter((p) => p.status === 'CONNECTED').length;

  $: actions = PALETTE_ACTIONS.map((action) =>
    filterActionByContext(action, {
      hasSelectedNote: selectedNoteId.length > 0,
      trashCount: trashNotes.length,
      connectedPeers,
    }),
  ).filter(Boolean) as PaletteActionDescriptor[];

  $: filteredActions = actions.filter((action) => matchesActionQuery(action, query));
  $: filteredNotes = filterNotes(notes, query);

  $: totalItems = restoreMode ? trashNotes.length : filteredActions.length + filteredNotes.length;

  $: if (focusedIndex >= totalItems) {
    focusedIndex = Math.max(0, totalItems - 1);
  }

  $: if (open && !wasOpen) {
    query = '';
    focusedIndex = 0;
    renaming = false;
    renameValue = '';
    renameNoteId = '';
    restoreMode = false;
    setTimeout(() => inputEl?.focus(), 0);
  }

  $: wasOpen = open;

  $: if (open && modeNonce > 0) {
    if (forceMode === 'restore') {
      restoreMode = true;
      renaming = false;
      focusedIndex = 0;
    }

    if (forceMode === 'rename' && selectedNoteId) {
      startRenameMode();
    }
  }

  function filterNotes(allNotes: NoteMeta[], q: string): { note: NoteMeta; badge: string }[] {
    if (!q.trim()) {
      return allNotes.map((n) => ({ note: n, badge: '' }));
    }
    const lower = q.toLowerCase();

    const fuzzyMatches: { note: NoteMeta; badge: string }[] = [];
    const substringMatches: { note: NoteMeta; badge: string }[] = [];

    for (const note of allNotes) {
      const title = note.title.toLowerCase();
      if (fuzzyMatch(title, lower)) {
        fuzzyMatches.push({ note, badge: 'fuzzy' });
      } else if (title.includes(lower)) {
        substringMatches.push({ note, badge: 'substring' });
      }
    }

    if (fuzzyMatches.length > 0) return fuzzyMatches;
    if (substringMatches.length > 0) return substringMatches;

    const bodyMatches: { note: NoteMeta; badge: string }[] = [];
    for (const note of allNotes) {
      const body = note.body?.toLowerCase() ?? '';
      if (body.includes(lower)) {
        bodyMatches.push({ note, badge: `본문 매치: ${q}` });
      }
    }

    return bodyMatches;
  }

  function fuzzyMatch(text: string, pattern: string): boolean {
    let textIndex = 0;
    for (let patternIndex = 0; patternIndex < pattern.length; patternIndex++) {
      const found = text.indexOf(pattern[patternIndex], textIndex);
      if (found === -1) return false;
      textIndex = found + 1;
    }
    return true;
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (renaming) {
        renaming = false;
      } else if (restoreMode) {
        restoreMode = false;
        focusedIndex = 0;
      } else {
        onClose();
      }
      return;
    }

    if (renaming) {
      if (event.key === 'Enter') {
        event.preventDefault();
        if (renameValue.trim() && renameNoteId) {
          onRenameNote(renameNoteId, renameValue.trim());
        }
        onClose();
      }
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusedIndex = (focusedIndex + 1) % Math.max(1, totalItems);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusedIndex = (focusedIndex - 1 + Math.max(1, totalItems)) % Math.max(1, totalItems);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      selectItem(focusedIndex);
    }
  }

  function selectItem(index: number) {
    if (restoreMode) {
      const note = trashNotes[index];
      if (note) {
        onRestoreNote(note.id);
        onClose();
      }
      return;
    }

    if (index < filteredActions.length) {
      const action = filteredActions[index];
      if (action) {
        executeAction(action.id);
      }
      return;
    }

    const noteIndex = index - filteredActions.length;
    const entry = filteredNotes[noteIndex];
    if (entry) {
      onSelectNote(entry.note.id);
      onClose();
    }
  }

  function executeAction(actionId: PaletteActionId) {
    switch (actionId) {
      case 'new-note':
        onNewNote();
        onClose();
        break;
      case 'toc':
        onToggleToc();
        onClose();
        break;
      case 'rename':
        startRenameMode();
        break;
      case 'delete':
        if (selectedNoteId) {
          onDeleteNote(selectedNoteId);
        }
        onClose();
        break;
      case 'restore-mode':
        restoreMode = true;
        query = '';
        focusedIndex = 0;
        break;
      case 'peers':
        onOpenPeers();
        onClose();
        break;
      case 'share-workspace':
        onShareWorkspace();
        onClose();
        break;
      case 'export-current':
        onExportCurrent();
        onClose();
        break;
      case 'export-workspace':
        onExportWorkspace();
        onClose();
        break;
      default:
        break;
    }
  }

  function startRenameMode() {
    const targetId = selectedNoteId || notes[0]?.id || '';
    if (!targetId) {
      return;
    }

    renaming = true;
    restoreMode = false;
    renameNoteId = targetId;
    renameValue = notes.find((note) => note.id === targetId)?.title ?? '';

    setTimeout(() => {
      renameInputEl?.focus();
      renameInputEl?.select();
    }, 0);
  }

  function handleBackdropClick(event: MouseEvent) {
    if (event.target === event.currentTarget) {
      onClose();
    }
  }

  function formatAge(deletedAt: number): string {
    const days = Math.floor((Date.now() - deletedAt) / (1000 * 60 * 60 * 24));
    if (days === 0) return 'today';
    if (days === 1) return '1d ago';
    return `${days}d ago`;
  }
</script>

{#if open}
  <!-- svelte-ignore a11y-click-events-have-key-events -->
  <!-- svelte-ignore a11y-no-static-element-interactions -->
  <div class="palette-backdrop" on:click={handleBackdropClick} on:keydown={handleKeydown}>
    <div class="palette">
      <div class="palette-input">
        <span class="palette-input-icon">⌘</span>
        {#if renaming}
          <input bind:this={renameInputEl} bind:value={renameValue} placeholder="New title..." type="text" />
        {:else}
          <input
            bind:this={inputEl}
            bind:value={query}
            placeholder={restoreMode ? 'Select note to restore...' : 'Search notes and actions...'}
            type="text"
          />
        {/if}
        {#if restoreMode}
          <span class="palette-mode-label">TRASH</span>
        {/if}
      </div>

      <div class="palette-results">
        {#if restoreMode}
          <div class="palette-section-label">RESTORE FROM TRASH</div>
          {#if trashNotes.length === 0}
            <div class="palette-empty">Trash is empty</div>
          {:else}
            {#each trashNotes as note, index}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div class="palette-item" class:focused={focusedIndex === index} on:click={() => selectItem(index)}>
                <span>{note.title}</span>
                {#if note.deletedAt}
                  <span class="badge">{formatAge(note.deletedAt)}</span>
                {/if}
              </div>
            {/each}
          {/if}
        {:else if !renaming}
          {#if filteredActions.length > 0}
            <div class="palette-section-label">ACTIONS</div>
            {#each filteredActions as action, index}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <button
                type="button"
                class="palette-item"
                class:focused={focusedIndex === index}
                on:click={() => executeAction(action.id)}
              >
                <span>{action.label}</span>
                <span class="shortcut">{action.shortcut}</span>
              </button>
            {/each}
          {/if}

          {#if filteredNotes.length > 0}
            <div class="palette-section-label">NOTES</div>
            {#each filteredNotes as entry, index}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                class="palette-item"
                class:focused={focusedIndex === filteredActions.length + index}
                on:click={() => selectItem(filteredActions.length + index)}
              >
                <span>{entry.note.title}</span>
                {#if entry.badge}
                  <span class="badge">{entry.badge}</span>
                {/if}
              </div>
            {/each}
          {/if}

          {#if filteredActions.length === 0 && filteredNotes.length === 0}
            <div class="palette-empty">No matching actions or notes</div>
          {/if}
        {:else}
          <div class="palette-section-label">RENAME NOTE</div>
          <div class="palette-item focused">
            <span>Press Enter to confirm, Escape to cancel</span>
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .palette-backdrop {
    position: fixed;
    inset: 0;
    background: var(--overlay-strong);
    backdrop-filter: blur(4px);
    z-index: 100;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 80px;
  }

  .palette {
    width: min(560px, calc(100vw - 20px));
    max-height: min(440px, calc(100vh - 96px));
    background: var(--bg-surface);
    border: var(--border);
    border-radius: var(--radius-lg);
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .palette-input {
    padding: 12px 16px;
    border-bottom: var(--border);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .palette-input-icon {
    color: var(--text-dim);
    font-size: 14px;
  }

  .palette-input input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text);
    font: inherit;
    font-size: 14px;
  }

  .palette-mode-label {
    font-size: 10px;
    color: var(--accent);
    letter-spacing: 0.1em;
    padding: 2px 6px;
    border: var(--border-accent);
    border-radius: var(--radius-xs);
  }

  .palette-results {
    overflow-y: auto;
    flex: 1;
  }

  .palette-section-label {
    padding: 8px 16px 4px;
    font-size: 10px;
    color: var(--text-dim);
    letter-spacing: 0.1em;
  }

  .palette-empty {
    padding: 12px 16px;
    font-size: 13px;
    color: var(--text-dim);
  }

  .palette-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    cursor: pointer;
    gap: 8px;
    font-size: 13px;
    width: 100%;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    text-align: left;
  }

  .palette-item:hover,
  .palette-item.focused {
    background: var(--accent-subtle);
    color: var(--accent);
  }

  .palette-item .badge {
    font-size: 10px;
    color: var(--text-dim);
    flex-shrink: 0;
  }

  .palette-item .shortcut {
    font-size: 11px;
    color: var(--text-dim);
    flex-shrink: 0;
  }
</style>
