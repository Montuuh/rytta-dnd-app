import { themeOf, type GeneratorOptions, type MapTheme, type RoomUse } from '../domain/generator'
import { floorArt, type DecalArt, type EffectArt, type FloorArt, type WallArt } from './map-art'
import { propPictures } from './prop-pictures'

// RYT-068: what each theme is painted with. Floors, walls and water are the author's ChatGPT tiles
// (public/tabletop/textures), decals their scattered details; the rock outside underground maps is
// never textured: it is painted as a quiet dark ground (design-flow.md, "the void").

type RGB = readonly [number, number, number]
/** A map, or just its kind and theme. */
type Themed = { options: Pick<GeneratorOptions, 'kind' | 'theme'> }

export interface Scatter {
  art: DecalArt
  /** Chance per square (at normal density). */
  share: number
  /** Size range in squares. */
  size: readonly [number, number]
  /** Where it falls: anywhere on the floor, along walls, on outdoor ground or beside paths. */
  where?: 'floor' | 'edge' | 'ground' | 'path'
  /** Drawn translucent (stains, cracks). */
  alpha?: number
}

export interface Materials {
  /** The main floor (underground, the building) or the ground (outdoors). */
  floor: FloorArt
  /** A second floor blended into it in soft patches, so the tile never shows its repeat. */
  wear?: FloorArt
  /** Passages between rooms, trails outdoors. */
  passage: FloorArt
  /** Floors by room purpose (a library's parquet, the kitchen's flags). */
  rooms?: Partial<Record<RoomUse, FloorArt>>
  /** Floors by room id (the tavern's rooms). */
  byId?: Readonly<Record<string, FloorArt>>
  wall: WallArt
  /** Pools and streams; lava on volcanic maps. */
  water: FloorArt
  hot?: boolean
  /** The rock outside: its base colour, the lighter and darker clouds, the specks. */
  rock: { base: string; light: string; dark: string; speck: string }
  decals: readonly Scatter[]
  /** Torch light on underground walls. */
  light: RGB
  /** Some wall lights burn this colour instead (cold fire in crypts and ice). */
  sconce?: RGB
  /** Tree pictures (variants of the `tree` prop) a wood is planted with. */
  trees?: readonly number[]
  /** The floor that tells this theme apart in the generator's sample, when not the main one. */
  sample?: FloorArt
}

const warmRock = { base: '#13100d', light: '#2a231c', dark: '#070605', speck: '#8c7c68' }
const coldRock = { base: '#101216', light: '#232831', dark: '#060709', speck: '#7e8794' }
const torch: RGB = [255, 170, 90]

