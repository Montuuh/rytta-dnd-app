// RYT-104/107: one mock of `import_basic_items` for every fixture, following the SQL function.
// New keys become srd definitions; existing keys (archived ones too) are skipped and return their
// id; with `update_existing` a live definition whose catalogue fields differ is updated while its
// price, image and template flag stay. A request id replays its first result for the same payload
// (items and update_existing) and refuses a different one with 'Request mismatch'.

export type ImportedDefinition = Record<string, unknown> & {
  id: string
  basic_key?: string | null
  archived?: boolean
  revision: number
}

const catalogueFields = [
  'name',
  'description',
  'translations',
  'category',
  'icon',
  'rarity',
  'slot_kind',
  'properties',
  'weight_lb',
] as const

export type ImportReply = { data: unknown } | { error: string }

export function basicImportMock<Row extends ImportedDefinition>(options: {
  definitions: Row[]
  /** Builds and returns the new definition row; the mock pushes it. */
  create: (entry: Record<string, unknown>, key: string) => Row
}) {
  const replies = new Map<string, { payload: string; data: unknown }>()
  return (body: Record<string, unknown>): ImportReply => {
    const items = body.items as Record<string, unknown>[]
    const updateExisting = Boolean(body.update_existing)
    const payload = JSON.stringify([items, updateExisting])
    const requestId = String(body.request_id)
    const prior = replies.get(requestId)
    if (prior)
      return prior.payload === payload ? { data: prior.data } : { error: 'Request mismatch' }
    if (!Array.isArray(items) || items.length < 1 || items.length > 500)
      return { error: 'Invalid request' }
    const created: { key: string; id: string }[] = []
    const updated: { key: string; id: string }[] = []
    const skipped: { key: string; id: string; archived: boolean }[] = []
    for (const entry of items) {
      const key = String(entry.key)
      const existing = options.definitions.find((d) => d.basic_key === key)
      if (!existing) {
        const row = options.create(entry, key)
        options.definitions.push(row)
        created.push({ key, id: row.id })
        continue
      }
      const weight = Number(entry.weight_lb ?? 0)
      const next: Record<string, unknown> = {
        ...Object.fromEntries(catalogueFields.map((field) => [field, entry[field]])),
        description: String(entry.description ?? ''),
        translations: entry.translations ?? null,
        properties: entry.properties ?? {},
        weight_lb: weight,
      }
      const differs = catalogueFields.some(
        (field) => JSON.stringify(existing[field] ?? null) !== JSON.stringify(next[field] ?? null),
      )
      if (updateExisting && !existing.archived && differs) {
        Object.assign(existing, next, {
          weight_tenths: Math.round(weight * 10),
          revision: existing.revision + 1,
        })
        updated.push({ key, id: existing.id })
      } else skipped.push({ key, id: existing.id, archived: Boolean(existing.archived) })
    }
    const data = {
      created_count: created.length,
      updated_count: updated.length,
      skipped_count: skipped.length,
      created,
      updated,
      skipped,
    }
    replies.set(requestId, { payload, data })
    return { data }
  }
}
