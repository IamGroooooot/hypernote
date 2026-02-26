<script lang="ts">
  import { onMount } from 'svelte';

  import EditorPanel from './components/EditorPanel.svelte';
  import NoteSidebar from './components/NoteSidebar.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import TopBar from './components/TopBar.svelte';
  import type { NoteMeta, PeerInfo, SyncStatus } from './lib/contracts';
  import {
    createTextareaYjsBridge,
    type TextChangeEvent,
    type TextareaYjsBridge,
  } from './lib/editor/textarea-yjs-bridge';
  import { BrowserNoteContainerStore } from './lib/persistence/browser-note-store';
  import { LocalNotePersistence } from './lib/persistence/local-note-persistence';
  import { createPeerStatusStore } from './lib/stores/peer-status';
  import { applyLocalEdit, listPeers, onPeerUpdate } from './lib/tauri-client';

  const persistence = new LocalNotePersistence(new BrowserNoteContainerStore());
  const peerStore = createPeerStatusStore();

  let notes: NoteMeta[] = [];
  let selectedId = '';
  let editorText = '';
  let sync: SyncStatus = {
    noteId: '',
    peerCount: 0,
    state: 'offline',
  };

  let bridge: TextareaYjsBridge | null = null;
  let cleanupBridge: (() => void) | null = null;

  onMount(() => {
    void bootstrap();

    const stopPeerUpdateSubscription = onPeerUpdate((event) => {
      if (!bridge || event.noteId !== selectedId) {
        return;
      }

      peerStore.markSyncStarted(event.noteId);
      sync = peerStore.syncStatus(event.noteId);

      bridge.applyPeerUpdate(Uint8Array.from(event.update));
    });

    const refreshInterval = setInterval(() => {
      void refreshPeers();
    }, 5_000);

    return () => {
      stopPeerUpdateSubscription();
      clearInterval(refreshInterval);
      releaseBridge();
    };
  });

  function makeNoteMeta(id: string): NoteMeta {
    const now = Date.now();

    return {
      id,
      title: 'Untitled',
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    };
  }

  async function bootstrap(): Promise<void> {
    notes = sortNotes(await persistence.listMetadata());

    if (notes.length === 0) {
      await createNote();
    }

    if (notes.length > 0) {
      await selectNote(notes[0].id);
    }

    await refreshPeers();
  }

  async function createNote(): Promise<void> {
    const meta = makeNoteMeta(createNoteId());

    notes = sortNotes([meta, ...notes]);

    const initialBridge = createTextareaYjsBridge(meta.id);
    await persistence.saveNow({
      meta,
      yjsState: initialBridge.encodeStateAsUpdate(),
    });
    initialBridge.destroy();

    await selectNote(meta.id);
  }

  async function selectNote(noteId: string): Promise<void> {
    selectedId = noteId;
    peerStore.setActiveNote(noteId);

    const snapshot = await persistence.open(noteId);

    releaseBridge();
    bridge = createTextareaYjsBridge(noteId, { initialUpdate: snapshot.yjsState });
    cleanupBridge = bridge.onChange((event) => {
      void handleBridgeChange(event);
    });

    editorText = bridge.getText();
    sync = peerStore.syncStatus(noteId);
  }

  function releaseBridge(): void {
    cleanupBridge?.();
    cleanupBridge = null;

    bridge?.destroy();
    bridge = null;
  }

  async function handleEditorInput(nextValue: string): Promise<void> {
    if (!bridge || selectedId.length === 0) {
      return;
    }

    const update = bridge.setText(nextValue);

    if (!update) {
      return;
    }

    peerStore.markSyncStarted(selectedId);
    sync = peerStore.syncStatus(selectedId);

    const applied = await applyLocalEdit(selectedId, update);
    if (applied) {
      peerStore.markSyncCompleted(selectedId);
    } else {
      peerStore.markSyncError(selectedId, 'failed to apply local edit');
    }

    sync = peerStore.syncStatus(selectedId);
  }

  async function handleBridgeChange(event: TextChangeEvent): Promise<void> {
    editorText = event.text;

    if (!bridge || selectedId.length === 0) {
      return;
    }

    const currentMeta = notes.find((note) => note.id === selectedId);

    if (!currentMeta) {
      return;
    }

    const nextMeta: NoteMeta = {
      ...currentMeta,
      title: titleFromText(event.text),
      updatedAt: Date.now(),
    };

    notes = sortNotes(notes.map((note) => (note.id === selectedId ? nextMeta : note)));

    persistence.scheduleSave({
      meta: nextMeta,
      yjsState: bridge.encodeStateAsUpdate(),
    });

    if (event.source === 'remote') {
      peerStore.markSyncCompleted(selectedId);
      sync = peerStore.syncStatus(selectedId);
    }
  }

  async function refreshPeers(): Promise<void> {
    const peers = await listPeers();
    syncPeers(peers);
    sync = peerStore.syncStatus(selectedId);
  }

  function syncPeers(nextPeers: PeerInfo[]): void {
    const nextById = new Map(nextPeers.map((peer) => [peer.peerId, peer]));

    for (const peer of nextPeers) {
      peerStore.upsertPeer(peer);
    }

    for (const existingPeer of peerStore.peersForNote('')) {
      if (!nextById.has(existingPeer.peerId)) {
        peerStore.removePeer(existingPeer.peerId);
      }
    }
  }

  function titleFromText(text: string): string {
    const title = text.split('\n')[0]?.trim() ?? '';
    return title.length > 0 ? title.slice(0, 200) : 'Untitled';
  }

  function sortNotes(value: NoteMeta[]): NoteMeta[] {
    return [...value].sort((left, right) => right.updatedAt - left.updatedAt);
  }

  function createNoteId(): string {
    const random = Math.random().toString(36).slice(2, 12);
    return `note-${Date.now()}-${random}`;
  }
</script>

<div class="app-shell">
  <TopBar state={sync.state} peerCount={sync.peerCount} />

  <main class="content">
    <NoteSidebar
      notes={notes}
      selectedId={selectedId}
      onSelect={(noteId) => {
        void selectNote(noteId);
      }}
    />

    <EditorPanel
      title={notes.find((note) => note.id === selectedId)?.title ?? 'Untitled'}
      value={editorText}
      onInput={(nextValue) => {
        void handleEditorInput(nextValue);
      }}
    />
  </main>

  <StatusBar text={editorText} peerCount={sync.peerCount} state={sync.state} />
</div>
