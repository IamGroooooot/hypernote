import type { NoteMeta, PeerInfo } from './contracts';

type InvokeArgs = Record<string, unknown> | undefined;
type InvokeFn = <T>(command: string, args?: InvokeArgs) => Promise<T>;

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke?: InvokeFn;
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

export async function createNote(title: string): Promise<NoteMeta | null> {
  return invokeOrFallback<NoteMeta | null>('create_note', { title }, null);
}

export async function openNote(noteId: string): Promise<Uint8Array | null> {
  return invokeOrFallback<Uint8Array | null>('open_note', { noteId }, null);
}

export async function applyLocalEdit(noteId: string, update: Uint8Array): Promise<void> {
  await invokeOrFallback<void>(
    'apply_local_edit',
    { noteId, update: Array.from(update) },
    undefined,
  );
}

export async function applyPeerUpdate(noteId: string, update: Uint8Array): Promise<void> {
  await invokeOrFallback<void>(
    'apply_peer_update',
    { noteId, update: Array.from(update) },
    undefined,
  );
}

export async function listNotes(): Promise<NoteMeta[]> {
  return invokeOrFallback<NoteMeta[]>('list_notes', undefined, []);
}

export async function deleteNoteToTrash(noteId: string): Promise<void> {
  await invokeOrFallback<void>('delete_note_to_trash', { noteId }, undefined);
}

export async function listPeers(): Promise<PeerInfo[]> {
  return invokeOrFallback<PeerInfo[]>('list_peers', undefined, []);
}
