import { z } from 'zod'

// ADR 032: the tabletop contract. Positions and sizes are in squares; one square is 5 feet.

export const grounds = ['parchment', 'stone', 'grass', 'wood', 'sand'] as const
export type Ground = (typeof grounds)[number]
export const tokenColors = [
  'amber',
  'crimson',
  'forest',
  'azure',
  'violet',
  'slate',
  'ivory',
  'ochre',
] as const
export type TokenColor = (typeof tokenColors)[number]
/** SRD 5.2.1 Creature Size and Space (page 14). */
export const creatureSizes = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const
export type CreatureSize = (typeof creatureSizes)[number]
export const areaShapes = ['sphere', 'cylinder', 'cube', 'cone', 'line', 'emanation'] as const
export type AreaShape = (typeof areaShapes)[number]
export const damageTypes = [
  'fire',
  'cold',
  'lightning',
  'thunder',
  'acid',
  'poison',
  'necrotic',
  'radiant',
  'force',
] as const
export type DamageType = (typeof damageTypes)[number]
export const ambiences = [
  'dungeon',
  'cave',
  'forest',
  'rain',
  'storm',
  'campfire',
  'tavern',
  'sea',
] as const
export type Ambience = (typeof ambiences)[number]
export const soundEffects = ['door', 'thunder', 'gong', 'swords', 'coins'] as const
export type SoundEffect = (typeof soundEffects)[number]
export const doorStates = ['closed', 'open', 'locked'] as const
export type DoorState = (typeof doorStates)[number]

const num = z.number().finite()
const rect = z.tuple([num, num, num, num])
const point = z.tuple([num, num])

export const roomSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  rects: z.array(rect),
})
export type Room = z.infer<typeof roomSchema>
/** Generated passages (RYT-063) are reveal areas, numbered apart from the rooms. */
export const isPassage = (id: string) => id.startsWith('pass-')
/** The number the DM reads for each room or passage, in list order. */
export function roomNumbers(rooms: Room[]) {
  const numbers = new Map<string, { passage: boolean; n: number }>()
  let room = 0
  let passage = 0
  for (const r of rooms)
    numbers.set(
      r.id,
      isPassage(r.id) ? { passage: true, n: ++passage } : { passage: false, n: ++room },
    )
  return numbers
}

export const fogOpSchema = z.discriminatedUnion('shape', [
  z.object({
    mode: z.enum(['reveal', 'hide']),
    shape: z.literal('rect'),
    x: num,
    y: num,
    w: num,
    h: num,
  }),
  z.object({
    mode: z.enum(['reveal', 'hide']),
    shape: z.literal('circle'),
    x: num,
    y: num,
    r: num,
  }),
  z.object({
    mode: z.enum(['reveal', 'hide']),
    shape: z.literal('brush'),
    r: num,
    points: z.array(point),
  }),
  z.object({ mode: z.enum(['reveal', 'hide']), shape: z.literal('rects'), rects: z.array(rect) }),
])
export type FogOp = z.infer<typeof fogOpSchema>
export const fogSchema = z.object({
  base: z.enum(['hidden', 'revealed']).catch('hidden'),
  ops: z.array(fogOpSchema).catch([]),
})
export type Fog = z.infer<typeof fogSchema>

export const recipeSchema = z
  .object({
    kind: z.string().max(20),
    seed: z.number().int(),
    look: z.string().max(20),
    density: z.string().max(20).optional(),
    secret: z.boolean().optional(),
    version: z.number().int(),
  })
  .passthrough()
export type Recipe = z.infer<typeof recipeSchema>

export const sceneSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1).max(80),
  map_kind: z.enum(['blank', 'upload', 'generated']),
  map_path: z.string().max(200).nullable(),
  map_width: z.number().int().nullable(),
  map_height: z.number().int().nullable(),
  cell_px: num,
  offset_x: num,
  offset_y: num,
  cols: z.number().int(),
  rows: z.number().int(),
  ground: z.enum(grounds),
  grid_visible: z.boolean(),
  fog_enabled: z.boolean(),
  fog: fogSchema,
  revision: z.number().int(),
  updated_at: z.string(),
  /** DM only. */
  rooms: z.array(roomSchema).optional(),
  recipe: recipeSchema.nullable().optional(),
  /** The generated look (ink or painted), for everyone; the recipe stays DM-only. */
  look: z.string().max(20).nullable().optional(),
})
export type Scene = z.infer<typeof sceneSchema>

