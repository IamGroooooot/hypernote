import { decodeNoteContainer, decodeNoteMetadata, encodeNoteContainer, type NoteMeta } from '../contracts';
import { createDebouncedSaveScheduler, type DebouncedSaveScheduler } from '../core';
import { ContainerNoteMetadataIndex, type NoteMetadataIndex } from './metadata-index';
import { StoreTrashMover, type TrashMover } from './trash-mover';
import type { NoteContainerStore, NoteSnapshot } from './types';

export class LocalNotePersistence {
  private readonly metadataIndex: NoteMetadataIndex;
  private readonly trashMover: TrashMover;

  constructor(
    private readonly store: NoteContainerStore,
    private readonly saveScheduler: DebouncedSaveScheduler = createDebouncedSaveScheduler(500),
    metadataIndex?: NoteMetadataIndex,
    trashMover?: TrashMover,
  ) {
    this.metadataIndex = metadataIndex ?? new ContainerNoteMetadataIndex(store);
    this.trashMover = trashMover ?? new StoreTrashMover(store);
  }

  scheduleSave(note: NoteSnapshot): void {
    this.saveScheduler.schedule(note.meta.id, () => this.saveNow(note));
  }

  async saveNow(note: NoteSnapshot): Promise<void> {
    const encoded = encodeNoteContainer(note.meta, note.yjsState);
    await this.store.writeContainer(note.meta.id, encoded.bytes);
  }

  async open(noteId: string): Promise<NoteSnapshot> {
    const bytes = await this.store.readContainer(noteId);
    const decoded = decodeNoteContainer(bytes);
    return {
      meta: decoded.meta,
      yjsState: decoded.yjsState,
    };
  }

  async listMetadata(): Promise<NoteMeta[]> {
    return this.metadataIndex.list();
  }

  async moveToTrash(noteId: string): Promise<void> {
    // Stamp deletedAt into the container before moving so sweepTrash can GC it.
    try {
      const bytes = await this.store.readContainer(noteId);
      const decoded = decodeNoteContainer(bytes);
      const updatedMeta: NoteMeta = { ...decoded.meta, deletedAt: Date.now() };
      const encoded = encodeNoteContainer(updatedMeta, decoded.yjsState);
      await this.store.writeContainer(noteId, encoded.bytes);
    } catch {
      // Proceed even if metadata update fails — trash move must not block.
    }

    await this.trashMover.move(noteId);
  }

  async listTrashMetadata(): Promise<NoteMeta[]> {
    const containers = await this.store.listTrashContainers();
    const metadata: NoteMeta[] = [];

    for (const bytes of containers) {
      try {
        metadata.push(decodeNoteMetadata(bytes));
      } catch {
        // Skip corrupted containers.
      }
    }

    return metadata.sort((left, right) => (right.deletedAt ?? 0) - (left.deletedAt ?? 0));
  }

  async restoreFromTrash(noteId: string): Promise<void> {
    await this.store.restoreFromTrash(noteId);

    // Clear deletedAt stamp so the restored note behaves as active.
    try {
      const bytes = await this.store.readContainer(noteId);
      const decoded = decodeNoteContainer(bytes);
      if (decoded.meta.deletedAt !== null) {
        const restoredMeta: NoteMeta = { ...decoded.meta, deletedAt: null };
        const encoded = encodeNoteContainer(restoredMeta, decoded.yjsState);
        await this.store.writeContainer(noteId, encoded.bytes);
      }
    } catch {
      // Best-effort stamp clearing; restored note may still have deletedAt set.
    }
  }

  async sweepTrash(maxAgeDays = 30): Promise<void> {
    const cutoffMs = maxAgeDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const containers = await this.store.listTrashContainers();

    for (const bytes of containers) {
      try {
        const meta = decodeNoteMetadata(bytes);
        if (meta.deletedAt !== null && now - meta.deletedAt > cutoffMs) {
          await this.store.permanentDeleteFromTrash(meta.id);
        }
      } catch {
        // Skip malformed containers.
      }
    }
  }
}
