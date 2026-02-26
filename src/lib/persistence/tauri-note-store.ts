import { appDataDir, join as joinPath } from '@tauri-apps/api/path';
import { exists, mkdir, readDir, readFile, remove, rename, writeFile } from '@tauri-apps/plugin-fs';

import type { NoteContainerStore } from './types';

export function isTauriEnv(): boolean {
  return (
    typeof window !== 'undefined' &&
    ('__TAURI__' in window || '__TAURI_INTERNALS__' in window || '__TAURI_INVOKE__' in window)
  );
}

export class TauriNoteContainerStore implements NoteContainerStore {
  private notesDir: string | null = null;
  private trashDir: string | null = null;

  private async getNotesDir(): Promise<string> {
    if (!this.notesDir) {
      const base = await appDataDir();
      this.notesDir = await joinPath(base, 'notes');
    }
    return this.notesDir;
  }

  private async getTrashDir(): Promise<string> {
    if (!this.trashDir) {
      const base = await appDataDir();
      this.trashDir = await joinPath(base, 'trash');
    }
    return this.trashDir;
  }

  async listContainers(): Promise<ReadonlyArray<Uint8Array>> {
    const dir = await this.getNotesDir();
    const dirExists = await exists(dir);
    if (!dirExists) return [];

    const entries = await readDir(dir);
    const results: Uint8Array[] = [];

    for (const entry of entries) {
      if (entry.name?.endsWith('.yjs')) {
        const path = await joinPath(dir, entry.name);
        const bytes = await readFile(path);
        results.push(bytes);
      }
    }

    return results;
  }

  async readContainer(noteId: string): Promise<Uint8Array> {
    const dir = await this.getNotesDir();
    const path = await joinPath(dir, `${noteId}.yjs`);
    const fileExists = await exists(path);

    if (!fileExists) {
      throw new Error(`note not found: ${noteId}`);
    }

    return readFile(path);
  }

  async writeContainer(noteId: string, bytes: Uint8Array): Promise<void> {
    const dir = await this.getNotesDir();
    const dirExists = await exists(dir);

    if (!dirExists) {
      await mkdir(dir, { recursive: true });
    }

    const path = await joinPath(dir, `${noteId}.yjs`);
    await writeFile(path, bytes);
  }

  async moveContainerToTrash(noteId: string): Promise<void> {
    const notesDir = await this.getNotesDir();
    const trashDir = await this.getTrashDir();

    const src = await joinPath(notesDir, `${noteId}.yjs`);
    const srcExists = await exists(src);

    if (!srcExists) return;

    const trashExists = await exists(trashDir);
    if (!trashExists) {
      await mkdir(trashDir, { recursive: true });
    }

    const dst = await joinPath(trashDir, `${noteId}.yjs`);
    await rename(src, dst);
  }

  async listTrashContainers(): Promise<ReadonlyArray<Uint8Array>> {
    const dir = await this.getTrashDir();
    const dirExists = await exists(dir);
    if (!dirExists) return [];

    const entries = await readDir(dir);
    const results: Uint8Array[] = [];

    for (const entry of entries) {
      if (entry.name?.endsWith('.yjs')) {
        const path = await joinPath(dir, entry.name);
        const bytes = await readFile(path);
        results.push(bytes);
      }
    }

    return results;
  }

  async permanentDeleteFromTrash(noteId: string): Promise<void> {
    const dir = await this.getTrashDir();
    const path = await joinPath(dir, `${noteId}.yjs`);
    const fileExists = await exists(path);

    if (fileExists) {
      await remove(path);
    }
  }

  async restoreFromTrash(noteId: string): Promise<void> {
    const trashDir = await this.getTrashDir();
    const notesDir = await this.getNotesDir();

    const src = await joinPath(trashDir, `${noteId}.yjs`);
    const srcExists = await exists(src);

    if (!srcExists) return;

    const notesDirExists = await exists(notesDir);
    if (!notesDirExists) {
      await mkdir(notesDir, { recursive: true });
    }

    const dst = await joinPath(notesDir, `${noteId}.yjs`);
    await rename(src, dst);
  }
}
