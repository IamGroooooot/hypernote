import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  applyLocalEdit,
  broadcastUpdate,
  disconnectPeer,
  getShareTarget,
  joinWorkspace,
  listPeers,
  onPeerConnected,
  onWsMessage,
  sendToPeer,
  onPeerUpdate,
} from './tauri-client';

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, 'window');
  Reflect.deleteProperty(globalThis, 'WebSocket');
});

describe('tauri client', () => {
  it('maps command ack for local edit apply', async () => {
    installWindow({
      __TAURI_INVOKE__: vi.fn(async () => ({ accepted: true, reason: null })),
    });

    const result = await applyLocalEdit('note-1', new Uint8Array([1, 2]));

    expect(result).toBe(true);
  });

  it('returns invoke ack for join workspace', async () => {
    const invoke = vi.fn(async () => ({ accepted: true, reason: null }));
    installWindow({
      __TAURI_INVOKE__: invoke,
    });

    const result = await joinWorkspace('127.0.0.1:4747');

    expect(result).toEqual({ accepted: true, reason: null });
    expect(invoke).toHaveBeenCalledWith('join_workspace', { target: '127.0.0.1:4747' });
  });

  it('reads share target from backend command', async () => {
    const invoke = vi.fn(async () => 'ws://192.168.0.10:4747');
    installWindow({
      __TAURI_INVOKE__: invoke,
    });

    const result = await getShareTarget();

    expect(result).toBe('ws://192.168.0.10:4747');
    expect(invoke).toHaveBeenCalledWith('get_share_target', undefined);
  });

  it('returns empty share target fallback when tauri runtime is unavailable', async () => {
    const result = await getShareTarget();
    expect(result).toBe('');
  });

  it('joins workspace via browser websocket fallback when tauri runtime is unavailable', async () => {
    installWindow();
    const sockets = installMockWebSocket();

    const resultPromise = joinWorkspace('127.0.0.1:4747');
    expect(sockets).toHaveLength(1);
    expect(sockets[0]?.url).toBe('ws://127.0.0.1:4747/');
    sockets[0]?.open();
    const result = await resultPromise;
    expect(result).toEqual({ accepted: true, reason: null });
    sockets[0]?.close();
  });

  it('dispatches fallback peer/ws events and supports send/broadcast in browser mode', async () => {
    installWindow();
    const sockets = installMockWebSocket();

    const onConnected = vi.fn();
    const onMessage = vi.fn();
    const stopConnected = onPeerConnected(onConnected);
    const stopMessage = onWsMessage(onMessage);

    const joinPromise = joinWorkspace('127.0.0.1:4747');
    const socket = sockets[0];
    expect(socket).toBeDefined();
    socket!.open();
    await joinPromise;
    socket!.emitMessage('{"type":"hello"}');

    expect(onConnected).toHaveBeenCalledTimes(1);
    expect(onConnected).toHaveBeenCalledWith(
      expect.objectContaining({
        addr: '127.0.0.1:4747',
        outbound: true,
      }),
    );
    const connectedPeerId = onConnected.mock.calls[0]?.[0]?.peerId;
    expect(typeof connectedPeerId).toBe('string');
    expect(onMessage).toHaveBeenCalledWith({
      peerId: connectedPeerId,
      payload: '{"type":"hello"}',
    });

    const peers = await listPeers();
    expect(peers).toHaveLength(1);
    expect(peers[0]?.status).toBe('CONNECTED');

    const sendResult = await sendToPeer(connectedPeerId, 'direct');
    const broadcastResult = await broadcastUpdate('broadcast');
    expect(sendResult).toBe(true);
    expect(broadcastResult).toBe(true);
    expect(socket?.sent).toEqual(['direct', 'broadcast']);
    socket?.close();

    stopConnected();
    stopMessage();
  });

  it('disconnects browser fallback peer connection', async () => {
    installWindow();
    const sockets = installMockWebSocket();
    const onConnected = vi.fn();
    const stopConnected = onPeerConnected(onConnected);

    const joinPromise = joinWorkspace('127.0.0.1:4747');
    const socket = sockets[0];
    expect(socket).toBeDefined();
    socket!.open();
    await joinPromise;

    const connectedPeerId = onConnected.mock.calls[0]?.[0]?.peerId as string;
    const disconnected = await disconnectPeer(connectedPeerId, 'rejected by host');
    expect(disconnected).toBe(true);

    const peers = await listPeers();
    expect(peers).toHaveLength(0);

    stopConnected();
  });

  it('invokes backend disconnect command in tauri runtime', async () => {
    const invoke = vi.fn(async () => ({ accepted: true, reason: null }));
    installWindow({
      __TAURI_INVOKE__: invoke,
    });

    const result = await disconnectPeer('peer-1', 'manual reject');

    expect(result).toBe(true);
    expect(invoke).toHaveBeenCalledWith('disconnect_peer', {
      peerId: 'peer-1',
      reason: 'manual reject',
    });
  });

  it('normalizes peer statuses from invoke payload', async () => {
    installWindow({
      __TAURI_INVOKE__: vi.fn(async (command: string) => {
        if (command !== 'list_peers') {
          return [];
        }

        return [
          {
            peerId: 'peer-1',
            wsUrl: 'ws://127.0.0.1:4747',
            status: 'connected',
            noteIds: ['note-1'],
          },
        ];
      }),
    });

    const peers = await listPeers();

    expect(peers).toHaveLength(1);
    expect(peers[0]?.status).toBe('CONNECTED');
  });

  it('listens to fallback window peer update event', () => {
    const win = installWindow();
    const listener = vi.fn();

    const stop = onPeerUpdate(listener);
    win.dispatchEvent(
      new CustomEvent('hypernote:peer-update', {
        detail: {
          noteId: 'note-1',
          update: [1, 2, 3],
        },
      }),
    );

    expect(listener).toHaveBeenCalledWith({
      noteId: 'note-1',
      update: [1, 2, 3],
    });

    stop();
  });
});

