export type FrameType = 'hello' | 'note_list' | 'state_vector' | 'update' | 'error';

export const PROTOCOL_VERSION = 1;

export interface WsFrame {
  type: FrameType;
  noteId: string;
  senderId: string;
  protocolVersion: number;
  payload: unknown;
}

const FRAME_TYPES: Set<FrameType> = new Set([
  'hello',
  'note_list',
  'state_vector',
  'update',
  'error',
]);

export function isValidWsFrame(input: unknown): input is WsFrame {
  if (!input || typeof input !== 'object') {
    return false;
  }

  const value = input as Record<string, unknown>;

  return (
    typeof value.noteId === 'string' &&
    typeof value.senderId === 'string' &&
    typeof value.protocolVersion === 'number' &&
    typeof value.type === 'string' &&
    FRAME_TYPES.has(value.type as FrameType) &&
    value.payload !== undefined
  );
}

export function createFrame(
  type: FrameType,
  noteId: string,
  senderId: string,
  payload: unknown,
): WsFrame {
  return {
    type,
    noteId,
    senderId,
    protocolVersion: PROTOCOL_VERSION,
    payload,
  };
}
