import { invoke as tauriInvoke } from '@tauri-apps/api/core';
import {
  listen as tauriListen,
  type Event as TauriEvent,
  type UnlistenFn,
} from '@tauri-apps/api/event';

import type { CommandAck, NoteDocument, NoteMeta, PeerInfo, PeerStatus } from './contracts';

const FALLBACK_EVENT_PEER_CONNECTED = 'hypernote:peer-connected';
const FALLBACK_EVENT_PEER_DISCONNECTED = 'hypernote:peer-disconnected';
const FALLBACK_EVENT_WS_MESSAGE = 'hypernote:ws-message';

const WS_READY_CONNECTING = 0;
const WS_READY_OPEN = 1;
const WS_READY_CLOSING = 2;
const WS_READY_CLOSED = 3;

const browserPeerConnections = new Map<string, BrowserPeerConnection>();
const browserLocalPeerId = `web-${Math.random().toString(36).slice(2, 10)}`;
let browserPeerSequence = 0;

export interface PeerUpdateEvent {
  noteId: string;
  update: number[];
}

interface BrowserPeerConnection {
  peerId: string;
  addr: string;
  socket: WebSocket;
}

type InvokeArgs = Record<string, unknown> | undefined;
type InvokeFn = <T>(command: string, args?: InvokeArgs) => Promise<T>;
type ListenFn = (
  event: string,
  handler: (event: { payload: unknown }) => void,
) => Promise<() => void>;

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke?: InvokeFn;
      };
      event?: {
        listen?: ListenFn;
      };
    };
    __TAURI_INVOKE__?: InvokeFn;
    __TAURI_INTERNALS__?: unknown;
  }
}

function getInvoke(): InvokeFn | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const globalInvoke = window.__TAURI__?.core?.invoke ?? window.__TAURI_INVOKE__ ?? null;
  if (globalInvoke) {
    return globalInvoke;
  }

  // Tauri v2 default runtime path when withGlobalTauri is disabled.
  if ('__TAURI_INTERNALS__' in window) {
    return <T>(command: string, args?: InvokeArgs) => tauriInvoke<T>(command, args);
  }

  return null;
}

function getListen(): ListenFn | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const globalListen = window.__TAURI__?.event?.listen ?? null;
  if (globalListen) {
    return globalListen;
  }

  // Tauri v2 default runtime path when withGlobalTauri is disabled.
  if ('__TAURI_INTERNALS__' in window) {
    return (eventName, handler) =>
      tauriListen(eventName, (event: TauriEvent<unknown>) => {
        handler({ payload: event.payload });
      }) as Promise<UnlistenFn>;
  }

  return null;
}

async function invokeOrFallback<T>(command: string, args: InvokeArgs, fallback: T): Promise<T> {
  const invoke = getInvoke();

  if (!invoke) {
    return fallback;
  }

  try {
    return await invoke<T>(command, args);
  } catch {
    return fallback;
  }
}

async function invokeWithStatus(command: string, args: InvokeArgs): Promise<boolean> {
  const invoke = getInvoke();

  if (!invoke) {
    // Local web fallback: keep UX responsive when Tauri runtime is absent.
    return true;
  }

  try {
    const ack = await invoke<CommandAck>(command, args);
    return ack.accepted;
  } catch {
    return false;
  }
}

export async function createNote(): Promise<NoteMeta | null> {
  return invokeOrFallback<NoteMeta | null>('create_note', undefined, null);
}

export async function openNote(noteId: string): Promise<NoteDocument | null> {
  return invokeOrFallback<NoteDocument | null>('open_note', { noteId }, null);
}

export async function applyLocalEdit(noteId: string, update: Uint8Array): Promise<boolean> {
  return invokeWithStatus('apply_local_edit', { noteId, update: Array.from(update) });
}

export async function applyPeerUpdate(noteId: string, update: Uint8Array): Promise<boolean> {
  return invokeWithStatus('apply_peer_update', { noteId, update: Array.from(update) });
}

export async function listNotes(): Promise<NoteMeta[]> {
  return invokeOrFallback<NoteMeta[]>('list_notes', undefined, []);
}

export async function deleteNoteToTrash(noteId: string): Promise<boolean> {
  return invokeWithStatus('delete_note_to_trash', { noteId });
}

