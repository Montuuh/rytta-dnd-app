import { z } from 'zod'
import { descriptionLimit } from '@/shared/lib/translations'
import {
  basicItemExtraPropertiesSchema,
  type BasicItem,
  type BasicItemDescriptions,
} from './basic-items'
import {
  itemCategories,
  itemPropertiesSchema,
  rarities,
  slotKinds,
  type ItemCategory,
} from './item'

/**
 * RYT-166: items come from the content packs a campaign uses (ADR 051). An entry of kind `item`
 * keeps its mechanics in `data.index` and its description in `data.en` / `data.es`.
 *
 * A storeroom item remembers where it came from in `basic_key`:
 * - the SRD and the Rytta basics keep the key of the old bundled catalogue (`index.key`), so the
 *   items campaigns already imported stay linked and the shop presets keep working;
 * - any other pack uses `<pack ref>--<entry key>`.
 */
export const defaultItemPackSlugs = ['srd-5-2-1', 'rytta-basics'] as const
export const ryttaBasicsSlug = 'rytta-basics'

export const categoryIconDefaults: Record<ItemCategory, string> = {
  weapon: 'sword',
  armor: 'shirt',
  shield: 'shield',
  gear: 'backpack',
  consumable: 'flask-conical',
  ammo: 'feather',
  tool: 'wrench',
  treasure: 'gem',
  quest: 'scroll',
}

export const packItemPropertiesSchema = itemPropertiesSchema
  .extend(basicItemExtraPropertiesSchema.shape)
  .strict()

/** An item's mechanics as a pack entry stores them. */
export const packItemIndexSchema = z.object({
  /** Key of the old bundled catalogue (SRD and Rytta basics only). */
  key: z
    .string()
    .regex(/^[a-z][A-Za-z0-9]{1,48}$/)
    .optional(),
  category: z.enum(itemCategories),
  icon: z
    .string()
    .regex(/^[a-z0-9-]{1,40}$/)
    .optional(),
  slot_kind: z.enum(slotKinds).default('none'),
  /** RYT-176: magic items carry theirs; everything else is common. */
  rarity: z.enum(rarities).default('common'),
  /** Exact weight of one unit in pounds. */
  weightLb: z.number().min(0).max(10000).default(0),
  /** Price of one unit in copper pieces (1 GP = 100 CP). */
  costCp: z.number().int().min(0).max(100_000_000).default(0),
  properties: packItemPropertiesSchema.default({}),
  /** Lot the item is sold in, when its listed price is not per unit (ammunition). */
  pack: z
    .object({
      quantity: z.number().int().min(2).max(1000),
      weightLb: z.number().min(0),
      costCp: z.number().int().min(0),
    })
    .optional(),
})
export type PackItemIndex = z.infer<typeof packItemIndexSchema>

const bodySchema = z
  .object({ description: z.string().trim().max(descriptionLimit).optional() })
  .partial()

export const itemPackSchema = z.object({
  id: z.uuid(),
  ref: z.string().regex(/^[0-9a-f]{8}$/),
  slug: z.string(),
  title_en: z.string(),
  title_es: z.string(),
  srd: z.boolean(),
  version: z.number().int().positive(),
  enabled: z.boolean(),
  hidden: z.array(z.string()),
})
export type ItemPack = z.infer<typeof itemPackSchema>
export const itemPacksSchema = z.array(itemPackSchema)

export const itemPackEntriesSchema = z.object({
  version: z.number().int().positive(),
  entries: z.array(
    z.object({
      key: z.string(),
      name_en: z.string(),
      name_es: z.string(),
      data: z.unknown(),
    }),
  ),
})
export type ItemPackEntries = z.infer<typeof itemPackEntriesSchema>

export const itemPackTitle = (pack: Pick<ItemPack, 'title_en' | 'title_es'>, language: string) =>
  (language.startsWith('en') ? pack.title_en : pack.title_es) || pack.title_en || pack.title_es

/** The `basic_key` a storeroom item from this pack entry carries. */
export function itemReference(
  pack: Pick<ItemPack, 'srd' | 'ref' | 'slug'>,
  entryKey: string,
  legacyKey?: string,
) {
  if (legacyKey && (pack.srd || pack.slug === ryttaBasicsSlug)) return legacyKey
  return pack.srd ? entryKey : `${pack.ref}--${entryKey}`
}

