import { describe, expect, it } from 'vitest';

import { formatModShortcut, formatShortcutForDisplay, matchesShortcut } from './actions';

describe('shortcut labels', () => {
  it('renders mac shortcuts with command key only', () => {
    expect(formatShortcutForDisplay('⌘/Ctrl+N', 'mac')).toBe('⌘+N');
    expect(formatModShortcut('Z', 'mac')).toBe('⌘+Z');
  });

  it('renders non-mac shortcuts with ctrl key', () => {
    expect(formatShortcutForDisplay('⌘/Ctrl+Shift+E', 'non-mac')).toBe('Ctrl+Shift+E');
    expect(formatModShortcut('K', 'non-mac')).toBe('Ctrl+K');
  });

  it('matches toggle notes shortcut on mod+b', () => {
    const modB = {
      key: 'b',
      metaKey: true,
      ctrlKey: false,
      shiftKey: false,
    } as KeyboardEvent;

    const modShiftB = {
      key: 'b',
      metaKey: true,
      ctrlKey: false,
      shiftKey: true,
    } as KeyboardEvent;

    expect(matchesShortcut(modB, 'toggle-notes')).toBe(true);
    expect(matchesShortcut(modShiftB, 'toggle-notes')).toBe(false);
  });
});