const tokenData = z.object({
  color: z.enum(tokenColors).optional(),
  size: z.enum(creatureSizes).optional(),
  srd_id: z.string().max(80).optional(),
  shape: z.enum(['round', 'square', 'hex']).optional(),
})
const propData = z.object({ prop: z.string().max(40), tint: z.string().max(20).optional() })
const doorData = z.object({
  state: z.enum(doorStates),
  secret: z.boolean().optional(),
  rooms: z.array(z.string()).optional(),
})
const eventActions = z.object({
  reveal_room: z.string().optional(),
  reveal_radius: num.optional(),
  show_hidden: z.boolean().optional(),
  card_id: z.uuid().optional(),
  ambience: z.enum(ambiences).optional(),
  sound: z.enum(soundEffects).optional(),
})
export type EventActions = z.infer<typeof eventActions>
const areaData = z.object({
  shape: z.enum(areaShapes),
  size_ft: num,
  width_ft: num.optional(),
  angle: num.optional(),
  damage: z.enum(damageTypes).optional(),
})
export type AreaData = z.infer<typeof areaData>

const itemBase = {
  id: z.uuid(),
  x: num,
  y: num,
  w: num,
  h: num,
  rotation: z.number().int(),
  label: z.string().max(80).nullable(),
  combatant_id: z.uuid().nullable(),
  character_id: z.uuid().nullable(),
  /** DM only. */
  hidden: z.boolean().optional(),
  locked: z.boolean().optional(),
  revision: z.number().int().optional(),
}
export const itemSchema = z.discriminatedUnion('kind', [
  z.object({ ...itemBase, kind: z.literal('token'), data: tokenData }),
  z.object({ ...itemBase, kind: z.literal('prop'), data: propData }),
  z.object({ ...itemBase, kind: z.literal('door'), data: doorData }),
  z.object({
    ...itemBase,
    kind: z.literal('note'),
    data: z.object({}).passthrough(),
    secret: z.object({ text: z.string().max(4000).optional() }).optional(),
  }),
  z.object({
    ...itemBase,
    kind: z.literal('event'),
    data: z.object({ fired: z.boolean().optional() }),
    secret: z
      .object({ text: z.string().max(4000).optional(), actions: eventActions.optional() })
      .optional(),
  }),
  z.object({ ...itemBase, kind: z.literal('area'), data: areaData }),
])
export type Item = z.infer<typeof itemSchema>
export type ItemKind = Item['kind']
export type ItemOf<K extends ItemKind> = Extract<Item, { kind: K }>

export const screenSchema = z
  .object({
    diagonal_in: num.optional(),
    px_w: num.optional(),
    px_h: num.optional(),
    base_mm: num.optional(),
    fine: num.optional(),
    flip: z.boolean().optional(),
  })
  .catch({})
export type ScreenSetup = z.infer<typeof screenSchema>

export const liveSchema = z.object({
  scene_id: z.uuid().nullable(),
  view_x: num.nullable(),
  view_y: num.nullable(),
  card_id: z.uuid().nullable(),
  ambience: z.enum(ambiences).nullable(),
  track_id: z.uuid().nullable(),
  volume: z.number().int(),
  playing: z.boolean(),
  loop: z.boolean(),
  sound: z.object({ key: z.enum(soundEffects), at: z.string() }).nullable(),
  ping: z.object({ x: num, y: num, at: z.string() }).nullable(),
  measure: z.object({ points: z.array(point), at: z.string() }).nullable(),
  screen: screenSchema,
  revision: z.number().int(),
  updated_at: z.string().nullable(),
})
export type Live = z.infer<typeof liveSchema>

