<script lang="ts">
  import { onMount } from 'svelte';

  import CommandPalette from './components/CommandPalette.svelte';
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
  import { isTauriEnv, TauriNoteContainerStore } from './lib/persistence/tauri-note-store';
  import { createPeerStatusStore } from './lib/stores/peer-status';
  import {
    applyLocalEdit,
    broadcastUpdate,
    getLocalPeerId,
    listPeers,
    onPeerConnected,
    onPeerDisconnected,
    onPeerUpdate,
    onWsMessage,
    sendToPeer,
    type PeerConnectedEvent,
    type WsMessageEvent,
  } from './lib/tauri-client';
  import {
    createHelloFrame,
    createUpdateFrame,
    decodeBinaryPayload,
    decodeFrameMessage,
    serializeFrame,
  } from './lib/sync/frame';

  const store = isTauriEnv() ? new TauriNoteContainerStore() : new BrowserNoteContainerStore();
  const persistence = new LocalNotePersistence(store);
  const peerStore = createPeerStatusStore();

  let notes: NoteMeta[] = [];
  let trashNotes: NoteMeta[] = [];
  let selectedId = '';
  let editorText = '';
  let paletteOpen = false;
  let peers: PeerInfo[] = [];
  let myPeerId = '';
  let sync: SyncStatus = {
    noteId: '',
    peerCount: 0,
    state: 'offline',
  };

  let bridge: TextareaYjsBridge | null = null;
  let cleanupBridge: (() => void) | null = null;
  let crdtSizeWarning = false;

  const CRDT_WARN_BYTES = 100 * 1024 * 1024; // 100 MB

  onMount(() => {
    void bootstrap();

    void getLocalPeerId().then((id) => {
      myPeerId = id;
    });

    function handleKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        void openPalette();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'n') {
        e.preventDefault();
        void createNote();
      }
    }
    window.addEventListener('keydown', handleKeydown);

    // Legacy: Tauri apply_peer_update command path (fallback / backward-compat).
    const stopPeerUpdateSubscription = onPeerUpdate((event) => {
      if (!bridge || event.noteId !== selectedId) {
        return;
      }

      peerStore.markSyncStarted(event.noteId);
      sync = peerStore.syncStatus(event.noteId);
      bridge.applyPeerUpdate(Uint8Array.from(event.update));
    });

    // WS peer lifecycle events.
    const stopPeerConnected = onPeerConnected((event) => {
      void handlePeerConnected(event);
    });
    const stopPeerDisconnected = onPeerDisconnected((event) => {
      peerStore.removePeer(event.peerId);
      peers = peerStore.peersForNote('');
      sync = peerStore.syncStatus(selectedId);
    });
    const stopWsMessage = onWsMessage((event) => {
      void handleWsMessage(event);
    });

    const refreshInterval = setInterval(() => {
      void refreshPeers();
    }, 5_000);

    return () => {
      window.removeEventListener('keydown', handleKeydown);
      stopPeerUpdateSubscription();
      stopPeerConnected();
      stopPeerDisconnected();
      stopWsMessage();
      clearInterval(refreshInterval);
      releaseBridge();
    };
  });

  async function openPalette(): Promise<void> {
    trashNotes = await persistence.listTrashMetadata();
    paletteOpen = true;
  }

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
    void persistence.sweepTrash(); // T-18: evict trash entries older than 30 days
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

    // Broadcast delta to all connected WS peers (T-03, T-09).
    if (myPeerId) {
      const frame = createUpdateFrame(selectedId, myPeerId, update);
      void broadcastUpdate(serializeFrame(frame));
    }
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
      body: event.text.slice(0, 500),
      updatedAt: Date.now(),
    };

    notes = sortNotes(notes.map((note) => (note.id === selectedId ? nextMeta : note)));

    const yjsState = bridge.encodeStateAsUpdate();
    crdtSizeWarning = yjsState.length > CRDT_WARN_BYTES;

    persistence.scheduleSave({
      meta: nextMeta,
      yjsState,
    });

    if (event.source === 'remote') {
      peerStore.markSyncCompleted(selectedId);
      sync = peerStore.syncStatus(selectedId);
    }
  }

  async function handlePeerConnected(event: PeerConnectedEvent): Promise<void> {
    peerStore.upsertPeer({
      peerId: event.peerId,
      wsUrl: `ws://${event.addr}`,
      status: 'CONNECTED',
      noteIds: [],
    });
    peers = peerStore.peersForNote('');
    sync = peerStore.syncStatus(selectedId);

    if (!selectedId || !bridge || !myPeerId) return;

    // Exchange hello + full state for the currently open note.
    const helloFrame = createHelloFrame('', myPeerId, [selectedId]);
    await sendToPeer(event.peerId, serializeFrame(helloFrame));

    const fullState = bridge.encodeStateAsUpdate();
    const updateFrame = createUpdateFrame(selectedId, myPeerId, fullState);
    await sendToPeer(event.peerId, serializeFrame(updateFrame));
  }

  async function handleWsMessage(event: WsMessageEvent): Promise<void> {
    const result = decodeFrameMessage(event.payload);
    if (!result.ok) return;

    const { frame } = result;

    if (frame.type === 'hello') {
      const payload = frame.payload as { openNoteIds: string[] };
      peerStore.setPeerNoteIds(event.peerId, payload.openNoteIds);
      sync = peerStore.syncStatus(selectedId);

      // Respond with our full state for any note the peer has open.
      if (bridge && myPeerId && payload.openNoteIds.includes(selectedId)) {
        const fullState = bridge.encodeStateAsUpdate();
        const updateFrame = createUpdateFrame(selectedId, myPeerId, fullState);
        await sendToPeer(event.peerId, serializeFrame(updateFrame));
      }
    }

    if (frame.type === 'update' && frame.noteId === selectedId && bridge) {
      const bytes = decodeBinaryPayload(frame.payload as { bytes: number[] });
      peerStore.markSyncStarted(selectedId);
      sync = peerStore.syncStatus(selectedId);
      bridge.applyPeerUpdate(bytes);
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

    peers = peerStore.peersForNote('');
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

  async function handleDeleteNote(noteId: string): Promise<void> {
    await persistence.moveToTrash(noteId);
    notes = notes.filter((n) => n.id !== noteId);
    paletteOpen = false;
    if (selectedId === noteId) {
      if (notes.length > 0) {
        await selectNote(notes[0].id);
      } else {
        await createNote();
      }
    }
  }

  async function handleRestoreNote(noteId: string): Promise<void> {
    await persistence.restoreFromTrash(noteId);
    notes = sortNotes(await persistence.listMetadata());
    trashNotes = await persistence.listTrashMetadata();
    paletteOpen = false;
    await selectNote(noteId);
  }

  async function handleRenameNote(noteId: string, newTitle: string): Promise<void> {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    const updated = { ...note, title: newTitle, updatedAt: Date.now() };
    notes = sortNotes(notes.map((n) => (n.id === noteId ? updated : n)));
    paletteOpen = false;
  }
</script>

<div class="app-shell">
  <TopBar
    state={sync.state}
    peerCount={sync.peerCount}
    onOpenPalette={() => {
      void openPalette();
    }}
  />

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
      crdtSizeWarning={crdtSizeWarning}
      onInput={(nextValue) => {
        void handleEditorInput(nextValue);
      }}
    />
  </main>

  <StatusBar text={editorText} peerCount={sync.peerCount} state={sync.state} />
</div>

<CommandPalette
  open={paletteOpen}
  notes={notes}
  trashNotes={trashNotes}
  peers={peers}
  selectedNoteId={selectedId}
  onClose={() => {
    paletteOpen = false;
  }}
  onNewNote={() => {
    void createNote();
    paletteOpen = false;
  }}
  onSelectNote={(noteId) => {
    void selectNote(noteId);
    paletteOpen = false;
  }}
  onDeleteNote={(noteId) => {
    void handleDeleteNote(noteId);
  }}
  onRenameNote={(noteId, newTitle) => {
    void handleRenameNote(noteId, newTitle);
  }}
  onRestoreNote={(noteId) => {
    void handleRestoreNote(noteId);
  }}
/>
