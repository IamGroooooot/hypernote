import type { NoteMeta } from './types';

const MAGIC = new Uint8Array([0x48, 0x59, 0x50, 0x4e]); // HYPN
const VERSION = 1;
const METADATA_LEN_OFFSET = MAGIC.length + 1;
const METADATA_OFFSET = METADATA_LEN_OFFSET + 4;
const MIN_CONTAINER_SIZE = METADATA_OFFSET + 8 + 4;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

export interface EncodedNote {
  bytes: Uint8Array;
}

export interface DecodedNote {
  meta: NoteMeta;
  yjsState: Uint8Array;
}

export function encodeNoteContainer(meta: NoteMeta, yjsState: Uint8Array): EncodedNote {
  const metadataBytes = textEncoder.encode(JSON.stringify(meta));
  const headerSize = METADATA_OFFSET + metadataBytes.length + 8;
  const totalSize = headerSize + yjsState.length + 4;

  const bytes = new Uint8Array(totalSize);
  const view = new DataView(bytes.buffer);

  bytes.set(MAGIC, 0);
  view.setUint8(MAGIC.length, VERSION);
  view.setUint32(METADATA_LEN_OFFSET, metadataBytes.length, false);

  let offset = METADATA_OFFSET;
  bytes.set(metadataBytes, offset);
  offset += metadataBytes.length;

  view.setBigUint64(offset, BigInt(yjsState.length), false);
  offset += 8;

  bytes.set(yjsState, offset);
  offset += yjsState.length;

  view.setUint32(offset, crc32(yjsState), false);

  return { bytes };
}

export function decodeNoteMetadata(bytes: Uint8Array): NoteMeta {
  return parseContainerPrefix(bytes).meta;
}

export function decodeNoteContainer(bytes: Uint8Array): DecodedNote {
  const { meta, view, offsetAfterMetadata } = parseContainerPrefix(bytes);
  let offset = offsetAfterMetadata;
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

interface ParsedContainerPrefix {
  meta: NoteMeta;
  view: DataView;
  offsetAfterMetadata: number;
}

function parseContainerPrefix(bytes: Uint8Array): ParsedContainerPrefix {
  if (bytes.length < MIN_CONTAINER_SIZE) {
    throw new Error('Invalid container: too short');
  }

  if (!MAGIC.every((value, index) => bytes[index] === value)) {
    throw new Error('Invalid container: bad magic');
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint8(MAGIC.length);
  if (version !== VERSION) {
    throw new Error(`Unsupported container version: ${version}`);
  }

  const metadataLen = view.getUint32(METADATA_LEN_OFFSET, false);
  const metadataEnd = METADATA_OFFSET + metadataLen;

  if (metadataEnd > bytes.length) {
    throw new Error('Invalid container: metadata overflow');
  }

  const metadataJson = textDecoder.decode(bytes.slice(METADATA_OFFSET, metadataEnd));
  const meta = JSON.parse(metadataJson) as NoteMeta;

  return { meta, view, offsetAfterMetadata: metadataEnd };
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
