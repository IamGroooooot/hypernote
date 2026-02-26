import { describe, expect, it } from 'vitest';

import { findActiveHeadingId, parseMarkdownToc } from './markdown-toc';

describe('parseMarkdownToc', () => {
  it('extracts markdown headings with levels and offsets', () => {
    const text = ['# Title', '', '## Section', 'body', '### Section'].join('\n');

    const toc = parseMarkdownToc(text);

    expect(toc).toHaveLength(3);
    expect(toc[0]).toMatchObject({ text: 'Title', level: 1, line: 1, offset: 0 });
    expect(toc[1]).toMatchObject({ text: 'Section', level: 2, line: 3 });
    expect(toc[2]).toMatchObject({ text: 'Section', level: 3, line: 5, id: 'section-2' });
  });

  it('ignores headings inside fenced code blocks', () => {
    const text = ['# Real', '```md', '# Hidden', '```', '## Real 2'].join('\n');

    const toc = parseMarkdownToc(text);

    expect(toc.map((heading) => heading.text)).toEqual(['Real', 'Real 2']);
  });
});

describe('findActiveHeadingId', () => {
  it('returns heading id nearest to cursor offset', () => {
    const text = ['# Start', 'x', '## Mid', 'x', '### End'].join('\n');
    const toc = parseMarkdownToc(text);

    expect(findActiveHeadingId(toc, 0)).toBe('start');
    expect(findActiveHeadingId(toc, text.indexOf('## Mid') + 2)).toBe('mid');
    expect(findActiveHeadingId(toc, text.length)).toBe('end');
  });

  it('returns empty id when cursor is before first heading', () => {
    const toc = parseMarkdownToc('# One\n## Two');
    expect(findActiveHeadingId(toc, -1)).toBe('');
  });
});
