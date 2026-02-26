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

export type MarkdownBlock =
  | { type: 'heading'; level: number; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list-item'; ordered: boolean; index: number; text: string }
  | { type: 'blockquote'; text: string }
  | { type: 'code'; text: string };

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
  const markdown = buildMarkdown(note);
  const blocks = parseMarkdownBlocks(markdown);
  const document = new jsPDF({
    format: 'a4',
    unit: 'pt',
  });

  const left = 48;
  const right = 48;
  const maxWidth = document.internal.pageSize.getWidth() - left - right;
  const pageBottom = document.internal.pageSize.getHeight() - 48;
  let cursorY = 56;

  const addPageIfNeeded = (nextLineHeight: number) => {
    if (cursorY + nextLineHeight <= pageBottom) {
      return;
    }
    document.addPage();
    cursorY = 56;
  };

  const drawWrappedText = (
    text: string,
    options: {
      font: 'helvetica' | 'courier';
      style: 'normal' | 'bold' | 'italic';
      size: number;
      indent?: number;
      spacingAfter?: number;
    },
  ) => {
    const indent = options.indent ?? 0;
    const spacingAfter = options.spacingAfter ?? 8;
    const lineHeight = options.size * 1.45;
    const width = Math.max(20, maxWidth - indent);

    document.setFont(options.font, options.style);
    document.setFontSize(options.size);

    const lines = document.splitTextToSize(text, width) as string[];
    for (const line of lines) {
      addPageIfNeeded(lineHeight);
      document.text(line, left + indent, cursorY);
      cursorY += lineHeight;
    }
    cursorY += spacingAfter;
  };

  for (const block of blocks) {
    switch (block.type) {
      case 'heading':
        drawWrappedText(block.text, {
          font: 'helvetica',
          style: 'bold',
          size: headingSize(block.level),
          spacingAfter: 6,
        });
        break;
      case 'paragraph':
        drawWrappedText(block.text, {
          font: 'helvetica',
          style: 'normal',
          size: 11,
        });
        break;
      case 'list-item': {
        const bullet = block.ordered ? `${block.index}.` : '•';
        drawWrappedText(`${bullet} ${block.text}`, {
          font: 'helvetica',
          style: 'normal',
          size: 11,
          indent: 12,
          spacingAfter: 4,
        });
        break;
      }
      case 'blockquote':
        drawWrappedText(`> ${block.text}`, {
          font: 'helvetica',
          style: 'italic',
          size: 11,
          indent: 10,
        });
        break;
      case 'code':
        drawWrappedText(block.text, {
          font: 'courier',
          style: 'normal',
          size: 10,
          indent: 10,
          spacingAfter: 6,
        });
        break;
      default:
        break;
    }
  }

  const buffer = document.output('arraybuffer');
  return new Uint8Array(buffer);
}

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const paragraphBuffer: string[] = [];

  let inFence = false;
  let codeLines: string[] = [];

  const flushParagraph = () => {
    if (paragraphBuffer.length === 0) {
      return;
    }

    const text = paragraphBuffer.join(' ').trim();
    if (text.length > 0) {
      blocks.push({ type: 'paragraph', text });
    }
    paragraphBuffer.length = 0;
  };

  const flushCode = () => {
    if (codeLines.length === 0) {
      return;
    }
    blocks.push({
      type: 'code',
      text: codeLines.join('\n'),
    });
    codeLines = [];
  };

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (/^\s{0,3}(```|~~~)/u.test(rawLine)) {
      flushParagraph();
      if (inFence) {
        flushCode();
      }
      inFence = !inFence;
      continue;
    }

    if (inFence) {
      codeLines.push(rawLine);
      continue;
    }

    if (trimmed.length === 0) {
      flushParagraph();
      continue;
    }

    const headingMatch = rawLine.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/u);
    if (headingMatch) {
      flushParagraph();
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      continue;
    }

    const orderedListMatch = rawLine.match(/^\s*(\d+)\.\s+(.+)$/u);
    if (orderedListMatch) {
      flushParagraph();
      blocks.push({
        type: 'list-item',
        ordered: true,
        index: Number.parseInt(orderedListMatch[1], 10),
        text: orderedListMatch[2].trim(),
      });
      continue;
    }

    const unorderedListMatch = rawLine.match(/^\s*[-*+]\s+(.+)$/u);
    if (unorderedListMatch) {
      flushParagraph();
      blocks.push({
        type: 'list-item',
        ordered: false,
        index: 0,
        text: unorderedListMatch[1].trim(),
      });
      continue;
    }

    const quoteMatch = rawLine.match(/^\s*>\s?(.+)$/u);
    if (quoteMatch) {
      flushParagraph();
      blocks.push({
        type: 'blockquote',
        text: quoteMatch[1].trim(),
      });
      continue;
    }

    paragraphBuffer.push(trimmed);
  }

  flushParagraph();
  if (inFence) {
    flushCode();
  }

  return blocks;
}

function headingSize(level: number): number {
  switch (level) {
    case 1:
      return 18;
    case 2:
      return 15;
    case 3:
      return 13;
    case 4:
      return 12;
    default:
      return 11;
  }
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
