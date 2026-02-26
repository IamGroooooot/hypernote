import { get, writable, type Readable } from 'svelte/store';

import type { PeerInfo, PeerStatus, SyncStatus } from '../contracts';

export interface PeerStatusState {
  activeNoteId: string;
  peers: Record<string, PeerInfo>;
  syncingByNoteId: Record<string, true>;
  errorByNoteId: Record<string, string>;
}

export interface PeerStatusStore extends Readable<PeerStatusState> {
  setActiveNote(noteId: string): void;
  upsertPeer(peer: PeerInfo): void;
  setPeerStatus(peerId: string, status: PeerStatus): void;
  setPeerNoteIds(peerId: string, noteIds: string[]): void;
  removePeer(peerId: string): void;
  markSyncStarted(noteId: string): void;
  markSyncCompleted(noteId: string): void;
  markSyncError(noteId: string, message: string): void;
  clearSyncError(noteId: string): void;
  syncStatus(noteId?: string): SyncStatus;
  peersForNote(noteId?: string): PeerInfo[];
  reset(): void;
}

const INITIAL_STATE: PeerStatusState = {
  activeNoteId: '',
  peers: {},
  syncingByNoteId: {},
  errorByNoteId: {},
};

export function createPeerStatusStore(initialNoteId = ''): PeerStatusStore {
  const state = writable<PeerStatusState>({
    ...INITIAL_STATE,
    activeNoteId: initialNoteId,
  });

  return {
    subscribe: state.subscribe,

    setActiveNote(noteId) {
      state.update((current) => ({ ...current, activeNoteId: noteId }));
    },

    upsertPeer(peer) {
      state.update((current) => ({
        ...current,
        peers: {
          ...current.peers,
          [peer.peerId]: {
            ...peer,
            noteIds: [...peer.noteIds],
          },
        },
      }));
    },

    setPeerStatus(peerId, status) {
      state.update((current) => {
        const peer = current.peers[peerId];

        if (!peer) {
          return current;
        }

        return {
          ...current,
          peers: {
            ...current.peers,
            [peerId]: {
              ...peer,
              status,
            },
          },
        };
      });
    },

    setPeerNoteIds(peerId, noteIds) {
      state.update((current) => {
        const peer = current.peers[peerId];

        if (!peer) {
          return current;
        }

        return {
          ...current,
          peers: {
            ...current.peers,
            [peerId]: {
              ...peer,
              noteIds: [...noteIds],
            },
          },
        };
      });
    },

    removePeer(peerId) {
      state.update((current) => {
        if (!(peerId in current.peers)) {
          return current;
        }

        const nextPeers = { ...current.peers };
        delete nextPeers[peerId];

        return {
          ...current,
          peers: nextPeers,
        };
      });
    },

    markSyncStarted(noteId) {
      state.update((current) => ({
        ...current,
        syncingByNoteId: {
          ...current.syncingByNoteId,
          [noteId]: true,
        },
        errorByNoteId: removeKey(current.errorByNoteId, noteId),
      }));
    },

    markSyncCompleted(noteId) {
      state.update((current) => ({
        ...current,
        syncingByNoteId: removeKey(current.syncingByNoteId, noteId),
      }));
    },

    markSyncError(noteId, message) {
      state.update((current) => ({
        ...current,
        syncingByNoteId: removeKey(current.syncingByNoteId, noteId),
        errorByNoteId: {
          ...current.errorByNoteId,
          [noteId]: message,
        },
      }));
    },

    clearSyncError(noteId) {
      state.update((current) => ({
        ...current,
        errorByNoteId: removeKey(current.errorByNoteId, noteId),
      }));
    },

    syncStatus(noteId = get(state).activeNoteId) {
      return deriveSyncStatus(get(state), noteId);
    },

    peersForNote(noteId = get(state).activeNoteId) {
      return peersForNote(get(state), noteId);
    },

    reset() {
      state.set({ ...INITIAL_STATE, activeNoteId: initialNoteId });
    },
  };
}

export const peerStatusStore = createPeerStatusStore();

export function deriveSyncStatus(state: PeerStatusState, noteId: string): SyncStatus {
  const peers = peersForNote(state, noteId);
  const connectedPeers = peers.filter((peer) => peer.status === 'CONNECTED');
  const hasConnectingPeer = peers.some(
    (peer) => peer.status === 'CONNECTING' || peer.status === 'DISCOVERING',
  );
  const hasError = Boolean(state.errorByNoteId[noteId]);
  const isSyncing = Boolean(state.syncingByNoteId[noteId]);

  if (hasError) {
    return {
      noteId,
      peerCount: connectedPeers.length,
      state: 'error',
    };
  }

  if (isSyncing || hasConnectingPeer) {
    return {
      noteId,
      peerCount: connectedPeers.length,
      state: 'syncing',
    };
  }

  if (connectedPeers.length > 0) {
    return {
      noteId,
      peerCount: connectedPeers.length,
      state: 'connected',
    };
  }

  return {
    noteId,
    peerCount: 0,
    state: 'offline',
  };
}

function peersForNote(state: PeerStatusState, noteId: string): PeerInfo[] {
  if (!noteId) {
    return Object.values(state.peers);
  }

  return Object.values(state.peers).filter((peer) => peer.noteIds.includes(noteId));
}

function removeKey<TValue>(value: Record<string, TValue>, key: string): Record<string, TValue> {
  if (!(key in value)) {
    return value;
  }

  const next = { ...value };
  delete next[key];

  return next;
}
