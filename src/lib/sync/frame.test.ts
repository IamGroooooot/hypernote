import { describe, expect, it } from 'vitest';

import { PROTOCOL_VERSION } from '../contracts';
import {
  createHelloFrame,
  createPresenceFrame,
  createUpdateFrame,
  decodeBinaryPayload,
  decodeFrameMessage,
  serializeFrame,
} from './frame';

describe('sync frame helpers', () => {
  it('serializes and decodes a valid hello frame', () => {
    const frame = createHelloFrame('note-1', 'peer-1', ['note-1', 'note-2']);
    const encoded = serializeFrame(frame);
    const decoded = decodeFrameMessage(encoded);

    expect(decoded.ok).toBe(true);

    if (decoded.ok) {
      expect(decoded.frame.type).toBe('hello');
      expect(decoded.frame.protocolVersion).toBe(PROTOCOL_VERSION);
      if (decoded.frame.type === 'hello') {
        expect(decoded.frame.payload.openNoteIds).toEqual(['note-1', 'note-2']);
      }
    }
  });

  it('round-trips update bytes payload', () => {
    const update = new Uint8Array([10, 20, 30]);
    const frame = createUpdateFrame('note-1', 'peer-1', update);
    const decoded = decodeFrameMessage(serializeFrame(frame));

    expect(decoded.ok).toBe(true);

    if (decoded.ok) {
      expect(decoded.frame.type).toBe('update');
      if (decoded.frame.type === 'update') {
        const bytes = decodeBinaryPayload(decoded.frame.payload);
        expect(Array.from(bytes)).toEqual([10, 20, 30]);
      }
    }
  });

  it('round-trips presence payload', () => {
    const frame = createPresenceFrame('note-1', 'peer-1', {
      cursorOffset: 42,
      selectionSize: 0,
      scrollTop: 160,
      scrollHeight: 640,
      clientHeight: 320,
      emittedAt: 1_700_000_000_000,
    });
    const decoded = decodeFrameMessage(serializeFrame(frame));

    expect(decoded.ok).toBe(true);
    if (decoded.ok && decoded.frame.type === 'presence') {
      expect(decoded.frame.payload.cursorOffset).toBe(42);
      expect(decoded.frame.payload.scrollTop).toBe(160);
    }
  });

  it('rejects mismatched protocol version', () => {
    const rawFrame = {
      type: 'hello',
      noteId: 'note-1',
      senderId: 'peer-1',
      protocolVersion: PROTOCOL_VERSION + 1,
      payload: { openNoteIds: ['note-1'] },
    };

    const decoded = decodeFrameMessage(JSON.stringify(rawFrame));

    expect(decoded.ok).toBe(false);
    if (!decoded.ok) {
      expect(decoded.reason).toContain('unsupported protocol version');
    }
  });

  it('rejects payload shape mismatch', () => {
    const rawFrame = {
      type: 'update',
      noteId: 'note-1',
      senderId: 'peer-1',
      protocolVersion: PROTOCOL_VERSION,
      payload: { bytes: ['not-a-byte'] },
    };

    const decoded = decodeFrameMessage(rawFrame);

    expect(decoded.ok).toBe(false);
    if (!decoded.ok) {
      expect(decoded.reason).toBe('frame shape mismatch');
    }
  });
});
