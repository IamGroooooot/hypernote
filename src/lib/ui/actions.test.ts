import { describe, expect, it } from 'vitest';

import { formatModShortcut, formatShortcutForDisplay } from './actions';

describe('shortcut labels', () => {
  it('renders mac shortcuts with command key only', () => {
    expect(formatShortcutForDisplay('⌘/Ctrl+N', 'mac')).toBe('⌘+N');
    expect(formatModShortcut('Z', 'mac')).toBe('⌘+Z');
  });

  it('renders non-mac shortcuts with ctrl key', () => {
    expect(formatShortcutForDisplay('⌘/Ctrl+Shift+E', 'non-mac')).toBe('Ctrl+Shift+E');
    expect(formatModShortcut('K', 'non-mac')).toBe('Ctrl+K');
  });
});
