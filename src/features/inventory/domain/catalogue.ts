// RYT-104/105: the campaign catalogue beyond plain definitions: search results, the basic
// catalogue import, Player proposals and merges of duplicate definitions.
import { z } from 'zod'
import { cpToGp, gpAmount } from '@/shared/lib/money'
import { localizedName, translationsSchema } from '@/shared/lib/translations'
import type { BasicItem, BasicItemDescriptions } from './basic-items'
import {
  itemCategories,
  itemPropertiesSchema,
  rarities,
  slotKinds,
  type DefinitionDraft,
  type ItemCategory,
  type Rarity,
} from './item'

const money = z.coerce.number().pipe(gpAmount)
const revision = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER)

/** One row of `search_campaign_items`; Players only get value_gp for basic items. */
export const searchItemSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z
    .string()
    .nullable()
    .transform((value) => value ?? ''),
  translations: translationsSchema,
  category: z.enum(itemCategories),
  icon: z.string(),
  image_path: z.string().nullable(),
  rarity: z.enum(rarities),
  weight_lb: z.coerce.number().min(0),
  weight_tenths: z.number().int().optional(),
  slot_kind: z.enum(slotKinds),
  properties: itemPropertiesSchema.catch({}),
  origin: z.enum(['dm', 'player', 'srd']),
  basic_key: z.string().nullable(),
  is_template: z.boolean(),
  value_gp: money.nullable(),
  revision,
  created_by_you: z.boolean(),
})
export type CatalogueItem = z.infer<typeof searchItemSchema>

/** Templates first, then basic items, then the rest; alphabetical in the reader's language. */
export function rankStartingPoints(items: readonly CatalogueItem[], language: string) {
  const weight = (item: CatalogueItem) => (item.is_template ? 0 : item.basic_key ? 1 : 2)
  return [...items].sort(
    (a, b) =>
      weight(a) - weight(b) ||
      localizedName(a, language).localeCompare(localizedName(b, language), language),
  )
}

/** A forge draft from an existing item: every field but price flags, identity and image. */
export function draftFrom(item: CatalogueItem, dm: boolean): DefinitionDraft {
  return {
    name: item.name,
    category: item.category,
    icon: item.icon,
    rarity: item.rarity,
    weight_lb: item.weight_lb,
    value_gp: dm ? item.value_gp : null,
    description: item.description,
    translations: item.translations,
    slot_kind: item.slot_kind,
    properties: item.properties,
  }
}

// ---------------------------------------------------------------------------------------------
// Basic catalogue import (DM)
// ---------------------------------------------------------------------------------------------
export type ImportItem = {
  key: string
  name: string
  description: string
  translations: {
    en: { name: string; description: string }
    es: { name: string; description: string }
  }
  category: ItemCategory
  icon: string
  slot_kind: string
  rarity: Rarity
  properties: Record<string, unknown>
  weight_lb: number
  value_gp: number
}

const round3 = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000

/**
 * The `import_basic_items` element of a catalogue item, for the storeroom import and for shop
 * stocking alike. The base name and description are the reader's language; both languages travel
 * in `translations`; the weight is lb with three decimals and the price gp with cents.
 */
export function toImportItem(
  item: BasicItem,
  language: 'en' | 'es',
  descriptions: Record<'en' | 'es', BasicItemDescriptions>,
): ImportItem {
  const text = (lang: 'en' | 'es') => ({
    name: item.name[lang],
    description: descriptions[lang][item.key] ?? '',
  })
  return {
    key: item.key,
    ...text(language),
    translations: { en: text('en'), es: text('es') },
    category: item.category,
    icon: item.icon,
    slot_kind: item.slot_kind,
    rarity: item.rarity ?? 'common',
    properties: item.properties,
    weight_lb: round3(item.weightLb),
    value_gp: cpToGp(item.costCp),
  }
}

/** Catalogue items per category with how many of them the campaign already holds. */
export function importGroups(items: readonly BasicItem[], imported: ReadonlySet<string>) {
  return itemCategories
    .map((category) => {
      const members = items.filter((item) => item.category === category)
      return {
        category,
        total: members.length,
        done: members.filter((item) => imported.has(item.key)).length,
        keys: members.map((item) => item.key),
      }
    })
    .filter((group) => group.total > 0)
}

