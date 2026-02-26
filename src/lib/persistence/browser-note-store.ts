import type { NoteContainerStore } from './types';

const NOTE_PREFIX = 'hypernote:notes:';
const TRASH_PREFIX = 'hypernote:trash:';

export class BrowserNoteContainerStore implements NoteContainerStore {
  private readonly memoryStore = new Map<string, Uint8Array>();

  async listContainers(): Promise<ReadonlyArray<Uint8Array>> {
    const noteIds = this.listNoteIds();
    return noteIds
      .map((noteId) => this.readRaw(NOTE_PREFIX, noteId))
      .filter((value): value is Uint8Array => Boolean(value));
  }

  async readContainer(noteId: string): Promise<Uint8Array> {
    const value = this.readRaw(NOTE_PREFIX, noteId);

    if (!value) {
      throw new Error(`note not found: ${noteId}`);
    }

    return value;
  }

  async writeContainer(noteId: string, bytes: Uint8Array): Promise<void> {
    this.writeRaw(NOTE_PREFIX, noteId, bytes);
  }

  async moveContainerToTrash(noteId: string): Promise<void> {
    const value = this.readRaw(NOTE_PREFIX, noteId);

    if (!value) {
      return;
    }

    this.writeRaw(TRASH_PREFIX, noteId, value);
    this.deleteRaw(NOTE_PREFIX, noteId);
  }

  private listNoteIds(): string[] {
    if (typeof localStorage === 'undefined') {
      return Array.from(this.memoryStore.keys())
        .filter((key) => key.startsWith(NOTE_PREFIX))
        .map((key) => key.slice(NOTE_PREFIX.length));
    }

    const noteIds: string[] = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const key = localStorage.key(i);
      if (!key || !key.startsWith(NOTE_PREFIX)) {
        continue;
      }

      noteIds.push(key.slice(NOTE_PREFIX.length));
    }

    return noteIds;
  }

  private readRaw(prefix: string, noteId: string): Uint8Array | null {
    const key = `${prefix}${noteId}`;

    if (typeof localStorage === 'undefined') {
      return this.memoryStore.get(key) ?? null;
    }

    const encoded = localStorage.getItem(key);

    if (!encoded) {
      return null;
    }

    return decodeBase64(encoded);
  }

  private writeRaw(prefix: string, noteId: string, bytes: Uint8Array): void {
    const key = `${prefix}${noteId}`;

    if (typeof localStorage === 'undefined') {
      this.memoryStore.set(key, bytes);
      return;
    }

    localStorage.setItem(key, encodeBase64(bytes));
  }

  private deleteRaw(prefix: string, noteId: string): void {
    const key = `${prefix}${noteId}`;

    if (typeof localStorage === 'undefined') {
      this.memoryStore.delete(key);
      return;
    }

    localStorage.removeItem(key);
  }
}

function encodeBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    const chunk = bytes.subarray(offset, offset + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

function decodeBase64(encoded: string): Uint8Array {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