export const cardSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(80),
  body: z.string().max(4000),
  image_path: z.string().max(200).nullable(),
  revision: z.number().int().optional(),
  updated_at: z.string().optional(),
})
export type Card = z.infer<typeof cardSchema>
export const trackSchema = z.object({
  id: z.uuid(),
  title: z.string().min(1).max(80),
  path: z.string().max(200),
  mime: z.string(),
  size_bytes: z.number().int().optional(),
  created_at: z.string().optional(),
})
export type Track = z.infer<typeof trackSchema>

export const viewSchema = z.object({
  role: z.enum(['dm', 'player']),
  live: liveSchema,
  scene: sceneSchema.nullable(),
  items: z.array(itemSchema),
  card: cardSchema.nullable(),
  track: trackSchema.nullable(),
})
export type TabletopView = z.infer<typeof viewSchema>

export const sceneSummarySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  map_kind: z.enum(['blank', 'upload', 'generated']),
  map_path: z.string().nullable(),
  cols: z.number().int(),
  rows: z.number().int(),
  ground: z.enum(grounds),
  fog_enabled: z.boolean(),
  recipe: recipeSchema.nullable(),
  revision: z.number().int(),
  updated_at: z.string(),
  items: z.number().int(),
})
export type SceneSummary = z.infer<typeof sceneSummarySchema>
export const sceneListSchema = z.object({ live: liveSchema, scenes: z.array(sceneSummarySchema) })
export type SceneList = z.infer<typeof sceneListSchema>
export const librarySchema = z.object({ cards: z.array(cardSchema), tracks: z.array(trackSchema) })
export type Library = z.infer<typeof librarySchema>

/** What the editor sends; missing keys stay unchanged on the server. */
export type ItemPatch = Partial<Omit<Item, 'kind' | 'data' | 'revision'>> & {
  id?: string
  kind?: ItemKind
  data?: Record<string, unknown>
  secret?: Record<string, unknown>
}

export type SceneFields = Partial<{
  name: string
  map_kind: Scene['map_kind']
  map_path: string | null
  map_width: number | null
  map_height: number | null
  cell_px: number
  offset_x: number
  offset_y: number
  cols: number
  rows: number
  ground: Ground
  grid_visible: boolean
  fog_enabled: boolean
  rooms: Room[]
  recipe: Recipe | null
  items: ItemPatch[]
}>

export type LivePatch = Partial<{
  scene_id: string | null
  view_x: number
  view_y: number
  card_id: string | null
  ambience: Ambience | null
  track_id: string | null
  volume: number
  playing: boolean
  loop: boolean
  sound: SoundEffect | null
  ping: { x: number; y: number } | null
  measure: { points: [number, number][] } | null
  screen: ScreenSetup
}>

export type FogChange =
  | { reset: 'hidden' | 'revealed' }
  | { mode: 'reveal' | 'hide'; shape: 'rect'; x: number; y: number; w: number; h: number }
  | { mode: 'reveal' | 'hide'; shape: 'circle'; x: number; y: number; r: number }
  | { mode: 'reveal' | 'hide'; shape: 'brush'; r: number; points: [number, number][] }
  | { mode: 'reveal' | 'hide'; shape: 'room'; room: string }

export type TabletopErrorCode =
  | 'stale'
  | 'gone'
  | 'invalid'
  | 'forbidden'
  | 'image'
  | 'audio'
  | 'fogFull'
  | 'full'
  | 'offline'
  | 'unavailable'

export function tabletopErrorCode(message: string): TabletopErrorCode {
  const table: [RegExp, TabletopErrorCode][] = [
    [/Stale scene/, 'stale'],
    [/Fog is full/, 'fogFull'],
    [/Scene is full/, 'full'],
    [/Image unavailable/, 'image'],
    [/Audio unavailable/, 'audio'],
    [/(Scene|Item|Card|Track) unavailable/, 'gone'],
    [/Invalid request|Request mismatch/, 'invalid'],
    [/Forbidden/, 'forbidden'],
    [/Failed to fetch|NetworkError|offline/, 'offline'],
  ]
  return table.find(([pattern]) => pattern.test(message))?.[1] ?? 'unavailable'
}

/** Seconds between table refetches when realtime is down (the live row is the hint). */
export const tabletopPollMs = (connected: boolean) => (connected ? 20_000 : 3_000)