const underground: Record<string, Materials> = {
  stone: {
    floor: 'flagstone-grey',
    wear: 'flagstone-grey-worn',
    passage: 'flagstone-grey-worn',
    rooms: {
      library: 'parquet-herringbone',
      study: 'parquet-herringbone',
      barracks: 'planks-oak-dark',
      kitchen: 'kitchen-flagstone',
      forge: 'brick-running',
      throne: 'slate',
      shrine: 'mosaic',
    },
    wall: 'wall-dungeon-stone',
    water: 'water-deep',
    rock: warmRock,
    decals: [
      { art: 'cracks', share: 0.05, size: [0.5, 0.8], alpha: 0.75 },
      { art: 'stains-dried', share: 0.025, size: [0.4, 0.7], alpha: 0.7 },
      { art: 'rubble-scatter', share: 0.035, size: [0.4, 0.7], where: 'edge' },
      { art: 'moss', share: 0.03, size: [0.4, 0.7], where: 'edge', alpha: 0.85 },
      { art: 'puddles', share: 0.012, size: [0.5, 0.8], alpha: 0.85 },
      { art: 'bones-scatter', share: 0.01, size: [0.35, 0.5] },
    ],
    light: torch,
  },
  ruins: {
    floor: 'flagstone-mossy',
    wear: 'flagstone-grey-worn',
    passage: 'flagstone-mossy',
    rooms: { library: 'parquet-herringbone', shrine: 'crypt-slabs-mossy' },
    wall: 'wall-ruined',
    water: 'water-shallow',
    rock: warmRock,
    decals: [
      { art: 'rubble-scatter', share: 0.06, size: [0.45, 0.8] },
      { art: 'moss', share: 0.05, size: [0.4, 0.75], where: 'edge' },
      { art: 'roots', share: 0.025, size: [0.5, 0.8], where: 'edge' },
      { art: 'grass-tufts', share: 0.03, size: [0.3, 0.45] },
      { art: 'cracks', share: 0.04, size: [0.5, 0.8], alpha: 0.75 },
      { art: 'leaves', share: 0.02, size: [0.4, 0.6] },
      // Broken pottery left by whoever lived here.
      { art: 'shards', share: 0.012, size: [0.3, 0.45] },
    ],
    light: torch,
  },
  temple: {
    floor: 'marble-white',
    passage: 'marble-white',
    rooms: {
      shrine: 'mosaic',
      throne: 'carpet-red',
      library: 'parquet-chevron',
      study: 'parquet-chevron',
      barracks: 'parquet-herringbone',
    },
    wall: 'wall-granite',
    water: 'water-shallow',
    rock: warmRock,
    decals: [
      { art: 'cracks', share: 0.025, size: [0.5, 0.8], alpha: 0.5 },
      { art: 'stains-dried', share: 0.01, size: [0.4, 0.6], alpha: 0.5 },
    ],
    light: [255, 196, 120],
    sconce: [255, 220, 150],
  },
  sandstone: {
    floor: 'sandstone-tiles',
    wear: 'sand-desert',
    passage: 'sandstone-tiles',
    rooms: { shrine: 'mosaic', throne: 'terracotta', library: 'parquet-chevron' },
    wall: 'wall-sandstone',
    water: 'water-shallow',
    rock: { base: '#16110c', light: '#30251a', dark: '#080604', speck: '#a08a66' },
    decals: [
      { art: 'sand-drifts', share: 0.05, size: [0.5, 0.85], where: 'edge' },
      { art: 'cracks', share: 0.03, size: [0.5, 0.8], alpha: 0.7 },
      { art: 'pebbles', share: 0.025, size: [0.3, 0.45] },
      { art: 'bones-scatter', share: 0.01, size: [0.35, 0.5] },
    ],
    light: torch,
  },
  dwarven: {
    floor: 'hex-tiles',
    wear: 'slate',
    passage: 'slate',
    rooms: {
      barracks: 'planks-oak-dark',
      kitchen: 'kitchen-flagstone',
      library: 'parquet-herringbone',
      forge: 'brick-running',
    },
    wall: 'wall-granite',
    water: 'water-deep',
    rock: coldRock,
    decals: [
      { art: 'cracks', share: 0.035, size: [0.5, 0.8], alpha: 0.7 },
      { art: 'rubble-scatter', share: 0.03, size: [0.4, 0.7], where: 'edge' },
      { art: 'scorch', share: 0.012, size: [0.5, 0.8], alpha: 0.7 },
    ],
    light: [255, 160, 80],
  },
  ice: {
    floor: 'ice',
    wear: 'snow',
    passage: 'snow',
    wall: 'wall-ice',
    water: 'water-deep',
    rock: { base: '#0d1218', light: '#1f2c3a', dark: '#05080b', speck: '#a9c4dc' },
    decals: [
      { art: 'snow-drifts', share: 0.06, size: [0.5, 0.85], where: 'edge' },
      { art: 'cracks', share: 0.03, size: [0.5, 0.8], alpha: 0.6 },
      { art: 'pebbles', share: 0.015, size: [0.3, 0.45] },
    ],
    light: [200, 225, 255],
    sconce: [150, 200, 255],
  },
  volcanic: {
    floor: 'obsidian',
    wear: 'ash',
    passage: 'ash',
    rooms: { forge: 'brick-running' },
    wall: 'wall-obsidian',
    water: 'lava',
    hot: true,
    rock: { base: '#120b09', light: '#2a1712', dark: '#050303', speck: '#d0643a' },
    decals: [
      { art: 'ash-piles', share: 0.04, size: [0.35, 0.6] },
      { art: 'scorch', share: 0.035, size: [0.5, 0.85], alpha: 0.8 },
      { art: 'rubble-scatter', share: 0.03, size: [0.4, 0.7], where: 'edge' },
      { art: 'cracks', share: 0.03, size: [0.5, 0.8], alpha: 0.7 },
    ],
    light: [255, 130, 60],
  },
  crypt: {
    floor: 'crypt-slabs',
    wear: 'crypt-slabs-mossy',
    passage: 'crypt-slabs',
    rooms: { lord: 'slate', shrine: 'mosaic' },
    wall: 'wall-crypt-ashlar',
    water: 'water-deep',
    rock: coldRock,
    decals: [
      { art: 'cracks', share: 0.05, size: [0.5, 0.8], alpha: 0.75 },
      { art: 'bones-scatter', share: 0.03, size: [0.35, 0.5] },
      { art: 'stains-dried', share: 0.02, size: [0.4, 0.6], alpha: 0.7 },
      { art: 'moss', share: 0.025, size: [0.4, 0.65], where: 'edge', alpha: 0.85 },
      { art: 'puddles', share: 0.01, size: [0.5, 0.75], alpha: 0.85 },
    ],
    light: torch,
    sconce: [140, 190, 255],
  },
  mossy: {
    floor: 'crypt-slabs-mossy',
    wear: 'flagstone-mossy',
    passage: 'crypt-slabs-mossy',
    rooms: { lord: 'crypt-slabs' },
    wall: 'wall-ruined',
    water: 'water-shallow',
    rock: warmRock,
    decals: [
      { art: 'moss', share: 0.06, size: [0.4, 0.75], where: 'edge' },
      { art: 'roots', share: 0.035, size: [0.5, 0.8], where: 'edge' },
      { art: 'bones-scatter', share: 0.025, size: [0.35, 0.5] },
      { art: 'puddles', share: 0.02, size: [0.5, 0.8], alpha: 0.85 },
      { art: 'leaves', share: 0.02, size: [0.4, 0.6] },
    ],
    light: torch,
    sconce: [150, 230, 170],
  },
  marble: {
    floor: 'marble-white',
    passage: 'marble-white',
    rooms: { lord: 'crypt-slabs', shrine: 'mosaic' },
    wall: 'wall-granite',
    water: 'water-shallow',
    rock: coldRock,
    decals: [
      { art: 'cracks', share: 0.035, size: [0.5, 0.8], alpha: 0.55 },
      { art: 'bones-scatter', share: 0.015, size: [0.35, 0.5] },
    ],
    light: [255, 196, 120],
    sconce: [200, 160, 255],
  },
  rock: {
    floor: 'cave-rock',
    wear: 'cave-rock-damp',
    passage: 'cave-rock',
    wall: 'wall-cave-rock',
    water: 'water-deep',
    rock: warmRock,
    // Fewer, larger details: small specks read as noise on a TV (UI review RYT-068).
    decals: [
      { art: 'pebbles', share: 0.03, size: [0.4, 0.6] },
      { art: 'rubble-scatter', share: 0.04, size: [0.5, 0.85], where: 'edge' },
      { art: 'cracks', share: 0.03, size: [0.55, 0.85], alpha: 0.7 },
      { art: 'puddles', share: 0.015, size: [0.55, 0.85], alpha: 0.85 },
      { art: 'bones-scatter', share: 0.006, size: [0.45, 0.6] },
    ],
    light: torch,
  },
  damp: {
    floor: 'cave-rock-damp',
    wear: 'mud',
    passage: 'cave-rock-damp',
    wall: 'wall-cave-rock',
    water: 'water-shallow',
    rock: warmRock,
    decals: [
      { art: 'puddles', share: 0.05, size: [0.5, 0.85], alpha: 0.9 },
      { art: 'moss', share: 0.05, size: [0.4, 0.7], where: 'edge' },
      { art: 'roots', share: 0.03, size: [0.5, 0.8], where: 'edge' },
      { art: 'mud-patches', share: 0.03, size: [0.5, 0.8] },
      { art: 'pebbles', share: 0.02, size: [0.4, 0.55] },
    ],
    light: torch,
  },
  crystal: {
    floor: 'cave-crystal',
    wear: 'cave-rock',
    passage: 'cave-rock',
    wall: 'wall-cave-rock',
    water: 'water-deep',
    rock: { base: '#0f0d15', light: '#241f33', dark: '#060509', speck: '#b9a4ff' },
    decals: [
      { art: 'pebbles', share: 0.03, size: [0.4, 0.6] },
      { art: 'rubble-scatter', share: 0.04, size: [0.5, 0.85], where: 'edge' },
    ],
    light: [190, 170, 255],
    sconce: [170, 140, 255],
  },
}
underground.caveIce = {
  ...underground.ice!,
  passage: 'ice',
  wall: 'wall-ice',
  decals: [
    { art: 'snow-drifts', share: 0.07, size: [0.5, 0.9], where: 'edge' },
    { art: 'pebbles', share: 0.02, size: [0.4, 0.55] },
    { art: 'cracks', share: 0.03, size: [0.5, 0.8], alpha: 0.6 },
  ],
}
underground.caveVolcanic = { ...underground.volcanic!, rooms: undefined, wall: 'wall-cave-rock' }

