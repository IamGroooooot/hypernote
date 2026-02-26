import { describe, expect, it } from 'vitest';

import { createTextareaYjsBridge } from './textarea-yjs-bridge';

describe('textarea yjs bridge', () => {
  it('applies local text updates through Yjs document', () => {
    const bridge = createTextareaYjsBridge('note-1');

    const update = bridge.setText('hello world');

    expect(update).not.toBeNull();
    expect(bridge.getText()).toBe('hello world');

    bridge.destroy();
  });

  it('applies peer updates and converges with source bridge', () => {
    const first = createTextareaYjsBridge('note-1');
    const second = createTextareaYjsBridge('note-1');

    const firstUpdate = first.setText('shared text');
    expect(firstUpdate).not.toBeNull();

    second.applyPeerUpdate(firstUpdate!);

    expect(second.getText()).toBe('shared text');

    const secondUpdate = second.setText('shared text + second');
    expect(secondUpdate).not.toBeNull();
    first.applyPeerUpdate(secondUpdate!);

    expect(first.getText()).toBe('shared text + second');
    expect(second.getText()).toBe('shared text + second');

    first.destroy();
    second.destroy();
  });

  it('keeps idempotent state when same update is re-applied', () => {
    const first = createTextareaYjsBridge('note-1');
    const second = createTextareaYjsBridge('note-1');

    const update = first.setText('idempotent update');
    expect(update).not.toBeNull();

    second.applyPeerUpdate(update!);
    second.applyPeerUpdate(update!);

    expect(second.getText()).toBe('idempotent update');

    first.destroy();
    second.destroy();
  });

  it('emits local and remote change events', () => {
    const first = createTextareaYjsBridge('note-1');
    const second = createTextareaYjsBridge('note-1');

    const events: Array<'local' | 'remote'> = [];
    const stop = second.onChange((event) => {
      events.push(event.source);
    });

    const localUpdate = second.setText('local');
    expect(localUpdate).not.toBeNull();

    const peerUpdate = first.setText('peer');
    second.applyPeerUpdate(peerUpdate!);

    expect(events).toEqual(['local', 'remote']);

    stop();
    first.destroy();
    second.destroy();
  });
});