export async function listPeers(): Promise<PeerInfo[]> {
  const invoke = getInvoke();
  if (!invoke) {
    return listBrowserPeers();
  }

  const peers = await invokeOrFallback<PeerInfo[]>('list_peers', undefined, []);
  return peers.map((peer) => ({
    ...peer,
    status: normalizePeerStatus(peer.status),
  }));
}

// ---------------------------------------------------------------------------
// WS sync commands
// ---------------------------------------------------------------------------

export async function broadcastUpdate(payload: string): Promise<boolean> {
  if (!getInvoke()) {
    let failed = 0;
    for (const connection of browserPeerConnections.values()) {
      try {
        if (connection.socket.readyState === WS_READY_OPEN) {
          connection.socket.send(payload);
        } else {
          failed += 1;
        }
      } catch {
        failed += 1;
      }
    }

    return failed === 0;
  }

  return invokeWithStatus('broadcast_update', { payload });
}

export async function sendToPeer(peerId: string, payload: string): Promise<boolean> {
  if (!getInvoke()) {
    const connection = browserPeerConnections.get(peerId);
    if (!connection || connection.socket.readyState !== WS_READY_OPEN) {
      return false;
    }

    try {
      connection.socket.send(payload);
      return true;
    } catch {
      return false;
    }
  }

  return invokeWithStatus('send_to_peer', { peerId, payload });
}

export async function getShareTarget(): Promise<string> {
  return invokeOrFallback<string>('get_share_target', undefined, '');
}

export async function joinWorkspace(target: string): Promise<CommandAck> {
  const invoke = getInvoke();

  if (!invoke) {
    return joinWorkspaceViaBrowser(target);
  }

  try {
    return await invoke<CommandAck>('join_workspace', { target });
  } catch {
    return {
      accepted: false,
      reason: 'join command failed',
    };
  }
}

export async function getLocalPeerId(): Promise<string> {
  const invoke = getInvoke();
  if (!invoke) {
    return browserLocalPeerId;
  }

  return invokeOrFallback<string>('get_peer_id', undefined, '');
}

export interface PeerConnectedEvent {
  peerId: string;
  addr: string;
}

export interface PeerDisconnectedEvent {
  peerId: string;
}

export interface WsMessageEvent {
  peerId: string;
  payload: string;
}

export function onPeerConnected(listener: (event: PeerConnectedEvent) => void): () => void {
  const tauriListen = getListen();
  if (tauriListen) {
    return createTauriEventListener('hypernote://peer-connected', listener, isPeerConnectedEvent);
  }

  return createWindowEventListener(FALLBACK_EVENT_PEER_CONNECTED, listener, isPeerConnectedEvent);
}

export function onPeerDisconnected(listener: (event: PeerDisconnectedEvent) => void): () => void {
  const tauriListen = getListen();
  if (tauriListen) {
    return createTauriEventListener(
      'hypernote://peer-disconnected',
      listener,
      isPeerDisconnectedEvent,
    );
  }

  return createWindowEventListener(
    FALLBACK_EVENT_PEER_DISCONNECTED,
    listener,
    isPeerDisconnectedEvent,
  );
}

export function onWsMessage(listener: (event: WsMessageEvent) => void): () => void {
  const tauriListen = getListen();
  if (tauriListen) {
    return createTauriEventListener('hypernote://ws-message', listener, isWsMessageEvent);
  }

  return createWindowEventListener(FALLBACK_EVENT_WS_MESSAGE, listener, isWsMessageEvent);
}

function createTauriEventListener<T>(
  eventName: string,
  listener: (event: T) => void,
  validator: (payload: unknown) => payload is T,
): () => void {
  const tauriListen = getListen();

  if (!tauriListen) {
    return () => {};
  }

  let stop: (() => void) | null = null;
  let active = true;

  void tauriListen(eventName, (event) => {
    if (validator(event.payload)) {
      listener(event.payload);
    }
  }).then((unlisten) => {
    if (!active) {
      unlisten();
      return;
    }

    stop = unlisten;
  });

  return () => {
    active = false;
    stop?.();
  };
}