const outdoor: Record<string, Materials> = {
  forest: {
    floor: 'grass-lush',
    wear: 'forest-floor',
    passage: 'dirt-trail',
    wall: 'wall-hedge',
    water: 'water-shallow',
    rock: warmRock,
    decals: [
      { art: 'grass-tufts', share: 0.08, size: [0.3, 0.5], where: 'ground' },
      { art: 'leaves', share: 0.05, size: [0.4, 0.65], where: 'ground' },
      { art: 'flower-patches', share: 0.025, size: [0.3, 0.45], where: 'ground' },
      { art: 'pebbles', share: 0.04, size: [0.25, 0.4], where: 'path' },
      { art: 'grass-tufts', share: 0.12, size: [0.25, 0.4], where: 'path' },
    ],
    light: torch,
    trees: [0, 1, 2, 6, 7],
  },
  autumn: {
    floor: 'grass-dry',
    wear: 'autumn-leaves',
    passage: 'dirt-trail',
    wall: 'wall-hedge',
    water: 'water-shallow',
    rock: warmRock,
    decals: [
      { art: 'leaves', share: 0.1, size: [0.4, 0.7], where: 'ground' },
      { art: 'grass-tufts', share: 0.04, size: [0.3, 0.45], where: 'ground' },
      { art: 'mud-patches', share: 0.02, size: [0.5, 0.8], where: 'path' },
      { art: 'leaves', share: 0.1, size: [0.35, 0.55], where: 'path' },
    ],
    light: torch,
    trees: [4, 4, 0, 3, 7],
    sample: 'autumn-leaves',
  },
  meadow: {
    floor: 'meadow',
    wear: 'grass-lush',
    passage: 'dirt-trail',
    wall: 'wall-hedge',
    water: 'water-shallow',
    rock: warmRock,
    decals: [
      { art: 'flower-patches', share: 0.07, size: [0.3, 0.5], where: 'ground' },
      { art: 'grass-tufts', share: 0.07, size: [0.3, 0.5], where: 'ground' },
      { art: 'pebbles', share: 0.04, size: [0.25, 0.4], where: 'path' },
      { art: 'grass-tufts', share: 0.12, size: [0.25, 0.4], where: 'path' },
    ],
    light: torch,
    trees: [6, 0, 2],
  },
  swamp: {
    floor: 'moss',
    wear: 'swamp',
    passage: 'mud',
    wall: 'wall-hedge',
    water: 'water-shallow',
    rock: warmRock,
    decals: [
      { art: 'mud-patches', share: 0.05, size: [0.5, 0.85], where: 'ground' },
      { art: 'puddles', share: 0.04, size: [0.5, 0.85], where: 'ground', alpha: 0.9 },
      { art: 'roots', share: 0.03, size: [0.5, 0.8], where: 'ground' },
      { art: 'grass-tufts', share: 0.06, size: [0.3, 0.5], where: 'ground' },
      { art: 'puddles', share: 0.06, size: [0.4, 0.6], where: 'path', alpha: 0.9 },
    ],
    light: torch,
    trees: [5, 5, 3, 7],
    sample: 'swamp',
  },
  winter: {
    floor: 'snow',
    wear: 'snow',
    passage: 'dirt-trail',
    wall: 'wall-hedge',
    water: 'ice',
    rock: coldRock,
    decals: [
      { art: 'snow-drifts', share: 0.06, size: [0.5, 0.9], where: 'ground' },
      { art: 'tracks', share: 0.02, size: [0.4, 0.6], where: 'ground', alpha: 0.8 },
      { art: 'snow-drifts', share: 0.12, size: [0.35, 0.6], where: 'path' },
      { art: 'pebbles', share: 0.02, size: [0.25, 0.4], where: 'ground' },
    ],
    light: torch,
    trees: [1, 1, 3],
  },
}

