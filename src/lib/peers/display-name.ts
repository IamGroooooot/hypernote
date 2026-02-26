const ADJECTIVES = [
  'Amber',
  'Brisk',
  'Calm',
  'Dawn',
  'Ember',
  'Frost',
  'Golden',
  'Ivy',
  'Lunar',
  'Mellow',
  'Nova',
  'Quiet',
  'River',
  'Solar',
  'Velvet',
] as const;

const NOUNS = [
  'Badger',
  'Falcon',
  'Fox',
  'Harbor',
  'Lynx',
  'Maple',
  'Otter',
  'Pine',
  'Raven',
  'Sable',
  'Sparrow',
  'Stone',
  'Tide',
  'Willow',
  'Wolf',
] as const;

export function buildPeerDisplayName(peerId: string): string {
  const seed = hashPeerId(peerId);
  const adjective = ADJECTIVES[seed % ADJECTIVES.length];
  const noun = NOUNS[Math.floor(seed / ADJECTIVES.length) % NOUNS.length];
  const badge = (seed % 90) + 10;
  return `${adjective} ${noun} ${badge}`;
}

function hashPeerId(peerId: string): number {
  let hash = 0;
  for (const ch of peerId) {
    hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return hash;
}
