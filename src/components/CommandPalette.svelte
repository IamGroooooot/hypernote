<script lang="ts">
  import type { NoteMeta, PeerInfo } from '../lib/contracts';

  export let open = false;
  export let notes: NoteMeta[] = [];
  export let trashNotes: NoteMeta[] = [];
  export let peers: PeerInfo[] = [];
  export let selectedNoteId = '';
  export let onClose: () => void = () => {};
  export let onNewNote: () => void = () => {};
  export let onSelectNote: (noteId: string) => void = () => {};
  export let onDeleteNote: (noteId: string) => void = () => {};
  export let onRenameNote: (noteId: string, newTitle: string) => void = () => {};
  export let onRestoreNote: (noteId: string) => void = () => {};

  let query = '';
  let focusedIndex = 0;
  let renaming = false;
  let renameValue = '';
  let restoreMode = false;
  let inputEl: HTMLInputElement | undefined;
  let renameInputEl: HTMLInputElement | undefined;

  $: connectedPeers = peers.filter((p) => p.status === 'CONNECTED').length;

  $: actions = buildActions(selectedNoteId, connectedPeers, trashNotes.length);

  function buildActions(noteId: string, peerCount: number, trashCount: number) {
    const items: { label: string; shortcut?: string; action: string }[] = [
      { label: '◈ new note', shortcut: '⌘N', action: 'new-note' },
    ];
    if (noteId) {
      items.push({ label: '✎ rename note', action: 'rename' });
      items.push({ label: '⌦ delete note → trash', action: 'delete' });
    }
    if (trashCount > 0) {
      items.push({ label: `↩ restore from trash (${trashCount})`, action: 'restore-mode' });
    }
    items.push({
      label: `⊕ peers (${peerCount} connected)`,
      action: 'peers',
    });
    return items;
  }

  $: filteredNotes = filterNotes(notes, query);

  function filterNotes(allNotes: NoteMeta[], q: string): { note: NoteMeta; badge: string }[] {
    if (!q.trim()) {
      return allNotes.map((n) => ({ note: n, badge: '' }));
    }
    const lower = q.toLowerCase();

    const fuzzyMatches: { note: NoteMeta; badge: string }[] = [];
    const substringMatches: { note: NoteMeta; badge: string }[] = [];

    for (const n of allNotes) {
      const title = n.title.toLowerCase();
      if (fuzzyMatch(title, lower)) {
        fuzzyMatches.push({ note: n, badge: 'fuzzy' });
      } else if (title.includes(lower)) {
        substringMatches.push({ note: n, badge: 'substring' });
      }
    }

    if (fuzzyMatches.length > 0) return fuzzyMatches;
    if (substringMatches.length > 0) return substringMatches;

    // Body fallback (T-12)
    const bodyMatches: { note: NoteMeta; badge: string }[] = [];
    for (const n of allNotes) {
      const body = n.body?.toLowerCase() ?? '';
      if (body.includes(lower)) {
        bodyMatches.push({ note: n, badge: `본문 매치: ${q}` });
      }
    }
    return bodyMatches;
  }

  function fuzzyMatch(text: string, pattern: string): boolean {
    let ti = 0;
    for (let pi = 0; pi < pattern.length; pi++) {
      const found = text.indexOf(pattern[pi], ti);
      if (found === -1) return false;
      ti = found + 1;
    }
    return true;
  }

  $: totalItems = restoreMode
    ? trashNotes.length
    : actions.length + filteredNotes.length;

  $: if (focusedIndex >= totalItems) {
    focusedIndex = Math.max(0, totalItems - 1);
  }

  $: if (open) {
    query = '';
    focusedIndex = 0;
    renaming = false;
    renameValue = '';
    restoreMode = false;
    setTimeout(() => inputEl?.focus(), 0);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
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
      if (e.key === 'Enter') {
        e.preventDefault();
        if (renameValue.trim()) {
          onRenameNote(selectedNoteId, renameValue.trim());
        }
        renaming = false;
      }
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusedIndex = (focusedIndex + 1) % Math.max(1, totalItems);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusedIndex = (focusedIndex - 1 + Math.max(1, totalItems)) % Math.max(1, totalItems);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectItem(focusedIndex);
    }
  }

  function selectItem(index: number) {
    if (restoreMode) {
      const note = trashNotes[index];
      if (note) {
        onRestoreNote(note.id);
      }
      return;
    }

    if (index < actions.length) {
      const action = actions[index];
      switch (action.action) {
        case 'new-note':
          onNewNote();
          break;
        case 'rename':
          renaming = true;
          renameValue = notes.find((n) => n.id === selectedNoteId)?.title ?? '';
          setTimeout(() => {
            renameInputEl?.focus();
            renameInputEl?.select();
          }, 0);
          break;
        case 'delete':
          onDeleteNote(selectedNoteId);
          break;
        case 'restore-mode':
          restoreMode = true;
          focusedIndex = 0;
          break;
        case 'peers':
          // Informational only.
          break;
      }
    } else {
      const noteIndex = index - actions.length;
      const entry = filteredNotes[noteIndex];
      if (entry) {
        onSelectNote(entry.note.id);
      }
    }
  }

  function handleBackdropClick(e: MouseEvent) {
    if (e.target === e.currentTarget) {
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
          <input
            bind:this={renameInputEl}
            bind:value={renameValue}
            placeholder="New title..."
            type="text"
          />
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
            {#each trashNotes as note, i}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                class="palette-item"
                class:focused={focusedIndex === i}
                on:click={() => selectItem(i)}
              >
                <span>{note.title}</span>
                {#if note.deletedAt}
                  <span class="badge">{formatAge(note.deletedAt)}</span>
                {/if}
              </div>
            {/each}
          {/if}
        {:else if !renaming}
          <div class="palette-section-label">ACTIONS</div>
          {#each actions as action, i}
            <!-- svelte-ignore a11y-click-events-have-key-events -->
            <!-- svelte-ignore a11y-no-static-element-interactions -->
            <div
              class="palette-item"
              class:focused={focusedIndex === i}
              on:click={() => selectItem(i)}
            >
              <span>{action.label}</span>
              {#if action.shortcut}
                <span class="shortcut">{action.shortcut}</span>
              {/if}
            </div>
          {/each}

          {#if filteredNotes.length > 0}
            <div class="palette-section-label">NOTES</div>
            {#each filteredNotes as entry, i}
              <!-- svelte-ignore a11y-click-events-have-key-events -->
              <!-- svelte-ignore a11y-no-static-element-interactions -->
              <div
                class="palette-item"
                class:focused={focusedIndex === actions.length + i}
                on:click={() => selectItem(actions.length + i)}
              >
                <span>{entry.note.title}</span>
                {#if entry.badge}
                  <span class="badge">{entry.badge}</span>
                {/if}
              </div>
            {/each}
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
    background: rgba(10, 10, 15, 0.7);
    backdrop-filter: blur(4px);
    z-index: 100;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 80px;
  }

  .palette {
    width: 560px;
    max-height: 400px;
    background: var(--bg-surface);
    border: var(--border);
    border-radius: 12px;
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
    border: 1px solid rgba(0, 255, 204, 0.3);
    border-radius: 4px;
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
  }

  .palette-item:hover,
  .palette-item.focused {
    background: rgba(0, 255, 204, 0.08);
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
  }
</style>

