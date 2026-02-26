import JSZip from 'jszip';
import { jsPDF } from 'jspdf';

import type { NoteMeta } from '../contracts';

export interface ExportNoteInput {
  meta: NoteMeta;
  text: string;
}

export interface ExportFileManifestEntry {
  path: string;
  size: number;
  sha256: string;
}

export interface ExportManifest {
  workspaceId: string;
  exportedAt: string;
  noteCount: number;
  files: ExportFileManifestEntry[];
}

export async function exportCurrentNote(note: ExportNoteInput): Promise<void> {
  const markdown = buildMarkdown(note);
  const pdfBytes = buildPdf(note);

  triggerDownload(
    new Blob([markdown], { type: 'text/markdown;charset=utf-8' }),
    `${safeFilename(note.meta.title, note.meta.id)}.md`,
  );

  triggerDownload(
    new Blob([toArrayBuffer(pdfBytes)], { type: 'application/pdf' }),
    `${safeFilename(note.meta.title, note.meta.id)}.pdf`,
  );
}

export async function exportWorkspaceZip(
  notes: ExportNoteInput[],
  workspaceId = 'hypernote-workspace',
): Promise<void> {
  const zip = new JSZip();
  const files: ExportFileManifestEntry[] = [];

  for (const note of notes) {
    const base = safeFilename(note.meta.title, note.meta.id);

    const markdownPath = `markdown/${base}.md`;
    const markdownBytes = new TextEncoder().encode(buildMarkdown(note));
    zip.file(markdownPath, markdownBytes);
    files.push({
      path: markdownPath,
      size: markdownBytes.byteLength,
      sha256: await sha256Hex(markdownBytes),
    });

    const pdfPath = `pdf/${base}.pdf`;
    const pdfBytes = buildPdf(note);
    zip.file(pdfPath, pdfBytes);
    files.push({
      path: pdfPath,
      size: pdfBytes.byteLength,
      sha256: await sha256Hex(pdfBytes),
    });
  }

  const manifest: ExportManifest = {
    workspaceId,
    exportedAt: new Date().toISOString(),
    noteCount: notes.length,
    files,
  };

  const manifestBytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2));
  zip.file('manifest.json', manifestBytes);

  const zipBlob = await zip.generateAsync({ type: 'blob' });
  triggerDownload(zipBlob, `${workspaceId}-${Date.now()}.zip`);
}

function buildMarkdown(note: ExportNoteInput): string {
  return `# ${note.meta.title}\n\n${note.text}`;
}

function buildPdf(note: ExportNoteInput): Uint8Array {
  const document = new jsPDF({
    format: 'a4',
    unit: 'pt',
  });

  const left = 48;
  const right = 48;
  const maxWidth = document.internal.pageSize.getWidth() - left - right;
  const lineHeight = 18;
  const title = note.meta.title.length > 0 ? note.meta.title : 'Untitled';

  document.setFont('helvetica', 'bold');
  document.setFontSize(16);
  document.text(title, left, 56);

  document.setFont('helvetica', 'normal');
  document.setFontSize(11);

  const lines = document.splitTextToSize(note.text, maxWidth) as string[];
  let cursorY = 84;
  const pageBottom = document.internal.pageSize.getHeight() - 48;

  for (const line of lines) {
    if (cursorY > pageBottom) {
      document.addPage();
      cursorY = 56;
    }

    document.text(line, left, cursorY);
    cursorY += lineHeight;
  }

  const buffer = document.output('arraybuffer');
  return new Uint8Array(buffer);
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    return 'unavailable';
  }

  const digest = await globalThis.crypto.subtle.digest('SHA-256', toArrayBuffer(bytes));
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}

function safeFilename(title: string, fallback: string): string {
  const normalized = title.trim().length > 0 ? title.trim() : fallback;
  const sanitized = normalized
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-_]/g, '')
    .slice(0, 48);

  return sanitized.length > 0 ? sanitized : fallback;
}

function triggerDownload(blob: Blob, filename: string): void {
  if (typeof window === 'undefined') {
    return;
  }

  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return copy.buffer;
}