/** Keys still to import from the chosen categories, split into batches the RPC accepts. */
export function importBatches(
  items: readonly BasicItem[],
  categories: ReadonlySet<ItemCategory>,
  imported: ReadonlySet<string>,
  size = 500,
) {
  const pending = items.filter((item) => categories.has(item.category) && !imported.has(item.key))
  const batches: BasicItem[][] = []
  for (let start = 0; start < pending.length; start += size)
    batches.push(pending.slice(start, start + size))
  return batches
}

export const importResultSchema = z.object({
  created_count: z.number().int().min(0),
  updated_count: z.number().int().min(0),
  skipped_count: z.number().int().min(0),
  created: z.array(z.object({ key: z.string(), id: z.uuid() })),
  updated: z.array(z.object({ key: z.string(), id: z.uuid() })),
  skipped: z.array(z.object({ key: z.string(), id: z.uuid(), archived: z.boolean() })),
})
export type ImportResult = z.infer<typeof importResultSchema>

// ---------------------------------------------------------------------------------------------
// Proposals (RYT-105)
// ---------------------------------------------------------------------------------------------
export const proposalStatuses = ['pending', 'accepted', 'merged', 'rejected', 'cancelled'] as const
export type ProposalStatus = (typeof proposalStatuses)[number]

const proposalDraftSchema = z.object({
  name: z.string(),
  description: z.string().catch(''),
  translations: translationsSchema.optional(),
  category: z.enum(itemCategories),
  icon: z.string().catch('package'),
  rarity: z.enum(rarities).catch('common'),
  slot_kind: z.enum(slotKinds).catch('none'),
  properties: itemPropertiesSchema.catch({}),
  weight_lb: z.coerce.number().min(0).catch(0),
  suggested_value_gp: money.optional().catch(undefined),
})
export type ProposalDraft = z.infer<typeof proposalDraftSchema>

export const proposalSchema = z.object({
  id: z.uuid(),
  character_id: z.uuid(),
  character_name: z.string().nullable(),
  proposed_by_you: z.boolean(),
  proposer_name: z.string().nullable().optional(),
  draft: proposalDraftSchema,
  quantity: z.number().int().min(1),
  status: z.enum(proposalStatuses),
  dm_note: z.string(),
  resolved_definition_id: z.uuid().nullable(),
  revision,
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  resolved_at: z.iso.datetime({ offset: true }).nullable(),
})
export type ItemProposal = z.infer<typeof proposalSchema>

export const proposalResultSchema = z.object({
  id: z.uuid(),
  status: z.enum(proposalStatuses),
  revision,
  definition_id: z.uuid().nullable().optional(),
  item_id: z.uuid().nullable().optional(),
  event_id: z.uuid().nullable().optional(),
  quantity: z.number().int().nullable().optional(),
})

/** The draft as forge input; the suggested price becomes the starting value for the DM. */
export function proposalToDraft(draft: ProposalDraft, dm: boolean): DefinitionDraft {
  return {
    name: draft.name,
    category: draft.category,
    icon: draft.icon,
    rarity: draft.rarity,
    weight_lb: draft.weight_lb,
    value_gp: dm ? (draft.suggested_value_gp ?? null) : null,
    description: draft.description,
    translations: draft.translations ?? null,
    slot_kind: draft.slot_kind,
    properties: draft.properties,
  }
}

/** Pending proposals first (oldest first, so nothing waits forever), then the rest, newest first. */
export function sortProposals(proposals: readonly ItemProposal[]) {
  return [...proposals].sort((a, b) => {
    const open = Number(b.status === 'pending') - Number(a.status === 'pending')
    if (open) return open
    return a.status === 'pending'
      ? a.created_at.localeCompare(b.created_at)
      : b.updated_at.localeCompare(a.updated_at)
  })
}

export const mergeResultSchema = z.object({
  source_id: z.uuid(),
  target_id: z.uuid(),
  moved_stacks: z.number().int(),
  merged_stacks: z.number().int(),
  unequipped_stacks: z.number().int(),
  moved_units: z.number().int(),
  characters: z.number().int(),
  repointed_listings: z.number().int(),
  archived_listings: z.number().int(),
})
export type MergeResult = z.infer<typeof mergeResultSchema>

export const templateResultSchema = z.object({
  id: z.uuid(),
  is_template: z.boolean(),
  revision,
})
