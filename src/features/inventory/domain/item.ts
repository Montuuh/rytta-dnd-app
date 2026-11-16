import { z } from 'zod'
import { gpAmount } from '@/shared/lib/money'
import { translationsSchema, type Translations } from '@/shared/lib/translations'

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
  acBonus: optionalInt(-5, 10),
  attackBonus: optionalInt(-5, 10),
  damageBonus: optionalInt(-5, 10),
  speedBonus: optionalInt(-30, 60),
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
  // RYT-103/104 catalogue properties, validated by the server where they have rules.
  mastery: z.string().trim().min(1).max(40).optional(),
  proficiency: z.enum(['simple', 'martial']).optional(),
  light: z.boolean().optional(),
  heavy: z.boolean().optional(),
  reach: z.boolean().optional(),
  loading: z.boolean().optional(),
  ammunition: z.string().max(80).optional(),
  flatDamage: optionalInt(1, 20),
  armorType: z.enum(['light', 'medium', 'heavy']).optional(),
  /** Rations and water one unit gives when used (one decimal; the counters get whole units). */
  rations: z.number().min(0).max(100).optional(),
  water: z.number().min(0).max(100).optional(),
  /** A container: what it holds and the share of the carried load it takes off. */
  container: z
    .object({
      capacityLb: z.number().min(0).max(10000),
      loadReductionPercent: z.number().int().min(0).max(90),
    })
    .optional(),
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
  /** RYT-104: weight of one unit in lb with three decimals; source of truth over weight_tenths. */
  weight_lb: z.coerce.number().min(0).max(10000).optional(),
  value_gp: z.coerce.number().pipe(gpAmount).nullable(),
  description: z.string().max(2000),
  translations: translationsSchema.optional(),
  basic_key: z.string().max(80).nullable().optional(),
  is_template: z.boolean().optional(),
  slot_kind: z.enum(slotKinds),
  properties: itemPropertiesSchema.catch({}),
  origin: z.enum(['dm', 'player', 'srd']),
  image_path: z.string().nullable().optional(),
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
  // purchase/sale/revert come from RYT-005 shops and are never undone from the inventory.
  kind: z.enum([
    'grant',
    'remove',
    'use',
    'equip',
    'unequip',
    'undo',
    'purchase',
    'sale',
    'revert',
    // RYT-034 trades: one row per stack on each side of a completed swap; never undone here.
    'trade_in',
    'trade_out',
    // RYT-105: a duplicate definition merged into the kept one moves its stacks.
    'merge',
  ]),
  quantity_delta: z.number().int(),
  after_value: z.record(z.string(), z.unknown()),
  undo_of: z.uuid().nullable(),
  undone_by: z.uuid().nullable(),
  created_at: z.iso.datetime({ offset: true }),
})
export type InventoryEvent = z.infer<typeof eventSchema>

const suppliesSchema = z.object({
  rations: z.number().int(),
  water: z.number().int(),
})
export type Supplies = z.infer<typeof suppliesSchema>
export const actionResultSchema = z.object({
  item_id: z.uuid(),
  event_id: z.uuid(),
  revision: safeRevision,
  /** RYT-104: rations and water a use added (or an undo took back). */
  supplies: suppliesSchema.optional(),
})

export type DefinitionDraft = {
  name: string
  category: ItemCategory
  icon: string
  rarity: Rarity
  /** Weight of one unit in lb, three decimals. */
  weight_lb: number
  value_gp: number | null
  description: string
  translations?: Translations
  slot_kind: SlotKind
  properties: ItemProperties
  origin?: 'dm' | 'srd'
  is_template?: boolean
}

/** Weight of one unit in lb: weight_lb when the server sent it, else the legacy tenths. */
export const unitPounds = (definition: Pick<ItemDefinition, 'weight_tenths' | 'weight_lb'>) =>
  definition.weight_lb ?? definition.weight_tenths / 10

export type InventoryAction =
  | {
      kind: 'define'
      requestId?: string
      definitionId: string | null
      expectedRevision: number | null
      draft: DefinitionDraft
    }
  | { kind: 'grant'; characterId: string; definitionId: string; amount: number; requestId?: string }
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
