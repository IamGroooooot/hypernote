import { describe, expect, it } from 'vitest';

import { parseMarkdownBlocks } from './workspace-export';

describe('parseMarkdownBlocks', () => {
  it('parses common markdown blocks for PDF rendering', () => {
    const markdown = [
      '# Title',
      '',
      'intro line',
      'continues',
      '',
      '- one',
      '2. two',
      '> quote',
      '```ts',
      'const x = 1;',
      '```',
    ].join('\n');

    const blocks = parseMarkdownBlocks(markdown);

    expect(blocks).toEqual([
      { type: 'heading', level: 1, text: 'Title' },
      { type: 'paragraph', text: 'intro line continues' },
      { type: 'list-item', ordered: false, index: 0, text: 'one' },
      { type: 'list-item', ordered: true, index: 2, text: 'two' },
      { type: 'blockquote', text: 'quote' },
      { type: 'code', text: 'const x = 1;' },
    ]);
  });

  it('flushes unfinished fenced blocks at EOF', () => {
    const blocks = parseMarkdownBlocks('```\nline');
    expect(blocks).toEqual([{ type: 'code', text: 'line' }]);
  });
});
