export interface TocHeading {
  id: string;
  level: number;
  text: string;
  offset: number;
  line: number;
}

const FENCE_PATTERN = /^\s{0,3}(```|~~~)/u;
const ATX_HEADING_PATTERN = /^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/u;

export function parseMarkdownToc(markdown: string, maxLevel = 4): TocHeading[] {
  const headings: TocHeading[] = [];
  const slugCounts = new Map<string, number>();

  const lines = markdown.split('\n');
  let inFence = false;
  let offset = 0;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (FENCE_PATTERN.test(trimmed)) {
      inFence = !inFence;
      offset += line.length + (index < lines.length - 1 ? 1 : 0);
      continue;
    }

    if (!inFence) {
      const headingMatch = line.match(ATX_HEADING_PATTERN);
      if (headingMatch) {
        const level = headingMatch[1].length;
        if (level <= maxLevel) {
          const text = normalizeHeadingText(headingMatch[2]);
          if (text.length > 0) {
            const baseSlug = slugifyHeading(text);
            const seen = slugCounts.get(baseSlug) ?? 0;
            slugCounts.set(baseSlug, seen + 1);
            const id = seen === 0 ? baseSlug : `${baseSlug}-${seen + 1}`;

            headings.push({
              id,
              level,
              text,
              offset,
              line: index + 1,
            });
          }
        }
      }
    }

    offset += line.length + (index < lines.length - 1 ? 1 : 0);
  }

  return headings;
}

export function findActiveHeadingId(headings: TocHeading[], cursorOffset: number): string {
  let activeId = '';

  for (const heading of headings) {
    if (heading.offset > cursorOffset) {
      break;
    }
    activeId = heading.id;
  }

  return activeId;
}

function normalizeHeadingText(raw: string): string {
  return raw
    .replace(/\[(.*?)\]\(.*?\)/g, '$1')
    .replace(/[*_`~]/g, '')
    .trim();
}

function slugifyHeading(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  return slug.length > 0 ? slug : 'section';
}
