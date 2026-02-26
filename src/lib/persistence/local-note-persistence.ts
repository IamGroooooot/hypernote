import { decodeNoteContainer, encodeNoteContainer, type NoteMeta } from '../contracts';
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
    await this.trashMover.move(noteId);
  }
}