const tavern: Record<string, Materials> = {
  oak: {
    floor: 'grass-lush',
    wear: 'dirt',
    passage: 'dirt-trail',
    byId: { hall: 'planks-oak', kitchen: 'kitchen-flagstone', store: 'cellar-earth' },
    rooms: { guest: 'planks-oak-dark' },
    wall: 'wall-tavern-stone',
    water: 'water-shallow',
    rock: warmRock,
    decals: [
      { art: 'grass-tufts', share: 0.06, size: [0.3, 0.5], where: 'ground' },
      { art: 'flower-patches', share: 0.02, size: [0.3, 0.45], where: 'ground' },
      { art: 'ale-stains', share: 0.03, size: [0.3, 0.45], alpha: 0.8 },
      { art: 'straw', share: 0.05, size: [0.4, 0.6], where: 'edge' },
      // A dropped mug or plate here and there.
      { art: 'shards', share: 0.008, size: [0.25, 0.4] },
    ],
    light: torch,
  },
  walnut: {
    floor: 'grass-dry',
    wear: 'dirt',
    passage: 'cobblestone',
    byId: { hall: 'planks-oak-dark', kitchen: 'brick-herringbone', store: 'cellar-earth' },
    rooms: { guest: 'parquet-herringbone' },
    wall: 'wall-brick-red',
    water: 'water-shallow',
    rock: warmRock,
    decals: [
      { art: 'grass-tufts', share: 0.05, size: [0.3, 0.5], where: 'ground' },
      { art: 'ale-stains', share: 0.03, size: [0.3, 0.45], alpha: 0.8 },
      { art: 'straw', share: 0.05, size: [0.4, 0.6], where: 'edge' },
      // A dropped mug or plate here and there.
      { art: 'shards', share: 0.008, size: [0.25, 0.4] },
    ],
    light: torch,
  },
  winter: {
    floor: 'snow',
    wear: 'snow',
    passage: 'dirt-trail',
    byId: { hall: 'planks-oak', kitchen: 'kitchen-flagstone', store: 'cellar-earth' },
    rooms: { guest: 'planks-oak-dark' },
    wall: 'wall-wood-planks',
    water: 'ice',
    rock: coldRock,
    decals: [
      { art: 'snow-drifts', share: 0.06, size: [0.5, 0.9], where: 'ground' },
      { art: 'tracks', share: 0.03, size: [0.4, 0.6], where: 'ground', alpha: 0.8 },
      { art: 'ale-stains', share: 0.03, size: [0.3, 0.45], alpha: 0.8 },
      { art: 'straw', share: 0.05, size: [0.4, 0.6], where: 'edge' },
      // A dropped mug or plate here and there.
      { art: 'shards', share: 0.008, size: [0.25, 0.4] },
    ],
    light: torch,
  },
}

