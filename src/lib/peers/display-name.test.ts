import { describe, expect, it } from 'vitest';

import { buildPeerDisplayName } from './display-name';

describe('peer display names', () => {
  it('builds a stable generated name from peer id', () => {
    expect(buildPeerDisplayName('peer-a')).toBe(buildPeerDisplayName('peer-a'));
    expect(buildPeerDisplayName('peer-a')).not.toBe(buildPeerDisplayName('peer-b'));
  });
});
