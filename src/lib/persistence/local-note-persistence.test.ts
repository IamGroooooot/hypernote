import { describe, expect, it } from 'vitest';

import type { NoteMeta } from '../contracts';
import { encodeNoteContainer } from '../contracts/storage';
import { LocalNotePersistence } from './local-note-persistence';
import { StoreTrashMover } from './trash-mover';
import type { NoteContainerStore, NoteSnapshot } from './types';

describe('LocalNotePersistence', () => {
  it('round-trips .yjs container bytes and detects corruption', async () => {
    const store = new InMemoryNoteContainerStore();
    const persistence = new LocalNotePersistence(store);
    const note = createSnapshot('note-1', 'Alpha', 100);

    await persistence.saveNow(note);
    const loaded = await persistence.open(note.meta.id);
    expect(loaded.meta).toEqual(note.meta);
    expect(Array.from(loaded.yjsState)).toEqual(Array.from(note.yjsState));

    store.mutateContainer(note.meta.id, (bytes) => {
      bytes[bytes.length - 1] ^= 0x01;
    });

    await expect(persistence.open(note.meta.id)).rejects.toThrow('checksum mismatch');
  });

  it('lists metadata by updatedAt DESC and skips invalid containers', async () => {
    const store = new InMemoryNoteContainerStore();
    const persistence = new LocalNotePersistence(store);

    await persistence.saveNow(createSnapshot('note-a', 'A', 100));
    await persistence.saveNow(createSnapshot('note-b', 'B', 300));
    await persistence.saveNow(createSnapshot('note-c', 'C', 200));

    store.injectContainer(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));

    const listed = await persistence.listMetadata();
    expect(listed.map((meta) => meta.id)).toEqual(['note-b', 'note-c', 'note-a']);
  });
});

describe('StoreTrashMover', () => {
  it('moves note containers into trash storage', async () => {
    const store = new InMemoryNoteContainerStore();
    const persistence = new LocalNotePersistence(store);
    await persistence.saveNow(createSnapshot('note-trash', 'Trash me', 10));

    const mover = new StoreTrashMover(store);
    await mover.move('note-trash');

    expect(store.hasNote('note-trash')).toBe(false);
    expect(store.hasTrash('note-trash')).toBe(true);
  });
});

describe('LocalNotePersistence.sweepTrash', () => {
  it('permanently deletes trash entries older than maxAgeDays', async () => {
    const store = new InMemoryNoteContainerStore();
    const persistence = new LocalNotePersistence(store);

    const now = Date.now();
    const msIn31Days = 31 * 24 * 60 * 60 * 1000;

    // Save two notes, move both to trash with different deletedAt stamps.
    await persistence.saveNow(createSnapshot('old-note', 'Old', now - msIn31Days));
    await persistence.saveNow(createSnapshot('new-note', 'New', now - 1000));

    // Manually stamp deletedAt by moving via persistence (which stamps deletedAt=now).
    // For the "old" note we need a past deletedAt — inject directly via store.
    store.injectTrash('old-note', createSnapshotWithDeletedAt('old-note', 'Old', now - msIn31Days));
    store.injectTrash('new-note', createSnapshotWithDeletedAt('new-note', 'New', now - 1000));

    await persistence.sweepTrash(30);

    expect(store.hasTrash('old-note')).toBe(false);
    expect(store.hasTrash('new-note')).toBe(true);
  });
});

class InMemoryNoteContainerStore implements NoteContainerStore {
  private readonly notes = new Map<string, Uint8Array>();
  private readonly trash = new Map<string, Uint8Array>();
  private readonly injectedContainers: Uint8Array[] = [];

  async listContainers(): Promise<ReadonlyArray<Uint8Array>> {
    return [
      ...Array.from(this.notes.values(), (value) => value.slice()),
      ...this.injectedContainers.map((value) => value.slice()),
    ];
  }

  async readContainer(noteId: string): Promise<Uint8Array> {
    const note = this.notes.get(noteId);
    if (!note) {
      throw new Error(`Not found: ${noteId}`);
    }

    return note.slice();
  }

  async writeContainer(noteId: string, bytes: Uint8Array): Promise<void> {
    this.notes.set(noteId, bytes.slice());
  }

  async moveContainerToTrash(noteId: string): Promise<void> {
    const note = this.notes.get(noteId);
    if (!note) {
      throw new Error(`Not found: ${noteId}`);
    }

    this.notes.delete(noteId);
    this.trash.set(noteId, note);
  }

  async listTrashContainers(): Promise<ReadonlyArray<Uint8Array>> {
    return Array.from(this.trash.values(), (value) => value.slice());
  }

  async permanentDeleteFromTrash(noteId: string): Promise<void> {
    this.trash.delete(noteId);
  }

  injectContainer(bytes: Uint8Array): void {
    this.injectedContainers.push(bytes.slice());
  }

  injectTrash(noteId: string, bytes: Uint8Array): void {
    this.trash.set(noteId, bytes.slice());
  }

  mutateContainer(noteId: string, mutator: (bytes: Uint8Array) => void): void {
    const note = this.notes.get(noteId);
    if (!note) {
      throw new Error(`Not found: ${noteId}`);
    }

    const copy = note.slice();
    mutator(copy);
    this.notes.set(noteId, copy);
  }

  hasNote(noteId: string): boolean {
    return this.notes.has(noteId);
  }

  hasTrash(noteId: string): boolean {
    return this.trash.has(noteId);
  }
}

function createSnapshot(id: string, title: string, updatedAt: number): NoteSnapshot {
  const meta: NoteMeta = {
    id,
    title,
    createdAt: updatedAt - 1,
    updatedAt,
    deletedAt: null,
  };

  return {
    meta,
    yjsState: new Uint8Array([updatedAt & 0xff, (updatedAt + 1) & 0xff, (updatedAt + 2) & 0xff]),
  };
}

function createSnapshotWithDeletedAt(id: string, title: string, deletedAt: number): Uint8Array {
  const meta: NoteMeta = { id, title, createdAt: deletedAt - 1000, updatedAt: deletedAt, deletedAt };
  return encodeNoteContainer(meta, new Uint8Array([1, 2, 3])).bytes;
}
