// RYT-062: the prop library. Every drawing is Rytta's own (ui/prop-art.tsx); sizes in squares.

export const propCategories = [
  'furniture',
  'containers',
  'dungeon',
  'nature',
  'light',
  'structures',
] as const
export type PropCategory = (typeof propCategories)[number]

export interface PropDefinition {
  id: string
  category: PropCategory
  w: number
  h: number
}

export const propLibrary: readonly PropDefinition[] = [
  { id: 'table', category: 'furniture', w: 1, h: 1 },
  { id: 'chair', category: 'furniture', w: 1, h: 1 },
  { id: 'bed', category: 'furniture', w: 1, h: 2 },
  { id: 'bookshelf', category: 'furniture', w: 1, h: 1 },
  { id: 'bar', category: 'furniture', w: 1, h: 3 },
  { id: 'rug', category: 'furniture', w: 2, h: 2 },
  { id: 'weapon-rack', category: 'furniture', w: 1, h: 1 },
  { id: 'crate', category: 'containers', w: 1, h: 1 },
  { id: 'barrel', category: 'containers', w: 1, h: 1 },
  { id: 'sack', category: 'containers', w: 1, h: 1 },
  { id: 'chest', category: 'containers', w: 1, h: 1 },
  { id: 'urn', category: 'containers', w: 1, h: 1 },
  { id: 'coins', category: 'containers', w: 1, h: 1 },
  { id: 'cauldron', category: 'containers', w: 1, h: 1 },
  { id: 'altar', category: 'dungeon', w: 2, h: 1 },
  { id: 'statue', category: 'dungeon', w: 1, h: 1 },
  { id: 'pillar', category: 'dungeon', w: 1, h: 1 },
  { id: 'sarcophagus', category: 'dungeon', w: 1, h: 2 },
  { id: 'bones', category: 'dungeon', w: 1, h: 1 },
  { id: 'rubble', category: 'dungeon', w: 1, h: 1 },
  { id: 'web', category: 'dungeon', w: 1, h: 1 },
  { id: 'trapdoor', category: 'dungeon', w: 1, h: 1 },
  { id: 'lever', category: 'dungeon', w: 1, h: 1 },
  { id: 'rock', category: 'nature', w: 1, h: 1 },
  { id: 'stalagmite', category: 'nature', w: 1, h: 1 },
  { id: 'mushrooms', category: 'nature', w: 1, h: 1 },
  { id: 'bush', category: 'nature', w: 1, h: 1 },
  { id: 'tree', category: 'nature', w: 2, h: 2 },
  { id: 'stump', category: 'nature', w: 1, h: 1 },
  { id: 'log', category: 'nature', w: 2, h: 1 },
  { id: 'flowers', category: 'nature', w: 1, h: 1 },
  { id: 'campfire', category: 'light', w: 1, h: 1 },
  { id: 'brazier', category: 'light', w: 1, h: 1 },
  { id: 'candles', category: 'light', w: 1, h: 1 },
  { id: 'torch', category: 'light', w: 1, h: 1 },
  { id: 'hearth', category: 'light', w: 2, h: 1 },
  { id: 'stairs', category: 'structures', w: 1, h: 1 },
  { id: 'well', category: 'structures', w: 1, h: 1 },
  { id: 'bridge', category: 'structures', w: 2, h: 2 },
  { id: 'cart', category: 'structures', w: 2, h: 1 },
  { id: 'tent', category: 'structures', w: 2, h: 2 },
  { id: 'fountain', category: 'structures', w: 2, h: 2 },
]

export const propById = new Map(propLibrary.map((p) => [p.id, p]))
