import type { NoteMeta } from '../contracts';

export interface NoteSnapshot {
  meta: NoteMeta;
  yjsState: Uint8Array;
}

export interface NoteContainerStore {
  listContainers(): Promise<ReadonlyArray<Uint8Array>>;
  readContainer(noteId: string): Promise<Uint8Array>;
  writeContainer(noteId: string, bytes: Uint8Array): Promise<void>;
  moveContainerToTrash(noteId: string): Promise<void>;
}
