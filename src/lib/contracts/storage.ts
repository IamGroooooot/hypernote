import type { NoteMeta } from './types';

const MAGIC = new Uint8Array([0x48, 0x59, 0x50, 0x4e]); // HYPN
const VERSION = 1;

export interface EncodedNote {
  bytes: Uint8Array;
}

export interface DecodedNote {
  meta: NoteMeta;
  yjsState: Uint8Array;
}

export function encodeNoteContainer(meta: NoteMeta, yjsState: Uint8Array): EncodedNote {
  const textEncoder = new TextEncoder();
  const metadataBytes = textEncoder.encode(JSON.stringify(meta));
  const headerSize = 4 + 1 + 4 + metadataBytes.length + 8;
  const totalSize = headerSize + yjsState.length + 4;

  const bytes = new Uint8Array(totalSize);
  const view = new DataView(bytes.buffer);

  bytes.set(MAGIC, 0);
  view.setUint8(4, VERSION);
  view.setUint32(5, metadataBytes.length, false);

  let offset = 9;
  bytes.set(metadataBytes, offset);
  offset += metadataBytes.length;

  view.setBigUint64(offset, BigInt(yjsState.length), false);
  offset += 8;

  bytes.set(yjsState, offset);
  offset += yjsState.length;

  view.setUint32(offset, crc32(yjsState), false);

  return { bytes };
}

export function decodeNoteContainer(bytes: Uint8Array): DecodedNote {
  if (bytes.length < 17) {
    throw new Error('Invalid container: too short');
  }

  if (!MAGIC.every((value, index) => bytes[index] === value)) {
    throw new Error('Invalid container: bad magic');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(4);
  if (version !== VERSION) {
    throw new Error(`Unsupported container version: ${version}`);
  }

  const metadataLen = view.getUint32(5, false);
  let offset = 9;
  const metadataEnd = offset + metadataLen;

  if (metadataEnd > bytes.length) {
    throw new Error('Invalid container: metadata overflow');
  }

  const textDecoder = new TextDecoder();
  const metadataJson = textDecoder.decode(bytes.slice(offset, metadataEnd));
  const meta = JSON.parse(metadataJson) as NoteMeta;

  offset = metadataEnd;
  if (offset + 8 > bytes.length) {
    throw new Error('Invalid container: missing body length');
  }

  const bodyLen = Number(view.getBigUint64(offset, false));
  offset += 8;

  const bodyEnd = offset + bodyLen;
  if (bodyEnd + 4 > bytes.length) {
    throw new Error('Invalid container: body overflow');
  }

  const yjsState = bytes.slice(offset, bodyEnd);
  const expectedChecksum = view.getUint32(bodyEnd, false);
  const actualChecksum = crc32(yjsState);

  if (expectedChecksum !== actualChecksum) {
    throw new Error('Invalid container: checksum mismatch');
  }

  return { meta, yjsState };
}

// Simple CRC32 implementation for deterministic container validation.
function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;

  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      const mask = -(crc & 1);
      crc = (crc >>> 1) ^ (0xedb88320 & mask);
    }
  }

  return (crc ^ 0xffffffff) >>> 0;
}
