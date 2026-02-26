<script lang="ts">
  import { onMount } from 'svelte';

  import CommandPalette from './components/CommandPalette.svelte';
  import DesktopTocPanel from './components/DesktopTocPanel.svelte';
  import EditorPanel from './components/EditorPanel.svelte';
  import MobileActionSheet from './components/MobileActionSheet.svelte';
  import MobileTocSheet from './components/MobileTocSheet.svelte';
  import NoteSidebar from './components/NoteSidebar.svelte';
  import StatusBar from './components/StatusBar.svelte';
  import TopBar from './components/TopBar.svelte';
  import UtilityHub from './components/UtilityHub.svelte';
  import type { FrameType, NoteMeta, PeerInfo, SyncStatus } from './lib/contracts';
  import {
    createTextareaYjsBridge,
    type TextChangeEvent,
    type TextareaYjsBridge,
  } from './lib/editor/textarea-yjs-bridge';
  import { exportCurrentNote, exportWorkspaceZip, type ExportNoteInput } from './lib/export/workspace-export';
  import { findActiveHeadingId, parseMarkdownToc } from './lib/editor/markdown-toc';
  import { BrowserNoteContainerStore } from './lib/persistence/browser-note-store';
  import { LocalNotePersistence } from './lib/persistence/local-note-persistence';
  import { isTauriEnv, TauriNoteContainerStore } from './lib/persistence/tauri-note-store';
  import { createPeerStatusStore } from './lib/stores/peer-status';
  import {
    applyLocalEdit,
    disconnectPeer,
    getShareTarget,
    getLocalPeerId,
    joinWorkspace,
    listPeers,
    onPeerConnected,
    onPeerDisconnected,
    onPeerUpdate,
    onWsMessage,
    sendToPeer,
    type PeerConnectedEvent,
    type WsMessageEvent,
  } from './lib/tauri-client';
  import { formatModShortcut, isModKey, matchesShortcut, type PaletteActionId } from './lib/ui/actions';
  import {
    createErrorFrame,
    createHelloFrame,
    createUpdateFrame,
    decodeBinaryPayload,
    decodeFrameMessage,
    serializeFrame,
  } from './lib/sync/frame';
  import {
    allowsInboundFrame,
    allowsOutboundSync,
    createJoinPeerState,
    isJoinApproved,
    isJoinPendingInboundApproval,
    peerStatusFromJoinState,
    transitionJoinPeerState,
    type JoinPeerState,
  } from './lib/sync/join-fsm';

  const store = isTauriEnv() ? new TauriNoteContainerStore() : new BrowserNoteContainerStore();
  const persistence = new LocalNotePersistence(store);
  const peerStore = createPeerStatusStore();

  const CRDT_WARN_BYTES = 100 * 1024 * 1024;
  const MOBILE_BREAKPOINT = 800;
  const RIGHT_EDGE_TRIGGER_PX = 16;
  const LEFT_SWIPE_ZONE_PX = 72;
  const EDGE_SWIPE_MIN_PX = 48;
  const MAX_SWIPE_VERTICAL_DRIFT_PX = 56;
  const SWIPE_VECTOR_VISIBLE_MS = 420;
  const GESTURE_COACHMARK_KEY = 'hypernote:gesture-coachmark-count';
  const JOIN_INPUT_HINT = 'Enter host, host:port, or ws://host:port';
  const SHARE_TARGET_HINT = 'Share this target with a collaborator on the same LAN';
  const SHARE_TARGET_LOADING = 'Resolving local share target...';
  const UNDO_SHORTCUT_LABEL = formatModShortcut('Z');

  type JoinWorkspaceStatus = 'idle' | 'joining' | 'joined' | 'error';
  type ShareTargetStatus = 'idle' | 'copied' | 'error';
  type JoinRequest = {
    peerId: string;
    addr: string;
    requestedAt: number;
  };

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
  let shareWorkspaceTarget = '';
  let shareTargetStatus: ShareTargetStatus = 'idle';
  let shareTargetMessage = SHARE_TARGET_HINT;
  let joinWorkspaceTarget = '';
  let joinWorkspaceStatus: JoinWorkspaceStatus = 'idle';
  let joinWorkspaceMessage = JOIN_INPUT_HINT;
  let joinFocusNonce = 0;
  let pendingJoinRequests: JoinRequest[] = [];
  let joinPeerStates: Record<string, JoinPeerState> = {};

  let isMobileViewport = false;
  let mobileTab: 'notes' | 'editor' = 'editor';
  let showMobileTabs = false;
  let mobileActionSheetOpen = false;
  let showGestureCoachmark = false;
  let coachmarkTimer: number | null = null;

  let focusMode = false;
  let focusModeTimer: number | null = null;

  let undoToast: { noteId: string; title: string; timeoutId: number } | null = null;

  let editorTextareaEl: HTMLTextAreaElement | null = null;
  let cursorOffset = 0;
  let desktopTocOpen = false;
  let mobileTocOpen = false;
  let leftSwipeStartX: number | null = null;
  let leftSwipeStartY: number | null = null;
  let rightSwipeStartX: number | null = null;
  let rightSwipeStartY: number | null = null;
  let swipeVector:
    | {
        x: number;
        y: number;
        length: number;
        direction: 'toc' | 'utility';
      }
    | null = null;
  let swipeVectorTimer: number | null = null;

  $: showMobileTabs = isMobileViewport && mobileTab === 'notes';
  $: tocHeadings = parseMarkdownToc(editorText);
  $: activeTocHeadingId = findActiveHeadingId(tocHeadings, cursorOffset);

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
      delete joinPeerStates[event.peerId];
      pendingJoinRequests = pendingJoinRequests.filter((request) => request.peerId !== event.peerId);
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
      clearSwipeVectorTimer();
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

    if (matchesShortcut(event, 'toc')) {
      event.preventDefault();
      toggleToc();
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
      if (utilityHubOpen) {
        return;
      }
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

    if (matchesShortcut(event, 'join-workspace')) {
      event.preventDefault();
      openJoinWorkspaceFlow();
      return;
    }

    if (matchesShortcut(event, 'share-workspace')) {
      event.preventDefault();
      void handleShareWorkspace();
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
      mobileTocOpen = false;
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
      mobileTocOpen = false;
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

  function clearSwipeVectorTimer(): void {
    if (swipeVectorTimer !== null) {
      window.clearTimeout(swipeVectorTimer);
      swipeVectorTimer = null;
    }
  }

  async function openPalette(mode: 'none' | 'restore' | 'rename' = 'none'): Promise<void> {
    trashNotes = await persistence.listTrashMetadata();
    paletteMode = mode;
    paletteModeNonce += 1;
    paletteOpen = true;
    desktopTocOpen = false;
    mobileTocOpen = false;
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
    cursorOffset = 0;
    sync = peerStore.syncStatus(noteId);
    void announceOpenNotes(noteId);

    if (isMobileViewport) {
      setMobileTab('editor');
    }
  }

  async function announceOpenNotes(noteId: string): Promise<void> {
    if (!myPeerId || !noteId) {
      return;
    }

    const connectedPeers = peers.filter(
      (peer) => peer.status === 'CONNECTED' && isPeerApproved(peer.peerId),
    );
    if (connectedPeers.length === 0) {
      return;
    }

    const helloFrame = createHelloFrame('', myPeerId, [noteId]);
    const payload = serializeFrame(helloFrame);
    await Promise.all(connectedPeers.map((peer) => sendToPeer(peer.peerId, payload)));
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
      const payload = serializeFrame(frame);
      const approvedPeers = peers.filter(
        (peer) => peer.status === 'CONNECTED' && isPeerApproved(peer.peerId),
      );
      await Promise.all(approvedPeers.map((peer) => sendToPeer(peer.peerId, payload)));
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

  function isPeerApproved(peerId: string): boolean {
    const state = joinPeerStates[peerId];
    return state === undefined || isJoinApproved(state);
  }

  function shouldProcessFrame(peerId: string, frameType: FrameType): boolean {
    const state = joinPeerStates[peerId];
    if (!state) {
      return true;
    }

    return allowsInboundFrame(state, frameType);
  }

  function upsertPendingJoinRequest(peerId: string, addr: string): void {
    const existing = pendingJoinRequests.find((request) => request.peerId === peerId);
    if (existing) {
      pendingJoinRequests = pendingJoinRequests.map((request) =>
        request.peerId === peerId ? { ...request, addr, requestedAt: Date.now() } : request,
      );
      return;
    }

    pendingJoinRequests = [...pendingJoinRequests, { peerId, addr, requestedAt: Date.now() }];
  }

  async function sendInitialSyncToPeer(peerId: string): Promise<void> {
    if (!selectedId || !bridge || !myPeerId) {
      return;
    }

    const helloFrame = createHelloFrame('', myPeerId, [selectedId]);
    await sendToPeer(peerId, serializeFrame(helloFrame));

    const fullState = bridge.encodeStateAsUpdate();
    const updateFrame = createUpdateFrame(selectedId, myPeerId, fullState);
    await sendToPeer(peerId, serializeFrame(updateFrame));
  }

  async function handlePeerConnected(event: PeerConnectedEvent): Promise<void> {
    const state = createJoinPeerState(event.outbound ? 'outbound' : 'inbound');
    joinPeerStates[event.peerId] = state;

    peerStore.upsertPeer({
      peerId: event.peerId,
      wsUrl: `ws://${event.addr}`,
      status: peerStatusFromJoinState(state),
      noteIds: selectedId ? [selectedId] : [],
    });
    peers = peerStore.peersForNote('');
    sync = peerStore.syncStatus(selectedId);

    if (isJoinPendingInboundApproval(state)) {
      upsertPendingJoinRequest(event.peerId, event.addr);
      utilityHubOpen = true;
      joinWorkspaceStatus = 'idle';
      joinWorkspaceMessage = `Join request from ${event.addr}. Approve or reject.`;
      return;
    }

    joinWorkspaceStatus = 'joined';
    joinWorkspaceMessage = 'Join request sent. Waiting for host approval.';
  }

  async function handleWsMessage(event: WsMessageEvent): Promise<void> {
    const result = decodeFrameMessage(event.payload);
    if (!result.ok) return;

    const { frame } = result;
    if (!shouldProcessFrame(event.peerId, frame.type)) {
      return;
    }

    if (frame.type === 'error') {
      const payload = frame.payload as { code: string; message: string };
      const currentState = joinPeerStates[event.peerId];
      if (currentState) {
        const nextState = transitionJoinPeerState(currentState, 'host_rejected');
        joinPeerStates[event.peerId] = nextState;
        peerStore.setPeerStatus(event.peerId, peerStatusFromJoinState(nextState));
      }
      pendingJoinRequests = pendingJoinRequests.filter((request) => request.peerId !== event.peerId);

      peers = peerStore.peersForNote('');
      sync = peerStore.syncStatus(selectedId);
      joinWorkspaceStatus = 'error';
      joinWorkspaceMessage = payload.message || 'Join rejected by host.';
      return;
    }

    if (frame.type === 'hello') {
      const currentState = joinPeerStates[event.peerId];
      if (
        currentState &&
        currentState.lifecycle === 'pending_outbound_approval'
      ) {
        const nextState = transitionJoinPeerState(currentState, 'host_hello');
        joinPeerStates[event.peerId] = nextState;
        peerStore.setPeerStatus(event.peerId, peerStatusFromJoinState(nextState));
        joinWorkspaceStatus = 'joined';
        joinWorkspaceMessage = 'Join approved. Sync connected.';
        await sendInitialSyncToPeer(event.peerId);
      }

      const payload = frame.payload as { openNoteIds: string[] };
      peerStore.setPeerNoteIds(event.peerId, payload.openNoteIds);
      sync = peerStore.syncStatus(selectedId);

      if (bridge && myPeerId && payload.openNoteIds.includes(selectedId) && isPeerApproved(event.peerId)) {
        const fullState = bridge.encodeStateAsUpdate();
        const updateFrame = createUpdateFrame(selectedId, myPeerId, fullState);
        await sendToPeer(event.peerId, serializeFrame(updateFrame));
      }
    }

    if (frame.type === 'update') {
      if (!isPeerApproved(event.peerId)) {
        return;
      }

      const bytes = decodeBinaryPayload(frame.payload as { bytes: number[] });
      await handleRemoteUpdate(event.peerId, frame.noteId, bytes);
    }
  }

  async function handleRemoteUpdate(
    _peerId: string,
    noteId: string,
    bytes: Uint8Array,
  ): Promise<void> {
    if (!noteId) {
      return;
    }

    const hasLocalNote = notes.some((note) => note.id === noteId);

    if (!hasLocalNote) {
      await createRemoteNoteFromUpdate(noteId, bytes);
      await selectNote(noteId);
      return;
    }

    if (noteId === selectedId && bridge) {
      peerStore.markSyncStarted(selectedId);
      sync = peerStore.syncStatus(selectedId);
      bridge.applyPeerUpdate(bytes);
      return;
    }

    await applyRemoteUpdateToStoredNote(noteId, bytes);
  }

  async function createRemoteNoteFromUpdate(noteId: string, bytes: Uint8Array): Promise<void> {
    const tempBridge = createTextareaYjsBridge(noteId);
    tempBridge.applyPeerUpdate(bytes);
    const text = tempBridge.getText();

    const now = Date.now();
    const meta: NoteMeta = {
      id: noteId,
      title: titleFromText(text),
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      body: text.slice(0, 500),
    };

    await persistence.saveNow({
      meta,
      yjsState: tempBridge.encodeStateAsUpdate(),
    });
    tempBridge.destroy();

    notes = sortNotes([meta, ...notes]);
  }

  async function applyRemoteUpdateToStoredNote(noteId: string, bytes: Uint8Array): Promise<void> {
    const snapshot = await persistence.open(noteId);
    const tempBridge = createTextareaYjsBridge(noteId, { initialUpdate: snapshot.yjsState });
    tempBridge.applyPeerUpdate(bytes);

    const text = tempBridge.getText();
    const nextMeta: NoteMeta = {
      ...snapshot.meta,
      title: titleFromText(text),
      body: text.slice(0, 500),
      updatedAt: Date.now(),
      deletedAt: null,
    };

    await persistence.saveNow({
      meta: nextMeta,
      yjsState: tempBridge.encodeStateAsUpdate(),
    });
    tempBridge.destroy();

    notes = sortNotes(notes.map((note) => (note.id === noteId ? nextMeta : note)));
  }

  async function refreshPeers(): Promise<void> {
    const fetchedPeers = await listPeers();
    syncPeers(fetchedPeers);
    sync = peerStore.syncStatus(selectedId);
  }

  function syncPeers(nextPeers: PeerInfo[]): void {
    const nextById = new Map(nextPeers.map((peer) => [peer.peerId, peer]));

    for (const peer of nextPeers) {
      const existingPeer = peerStore.peersForNote('').find((current) => current.peerId === peer.peerId);
      const noteIds = peer.noteIds.length > 0 ? peer.noteIds : existingPeer?.noteIds ?? [];
      const joinState = joinPeerStates[peer.peerId];
      const status = joinState ? peerStatusFromJoinState(joinState) : peer.status;
      peerStore.upsertPeer({
        ...peer,
        status,
        noteIds,
      });
    }

    for (const existingPeer of peerStore.peersForNote('')) {
      if (!nextById.has(existingPeer.peerId)) {
        delete joinPeerStates[existingPeer.peerId];
        pendingJoinRequests = pendingJoinRequests.filter(
          (request) => request.peerId !== existingPeer.peerId,
        );
        peerStore.removePeer(existingPeer.peerId);
      }
    }

    peers = peerStore.peersForNote('');
  }

  async function handleApproveJoinRequest(peerId: string): Promise<void> {
    const currentState = joinPeerStates[peerId];
    if (!currentState || !isJoinPendingInboundApproval(currentState)) {
      return;
    }

    const nextState = transitionJoinPeerState(currentState, 'host_approved');
    joinPeerStates[peerId] = nextState;
    pendingJoinRequests = pendingJoinRequests.filter((request) => request.peerId !== peerId);
    peerStore.setPeerStatus(peerId, peerStatusFromJoinState(nextState));
    peers = peerStore.peersForNote('');
    sync = peerStore.syncStatus(selectedId);
    if (allowsOutboundSync(nextState)) {
      await sendInitialSyncToPeer(peerId);
    }
  }

  async function handleRejectJoinRequest(peerId: string): Promise<void> {
    const currentState = joinPeerStates[peerId];
    if (!currentState || currentState.lifecycle === 'rejected') {
      return;
    }

    const nextState = transitionJoinPeerState(currentState, 'host_rejected');
    joinPeerStates[peerId] = nextState;
    pendingJoinRequests = pendingJoinRequests.filter((request) => request.peerId !== peerId);
    if (myPeerId) {
      const rejectionFrame = createErrorFrame(
        '',
        myPeerId,
        'JOIN_REJECTED',
        'Join request rejected by host.',
      );
      await sendToPeer(peerId, serializeFrame(rejectionFrame));
    }

    await disconnectPeer(peerId, 'join request rejected by host');
    peerStore.removePeer(peerId);
    peers = peerStore.peersForNote('');
    sync = peerStore.syncStatus(selectedId);
  }

  async function handleDisconnectConnectedPeer(peerId: string): Promise<void> {
    const peer = peers.find((entry) => entry.peerId === peerId);
    if (!peer || peer.status !== 'CONNECTED') {
      return;
    }

    const joinState = joinPeerStates[peerId];
    if (joinState) {
      joinPeerStates[peerId] = transitionJoinPeerState(joinState, 'transport_closed');
    }

    const disconnected = await disconnectPeer(peerId, 'peer disconnected by user');
    if (!disconnected) {
      joinWorkspaceStatus = 'error';
      joinWorkspaceMessage = 'Failed to disconnect peer.';
      return;
    }

    pendingJoinRequests = pendingJoinRequests.filter((request) => request.peerId !== peerId);
    peerStore.removePeer(peerId);
    peers = peerStore.peersForNote('');
    sync = peerStore.syncStatus(selectedId);
    void refreshPeers();
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

  function openUtilityHubPanel(): void {
    utilityHubOpen = true;
    desktopTocOpen = false;
    mobileActionSheetOpen = false;
    mobileTocOpen = false;
  }

  function toggleUtilityHub(): void {
    if (utilityHubOpen) {
      utilityHubOpen = false;
      return;
    }

    openUtilityHubPanel();
  }

  function toggleToc(): void {
    if (isMobileViewport) {
      mobileTocOpen = !mobileTocOpen;
      if (mobileTocOpen) {
        mobileActionSheetOpen = false;
        utilityHubOpen = false;
        showGestureCoachmark = false;
      }
      return;
    }

    desktopTocOpen = !desktopTocOpen;
    if (desktopTocOpen) {
      utilityHubOpen = false;
    }
  }

  function openJoinWorkspaceFlow(): void {
    openUtilityHubPanel();
    joinWorkspaceStatus = 'idle';
    joinWorkspaceMessage = JOIN_INPUT_HINT;
    joinFocusNonce += 1;
  }

  function handleJoinTargetChange(nextValue: string): void {
    joinWorkspaceTarget = nextValue;
    joinWorkspaceStatus = 'idle';
    joinWorkspaceMessage = JOIN_INPUT_HINT;
  }

  async function handleJoinWorkspace(): Promise<void> {
    const target = joinWorkspaceTarget.trim();
    const validationError = validateJoinTarget(target);

    if (validationError) {
      joinWorkspaceStatus = 'error';
      joinWorkspaceMessage = validationError;
      return;
    }

    joinWorkspaceStatus = 'joining';
    joinWorkspaceMessage = 'Sending join request...';

    const ack = await joinWorkspace(target);
    if (ack.accepted) {
      joinWorkspaceStatus = 'joined';
      joinWorkspaceMessage = 'Join requested. Waiting for host approval.';
      joinWorkspaceTarget = '';
      void refreshPeers();
      return;
    }

    joinWorkspaceStatus = 'error';
    joinWorkspaceMessage = ack.reason ?? 'Unable to join workspace';
  }

  async function handleShareWorkspace(): Promise<void> {
    openUtilityHubPanel();
    await refreshShareTarget();
  }

  async function refreshShareTarget(showLoading = true): Promise<void> {
    if (showLoading) {
      shareTargetStatus = 'idle';
      shareTargetMessage = SHARE_TARGET_LOADING;
    }

    const target = (await getShareTarget()).trim();
    if (target.length > 0) {
      shareWorkspaceTarget = target;
      shareTargetStatus = 'idle';
      shareTargetMessage = SHARE_TARGET_HINT;
      return;
    }

    shareWorkspaceTarget = '';
    shareTargetStatus = 'error';
    shareTargetMessage = 'Share target is available only in the Tauri app runtime.';
  }

  async function copyShareTarget(): Promise<void> {
    if (!shareWorkspaceTarget) {
      shareTargetStatus = 'error';
      shareTargetMessage = 'No share target available to copy.';
      return;
    }

    const copied = await copyTextToClipboard(shareWorkspaceTarget);
    if (copied) {
      shareTargetStatus = 'copied';
      shareTargetMessage = 'Copied share target to clipboard.';
      return;
    }

    shareTargetStatus = 'error';
    shareTargetMessage = 'Copy failed. Please copy manually.';
  }

  async function copyTextToClipboard(text: string): Promise<boolean> {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        // fallback below
      }
    }

    if (typeof document === 'undefined') {
      return false;
    }

    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();

    try {
      return document.execCommand('copy');
    } catch {
      return false;
    } finally {
      document.body.removeChild(textarea);
    }
  }

  function validateJoinTarget(target: string): string | null {
    if (!target) {
      return 'Enter a host or ws://host:port target.';
    }

    let value = target;
    let requirePort = false;

    if (target.startsWith('ws://')) {
      value = target.slice(5);
      requirePort = true;
    } else if (target.includes('://')) {
      return 'Only ws:// scheme is supported.';
    }

    if (!value || /\s/u.test(value) || /[/?#]/u.test(value)) {
      return 'Target contains unsupported characters.';
    }

    const separatorIndex = value.lastIndexOf(':');
    if (separatorIndex === -1) {
      return requirePort ? 'ws:// target must include host:port.' : null;
    }

    const host = value.slice(0, separatorIndex);
    const portText = value.slice(separatorIndex + 1);
    if (!host) {
      return 'Host is missing.';
    }

    if (host.includes(':')) {
      return 'IPv6 targets are not supported yet.';
    }

    if (!/^\d+$/u.test(portText)) {
      return 'Port must be numeric.';
    }

    const port = Number(portText);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      return 'Port must be between 1 and 65535.';
    }

    return null;
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
    mobileTocOpen = false;
    setMobileTab('notes');
  }

  function handleShowGestureHelp(): void {
    mobileActionSheetOpen = false;
    maybeShowGestureCoachmark(true);
  }

  function runAction(actionId: PaletteActionId): void {
    switch (actionId) {
      case 'toc':
        toggleToc();
        break;
      case 'join-workspace':
        openJoinWorkspaceFlow();
        break;
      case 'share-workspace':
        void handleShareWorkspace();
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

  function jumpToHeading(offset: number): void {
    const textarea = editorTextareaEl;
    if (!textarea) {
      return;
    }

    desktopTocOpen = false;
    mobileTocOpen = false;
    textarea.focus();
    textarea.setSelectionRange(offset, offset);
    cursorOffset = offset;

    requestAnimationFrame(() => {
      const textBefore = textarea.value.slice(0, offset);
      const lineIndex = Math.max(0, textBefore.split('\n').length - 1);
      const lineHeightRaw = window.getComputedStyle(textarea).lineHeight;
      const lineHeight = Number.parseFloat(lineHeightRaw);

      if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        return;
      }

      textarea.scrollTop = Math.max(0, lineIndex * lineHeight - textarea.clientHeight * 0.35);
    });
  }

  function showSwipeVectorFeedback(
    startX: number,
    startY: number,
    endX: number,
    endY: number,
    direction: 'toc' | 'utility',
  ): void {
    clearSwipeVectorTimer();

    swipeVector = {
      x: Math.min(startX, endX),
      y: Math.min(startY, endY),
      length: Math.max(40, Math.abs(endX - startX)),
      direction,
    };

    swipeVectorTimer = window.setTimeout(() => {
      swipeVector = null;
      swipeVectorTimer = null;
    }, SWIPE_VECTOR_VISIBLE_MS);
  }

  function resetSwipeGestureStart(): void {
    leftSwipeStartX = null;
    leftSwipeStartY = null;
    rightSwipeStartX = null;
    rightSwipeStartY = null;
  }

  function handleEditorTouchStart(event: TouchEvent): void {
    if (!isMobileViewport || mobileTab !== 'editor') {
      resetSwipeGestureStart();
      return;
    }

    const touch = event.touches[0];
    if (!touch) {
      resetSwipeGestureStart();
      return;
    }

    const rightEdgeDistance = window.innerWidth - touch.clientX;
    if (rightEdgeDistance <= RIGHT_EDGE_TRIGGER_PX) {
      rightSwipeStartX = touch.clientX;
      rightSwipeStartY = touch.clientY;
    } else {
      rightSwipeStartX = null;
      rightSwipeStartY = null;
    }

    if (touch.clientX >= 14 && touch.clientX <= LEFT_SWIPE_ZONE_PX) {
      leftSwipeStartX = touch.clientX;
      leftSwipeStartY = touch.clientY;
    } else {
      leftSwipeStartX = null;
      leftSwipeStartY = null;
    }
  }

  function handleEditorTouchEnd(event: TouchEvent): void {
    const touch = event.changedTouches[0];
    if (!touch) {
      resetSwipeGestureStart();
      return;
    }

    if (rightSwipeStartX !== null && rightSwipeStartY !== null) {
      const deltaX = rightSwipeStartX - touch.clientX;
      const deltaY = Math.abs(rightSwipeStartY - touch.clientY);

      if (deltaX >= EDGE_SWIPE_MIN_PX && deltaY <= MAX_SWIPE_VERTICAL_DRIFT_PX) {
        mobileActionSheetOpen = true;
        mobileTocOpen = false;
        showGestureCoachmark = false;
        showSwipeVectorFeedback(rightSwipeStartX, rightSwipeStartY, touch.clientX, touch.clientY, 'utility');
        resetSwipeGestureStart();
        return;
      }
    }

    if (leftSwipeStartX !== null && leftSwipeStartY !== null) {
      const deltaX = touch.clientX - leftSwipeStartX;
      const deltaY = Math.abs(leftSwipeStartY - touch.clientY);

      if (deltaX >= EDGE_SWIPE_MIN_PX && deltaY <= MAX_SWIPE_VERTICAL_DRIFT_PX) {
        mobileTocOpen = true;
        mobileActionSheetOpen = false;
        showGestureCoachmark = false;
        showSwipeVectorFeedback(leftSwipeStartX, leftSwipeStartY, touch.clientX, touch.clientY, 'toc');
      }
    }

    resetSwipeGestureStart();
  }
</script>

<div class="app-shell" class:mobile-editor-fullbleed={isMobileViewport && mobileTab === 'editor'}>
  {#if !isMobileViewport || mobileTab === 'notes'}
    <TopBar
      state={sync.state}
      peerCount={sync.peerCount}
      compactDock={focusMode && !utilityHubOpen}
      tocOpen={desktopTocOpen}
      onOpenPalette={() => {
        void openPalette();
      }}
      onToggleToc={toggleToc}
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
        bind:textareaEl={editorTextareaEl}
        showTitle={!isMobileViewport}
        onTouchStart={handleEditorTouchStart}
        onTouchEnd={handleEditorTouchEnd}
        onCursorChange={(nextOffset) => {
          cursorOffset = nextOffset;
        }}
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
      Swipe right from the left side for ToC, or left from the right edge for actions.
    </div>
  {/if}

  {#if swipeVector}
    <div
      class={`swipe-vector ${swipeVector.direction}`}
      style={`--vector-x:${swipeVector.x}px; --vector-y:${swipeVector.y}px; --vector-length:${swipeVector.length}px;`}
      aria-hidden="true"
    >
      <span class="vector-trail"></span>
      <span class="vector-label">{swipeVector.direction === 'toc' ? 'toc' : 'actions'}</span>
    </div>
  {/if}

  {#if undoToast}
    <div class="undo-toast" aria-live="polite">
      <span>Moved "{undoToast.title}" to trash</span>
      <button type="button" on:click={() => void undoDelete()}>undo ({UNDO_SHORTCUT_LABEL})</button>
    </div>
  {/if}
</div>

<UtilityHub
  open={utilityHubOpen}
  state={sync.state}
  peerCount={sync.peerCount}
  peers={peers}
  shareTarget={shareWorkspaceTarget}
  shareStatus={shareTargetStatus}
  shareMessage={shareTargetMessage}
  joinTarget={joinWorkspaceTarget}
  joinStatus={joinWorkspaceStatus}
  joinMessage={joinWorkspaceMessage}
  joinFocusNonce={joinFocusNonce}
  pendingJoinRequests={pendingJoinRequests}
  onClose={() => {
    utilityHubOpen = false;
  }}
  onShareWorkspace={() => {
    void handleShareWorkspace();
  }}
  onJoinTargetChange={handleJoinTargetChange}
  onJoinWorkspace={() => {
    void handleJoinWorkspace();
  }}
  onExportCurrent={() => {
    void handleExportCurrentNote();
  }}
  onExportWorkspace={() => {
    void handleExportWorkspace();
  }}
  onOpenPeers={() => {
    utilityHubOpen = true;
  }}
  onRefreshShareTarget={() => {
    void refreshShareTarget(false);
  }}
  onCopyShareTarget={() => {
    void copyShareTarget();
  }}
  onApproveJoin={(peerId) => {
    void handleApproveJoinRequest(peerId);
  }}
  onRejectJoin={(peerId) => {
    void handleRejectJoinRequest(peerId);
  }}
  onDisconnectPeer={(peerId) => {
    void handleDisconnectConnectedPeer(peerId);
  }}
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
  onJoinWorkspace={() => {
    runAction('join-workspace');
  }}
  onToggleToc={() => {
    runAction('toc');
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
  onOpenToc={() => {
    mobileActionSheetOpen = false;
    mobileTocOpen = true;
  }}
  onJoinWorkspace={() => {
    mobileActionSheetOpen = false;
    openJoinWorkspaceFlow();
  }}
  onShareWorkspace={() => {
    mobileActionSheetOpen = false;
    void handleShareWorkspace();
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

<DesktopTocPanel
  open={desktopTocOpen && !isMobileViewport}
  headings={tocHeadings}
  activeHeadingId={activeTocHeadingId}
  onClose={() => {
    desktopTocOpen = false;
  }}
  onSelectHeading={jumpToHeading}
/>

<MobileTocSheet
  open={mobileTocOpen && isMobileViewport && mobileTab === 'editor'}
  headings={tocHeadings}
  activeHeadingId={activeTocHeadingId}
  onClose={() => {
    mobileTocOpen = false;
  }}
  onSelectHeading={jumpToHeading}
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
    height: 100dvh;
  }

  .mobile-editor-fullbleed {
    grid-template-rows: 1fr;
  }

  .mobile-editor-fullbleed :global(.editor-panel) {
    padding: 0;
  }

  .mobile-editor-fullbleed :global(.editor-panel textarea) {
    min-height: 100%;
    height: 100%;
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

  .swipe-vector {
    position: fixed;
    left: var(--vector-x);
    top: calc(var(--vector-y) - 16px);
    width: var(--vector-length);
    height: 32px;
    pointer-events: none;
    z-index: 155;
    display: flex;
    align-items: center;
    gap: 6px;
    animation: swipe-fade 420ms ease-out forwards;
  }

  .swipe-vector.utility {
    justify-content: flex-end;
  }

  .vector-trail {
    flex: 1;
    height: 2px;
    border-radius: var(--radius-round);
    background: linear-gradient(90deg, var(--accent-muted), transparent);
    opacity: 0.8;
  }

  .swipe-vector.utility .vector-trail {
    background: linear-gradient(90deg, transparent, var(--accent-muted));
  }

  .vector-label {
    font-size: 10px;
    border: var(--border);
    border-radius: var(--radius-round);
    padding: 1px 6px;
    color: var(--accent);
    background: var(--surface-elevated);
    text-transform: uppercase;
    letter-spacing: 0.08em;
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

  @keyframes swipe-fade {
    0% {
      opacity: 0;
    }

    15% {
      opacity: 1;
    }

    100% {
      opacity: 0;
    }
  }
</style>
