export type PaletteActionId =
  | 'new-note'
  | 'toggle-notes'
  | 'toc'
  | 'rename'
  | 'delete'
  | 'restore-mode'
  | 'peers'
  | 'join-workspace'
  | 'share-workspace'
  | 'export-current'
  | 'export-workspace';

export interface PaletteActionDescriptor {
  id: PaletteActionId;
  label: string;
  shortcut: string;
  keywords: string[];
}

export type ShortcutPlatform = 'mac' | 'non-mac';

export const PALETTE_ACTIONS: readonly PaletteActionDescriptor[] = [
  {
    id: 'new-note',
    label: '◈ new note',
    shortcut: '⌘/Ctrl+N',
    keywords: ['new', 'create', 'note'],
  },
  {
    id: 'toggle-notes',
    label: '▣ toggle notes pane',
    shortcut: '⌘/Ctrl+B',
    keywords: ['notes', 'sidebar', 'toggle', 'pane'],
  },
  {
    id: 'toc',
    label: '☰ table of contents',
    shortcut: '⌘/Ctrl+Shift+T',
    keywords: ['toc', 'heading', 'outline', 'navigate'],
  },
  {
    id: 'rename',
    label: '✎ rename note',
    shortcut: 'F2',
    keywords: ['rename', 'title'],
  },
  {
    id: 'delete',
    label: '⌦ delete note → trash',
    shortcut: '⌘/Ctrl+Backspace',
    keywords: ['delete', 'trash', 'remove'],
  },
  {
    id: 'restore-mode',
    label: '↩ restore from trash',
    shortcut: '⌘/Ctrl+Shift+Backspace',
    keywords: ['restore', 'trash', 'recover'],
  },
  {
    id: 'peers',
    label: '⊕ peers',
    shortcut: '⌘/Ctrl+Shift+P',
    keywords: ['peer', 'lan', 'sync'],
  },
  {
    id: 'join-workspace',
    label: '↗ join workspace',
    shortcut: '⌘/Ctrl+Shift+J',
    keywords: ['join', 'workspace', 'connect', 'target'],
  },
  {
    id: 'share-workspace',
    label: '⇆ share workspace',
    shortcut: '⌘/Ctrl+Shift+S',
    keywords: ['share', 'workspace', 'invite'],
  },
  {
    id: 'export-current',
    label: '⇩ export current note',
    shortcut: '⌘/Ctrl+E',
    keywords: ['export', 'current', 'note'],
  },
  {
    id: 'export-workspace',
    label: '⇩ export workspace',
    shortcut: '⌘/Ctrl+Shift+E',
    keywords: ['export', 'workspace', 'bundle'],
  },
] as const;

export function filterActionByContext(
  action: PaletteActionDescriptor,
  context: {
    hasSelectedNote: boolean;
    trashCount: number;
    connectedPeers: number;
  },
): PaletteActionDescriptor | null {
  const shortcut = formatShortcutForDisplay(action.shortcut);

  if (!context.hasSelectedNote && (action.id === 'rename' || action.id === 'delete')) {
    return null;
  }

  if (action.id === 'restore-mode' && context.trashCount === 0) {
    return null;
  }

  if (action.id === 'peers') {
    return {
      ...action,
      label: `⊕ peers (${context.connectedPeers} connected)`,
      shortcut,
    };
  }

  if (action.id === 'restore-mode') {
    return {
      ...action,
      label: `↩ restore from trash (${context.trashCount})`,
      shortcut,
    };
  }

  return {
    ...action,
    shortcut,
  };
}

export function matchesActionQuery(action: PaletteActionDescriptor, query: string): boolean {
  const normalized = query.trim().toLowerCase();
  if (!normalized) {
    return true;
  }

  if (action.label.toLowerCase().includes(normalized)) {
    return true;
  }

  return action.keywords.some((keyword) => keyword.includes(normalized));
}

export function isModKey(event: KeyboardEvent): boolean {
  return event.metaKey || event.ctrlKey;
}

function matchesLetter(event: KeyboardEvent, letter: string): boolean {
  const key = event.key.toLowerCase();
  const code = (event.code ?? '').toLowerCase();
  return key === letter || code === `key${letter}`;
}

export function matchesShortcut(event: KeyboardEvent, actionId: PaletteActionId): boolean {
  const key = event.key.toLowerCase();
  const code = (event.code ?? '').toLowerCase();
  const mod = isModKey(event);

  switch (actionId) {
    case 'new-note':
      return mod && !event.shiftKey && matchesLetter(event, 'n');
    case 'toggle-notes':
      return mod && !event.shiftKey && matchesLetter(event, 'b');
    case 'toc':
      return mod && event.shiftKey && matchesLetter(event, 't');
    case 'rename':
      return !mod && !event.shiftKey && (event.key === 'F2' || event.code === 'F2');
    case 'delete':
      return mod && !event.shiftKey && (key === 'backspace' || code === 'backspace');
    case 'restore-mode':
      return mod && event.shiftKey && (key === 'backspace' || code === 'backspace');
    case 'peers':
      return mod && event.shiftKey && matchesLetter(event, 'p');
    case 'join-workspace':
      return mod && event.shiftKey && matchesLetter(event, 'j');
    case 'share-workspace':
      return mod && event.shiftKey && matchesLetter(event, 's');
    case 'export-current':
      return mod && !event.shiftKey && matchesLetter(event, 'e');
    case 'export-workspace':
      return mod && event.shiftKey && matchesLetter(event, 'e');
    default:
      return false;
  }
}

export function getShortcutPlatform(): ShortcutPlatform {
  if (typeof navigator === 'undefined') {
    return 'non-mac';
  }

  const userAgentData = (navigator as Navigator & { userAgentData?: { platform?: string } })
    .userAgentData;
  const platform = userAgentData?.platform ?? navigator.platform ?? navigator.userAgent ?? '';

  const normalized = platform.toLowerCase();
  return /(mac|iphone|ipad|ipod)/u.test(normalized) ? 'mac' : 'non-mac';
}

export function formatShortcutForDisplay(
  shortcut: string,
  platform: ShortcutPlatform = getShortcutPlatform(),
): string {
  if (platform === 'mac') {
    return shortcut.replace(/⌘\/Ctrl\+/gu, '⌘+');
  }

  return shortcut.replace(/⌘\/Ctrl\+/gu, 'Ctrl+');
}

export function formatModShortcut(
  key: string,
  platform: ShortcutPlatform = getShortcutPlatform(),
): string {
  return platform === 'mac' ? `⌘+${key}` : `Ctrl+${key}`;
}