function createWindowEventListener<T>(
  eventName: string,
  listener: (event: T) => void,
  validator: (payload: unknown) => payload is T,
): () => void {
  if (typeof window === 'undefined') {
    return () => {};
  }

  const handler = (event: Event) => {
    const customEvent = event as CustomEvent<unknown>;
    if (validator(customEvent.detail)) {
      listener(customEvent.detail);
    }
  };

  window.addEventListener(eventName, handler);
  return () => {
    window.removeEventListener(eventName, handler);
  };
}

function isPeerConnectedEvent(payload: unknown): payload is PeerConnectedEvent {
  if (!payload || typeof payload !== 'object') return false;
  const v = payload as Record<string, unknown>;
  return typeof v.peerId === 'string' && typeof v.addr === 'string';
}

function isPeerDisconnectedEvent(payload: unknown): payload is PeerDisconnectedEvent {
  if (!payload || typeof payload !== 'object') return false;
  const v = payload as Record<string, unknown>;
  return typeof v.peerId === 'string';
}

function isWsMessageEvent(payload: unknown): payload is WsMessageEvent {
  if (!payload || typeof payload !== 'object') return false;
  const v = payload as Record<string, unknown>;
  return typeof v.peerId === 'string' && typeof v.payload === 'string';
}

export function onPeerUpdate(listener: (event: PeerUpdateEvent) => void): () => void {
  const tauriListen = getListen();

  if (tauriListen) {
    let stop: (() => void) | null = null;
    let active = true;

    void tauriListen('hypernote://peer-update', (event) => {
      const parsed = parsePeerUpdateEvent(event.payload);
      if (parsed) {
        listener(parsed);
      }
    }).then((unlisten) => {
      if (!active) {
        unlisten();
        return;
      }

      stop = unlisten;
    });

    return () => {
      active = false;
      stop?.();
    };
  }

  if (typeof window === 'undefined') {
    return () => {};
  }

  const fallbackHandler = (event: Event) => {
    const customEvent = event as CustomEvent<unknown>;
    const parsed = parsePeerUpdateEvent(customEvent.detail);
    if (parsed) {
      listener(parsed);
    }
  };

  window.addEventListener('hypernote:peer-update', fallbackHandler);

  return () => {
    window.removeEventListener('hypernote:peer-update', fallbackHandler);
  };
}

function parsePeerUpdateEvent(payload: unknown): PeerUpdateEvent | null {
  if (!payload || typeof payload !== 'object') {
    return null;
  }

  const value = payload as Record<string, unknown>;

  if (typeof value.noteId !== 'string' || !Array.isArray(value.update)) {
    return null;
  }

  if (!value.update.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 255)) {
    return null;
  }

  return {
    noteId: value.noteId,
    update: value.update as number[],
  };
}

function normalizePeerStatus(value: string): PeerStatus {
  const normalized = value.toUpperCase();
  if (normalized === 'CONNECTING') {
    return 'CONNECTING';
  }

  if (normalized === 'CONNECTED') {
    return 'CONNECTED';
  }

  if (normalized === 'DISCOVERING') {
    return 'DISCOVERING';
  }

  return 'DISCONNECTED';
}

function listBrowserPeers(): PeerInfo[] {
  return Array.from(browserPeerConnections.values()).map((connection) => ({
    peerId: connection.peerId,
    wsUrl: `ws://${connection.addr}`,
    status: normalizeWebSocketReadyState(connection.socket.readyState),
    noteIds: [],
  }));
}

function normalizeWebSocketReadyState(readyState: number): PeerStatus {
  if (readyState === WS_READY_OPEN) {
    return 'CONNECTED';
  }

  if (readyState === WS_READY_CONNECTING) {
    return 'CONNECTING';
  }

  return 'DISCONNECTED';
}

