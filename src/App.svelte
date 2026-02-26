<script lang="ts">
  import type { NoteMeta, SyncStatus } from './lib/contracts';

  const notes: NoteMeta[] = [
    {
      id: 'today',
      title: 'today',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: null,
    },
    {
      id: 'meeting',
      title: 'meeting',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      deletedAt: null,
    },
  ];

  let selectedNote = notes[0]?.id ?? '';

  const sync: SyncStatus = {
    noteId: selectedNote,
    peerCount: 0,
    state: 'offline',
  };
</script>

<div class="app-shell">
  <header class="top-bar">
    <h1>HYPERNOTE</h1>
    <button type="button">⌘K</button>
    <span class="status">LAN: {sync.state}</span>
  </header>

  <main class="content">
    <aside class="note-list">
      <h2>NOTES</h2>
      {#each notes as note}
        <button
          class:selected={note.id === selectedNote}
          on:click={() => {
            selectedNote = note.id;
          }}
        >
          {note.title}
        </button>
      {/each}
    </aside>

    <section class="editor-panel">
      <h2>{selectedNote}</h2>
      <textarea placeholder="Type fast. Persist in 500ms."></textarea>
    </section>
  </main>

  <footer class="bottom-bar">CRDT: idle | peers: {sync.peerCount}</footer>
</div>