type WindowOverrides = {
  __TAURI_INVOKE__?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
};

function installWindow(overrides: WindowOverrides = {}): Window {
  const target = new EventTarget();
  const windowMock = {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
    ...overrides,
  } as unknown as Window;

  Object.defineProperty(globalThis, 'window', {
    value: windowMock,
    configurable: true,
    writable: true,
  });

  return windowMock;
}

type MockWebSocketInstance = {
  url: string;
  sent: string[];
  close: () => void;
  open: () => void;
  emitMessage: (data: string) => void;
};

function installMockWebSocket(): MockWebSocketInstance[] {
  const sockets: MockWebSocket[] = [];

  class MockWebSocket {
    static CONNECTING = 0;
    static OPEN = 1;
    static CLOSING = 2;
    static CLOSED = 3;

    public readyState = MockWebSocket.CONNECTING;
    public onopen: ((event: Event) => void) | null = null;
    public onclose: ((event: Event) => void) | null = null;
    public onerror: ((event: Event) => void) | null = null;
    public onmessage: ((event: { data: unknown }) => void) | null = null;
    public sent: string[] = [];

    constructor(public readonly url: string) {
      sockets.push(this);
    }

    send(data: string): void {
      if (this.readyState !== MockWebSocket.OPEN) {
        throw new Error('socket is not open');
      }

      this.sent.push(data);
    }

    close(): void {
      this.readyState = MockWebSocket.CLOSED;
      this.onclose?.(new Event('close'));
    }

    open(): void {
      this.readyState = MockWebSocket.OPEN;
      this.onopen?.(new Event('open'));
    }

    emitMessage(data: string): void {
      this.onmessage?.({ data });
    }
  }

  Object.defineProperty(globalThis, 'WebSocket', {
    value: MockWebSocket,
    configurable: true,
    writable: true,
  });

  return sockets;
}
