import { z } from 'zod'

export const itemCategories = [
  'weapon',
  'armor',
  'shield',
  'gear',
  'consumable',
  'ammo',
  'tool',
  'treasure',
  'quest',
] as const
export const rarities = [
  'common',
  'uncommon',
  'rare',
  'very_rare',
  'legendary',
  'artifact',
] as const
export const slotKinds = [
  'head',
  'neck',
  'cloak',
  'body',
  'hands',
  'belt',
  'feet',
  'ring',
  'one_hand',
  'two_hands',
  'shield',
  'none',
] as const
export const equipmentSlots = [
  'head',
  'neck',
  'cloak',
  'body',
  'hands',
  'belt',
  'feet',
  'ring_1',
  'ring_2',
  'main_hand',
  'off_hand',
] as const
export type ItemCategory = (typeof itemCategories)[number]
export type Rarity = (typeof rarities)[number]
export type SlotKind = (typeof slotKinds)[number]
export type EquipmentSlot = (typeof equipmentSlots)[number]

const optionalInt = (min: number, max: number) => z.number().int().min(min).max(max).optional()
export const itemPropertiesSchema = z.object({
  base: optionalInt(0, 30),
  dexCap: z.number().int().min(0).max(10).nullable().optional(),
  strReq: optionalInt(0, 30),
  stealthDisadvantage: z.boolean().optional(),
  acBonus: optionalInt(0, 10),
  dice: z
    .string()
    .regex(/^\d{1,2}d\d{1,3}$/)
    .optional(),
  versatileDice: z
    .string()
    .regex(/^\d{1,2}d\d{1,3}$/)
    .optional(),
  damageType: z.enum(['bludgeoning', 'piercing', 'slashing']).optional(),
  finesse: z.boolean().optional(),
  ranged: z.boolean().optional(),
  thrown: z.boolean().optional(),
  range: z
    .string()
    .regex(/^\d{1,4}\/\d{1,4}$/)
    .optional(),
  usesPerItem: optionalInt(1, 99),
})
export type ItemProperties = z.infer<typeof itemPropertiesSchema>

const safeRevision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)
export const definitionSchema = z.object({
  id: z.uuid(),
  campaign_id: z.uuid(),
  name: z.string().trim().min(1).max(100),
  category: z.enum(itemCategories),
  icon: z.string().regex(/^[a-z0-9-]{1,40}$/),
  rarity: z.enum(rarities),
  weight_tenths: z.number().int().min(0).max(100000),
  value_gp: z.number().int().min(0).nullable(),
  description: z.string().max(2000),
  slot_kind: z.enum(slotKinds),
  properties: itemPropertiesSchema.catch({}),
  origin: z.enum(['dm', 'player', 'srd']),
  archived: z.boolean(),
  created_by: z.uuid().nullable(),
  revision: safeRevision,
})
export type ItemDefinition = z.infer<typeof definitionSchema>

export const stackSchema = z.object({
  id: z.uuid(),
  campaign_id: z.uuid(),
  character_id: z.uuid(),
  definition_id: z.uuid(),
  quantity: z.number().int().min(0),
  equipped_slot: z.enum(equipmentSlots).nullable(),
  source: z.enum(['dm', 'player', 'shop']),
  notes: z.string().max(500),
  revision: safeRevision,
})
export type ItemStack = z.infer<typeof stackSchema>

export const eventSchema = z.object({
  id: z.uuid(),
  character_id: z.uuid(),
  item_id: z.uuid(),
  actor_id: z.uuid().nullable(),
  kind: z.enum(['grant', 'remove', 'use', 'equip', 'unequip', 'undo']),
  quantity_delta: z.number().int(),
  after_value: z.record(z.string(), z.unknown()),
  undo_of: z.uuid().nullable(),
  undone_by: z.uuid().nullable(),
  created_at: z.iso.datetime({ offset: true }),
})
export type InventoryEvent = z.infer<typeof eventSchema>

export const actionResultSchema = z.object({
  item_id: z.uuid(),
  event_id: z.uuid(),
  revision: safeRevision,
})

export type DefinitionDraft = {
  name: string
  category: ItemCategory
  icon: string
  rarity: Rarity
  weight_tenths: number
  value_gp: number | null
  description: string
  slot_kind: SlotKind
  properties: ItemProperties
  origin?: 'dm' | 'srd'
}

export type InventoryAction =
  | {
      kind: 'define'
      definitionId: string | null
      expectedRevision: number | null
      draft: DefinitionDraft
    }
  | { kind: 'grant'; characterId: string; definitionId: string; amount: number }
  | { kind: 'use' | 'remove'; itemId: string; expectedRevision: number; amount: number }
  | { kind: 'equip'; itemId: string; expectedRevision: number; slot: EquipmentSlot }
  | { kind: 'unequip'; itemId: string; expectedRevision: number }
  | { kind: 'undo'; eventId: string }

/** Usable means the server lets `use_item` subtract it. */
export const isUsable = (category: ItemCategory) => category === 'consumable' || category === 'ammo'
export const UNDO_WINDOW_MS = 10 * 60 * 1000
/** Mirrors the server rule for Players; the server stays authoritative. */
export function undoRemainingMs(event: InventoryEvent, now: number, dm: boolean, userId: string) {
  if (!['grant', 'use', 'remove'].includes(event.kind) || event.undone_by) return 0
  if (dm) return Number.POSITIVE_INFINITY
  if (event.actor_id !== userId) return 0
  return Math.max(0, Date.parse(event.created_at) + UNDO_WINDOW_MS - now)
}
