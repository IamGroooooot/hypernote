import { afterEach, describe, expect, it, vi } from 'vitest';

import { applyLocalEdit, listPeers, onPeerUpdate } from './tauri-client';

afterEach(() => {
  vi.restoreAllMocks();
  Reflect.deleteProperty(globalThis, 'window');
});

describe('tauri client', () => {
  it('maps command ack for local edit apply', async () => {
    installWindow({
      __TAURI_INVOKE__: vi.fn(async () => ({ accepted: true, reason: null })),
    });

    const result = await applyLocalEdit('note-1', new Uint8Array([1, 2]));

    expect(result).toBe(true);
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
