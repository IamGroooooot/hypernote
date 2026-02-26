import { describe, expect, it } from 'vitest';

import type { PeerInfo } from '../contracts';
import { createPeerStatusStore, deriveSyncStatus } from './peer-status';

function makePeer(overrides: Partial<PeerInfo>): PeerInfo {
  return {
    peerId: 'peer-1',
    wsUrl: 'ws://127.0.0.1:4747',
    status: 'DISCOVERING',
    noteIds: ['note-1'],
    ...overrides,
  };
}

describe('peer status store', () => {
  it('transitions offline -> syncing -> connected', () => {
    const store = createPeerStatusStore('note-1');

    expect(store.syncStatus()).toEqual({
      noteId: 'note-1',
      peerCount: 0,
      state: 'offline',
    });

    store.upsertPeer(makePeer({ status: 'CONNECTING' }));

    expect(store.syncStatus().state).toBe('syncing');

    store.setPeerStatus('peer-1', 'CONNECTED');
    store.markSyncStarted('note-1');

    expect(store.syncStatus().state).toBe('syncing');

    store.markSyncCompleted('note-1');

    expect(store.syncStatus()).toEqual({
      noteId: 'note-1',
      peerCount: 1,
      state: 'connected',
    });
  });

  it('transitions to error and recovers', () => {
    const store = createPeerStatusStore('note-1');
    store.upsertPeer(makePeer({ status: 'CONNECTED' }));

    store.markSyncError('note-1', 'socket dropped');
    expect(store.syncStatus().state).toBe('error');

    store.clearSyncError('note-1');
    expect(store.syncStatus().state).toBe('connected');
  });

  it('derives status from raw state snapshot', () => {
    const status = deriveSyncStatus(
      {
        activeNoteId: 'note-1',
        peers: {
          'peer-1': makePeer({ status: 'CONNECTED' }),
          'peer-2': makePeer({
            peerId: 'peer-2',
            status: 'DISCONNECTED',
          }),
        },
        syncingByNoteId: {},
        errorByNoteId: {},
      },
      'note-1',
    );

    expect(status).toEqual({
      noteId: 'note-1',
      peerCount: 1,
      state: 'connected',
    });
  });
});
