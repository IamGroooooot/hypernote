<script lang="ts">
  import { onMount } from 'svelte';

  import CommandPalette from './components/CommandPalette.svelte';
  import EditorPanel from './components/EditorPanel.svelte';
  import MobileActionSheet from './components/MobileActionSheet.svelte';
  import NoteSidebar from './components/NoteSidebar.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import TopBar from './components/TopBar.svelte';
  import UtilityHub from './components/UtilityHub.svelte';
  import type { NoteMeta, PeerInfo, SyncStatus } from './lib/contracts';
  import {
    createTextareaYjsBridge,
    type TextChangeEvent,
    type TextareaYjsBridge,
  } from './lib/editor/textarea-yjs-bridge';
  import { exportCurrentNote, exportWorkspaceZip, type ExportNoteInput } from './lib/export/workspace-export';
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
  import { isModKey, matchesShortcut, type PaletteActionId } from './lib/ui/actions';
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

  const CRDT_WARN_BYTES = 100 * 1024 * 1024;
  const MOBILE_BREAKPOINT = 800;
  const EDGE_TRIGGER_PX = 16;
  const EDGE_SWIPE_MIN_PX = 48;
  const GESTURE_COACHMARK_KEY = 'hypernote:gesture-coachmark-count';

  let notes: NoteMeta[] = [];
  let trashNotes: NoteMeta[] = [];
  let selectedId = '';
  let editorText = '';
  let paletteOpen = false;
  let paletteMode: 'none' | 'restore' | 'rename' = 'none';
  let paletteModeNonce = 0;
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

  let utilityHubOpen = false;
  let shareInviteCode = generateInviteCode();

  let isMobileViewport = false;
  let mobileTab: 'notes' | 'editor' = 'editor';
  let showMobileTabs = false;
  let mobileActionSheetOpen = false;
  let showGestureCoachmark = false;
  let edgeGestureStartX: number | null = null;
  let edgeGestureStartY: number | null = null;
  let coachmarkTimer: number | null = null;

  let focusMode = false;
  let focusModeTimer: number | null = null;

  let undoToast: { noteId: string; title: string; timeoutId: number } | null = null;

  $: showMobileTabs = isMobileViewport && mobileTab === 'notes';

  onMount(() => {
    void bootstrap();

    void getLocalPeerId().then((id) => {
      myPeerId = id;
    });

    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handleMediaChange = (event: MediaQueryListEvent) => {
      applyViewportMode(event.matches);
    };

    applyViewportMode(mediaQuery.matches);
    mediaQuery.addEventListener('change', handleMediaChange);

    const preventGestureZoom = (event: Event) => {
      if (isMobileViewport) {
        event.preventDefault();
      }
    };

    const preventPinchZoom = (event: TouchEvent) => {
      if (isMobileViewport && event.touches.length > 1) {
        event.preventDefault();
      }
    };

    window.addEventListener('gesturestart', preventGestureZoom as EventListener, { passive: false });
    window.addEventListener('gesturechange', preventGestureZoom as EventListener, { passive: false });
    window.addEventListener('gestureend', preventGestureZoom as EventListener, { passive: false });
    window.addEventListener('touchmove', preventPinchZoom, { passive: false });

    const handleKeydown = (event: KeyboardEvent) => {
      void handleGlobalKeydown(event);
    };

    window.addEventListener('keydown', handleKeydown);

    const stopPeerUpdateSubscription = onPeerUpdate((event) => {
      if (!bridge || event.noteId !== selectedId) {
        return;
      }

      peerStore.markSyncStarted(event.noteId);
      sync = peerStore.syncStatus(event.noteId);
      bridge.applyPeerUpdate(Uint8Array.from(event.update));
    });

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

    const refreshInterval = window.setInterval(() => {
      void refreshPeers();
    }, 5_000);

    return () => {
      mediaQuery.removeEventListener('change', handleMediaChange);
      window.removeEventListener('gesturestart', preventGestureZoom as EventListener);
      window.removeEventListener('gesturechange', preventGestureZoom as EventListener);
      window.removeEventListener('gestureend', preventGestureZoom as EventListener);
      window.removeEventListener('touchmove', preventPinchZoom);
      window.removeEventListener('keydown', handleKeydown);
      stopPeerUpdateSubscription();
      stopPeerConnected();
      stopPeerDisconnected();
      stopWsMessage();
      window.clearInterval(refreshInterval);
      clearFocusModeTimer();
      clearCoachmarkTimer();
      clearUndoToast();
      releaseBridge();
    };
  });

  async function handleGlobalKeydown(event: KeyboardEvent): Promise<void> {
    if (undoToast && isModKey(event) && !event.shiftKey && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      await undoDelete();
      return;
    }

    if (isModKey(event) && !event.shiftKey && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      await openPalette();
      return;
    }

    if (matchesShortcut(event, 'new-note')) {
      event.preventDefault();
      await createNote();
      return;
    }

    if (matchesShortcut(event, 'rename')) {
      event.preventDefault();
      if (selectedId) {
        await openPalette('rename');
      }
      return;
    }

    if (matchesShortcut(event, 'delete')) {
      event.preventDefault();
      if (selectedId) {
        await handleDeleteNote(selectedId);
      }
      return;
    }

    if (matchesShortcut(event, 'restore-mode')) {
      event.preventDefault();
      await openPalette('restore');
      return;
    }

    if (matchesShortcut(event, 'peers')) {
      event.preventDefault();
      utilityHubOpen = true;
      return;
    }

    if (matchesShortcut(event, 'share-workspace')) {
      event.preventDefault();
      handleShareWorkspace();
      return;
    }

    if (matchesShortcut(event, 'export-current')) {
      event.preventDefault();
      await handleExportCurrentNote();
      return;
    }

    if (matchesShortcut(event, 'export-workspace')) {
      event.preventDefault();
      await handleExportWorkspace();
      return;
    }

    if (isModKey(event) && !event.shiftKey && event.key === '1' && isMobileViewport) {
      event.preventDefault();
      setMobileTab('notes');
      return;
    }

    if (isModKey(event) && !event.shiftKey && event.key === '2' && isMobileViewport) {
      event.preventDefault();
      setMobileTab('editor');
    }
  }

  function applyViewportMode(matches: boolean): void {
    isMobileViewport = matches;
    if (!isMobileViewport) {
      mobileTab = 'editor';
      mobileActionSheetOpen = false;
      showGestureCoachmark = false;
      return;
    }

    if (mobileTab !== 'notes' && mobileTab !== 'editor') {
      mobileTab = 'editor';
    }

    if (mobileTab === 'editor') {
      maybeShowGestureCoachmark();
    }
  }

  function setMobileTab(tab: 'notes' | 'editor'): void {
    mobileTab = tab;

    if (tab === 'editor') {
      maybeShowGestureCoachmark();
    } else {
      showGestureCoachmark = false;
    }
  }

  function maybeShowGestureCoachmark(force = false): void {
    if (!isMobileViewport || mobileTab !== 'editor') {
      return;
    }

    if (typeof window === 'undefined') {
      return;
    }

    if (force) {
      showGestureCoachmarkForWindow();
      return;
    }

    const raw = window.localStorage.getItem(GESTURE_COACHMARK_KEY);
    const count = Number(raw ?? '0');

    if (count >= 2) {
      return;
    }

    window.localStorage.setItem(GESTURE_COACHMARK_KEY, String(count + 1));
    showGestureCoachmarkForWindow();
  }

  function showGestureCoachmarkForWindow(): void {
    showGestureCoachmark = true;
    clearCoachmarkTimer();
    coachmarkTimer = window.setTimeout(() => {
      showGestureCoachmark = false;
      coachmarkTimer = null;
    }, 2_800);
  }

  function clearCoachmarkTimer(): void {
    if (coachmarkTimer !== null) {
      window.clearTimeout(coachmarkTimer);
      coachmarkTimer = null;
    }
  }

  async function openPalette(mode: 'none' | 'restore' | 'rename' = 'none'): Promise<void> {
    trashNotes = await persistence.listTrashMetadata();
    paletteMode = mode;
    paletteModeNonce += 1;
    paletteOpen = true;
    mobileActionSheetOpen = false;
  }

  function closePalette(): void {
    paletteOpen = false;
    paletteMode = 'none';
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
    void persistence.sweepTrash();
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

    if (isMobileViewport) {
      setMobileTab('editor');
    }
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

    markTypingActivity();

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

    if (myPeerId) {
      const frame = createUpdateFrame(selectedId, myPeerId, update);
      void broadcastUpdate(serializeFrame(frame));
    }
  }

  function markTypingActivity(): void {
    focusMode = true;
    clearFocusModeTimer();

    focusModeTimer = window.setTimeout(() => {
      focusMode = false;
      focusModeTimer = null;
    }, 1_500);
  }

  function clearFocusModeTimer(): void {
    if (focusModeTimer !== null) {
      window.clearTimeout(focusModeTimer);
      focusModeTimer = null;
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
    const fetchedPeers = await listPeers();
    syncPeers(fetchedPeers);
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
    const note = notes.find((item) => item.id === noteId);
    if (!note) {
      return;
    }

    await persistence.moveToTrash(noteId);
    notes = notes.filter((item) => item.id !== noteId);
    queueUndoToast(note.id, note.title);

    closePalette();

    if (selectedId === noteId) {
      if (notes.length > 0) {
        await selectNote(notes[0].id);
      } else {
        await createNote();
      }
    }
  }

  function queueUndoToast(noteId: string, title: string): void {
    clearUndoToast();

    const timeoutId = window.setTimeout(() => {
      undoToast = null;
    }, 6_000);

    undoToast = {
      noteId,
      title,
      timeoutId,
    };
  }

  function clearUndoToast(): void {
    if (undoToast) {
      window.clearTimeout(undoToast.timeoutId);
      undoToast = null;
    }
  }

  async function undoDelete(): Promise<void> {
    if (!undoToast) {
      return;
    }

    const restoreTarget = undoToast.noteId;
    clearUndoToast();

    await persistence.restoreFromTrash(restoreTarget);
    notes = sortNotes(await persistence.listMetadata());

    if (notes.some((note) => note.id === restoreTarget)) {
      await selectNote(restoreTarget);
    }
  }

  async function handleRestoreNote(noteId: string): Promise<void> {
    await persistence.restoreFromTrash(noteId);
    notes = sortNotes(await persistence.listMetadata());
    trashNotes = await persistence.listTrashMetadata();
    closePalette();
    await selectNote(noteId);
  }

  async function handleRenameNote(noteId: string, newTitle: string): Promise<void> {
    const note = notes.find((item) => item.id === noteId);
    if (!note) return;

    const updated = { ...note, title: newTitle, updatedAt: Date.now() };
    notes = sortNotes(notes.map((item) => (item.id === noteId ? updated : item)));

    if (bridge && selectedId === noteId) {
      persistence.scheduleSave({
        meta: updated,
        yjsState: bridge.encodeStateAsUpdate(),
      });
    }

    closePalette();
  }

  function toggleUtilityHub(): void {
    utilityHubOpen = !utilityHubOpen;
    if (utilityHubOpen) {
      mobileActionSheetOpen = false;
    }
  }

  function handleShareWorkspace(): void {
    utilityHubOpen = true;
    if (shareInviteCode.length === 0) {
      shareInviteCode = generateInviteCode();
    }
  }

  function refreshInviteCode(): void {
    shareInviteCode = generateInviteCode();
  }

  async function handleExportCurrentNote(): Promise<void> {
    if (!bridge || !selectedId) {
      return;
    }

    const currentMeta = notes.find((note) => note.id === selectedId);
    if (!currentMeta) {
      return;
    }

    await exportCurrentNote({
      meta: currentMeta,
      text: bridge.getText(),
    });
  }

  async function handleExportWorkspace(): Promise<void> {
    const entries: ExportNoteInput[] = [];

    for (const note of notes) {
      if (note.id === selectedId && bridge) {
        entries.push({
          meta: note,
          text: bridge.getText(),
        });
        continue;
      }

      const snapshot = await persistence.open(note.id);
      const tempBridge = createTextareaYjsBridge(note.id, { initialUpdate: snapshot.yjsState });
      entries.push({
        meta: note,
        text: tempBridge.getText(),
      });
      tempBridge.destroy();
    }

    await exportWorkspaceZip(entries);
  }

  function onOpenNotesFromActionSheet(): void {
    mobileActionSheetOpen = false;
    setMobileTab('notes');
  }

  function handleShowGestureHelp(): void {
    mobileActionSheetOpen = false;
    maybeShowGestureCoachmark(true);
  }

  function generateInviteCode(): string {
    return Math.random().toString(36).slice(2, 10).toUpperCase();
  }

  function runAction(actionId: PaletteActionId): void {
    switch (actionId) {
      case 'share-workspace':
        handleShareWorkspace();
        break;
      case 'export-current':
        void handleExportCurrentNote();
        break;
      case 'export-workspace':
        void handleExportWorkspace();
        break;
      case 'peers':
        utilityHubOpen = true;
        break;
      default:
        break;
    }
  }

  function handleEditorTouchStart(event: TouchEvent): void {
    if (!isMobileViewport || mobileTab !== 'editor') {
      edgeGestureStartX = null;
      edgeGestureStartY = null;
      return;
    }

    const touch = event.touches[0];
    if (!touch) {
      return;
    }

    const edgeDistance = window.innerWidth - touch.clientX;
    if (edgeDistance <= EDGE_TRIGGER_PX) {
      edgeGestureStartX = touch.clientX;
      edgeGestureStartY = touch.clientY;
      return;
    }

    edgeGestureStartX = null;
    edgeGestureStartY = null;
  }

  function handleEditorTouchEnd(event: TouchEvent): void {
    if (edgeGestureStartX === null || edgeGestureStartY === null) {
      return;
    }

    const touch = event.changedTouches[0];
    if (!touch) {
      edgeGestureStartX = null;
      edgeGestureStartY = null;
      return;
    }

    const deltaX = edgeGestureStartX - touch.clientX;
    const deltaY = Math.abs(edgeGestureStartY - touch.clientY);

    if (deltaX >= EDGE_SWIPE_MIN_PX && deltaY <= 48) {
      mobileActionSheetOpen = true;
      showGestureCoachmark = false;
    }

    edgeGestureStartX = null;
    edgeGestureStartY = null;
  }
</script>

<div class="app-shell" class:mobile-editor-fullbleed={isMobileViewport && mobileTab === 'editor'}>
  {#if !isMobileViewport || mobileTab === 'notes'}
    <TopBar
      state={sync.state}
      peerCount={sync.peerCount}
      compactDock={focusMode && !utilityHubOpen}
      onOpenPalette={() => {
        void openPalette();
      }}
      onToggleUtilityHub={toggleUtilityHub}
    />
  {/if}

  {#if showMobileTabs}
    <nav class="mobile-tabs" aria-label="mobile view tabs">
      <button type="button" class:active={mobileTab === 'notes'} on:click={() => setMobileTab('notes')}>Notes</button>
      <button type="button" class:active={mobileTab === 'editor'} on:click={() => setMobileTab('editor')}>Editor</button>
    </nav>
  {/if}

  <main class="content" class:mobile={isMobileViewport} class:editor-only={isMobileViewport && mobileTab === 'editor'}>
    {#if !isMobileViewport || mobileTab === 'notes'}
      <NoteSidebar
        notes={notes}
        selectedId={selectedId}
        onSelect={(noteId) => {
          void selectNote(noteId);
        }}
      />
    {/if}

    {#if !isMobileViewport || mobileTab === 'editor'}
      <EditorPanel
        title={notes.find((note) => note.id === selectedId)?.title ?? 'Untitled'}
        value={editorText}
        crdtSizeWarning={crdtSizeWarning}
        showTitle={!isMobileViewport}
        onTouchStart={handleEditorTouchStart}
        onTouchEnd={handleEditorTouchEnd}
        onInput={(nextValue) => {
          void handleEditorInput(nextValue);
        }}
      />
    {/if}
  </main>

  {#if !isMobileViewport || mobileTab === 'notes'}
    <StatusBar text={editorText} peerCount={sync.peerCount} state={sync.state} />
  {/if}

  {#if showGestureCoachmark && isMobileViewport && mobileTab === 'editor'}
    <div class="gesture-coachmark" aria-live="polite">
      Swipe left from the right edge to open share/export actions.
    </div>
  {/if}

  {#if undoToast}
    <div class="undo-toast" aria-live="polite">
      <span>Moved "{undoToast.title}" to trash</span>
      <button type="button" on:click={() => void undoDelete()}>undo (⌘/Ctrl+Z)</button>
    </div>
  {/if}
</div>

<UtilityHub
  open={utilityHubOpen}
  state={sync.state}
  peerCount={sync.peerCount}
  peers={peers}
  inviteCode={shareInviteCode}
  onClose={() => {
    utilityHubOpen = false;
  }}
  onShareWorkspace={handleShareWorkspace}
  onExportCurrent={() => {
    void handleExportCurrentNote();
  }}
  onExportWorkspace={() => {
    void handleExportWorkspace();
  }}
  onOpenPeers={() => {
    utilityHubOpen = true;
  }}
  onRefreshInvite={refreshInviteCode}
/>

<CommandPalette
  open={paletteOpen}
  notes={notes}
  trashNotes={trashNotes}
  peers={peers}
  selectedNoteId={selectedId}
  forceMode={paletteMode}
  modeNonce={paletteModeNonce}
  onClose={closePalette}
  onNewNote={() => {
    void createNote();
    closePalette();
  }}
  onSelectNote={(noteId) => {
    void selectNote(noteId);
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
  onOpenPeers={() => {
    runAction('peers');
  }}
  onShareWorkspace={() => {
    runAction('share-workspace');
  }}
  onExportCurrent={() => {
    runAction('export-current');
  }}
  onExportWorkspace={() => {
    runAction('export-workspace');
  }}
/>

<MobileActionSheet
  open={mobileActionSheetOpen && isMobileViewport && mobileTab === 'editor'}
  onClose={() => {
    mobileActionSheetOpen = false;
  }}
  onOpenNotes={onOpenNotesFromActionSheet}
  onShareWorkspace={() => {
    mobileActionSheetOpen = false;
    handleShareWorkspace();
  }}
  onExportCurrent={() => {
    mobileActionSheetOpen = false;
    void handleExportCurrentNote();
  }}
  onExportWorkspace={() => {
    mobileActionSheetOpen = false;
    void handleExportWorkspace();
  }}
  onShowGestureHelp={handleShowGestureHelp}
/>

<style>
  .mobile-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    border-bottom: var(--border);
    background: var(--surface-elevated);
    padding: 6px;
    gap: 6px;
  }

  .mobile-tabs button {
    border: var(--border);
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text);
    font: inherit;
    padding: 8px;
  }

  .mobile-tabs button.active {
    color: var(--accent);
    border-color: var(--accent-muted);
    background: var(--accent-subtle);
  }

  .content.editor-only {
    grid-template-columns: 1fr;
    height: 100vh;
  }

  .mobile-editor-fullbleed {
    grid-template-rows: 1fr;
  }

  .mobile-editor-fullbleed :global(.editor-panel) {
    padding: 0;
  }

  .mobile-editor-fullbleed :global(.editor-panel textarea) {
    min-height: 100vh;
    border: none;
    border-radius: 0;
  }

  .gesture-coachmark {
    position: fixed;
    top: 16px;
    left: 16px;
    right: 16px;
    border: var(--border);
    border-radius: var(--radius-md);
    padding: 10px 12px;
    font-size: 12px;
    background: var(--surface-elevated);
    color: var(--text);
    z-index: 150;
    box-shadow: var(--shadow-elevated);
  }

  .undo-toast {
    position: fixed;
    left: 50%;
    bottom: 18px;
    transform: translateX(-50%);
    width: min(440px, calc(100vw - 20px));
    border: var(--border);
    border-radius: var(--radius-md);
    background: var(--surface-elevated);
    box-shadow: var(--shadow-elevated);
    padding: 10px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    z-index: 150;
    font-size: 12px;
  }

  .undo-toast button {
    border: var(--border);
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--accent);
    font: inherit;
    padding: 5px 8px;
    flex-shrink: 0;
  }

  @media (max-width: 800px) {
    .content.mobile {
      grid-template-columns: 1fr;
      grid-template-rows: auto 1fr;
    }
  }
</style>
