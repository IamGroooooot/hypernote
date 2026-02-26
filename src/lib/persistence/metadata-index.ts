import { decodeNoteMetadata, type NoteMeta } from '../contracts';
import type { NoteContainerStore } from './types';

export interface NoteMetadataIndex {
  list(): Promise<NoteMeta[]>;
}

export class ContainerNoteMetadataIndex implements NoteMetadataIndex {
  constructor(private readonly store: Pick<NoteContainerStore, 'listContainers'>) {}

  async list(): Promise<NoteMeta[]> {
    const containers = await this.store.listContainers();
    const metadata: NoteMeta[] = [];

    for (const container of containers) {
      try {
        metadata.push(decodeNoteMetadata(container));
      } catch {
        // Corrupted or unsupported files are ignored so listing can continue.
      }
    }

    return metadata.sort((left, right) => right.updatedAt - left.updatedAt);
  }
}