/** The materials a generated map is painted with. */
export function materialsOf(map: Themed): Materials {
  const { kind } = map.options
  const theme: MapTheme = themeOf(kind, map.options.theme)
  if (kind === 'forest') return outdoor[theme] ?? outdoor.forest!
  if (kind === 'tavern') return tavern[theme] ?? tavern.oak!
  if (kind === 'cave')
    return (
      (theme === 'ice'
        ? underground.caveIce
        : theme === 'volcanic'
          ? underground.caveVolcanic
          : underground[theme]) ?? underground.rock!
    )
  return underground[theme] ?? underground[kind === 'crypt' ? 'crypt' : 'stone']!
}

const base = () => `${import.meta.env.BASE_URL}tabletop/`
const thumb = (kind: 'floors' | 'walls', name: string) =>
  `${base()}textures/thumbs/${kind}/${name}.webp`

/**
 * A theme's sample in the generator: its floor (the hall's for a tavern), a band of its wall
 * (underground and taverns), a pool of its water or lava, and the ground outside a tavern; small
 * thumbnails with their average colour shown while they load.
 */
export function sampleOf(map: Themed) {
  const m = materialsOf(map)
  const { kind } = map.options
  const floor = kind === 'tavern' ? (m.byId?.hall ?? m.floor) : (m.sample ?? m.floor)
  return {
    floor: thumb('floors', floor),
    tone: floorArt[floor],
    wall: kind === 'forest' ? null : thumb('walls', m.wall),
    pool: kind === 'tavern' ? null : thumb('floors', m.water),
    ground:
      kind === 'tavern'
        ? thumb('floors', m.floor)
        : kind === 'forest'
          ? thumb('floors', m.passage)
          : null,
  }
}
export const floorUrl = (name: FloorArt) => `${base()}textures/floors/${name}.webp`
export const wallUrl = (name: WallArt) => `${base()}textures/walls/${name}.webp`
export const effectUrl = (name: EffectArt) => `${base()}textures/effects/${name}.webp`
export const decalUrl = (name: DecalArt) => `${base()}decals/${name}.webp`
export const treeUrl = (variant: number) => `${base()}props/tree-${variant}-2x2.webp`

