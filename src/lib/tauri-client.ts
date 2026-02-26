import type { CommandAck, NoteDocument, NoteMeta, PeerInfo, PeerStatus } from './contracts';

export interface PeerUpdateEvent {
  noteId: string;
  update: number[];
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
  }
}

function getInvoke(): InvokeFn | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.__TAURI__?.core?.invoke ?? window.__TAURI_INVOKE__ ?? null;
}

function getListen(): ListenFn | null {
  if (typeof window === 'undefined') {
    return null;
  }

  return window.__TAURI__?.event?.listen ?? null;
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
  const peers = await invokeOrFallback<PeerInfo[]>('list_peers', undefined, []);
  return peers.map((peer) => ({
    ...peer,
    status: normalizePeerStatus(peer.status),
  }));
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