async function joinWorkspaceViaBrowser(target: string): Promise<CommandAck> {
  if (typeof window === 'undefined' || typeof WebSocket === 'undefined') {
    return {
      accepted: false,
      reason: 'websocket runtime unavailable',
    };
  }

  const normalized = normalizeJoinTarget(target);
  if (!normalized.ok) {
    return {
      accepted: false,
      reason: normalized.reason,
    };
  }

  for (const connection of browserPeerConnections.values()) {
    if (
      connection.addr === normalized.addr &&
      connection.socket.readyState !== WS_READY_CLOSING &&
      connection.socket.readyState !== WS_READY_CLOSED
    ) {
      return {
        accepted: true,
        reason: 'already connected',
      };
    }
  }

  const peerId = createBrowserPeerId();
  let socket: WebSocket;
  try {
    socket = new WebSocket(normalized.url);
  } catch {
    return {
      accepted: false,
      reason: 'invalid websocket target',
    };
  }

  browserPeerConnections.set(peerId, {
    peerId,
    addr: normalized.addr,
    socket,
  });

  let finalized = false;
  const finalize = () => {
    if (finalized) {
      return;
    }

    finalized = true;
    browserPeerConnections.delete(peerId);
    emitFallbackEvent(FALLBACK_EVENT_PEER_DISCONNECTED, { peerId });
  };

  socket.onopen = () => {
    emitFallbackEvent(FALLBACK_EVENT_PEER_CONNECTED, {
      peerId,
      addr: normalized.addr,
    });
  };
  socket.onmessage = (event) => {
    void emitWsMessageEvent(peerId, event.data);
  };
  socket.onclose = () => {
    finalize();
  };
  socket.onerror = () => {
    if (socket.readyState === WS_READY_CLOSING || socket.readyState === WS_READY_CLOSED) {
      finalize();
    }
  };

  return {
    accepted: true,
    reason: null,
  };
}

function createBrowserPeerId(): string {
  browserPeerSequence += 1;
  return `browser-peer-${browserPeerSequence}`;
}

function emitFallbackEvent(eventName: string, detail: unknown): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent(eventName, { detail }));
}

async function emitWsMessageEvent(peerId: string, rawData: unknown): Promise<void> {
  if (typeof rawData === 'string') {
    emitFallbackEvent(FALLBACK_EVENT_WS_MESSAGE, { peerId, payload: rawData });
    return;
  }

  if (rawData instanceof ArrayBuffer) {
    const payload = new TextDecoder().decode(new Uint8Array(rawData));
    emitFallbackEvent(FALLBACK_EVENT_WS_MESSAGE, { peerId, payload });
    return;
  }

  if (ArrayBuffer.isView(rawData)) {
    const payload = new TextDecoder().decode(
      new Uint8Array(rawData.buffer, rawData.byteOffset, rawData.byteLength),
    );
    emitFallbackEvent(FALLBACK_EVENT_WS_MESSAGE, { peerId, payload });
    return;
  }

  if (rawData instanceof Blob) {
    const payload = await rawData.text();
    emitFallbackEvent(FALLBACK_EVENT_WS_MESSAGE, { peerId, payload });
  }
}

function normalizeJoinTarget(
  rawTarget: string,
): { ok: true; addr: string; url: string } | { ok: false; reason: string } {
  const target = rawTarget.trim();
  if (!target) {
    return { ok: false, reason: 'target is empty' };
  }

  if (target.startsWith('ws://')) {
    return parseHostPortTarget(target.slice(5), true);
  }

  if (target.includes('://')) {
    return { ok: false, reason: 'only ws:// scheme is supported' };
  }

  return parseHostPortTarget(target, false);
}

function parseHostPortTarget(
  value: string,
  requirePort: boolean,
): { ok: true; addr: string; url: string } | { ok: false; reason: string } {
  if (!value) {
    return { ok: false, reason: 'target is empty' };
  }

  if (/[/?#\s]/u.test(value)) {
    return { ok: false, reason: 'target contains unsupported characters' };
  }

  const separatorIndex = value.lastIndexOf(':');
  if (separatorIndex === -1) {
    if (requirePort) {
      return { ok: false, reason: 'target must be ws://host:port' };
    }

    const addr = `${value}:4747`;
    return { ok: true, addr, url: `ws://${addr}/` };
  }

  const host = value.slice(0, separatorIndex);
  const portRaw = value.slice(separatorIndex + 1);
  if (!host) {
    return { ok: false, reason: 'host is missing' };
  }

  if (host.includes(':')) {
    return { ok: false, reason: 'target host format is invalid' };
  }

  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    return { ok: false, reason: 'port must be between 1 and 65535' };
  }

  const addr = `${host}:${port}`;
  return { ok: true, addr, url: `ws://${addr}/` };
}
