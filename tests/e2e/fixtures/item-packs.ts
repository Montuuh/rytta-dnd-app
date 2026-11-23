import { readFileSync } from 'node:fs'

// RYT-166: the bundled basic items served as the library would: the SRD pack at version 2 and the
// Rytta basics pack at version 1, both enabled. Entries keep the old catalogue key in `index.key`,
// as the library's upload stores them.
export const srdItemsPackId = '80000000-0000-4000-8000-000000000001'
export const ryttaItemsPackId = '80000000-0000-4000-8000-000000000002'
export const bookItemsPackId = '80000000-0000-4000-8000-000000000003'

type Item = Record<string, unknown> & {
  key: string
  source: string
  name: { en: string; es: string }
}
const file = (name: string) =>
  JSON.parse(readFileSync(`src/features/inventory/content/${name}.json`, 'utf8')) as unknown
const items = (file('basic-items') as { items: Item[] }).items
const descriptions = { en: file('basic-items.en'), es: file('basic-items.es') } as Record<
  'en' | 'es',
  Record<string, string>
>
const entryKey = (key: string) =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .toLowerCase()
const entry = (item: Item) => {
  const { key, source: _source, name, descriptionSource: _text, ...mechanics } = item
  const body = (language: 'en' | 'es') =>
    descriptions[language][key] ? { description: descriptions[language][key] } : undefined
  return {
    key: entryKey(key),
    name_en: name.en,
    name_es: name.es,
    data: { index: { key, ...mechanics }, en: body('en'), es: body('es') },
  }
}

/** Test switches: hidden entry keys per pack, an extra private pack, or an unreachable library. */
export const itemPackState = {
  hidden: {} as Record<string, string[]>,
  books: false,
  none: false,
  unreachable: false,
}
export function resetItemPacks() {
  itemPackState.hidden = {}
  itemPackState.books = false
  itemPackState.none = false
  itemPackState.unreachable = false
}

const packs = () => {
  if (itemPackState.none) return []
  type Pack = Record<string, unknown> & { id: string; version: number; entries: unknown[] }
  const list: Pack[] = [
    {
      id: srdItemsPackId,
      ref: '80000000',
      slug: 'srd-5-2-1',
      title_en: 'System Reference Document 5.2.1',
      title_es: 'Documento de referencia del sistema 5.2.1',
      srd: true,
      version: 2,
      enabled: true,
      entries: items.filter((item) => item.source === 'srd').map(entry),
    },
    {
      id: ryttaItemsPackId,
      ref: '80000000',
      slug: 'rytta-basics',
      title_en: 'Rytta · Basic items',
      title_es: 'Rytta · Objetos básicos',
      srd: false,
      version: 1,
      enabled: true,
      entries: items.filter((item) => item.source === 'rytta').map(entry),
    },
  ]
  if (itemPackState.books)
    list.push({
      id: bookItemsPackId,
      ref: 'b00c5000',
      slug: 'owner-books',
      title_en: 'Owner books',
      title_es: 'Libros del dueño',
      srd: false,
      version: 1,
      enabled: true,
      entries: [
        {
          key: 'moon-blade',
          name_en: 'Moon Blade',
          name_es: 'Hoja lunar',
          data: {
            index: {
              category: 'weapon',
              slot_kind: 'one_hand',
              weightLb: 3,
              costCp: 40000,
              properties: { dice: '1d8', damageType: 'slashing' },
            },
            en: { description: 'A silver blade.' },
            es: { description: 'Una hoja de plata.' },
          },
        },
      ],
    })
  return list
}

/** The item pack RPCs, or null for any other method. DM only, as in SQL. */
export function itemPackRpc(
  method: string,
  body: Record<string, unknown>,
  dm: boolean,
): { data: unknown } | { error: string; status?: number } | null {
  if (method !== 'get_campaign_item_packs' && method !== 'get_campaign_item_pack') return null
  if (!dm) return { error: 'Forbidden' }
  if (itemPackState.unreachable) return { error: 'Library unavailable', status: 503 }
  if (method === 'get_campaign_item_packs')
    return {
      data: packs().map(({ entries: _entries, ...pack }) => ({
        ...pack,
        hidden: itemPackState.hidden[pack.id] ?? [],
      })),
    }
  const pack = packs().find((item) => item.id === body.target_pack)
  if (!pack) return { error: 'Invalid request' }
  if (pack.version !== body.at_version) return { error: 'Stale revision' }
  return { data: { version: pack.version, entries: pack.entries } }
}
