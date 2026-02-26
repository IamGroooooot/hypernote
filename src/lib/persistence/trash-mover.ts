import type { NoteContainerStore } from './types';

export interface TrashMover {
  move(noteId: string): Promise<void>;
}

export class StoreTrashMover implements TrashMover {
  constructor(private readonly store: Pick<NoteContainerStore, 'moveContainerToTrash'>) {}

  async move(noteId: string): Promise<void> {
    await this.store.moveContainerToTrash(noteId);
  }
}
