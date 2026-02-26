import { describe, expect, it } from 'vitest';

import {
  createFrame,
  decodeNoteContainer,
  encodeNoteContainer,
  isValidWsFrame,
  PROTOCOL_VERSION,
  type NoteMeta,
} from './index';

describe('protocol frame', () => {
  it('creates valid frame with locked protocol version', () => {
    const frame = createFrame('hello', 'note-1', 'peer-1', { openNoteIds: ['note-1'] });

    expect(frame.protocolVersion).toBe(PROTOCOL_VERSION);
    expect(isValidWsFrame(frame)).toBe(true);
  });

  it('rejects invalid frame', () => {
    expect(isValidWsFrame({ type: 'hello' })).toBe(false);
  });
});

describe('storage container', () => {
  it('encodes and decodes a note container', () => {
    const meta: NoteMeta = {
      id: 'note-1',
      title: 'Test',
      createdAt: 1,
      updatedAt: 2,
      deletedAt: null,
    };

    const state = new Uint8Array([1, 2, 3, 4, 5]);
    const encoded = encodeNoteContainer(meta, state);
    const decoded = decodeNoteContainer(encoded.bytes);

    expect(decoded.meta).toEqual(meta);
    expect(Array.from(decoded.yjsState)).toEqual([1, 2, 3, 4, 5]);
  });

  it('throws on checksum mismatch', () => {
    const meta: NoteMeta = {
      id: 'note-1',
      title: 'Test',
      createdAt: 1,
      updatedAt: 2,
      deletedAt: null,
    };

    const encoded = encodeNoteContainer(meta, new Uint8Array([8, 9, 10]));
    encoded.bytes[encoded.bytes.length - 1] ^= 0x01;

    expect(() => decodeNoteContainer(encoded.bytes)).toThrow('checksum mismatch');
  });

  it('throws when metadata is tampered even if body is unchanged', () => {
    const meta: NoteMeta = {
      id: 'note-1',
      title: 'Alpha',
      createdAt: 1,
      updatedAt: 2,
      deletedAt: null,
    };

    const encoded = encodeNoteContainer(meta, new Uint8Array([1, 2, 3]));
    const tampered = new Uint8Array(encoded.bytes);

    const raw = String.fromCharCode(...tampered);
    const replaced = raw.replace('Alpha', 'Bravo');

    for (let index = 0; index < replaced.length; index += 1) {
      tampered[index] = replaced.charCodeAt(index);
    }

    expect(() => decodeNoteContainer(tampered)).toThrow('checksum mismatch');
  });
});
