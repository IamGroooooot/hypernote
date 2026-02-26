export type PaletteActionId =
  | 'new-note'
  | 'toc'
  | 'rename'
  | 'delete'
  | 'restore-mode'
  | 'peers'
  | 'share-workspace'
  | 'export-current'
  | 'export-workspace';

export interface PaletteActionDescriptor {
  id: PaletteActionId;
  label: string;
  shortcut: string;
  keywords: string[];
}

export const PALETTE_ACTIONS: readonly PaletteActionDescriptor[] = [
  {
    id: 'new-note',
    label: '◈ new note',
    shortcut: '⌘/Ctrl+N',
    keywords: ['new', 'create', 'note'],
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
    };
  }

  if (action.id === 'restore-mode') {
    return {
      ...action,
      label: `↩ restore from trash (${context.trashCount})`,
    };
  }

  return action;
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

export function matchesShortcut(event: KeyboardEvent, actionId: PaletteActionId): boolean {
  const key = event.key.toLowerCase();
  const mod = isModKey(event);

  switch (actionId) {
    case 'new-note':
      return mod && !event.shiftKey && key === 'n';
    case 'toc':
      return mod && event.shiftKey && key === 't';
    case 'rename':
      return !mod && !event.shiftKey && event.key === 'F2';
    case 'delete':
      return mod && !event.shiftKey && key === 'backspace';
    case 'restore-mode':
      return mod && event.shiftKey && key === 'backspace';
    case 'peers':
      return mod && event.shiftKey && key === 'p';
    case 'share-workspace':
      return mod && event.shiftKey && key === 's';
    case 'export-current':
      return mod && !event.shiftKey && key === 'e';
    case 'export-workspace':
      return mod && event.shiftKey && key === 'e';
    default:
      return false;
  }
}
