import { appDataDir } from '@tauri-apps/api/path';
import { exists, mkdir, readDir, readFile, remove, rename, writeFile } from '@tauri-apps/plugin-fs';

import type { NoteContainerStore } from './types';

export function isTauriEnv(): boolean {
  return typeof window !== 'undefined' && '__TAURI__' in window;
}

export class TauriNoteContainerStore implements NoteContainerStore {
  private notesDir: string | null = null;
  private trashDir: string | null = null;

  private async getNotesDir(): Promise<string> {
    if (!this.notesDir) {
      const base = await appDataDir();
      this.notesDir = `${base}notes`;
    }
    return this.notesDir;
  }

  private async getTrashDir(): Promise<string> {
    if (!this.trashDir) {
      const base = await appDataDir();
      this.trashDir = `${base}trash`;
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
        const bytes = await readFile(`${dir}/${entry.name}`);
        results.push(bytes);
      }
    }

    return results;
  }

  async readContainer(noteId: string): Promise<Uint8Array> {
    const dir = await this.getNotesDir();
    const path = `${dir}/${noteId}.yjs`;
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

    await writeFile(`${dir}/${noteId}.yjs`, bytes);
  }

  async moveContainerToTrash(noteId: string): Promise<void> {
    const notesDir = await this.getNotesDir();
    const trashDir = await this.getTrashDir();

    const src = `${notesDir}/${noteId}.yjs`;
    const srcExists = await exists(src);

    if (!srcExists) return;

    const trashExists = await exists(trashDir);
    if (!trashExists) {
      await mkdir(trashDir, { recursive: true });
    }

    await rename(src, `${trashDir}/${noteId}.yjs`);
  }

  async listTrashContainers(): Promise<ReadonlyArray<Uint8Array>> {
    const dir = await this.getTrashDir();
    const dirExists = await exists(dir);
    if (!dirExists) return [];

    const entries = await readDir(dir);
    const results: Uint8Array[] = [];

    for (const entry of entries) {
      if (entry.name?.endsWith('.yjs')) {
        const bytes = await readFile(`${dir}/${entry.name}`);
        results.push(bytes);
      }
    }

    return results;
  }

  async permanentDeleteFromTrash(noteId: string): Promise<void> {
    const dir = await this.getTrashDir();
    const path = `${dir}/${noteId}.yjs`;
    const fileExists = await exists(path);

    if (fileExists) {
      await remove(path);
    }
  }
}
