import {
  PROTOCOL_VERSION,
  createFrame,
  isValidWsFrame,
  type FrameType,
  type WsFrame,
} from '../contracts';

export interface HelloPayload {
  openNoteIds: string[];
}

export interface NoteListPayload {
  noteIds: string[];
}

export interface BinaryPayload {
  bytes: number[];
}

export interface ErrorPayload {
  code: string;
  message: string;
}

export interface PresencePayload {
  cursorOffset: number;
  selectionSize: number;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  emittedAt: number;
}

export interface FramePayloadByType {
  hello: HelloPayload;
  note_list: NoteListPayload;
  state_vector: BinaryPayload;
  update: BinaryPayload;
  presence: PresencePayload;
  error: ErrorPayload;
}

export type TypedFrame<TType extends FrameType> = Omit<WsFrame, 'type' | 'payload'> & {
  type: TType;
  payload: FramePayloadByType[TType];
};

export type AnyTypedFrame = {
  [TType in FrameType]: TypedFrame<TType>;
}[FrameType];

export type DecodedFrameResult = { ok: true; frame: AnyTypedFrame } | { ok: false; reason: string };

export function createTypedFrame<TType extends FrameType>(
  type: TType,
  noteId: string,
  senderId: string,
  payload: FramePayloadByType[TType],
): TypedFrame<TType> {
  return createFrame(type, noteId, senderId, payload) as TypedFrame<TType>;
}

export function createHelloFrame(
  noteId: string,
  senderId: string,
  openNoteIds: string[],
): TypedFrame<'hello'> {
  return createTypedFrame('hello', noteId, senderId, { openNoteIds });
}

export function createNoteListFrame(
  noteId: string,
  senderId: string,
  noteIds: string[],
): TypedFrame<'note_list'> {
  return createTypedFrame('note_list', noteId, senderId, { noteIds });
}

export function createStateVectorFrame(
  noteId: string,
  senderId: string,
  stateVector: Uint8Array,
): TypedFrame<'state_vector'> {
  return createTypedFrame('state_vector', noteId, senderId, { bytes: [...stateVector] });
}

export function createUpdateFrame(
  noteId: string,
  senderId: string,
  update: Uint8Array,
): TypedFrame<'update'> {
  return createTypedFrame('update', noteId, senderId, { bytes: [...update] });
}

export function createPresenceFrame(
  noteId: string,
  senderId: string,
  payload: PresencePayload,
): TypedFrame<'presence'> {
  return createTypedFrame('presence', noteId, senderId, payload);
}

export function createErrorFrame(
  noteId: string,
  senderId: string,
  code: string,
  message: string,
): TypedFrame<'error'> {
  return createTypedFrame('error', noteId, senderId, { code, message });
}

export function serializeFrame(frame: AnyTypedFrame): string {
  if (!isTypedFrame(frame)) {
    throw new Error('cannot serialize invalid frame');
  }

  return JSON.stringify(frame);
}

export function decodeFrameMessage(raw: unknown): DecodedFrameResult {
  const parsed = parseRawFrame(raw);

  if (!parsed.ok) {
    return parsed;
  }

  if (!isTypedFrame(parsed.frame)) {
    return { ok: false, reason: 'frame shape mismatch' };
  }

  if (parsed.frame.protocolVersion !== PROTOCOL_VERSION) {
    return {
      ok: false,
      reason: `unsupported protocol version: ${String(parsed.frame.protocolVersion)}`,
    };
  }

  return {
    ok: true,
    frame: parsed.frame,
  };
}

export function decodeBinaryPayload(payload: BinaryPayload): Uint8Array {
  return Uint8Array.from(payload.bytes);
}

function parseRawFrame(raw: unknown): { ok: true; frame: WsFrame } | { ok: false; reason: string } {
  if (typeof raw === 'string') {
    return parseJson(raw);
  }

  if (raw instanceof Uint8Array) {
    const text = new TextDecoder().decode(raw);
    return parseJson(text);
  }

  if (raw instanceof ArrayBuffer) {
    const text = new TextDecoder().decode(new Uint8Array(raw));
    return parseJson(text);
  }

  if (isValidWsFrame(raw)) {
    return { ok: true, frame: raw };
  }

  return { ok: false, reason: 'unknown frame encoding' };
}

function parseJson(value: string): { ok: true; frame: WsFrame } | { ok: false; reason: string } {
  try {
    const parsed = JSON.parse(value) as unknown;

    if (!isValidWsFrame(parsed)) {
      return { ok: false, reason: 'invalid frame envelope' };
    }

    return { ok: true, frame: parsed };
  } catch {
    return { ok: false, reason: 'invalid json frame' };
  }
}

function isTypedFrame(frame: WsFrame): frame is AnyTypedFrame {
  if (!isValidWsFrame(frame)) {
    return false;
  }

  switch (frame.type) {
    case 'hello':
      return isHelloPayload(frame.payload);
    case 'note_list':
      return isNoteListPayload(frame.payload);
    case 'state_vector':
      return isBinaryPayload(frame.payload);
    case 'update':
      return isBinaryPayload(frame.payload);
    case 'presence':
      return isPresencePayload(frame.payload);
    case 'error':
      return isErrorPayload(frame.payload);
    default:
      return false;
  }
}

function isHelloPayload(payload: unknown): payload is HelloPayload {
  return isStringArrayRecord(payload, 'openNoteIds');
}

function isNoteListPayload(payload: unknown): payload is NoteListPayload {
  return isStringArrayRecord(payload, 'noteIds');
}

function isErrorPayload(payload: unknown): payload is ErrorPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const value = payload as Record<string, unknown>;

  return typeof value.code === 'string' && typeof value.message === 'string';
}

function isBinaryPayload(payload: unknown): payload is BinaryPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const value = payload as Record<string, unknown>;

  if (!Array.isArray(value.bytes)) {
    return false;
  }

  return value.bytes.every((entry) => Number.isInteger(entry) && entry >= 0 && entry <= 255);
}

function isPresencePayload(payload: unknown): payload is PresencePayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const value = payload as Record<string, unknown>;
  const numericKeys: Array<keyof PresencePayload> = [
    'cursorOffset',
    'selectionSize',
    'scrollTop',
    'scrollHeight',
    'clientHeight',
    'emittedAt',
  ];

  for (const key of numericKeys) {
    const current = value[key];
    if (typeof current !== 'number' || !Number.isFinite(current) || current < 0) {
      return false;
    }
  }

  return true;
}

function isStringArrayRecord<TField extends string>(
  payload: unknown,
  field: TField,
): payload is Record<TField, string[]> {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const value = payload as Record<string, unknown>;
  return Array.isArray(value[field]) && value[field].every((entry) => typeof entry === 'string');
}
