export type PeerStatus = 'DISCOVERING' | 'CONNECTING' | 'CONNECTED' | 'DISCONNECTED';

export interface NoteMeta {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  deletedAt: number | null;
  body?: string;
}

export interface NoteDocument {
  meta: NoteMeta;
  yjsState: number[];
  markdown: string;
}

export interface CommandAck {
  accepted: boolean;
  reason: string | null;
}

export interface PeerInfo {
  peerId: string;
  wsUrl: string;
  status: PeerStatus;
  noteIds: string[];
}

export interface SyncStatus {
  noteId: string;
  peerCount: number;
  state: 'offline' | 'syncing' | 'connected' | 'error';
}
