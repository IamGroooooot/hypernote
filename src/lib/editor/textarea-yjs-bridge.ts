import * as Y from 'yjs';

const LOCAL_ORIGIN = 'textarea-local-edit';
const REMOTE_ORIGIN = 'peer-update';

export type TextChangeSource = 'local' | 'remote';

export interface TextChangeEvent {
  source: TextChangeSource;
  text: string;
  update: Uint8Array;
}

export interface CreateTextareaBridgeOptions {
  initialText?: string;
  initialUpdate?: Uint8Array;
}

export interface TextareaYjsBridge {
  noteId: string;
  getText(): string;
  setText(nextText: string): Uint8Array | null;
  applyPeerUpdate(update: Uint8Array): void;
  encodeStateVector(): Uint8Array;
  encodeStateAsUpdate(stateVector?: Uint8Array): Uint8Array;
  onChange(listener: (event: TextChangeEvent) => void): () => void;
  destroy(): void;
}

export function createTextareaYjsBridge(
  noteId: string,
  options: CreateTextareaBridgeOptions = {},
): TextareaYjsBridge {
  const doc = new Y.Doc();
  const ytext = doc.getText('content');
  const listeners = new Set<(event: TextChangeEvent) => void>();

  const handleDocUpdate = (update: Uint8Array, origin: unknown) => {
    const source: TextChangeSource = origin === LOCAL_ORIGIN ? 'local' : 'remote';
    const event: TextChangeEvent = {
      source,
      text: ytext.toString(),
      update: new Uint8Array(update),
    };

    for (const listener of listeners) {
      listener(event);
    }
  };

  doc.on('update', handleDocUpdate);

  if (options.initialUpdate) {
    Y.applyUpdate(doc, options.initialUpdate, REMOTE_ORIGIN);
  } else if (options.initialText && options.initialText.length > 0) {
    doc.transact(() => {
      ytext.insert(0, options.initialText ?? '');
    }, LOCAL_ORIGIN);
  }

  return {
    noteId,

    getText() {
      return ytext.toString();
    },

    setText(nextText) {
      const current = ytext.toString();

      if (nextText === current) {
        return null;
      }

      const { prefixLen, deleteLen, insertText } = computeMinimalEdit(current, nextText);

      let capturedUpdate: Uint8Array | null = null;
      const captureLocalUpdate = (update: Uint8Array, origin: unknown) => {
        if (origin === LOCAL_ORIGIN) {
          capturedUpdate = new Uint8Array(update);
        }
      };

      doc.on('update', captureLocalUpdate);

      doc.transact(() => {
        if (deleteLen > 0) {
          ytext.delete(prefixLen, deleteLen);
        }

        if (insertText.length > 0) {
          ytext.insert(prefixLen, insertText);
        }
      }, LOCAL_ORIGIN);

      doc.off('update', captureLocalUpdate);

      return capturedUpdate;
    },

    applyPeerUpdate(update) {
      Y.applyUpdate(doc, update, REMOTE_ORIGIN);
    },

    encodeStateVector() {
      return Y.encodeStateVector(doc);
    },

    encodeStateAsUpdate(stateVector) {
      return Y.encodeStateAsUpdate(doc, stateVector);
    },

    onChange(listener) {
      listeners.add(listener);

      return () => {
        listeners.delete(listener);
      };
    },

    destroy() {
      listeners.clear();
      doc.off('update', handleDocUpdate);
      doc.destroy();
    },
  };
}

interface MinimalEdit {
  prefixLen: number;
  deleteLen: number;
  insertText: string;
}

function computeMinimalEdit(current: string, nextText: string): MinimalEdit {
  let prefixLen = 0;
  const minLen = Math.min(current.length, nextText.length);

  while (prefixLen < minLen && current[prefixLen] === nextText[prefixLen]) {
    prefixLen += 1;
  }

  let currentSuffixIndex = current.length - 1;
  let nextSuffixIndex = nextText.length - 1;

  while (
    currentSuffixIndex >= prefixLen &&
    nextSuffixIndex >= prefixLen &&
    current[currentSuffixIndex] === nextText[nextSuffixIndex]
  ) {
    currentSuffixIndex -= 1;
    nextSuffixIndex -= 1;
  }

  const deleteLen = currentSuffixIndex - prefixLen + 1;
  const insertText = nextText.slice(prefixLen, nextSuffixIndex + 1);

  return {
    prefixLen,
    deleteLen: Math.max(0, deleteLen),
    insertText,
  };
}