/** The floors a set of materials uses, the main one first. */
export function floorsOf(m: Materials): FloorArt[] {
  return [
    ...new Set([
      m.floor,
      ...(m.wear ? [m.wear] : []),
      m.passage,
      m.water,
      ...Object.values(m.rooms ?? {}),
      ...Object.values(m.byId ?? {}),
    ]),
  ]
}

/** Every picture a map's painting needs, as URLs. */
export function artUrls(map: Themed): string[] {
  const m = materialsOf(map)
  const trees = map.options.kind === 'forest' ? (m.trees ?? []).filter(treeExists) : []
  return [
    ...floorsOf(m).map(floorUrl),
    wallUrl(m.wall),
    ...new Set(m.decals.map((d) => decalUrl(d.art))),
    ...new Set(trees.map(treeUrl)),
  ]
}

const treeExists = (v: number) => v < (propPictures.tree?.sizes['2x2'] ?? 0)

/** Loaded pictures by URL; a picture that fails to load is simply left out. */
export type MapArt = ReadonlyMap<string, CanvasImageSource>

const loaded = new Map<string, Promise<CanvasImageSource | null>>()

function load(url: string) {
  let hit = loaded.get(url)
  if (!hit) {
    hit = new Promise<CanvasImageSource | null>((resolve) => {
      const image = new Image()
      image.decoding = 'async'
      image.onload = () => resolve(image)
      image.onerror = () => {
        loaded.delete(url)
        resolve(null)
      }
      image.src = url
    })
    loaded.set(url, hit)
  }
  return hit
}

/** Loads (once per page) the pictures a map's painting needs. */
export async function loadMapArt(map: Themed): Promise<MapArt> {
  if (typeof Image === 'undefined') return new Map()
  const urls = artUrls(map)
  const images = await Promise.all(urls.map(load))
  const art = new Map<string, CanvasImageSource>()
  urls.forEach((url, i) => {
    const image = images[i]
    if (image) art.set(url, image)
  })
  return art
}

/** Floor tiles the generator dialog shows as a theme's swatch. */
export const themeSwatch = (map: Themed) => floorUrl(materialsOf(map).floor)