export type ItemSource = { packId: string; title_en: string; title_es: string; srd: boolean }
/** The items a campaign offers, shaped as the old bundled catalogue so its users keep working. */
export type CampaignItemCatalogue = {
  items: BasicItem[]
  descriptions: Record<'en' | 'es', BasicItemDescriptions>
  /** Pack of each item, by `basic_key`. */
  sources: Record<string, ItemSource>
  /** Enabled item packs, in the campaign's order. */
  packs: ItemPack[]
  /** Entries that could not be read. */
  unreadable: number
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

/**
 * The enabled packs' items, without the hidden ones; an earlier pack wins when two give the same
 * reference. Entries whose data does not read are counted and left out.
 */
export function buildItemCatalogue(
  parts: { pack: ItemPack; entries: ItemPackEntries['entries'] }[],
): CampaignItemCatalogue {
  const catalogue: CampaignItemCatalogue = {
    items: [],
    descriptions: { en: {}, es: {} },
    sources: {},
    packs: [],
    unreadable: 0,
  }
  for (const { pack, entries } of parts) {
    if (!pack.enabled) continue
    catalogue.packs.push(pack)
    const hidden = new Set(pack.hidden)
    for (const entry of entries) {
      if (hidden.has(entry.key)) continue
      const data = isRecord(entry.data) ? entry.data : {}
      const index = packItemIndexSchema.safeParse(data.index)
      const en = bodySchema.safeParse(data.en ?? {})
      const es = bodySchema.safeParse(data.es ?? {})
      const nameEn = entry.name_en.trim() || entry.name_es.trim()
      const nameEs = entry.name_es.trim() || entry.name_en.trim()
      if (!index.success || !en.success || !es.success || !nameEn) {
        catalogue.unreadable++
        continue
      }
      const key = itemReference(pack, entry.key, index.data.key)
      if (catalogue.sources[key]) continue
      const mechanics = index.data
      catalogue.items.push({
        key,
        source: pack.srd ? 'srd' : 'rytta',
        name: { en: nameEn.slice(0, 100), es: nameEs.slice(0, 100) },
        descriptionSource: pack.srd ? 'srd' : 'rytta',
        category: mechanics.category,
        icon: mechanics.icon ?? categoryIconDefaults[mechanics.category],
        slot_kind: mechanics.slot_kind,
        weightLb: mechanics.weightLb,
        costCp: mechanics.costCp,
        properties: mechanics.properties,
        ...(mechanics.rarity === 'common' ? {} : { rarity: mechanics.rarity }),
        ...(mechanics.pack ? { pack: mechanics.pack } : {}),
      })
      const describe = (own?: string, other?: string) => own || other
      const textEn = describe(en.data.description, es.data.description)
      const textEs = describe(es.data.description, en.data.description)
      if (textEn) catalogue.descriptions.en[key] = textEn
      if (textEs) catalogue.descriptions.es[key] = textEs
      catalogue.sources[key] = {
        packId: pack.id,
        title_en: pack.title_en,
        title_es: pack.title_es,
        srd: pack.srd,
      }
    }
  }
  return catalogue
}

/** camelCase catalogue keys as pack entry keys: `chainMail` becomes `chain-mail`. */
export const entryKeyOf = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()

export type ItemDifference = 'name' | 'description' | 'weight' | 'details'
type Comparable = {
  name: string
  description: string
  translations?: {
    en?: { name?: string; description?: string } | null
    es?: { name?: string; description?: string } | null
  } | null
  category: string
  icon: string
  slot_kind: string
  weight_lb?: number
  weight_tenths: number
  properties: Record<string, unknown>
}

const stable = (value: unknown): string =>
  Array.isArray(value)
    ? `[${value.map(stable).join(',')}]`
    : isRecord(value)
      ? `{${Object.keys(value)
          .filter((key) => value[key] !== undefined)
          .sort()
          .map((key) => `${key}:${stable(value[key])}`)
          .join(',')}}`
      : JSON.stringify(value)

/**
 * What "Update" would change in a storeroom item (P3 A): names, descriptions, weight and the
 * other mechanics. Prices, images and template flags are never touched, so they do not count.
 */
export function itemDifferences(
  item: BasicItem,
  descriptions: Record<'en' | 'es', BasicItemDescriptions>,
  definition: Comparable,
): ItemDifference[] {
  const differences: ItemDifference[] = []
  const text = (language: 'en' | 'es') => definition.translations?.[language] ?? null
  const names = (['en', 'es'] as const).some((language) => {
    const own = text(language)?.name
    return own !== undefined && own !== item.name[language]
  })
  const fallbackName = definition.name !== item.name.en && definition.name !== item.name.es
  if (names || fallbackName) differences.push('name')
  const described = (['en', 'es'] as const).some((language) => {
    const own = text(language)?.description
    return own !== undefined && own !== (descriptions[language][item.key] ?? '')
  })
  if (described) differences.push('description')
  const weight = definition.weight_lb ?? definition.weight_tenths / 10
  if (Math.abs(weight - item.weightLb) > 0.0005) differences.push('weight')
  if (
    definition.category !== item.category ||
    definition.icon !== item.icon ||
    definition.slot_kind !== item.slot_kind ||
    stable(definition.properties) !== stable(item.properties)
  )
    differences.push('details')
  return differences
}
