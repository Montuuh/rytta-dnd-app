import { z } from 'zod'
import type { BasicItem, ImportResult } from '@/features/inventory'
import { cpToGp } from '@/shared/lib/money'
import type { ShopType } from './shop-types'

// RYT-107: a shop type stocks a shop from the basic catalogue in two idempotent steps.
// import_basic_items (the inventory feature's import, the same payload as the storeroom's) turns
// catalogue keys into campaign definitions (existing keys are skipped and return their id), then
// add_listings lists those definitions at the catalogue price with
// unlimited stock (definitions the shop already lists are skipped), so a retry never duplicates.

export type StockLanguage = 'en' | 'es'

/** The server's limits per call: import_basic_items takes 500 items, add_listings 200. */
export const importBatch = 500
export const listingBatch = 200

export const stockLanguage = (language: string): StockLanguage =>
  language.toLowerCase().startsWith('en') ? 'en' : 'es'

/** The catalogue items a type stocks, in the type's order; unknown keys are left out. */
export function typeItems(type: Pick<ShopType, 'stock'>, catalogue: readonly BasicItem[]) {
  const byKey = new Map(catalogue.map((item) => [item.key, item]))
  return type.stock.flatMap((key) => {
    const item = byKey.get(key)
    return item ? [item] : []
  })
}

export const addListingsResultSchema = z.object({
  created: z.object({ definition_id: z.uuid(), listing_id: z.uuid() }).array(),
  skipped: z.object({ definition_id: z.uuid(), listing_id: z.uuid() }).array(),
  created_count: z.number().int().min(0),
  skipped_count: z.number().int().min(0),
})
export type AddListingsResult = z.infer<typeof addListingsResultSchema>

/**
 * What to list after an import: every picked item that has a live definition, at its catalogue
 * price. Items whose definition was deleted from the storeroom (archived) are reported instead.
 */
type ImportRows = Pick<ImportResult, 'created' | 'updated' | 'skipped'>

export function listingPlan(items: readonly BasicItem[], results: readonly ImportRows[]) {
  const ids = new Map<string, string>()
  const archived = new Set<string>()
  for (const result of results) {
    for (const row of [...result.created, ...result.updated]) ids.set(row.key, row.id)
    for (const row of result.skipped)
      if (row.archived) archived.add(row.key)
      else ids.set(row.key, row.id)
  }
  const seen = new Set<string>()
  const listings: { definition_id: string; price: number }[] = []
  const unavailable: BasicItem[] = []
  for (const item of items) {
    const id = ids.get(item.key)
    if (!id) {
      if (archived.has(item.key)) unavailable.push(item)
      continue
    }
    if (seen.has(id)) continue
    seen.add(id)
    listings.push({ definition_id: id, price: cpToGp(item.costCp) })
  }
  return { listings, unavailable }
}

export const chunks = <T>(items: readonly T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, index) =>
    items.slice(index * size, (index + 1) * size),
  )
