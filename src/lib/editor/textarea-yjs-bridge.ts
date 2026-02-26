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

      let capturedUpdate: Uint8Array | null = null;
      const captureLocalUpdate = (update: Uint8Array, origin: unknown) => {
        if (origin === LOCAL_ORIGIN) {
          capturedUpdate = new Uint8Array(update);
        }
      };

      doc.on('update', captureLocalUpdate);

      doc.transact(() => {
        if (ytext.length > 0) {
          ytext.delete(0, ytext.length);
        }

        if (nextText.length > 0) {
          ytext.insert(0, nextText);
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
