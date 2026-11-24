// Basic items: equipment of the System Reference Document 5.2.1 by Wizards of the Coast LLC,
// licensed under CC-BY-4.0, and the Rytta basic items. Since RYT-167 they live in the library's
// packs (pack-items.ts); this module keeps their shape and helpers.
import { z } from 'zod'
import { cpToGp } from '@/shared/lib/money'
import { descriptionLimit } from '@/shared/lib/translations'
import {
  itemCategories,
  itemPropertiesSchema,
  rarities,
  slotKinds,
  type DefinitionDraft,
} from './item'

export const basicItemLanguages = ['en', 'es'] as const
export type BasicItemLanguage = (typeof basicItemLanguages)[number]

export const weaponMasteries = [
  'cleave',
  'graze',
  'nick',
  'push',
  'sap',
  'slow',
  'topple',
  'vex',
] as const

/** Catalogue properties, with the catalogue's stricter shapes. */
export const basicItemExtraPropertiesSchema = z.object({
  mastery: z.enum(weaponMasteries).optional(),
  proficiency: z.enum(['simple', 'martial']).optional(),
  light: z.boolean().optional(),
  heavy: z.boolean().optional(),
  reach: z.boolean().optional(),
  loading: z.boolean().optional(),
  /** Key of the ammunition item the weapon shoots. */
  ammunition: z.string().optional(),
  /** Fixed damage for weapons without a damage die (Blowgun). */
  flatDamage: z.number().int().min(1).max(20).optional(),
  armorType: z.enum(['light', 'medium', 'heavy']).optional(),
  /** Days of food one unit provides when consumed. */
  rations: z.number().min(0).max(30).optional(),
  /** Pints of drink one unit provides when consumed. */
  water: z.number().min(0).max(400).optional(),
  container: z
    .object({
      capacityLb: z.number().min(0).max(10000),
      /** Share of the contents' weight that does not count toward the carrier's load. */
      loadReductionPercent: z.number().int().min(0).max(90),
    })
    .optional(),
})

const localized = z.object({
  en: z.string().trim().min(1).max(100),
  es: z.string().trim().min(1).max(100),
})
export const basicItemSchema = z.object({
  key: z.string().regex(/^[a-z][A-Za-z0-9]{1,48}$/),
  source: z.enum(['srd', 'rytta']),
  name: localized,
  descriptionSource: z.enum(['srd', 'rytta']),
  category: z.enum(itemCategories),
  icon: z.string().regex(/^[a-z0-9-]{1,40}$/),
  slot_kind: z.enum(slotKinds),
  /** Exact weight of one unit in pounds. */
  weightLb: z.number().min(0).max(10000),
  /** Price of one unit in copper pieces (1 GP = 100 CP). */
  costCp: z.number().int().min(0).max(100_000_000),
  properties: itemPropertiesSchema.extend(basicItemExtraPropertiesSchema.shape).strict(),
  /** RYT-176: a magic item's rarity; an item without one is common. */
  rarity: z.enum(rarities).optional(),
  /** Lot the SRD sells the item in, when its listed price is not per unit (ammunition). */
  pack: z
    .object({
      quantity: z.number().int().min(2).max(1000),
      weightLb: z.number().min(0),
      costCp: z.number().int().min(0),
    })
    .optional(),
})
export type BasicItem = z.infer<typeof basicItemSchema>
export type BasicItemProperties = BasicItem['properties']

export const basicItemCatalogueSchema = z.object({
  attribution: z.string().min(1),
  items: z.array(basicItemSchema).min(1),
})
export const basicItemDescriptionsSchema = z.record(
  z.string(),
  z.string().trim().min(1).max(descriptionLimit),
)
export type BasicItemDescriptions = z.infer<typeof basicItemDescriptionsSchema>

export const basicItemsByKey = (items: readonly BasicItem[]) =>
  new Map(items.map((item) => [item.key, item]))
export const findBasicItem = (items: readonly BasicItem[], key: string) =>
  items.find((item) => item.key === key)

const fold = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()

/**
 * Items whose name in `language` contains every word of the query (accents and case ignored);
 * names starting with the query come first, then alphabetical. An empty query returns everything.
 */
export function searchBasicItems(
  items: readonly BasicItem[],
  query: string,
  language: BasicItemLanguage,
) {
  const needle = fold(query)
  const words = needle.split(/\s+/).filter(Boolean)
  return items
    .map((item) => ({ item, name: fold(item.name[language]) }))
    .filter(({ name }) => words.every((word) => name.includes(word)))
    .sort(
      (a, b) =>
        Number(b.name.startsWith(needle)) - Number(a.name.startsWith(needle)) ||
        a.name.localeCompare(b.name, language),
    )
    .map(({ item }) => item)
}

/**
 * The item as a definition draft: exact weight in lb, price in gp with cents and every property
 * (definitions accept the catalogue keys since RYT-104).
 */
export function toDefinitionDraft(
  item: BasicItem,
  language: BasicItemLanguage,
  description: string,
): DefinitionDraft {
  return {
    name: item.name[language],
    category: item.category,
    icon: item.icon,
    rarity: item.rarity ?? 'common',
    weight_lb: item.weightLb,
    value_gp: cpToGp(item.costCp),
    description,
    slot_kind: item.slot_kind,
    properties: itemPropertiesSchema.parse(item.properties),
    origin: item.source === 'srd' ? 'srd' : 'dm',
  }
}
