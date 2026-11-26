import type { Page } from '@playwright/test'

// RYT-162, RYT-184 SDK contract fixture: the campaign content RPCs for one campaign with five packs.
// Two are in use (the base pack, whose version 3 waits at version 2, and Northern Beasts), one is
// private and two are free. The base pack has 330 creatures so lists page. Authorization, pinned
// versions and the bestiary mirror are verified in tests/database/campaign-content.test.ts.
type Json = Record<string, unknown>
export const srdPackId = '80000000-0000-4000-8000-000000000001'
export const northPackId = '80000000-0000-4000-8000-000000000002'
export const ashPackId = '80000000-0000-4000-8000-000000000003'
export const valePackId = '80000000-0000-4000-8000-000000000004'
export const coastPackId = '80000000-0000-4000-8000-000000000005'
const categoryNames = ['creatures', 'spells', 'classes', 'rules', 'items'] as const
type Category = (typeof categoryNames)[number]

export type ContentOptions = {
  /** The update of the base pack answers "Stale revision". */
  stale?: boolean
  /** The base pack is already at its published version: no notice. */
  upToDate?: boolean
  /** Northern Beasts is in use at version 1 and its version 2 waits too (a second notice). */
  northUpdate?: boolean
  /** Northern Beasts was withdrawn by its author: in use, no longer offered. */
  withdrawn?: boolean
  /** Only the base pack and Northern Beasts exist. */
  fewPacks?: boolean
  /** No pack at all. */
  nothing?: boolean
  /** The base pack keeps its long title (the one the SRD was uploaded with). */
  longBase?: boolean
  /** The digest of the base pack cannot be read, until `flags.failDigest` is cleared. */
  failDigest?: boolean
  /** The list of the campaign's content cannot be read, until `flags.failList` is cleared. */
  failList?: boolean
  /** The reader is not the DM any more. */
  forbidden?: boolean
  /** Hiding an entry is refused (the SRD creature limit). */
  hideInvalid?: boolean
  /** Answers after this many milliseconds, to see the loading state. */
  delay?: number
}

const creatureNames: [string, string, string, string, string][] = [
  ['red-dragon', 'Adult Red Dragon', 'Dragón rojo adulto', 'dragon', '17'],
  ['wolf', 'Wolf', 'Lobo', 'beast', '1/4'],
  ['mage', 'Mage', 'Mago', 'humanoid', '6'],
  ['aboleth', 'Aboleth', 'Aboleth', 'aberration', '10'],
  ['kobold', 'Kobold', 'Kobold', 'humanoid', '1/8'],
  ['owlbear', 'Owlbear', 'Oso lechuza', 'monstrosity', '3'],
  ['goblin', 'Goblin Warrior', 'Guerrero goblin', 'fey', '1/4'],
  ['lich', 'Lich', 'Lich', 'undead', '21'],
]
const spellNames: [string, string, string, number, string][] = [
  ['fire-bolt', 'Fire Bolt', 'Rayo de fuego', 0, 'evocation'],
  ['fireball', 'Fireball', 'Bola de fuego', 3, 'evocation'],
  ['bless', 'Bless', 'Bendición', 1, 'enchantment'],
  ['shield', 'Shield', 'Escudo', 1, 'abjuration'],
]

function entriesOf(pack: string, category: Category) {
  const rows: {
    kind: string
    key: string
    name_en: string
    name_es: string
    hidden: boolean
    index: Json
  }[] = []
  if (pack === srdPackId && category === 'creatures') {
    creatureNames.forEach(([key, en, es, type, cr]) =>
      rows.push({
        kind: 'creature',
        key,
        name_en: en,
        name_es: es,
        hidden: false,
        index: { type, cr },
      }),
    )
    // The rest of the 330: generated, so the list pages (100 per page).
    for (let n = rows.length + 1; n <= 330; n++) {
      const id = String(n).padStart(3, '0')
      rows.push({
        kind: 'creature',
        key: `bestia-${id}`,
        name_en: `Test beast ${id}`,
        name_es: `Bestia de prueba ${id}`,
        hidden: false,
        index: { type: 'beast', cr: String(1 + (n % 9)) },
      })
    }
  }
  if (pack === srdPackId && category === 'spells')
    spellNames.forEach(([key, en, es, lv, sc]) =>
      rows.push({ kind: 'spell', key, name_en: en, name_es: es, hidden: false, index: { lv, sc } }),
    )
  if (pack === northPackId && category === 'creatures')
    for (let n = 1; n <= 42; n++)
      rows.push({
        kind: 'creature',
        key: `abc12345--norte-${n}`,
        name_en: `Northern beast ${n}`,
        name_es: `Bestia del Norte ${n}`,
        hidden: false,
        index: { type: 'beast', cr: '2' },
      })
  return rows
}

/** A book cover as a picture: a colour and a word. */
const cover = (colour: string, word: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 44 56"><rect width="44" height="56" fill="${colour}"/><rect x="4" y="4" width="36" height="48" fill="none" stroke="#e8d9b0" stroke-width="1.5"/><text x="22" y="34" text-anchor="middle" font-family="Georgia,serif" font-size="20" fill="#e8d9b0">${word}</text></svg>`
const coverPaths: Record<string, [string, string, string]> = {
  [srdPackId]: [`pre/${srdPackId}/7a000000-0000-4000-8000-000000000001.webp`, '#3a2a55', 'R'],
  [northPackId]: [`pre/${northPackId}/7a000000-0000-4000-8000-000000000002.webp`, '#27483d', 'N'],
  [ashPackId]: [`pre/${ashPackId}/7a000000-0000-4000-8000-000000000003.webp`, '#5a2a2a', 'C'],
}

export function contentServer(options: ContentOptions = {}) {
  const calls: { method: string; body: Json }[] = []
  const flags = { failDigest: Boolean(options.failDigest), failList: Boolean(options.failList) }
  const hiddenKeys = new Set<string>(['creature:kobold'])
  // The base pack is at version 3 and the campaign at 2; Northern Beasts at 1 (or 2 with an update).
  const baseVersion = 3
  const northVersion = options.northUpdate ? 2 : 1
  type Row = { enabled: boolean; pinned: number | null; entries: number; kinds: Json }
  const rows: Record<string, Partial<Record<Category, Row>>> = {
    [srdPackId]: {
      creatures: {
        enabled: true,
        pinned: options.upToDate ? 3 : 2,
        // As the backend counts: listed entries only (creature traits are not listed).
        entries: 330,
        kinds: { creature: 330 },
      },
      spells: {
        enabled: true,
        pinned: options.upToDate ? 3 : 2,
        entries: 339,
        kinds: { spell: 339 },
      },
      classes: {
        enabled: true,
        pinned: options.upToDate ? 3 : 2,
        entries: 60,
        kinds: { class: 12, subclass: 12, feature: 36 },
      },
      rules: {
        enabled: true,
        pinned: options.upToDate ? 3 : 2,
        entries: 120,
        kinds: { rule: 90, condition: 30 },
      },
      items: {
        enabled: true,
        pinned: options.upToDate ? 3 : 2,
        entries: 198,
        kinds: { item: 198 },
      },
    },
    [northPackId]: {
      creatures: { enabled: true, pinned: 1, entries: 42, kinds: { creature: 42 } },
    },
    [ashPackId]: {
      creatures: { enabled: false, pinned: null, entries: 18, kinds: { creature: 18 } },
      spells: { enabled: false, pinned: null, entries: 24, kinds: { spell: 24 } },
    },
    [valePackId]: { items: { enabled: false, pinned: null, entries: 30, kinds: { item: 30 } } },
    [coastPackId]: {
      creatures: { enabled: false, pinned: null, entries: 26, kinds: { creature: 26 } },
      rules: { enabled: false, pinned: null, entries: 12, kinds: { rule: 12 } },
    },
  }
  const meta = (id: string) =>
    ({
      [srdPackId]: {
        slug: 'rytta',
        srd: true,
        title_en: options.longBase ? 'System Reference Document 5.2.1' : 'Rytta',
        title_es: options.longBase ? 'Documento de referencia del sistema 5.2.1' : 'Rytta',
        version: baseVersion,
      },
      [northPackId]: {
        slug: 'northern-beasts',
        srd: false,
        title_en: 'Northern Beasts',
        title_es: 'Bestias del Norte',
        version: options.withdrawn ? null : northVersion,
      },
      [ashPackId]: {
        slug: 'tomb-of-ash',
        srd: false,
        title_en: 'Tomb of Ash',
        title_es: 'Tomo de ceniza',
        version: 1,
      },
      [valePackId]: {
        slug: 'vale-armoury',
        srd: false,
        title_en: 'Vale Armoury',
        title_es: 'Arsenal del Valle',
        version: 1,
      },
      [coastPackId]: {
        slug: 'coast-bestiary',
        srd: false,
        title_en: 'Coast Bestiary',
        title_es: 'Bestiario de la Costa',
        version: 2,
      },
    })[id]!
  const ids = options.nothing
    ? []
    : options.fewPacks
      ? [srdPackId, northPackId]
      : [srdPackId, northPackId, ashPackId, valePackId, coastPackId]
  const hiddenIn = (pack: string, category: Category) =>
    entriesOf(pack, category).filter((row) => hiddenKeys.has(`${row.kind}:${row.key}`)).length
  const packs = () =>
    ids.map((id) => ({
      id,
      ...meta(id),
      offered: !(options.withdrawn && id === northPackId),
      cover: coverPaths[id]?.[0] ?? null,
      categories: categoryNames
        .filter((name) => rows[id]![name])
        .map((name) => {
          const row = rows[id]![name]!
          return {
            category: name,
            enabled: row.enabled,
            pinned_version: row.pinned,
            entries: row.entries,
            hidden: row.enabled ? hiddenIn(id, name) : 0,
            kinds: row.kinds,
          }
        }),
    }))
  const digest = () => ({
    version: baseVersion,
    new: 3,
    changed: 34,
    withdrawn: 1,
    campaign_versions: 2,
    hidden: 1,
    categories: [
      { category: 'creatures', pinned_version: 2, new: 3, changed: 30, withdrawn: 1 },
      { category: 'spells', pinned_version: 2, new: 0, changed: 4, withdrawn: 0 },
    ],
    affected: [
      {
        kind: 'creature',
        key: 'wolf',
        name_en: 'Wolf',
        name_es: 'Lobo',
        category: 'creatures',
        change: 'changed',
        hidden: false,
        campaign_version: true,
      },
      {
        kind: 'creature',
        key: 'goblin',
        name_en: 'Goblin Warrior',
        name_es: 'Guerrero goblin',
        category: 'creatures',
        change: 'changed',
        hidden: false,
        campaign_version: true,
      },
      {
        kind: 'creature',
        key: 'kobold',
        name_en: 'Kobold',
        name_es: 'Kobold',
        category: 'creatures',
        change: 'withdrawn',
        hidden: true,
        campaign_version: false,
      },
    ],
    affected_more: 0,
  })
  return {
    calls,
    flags,
    async install(page: Page) {
      await page.route(/\/storage\/v1\/object\/sign\/pack-images/, async (route) => {
        const paths = (route.request().postDataJSON() as { paths?: string[] } | null)?.paths ?? []
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(
            paths.map((path) => ({
              path,
              signedURL: `/object/public-test/cover-${path.split('/')[1]}.svg?token=fixture`,
              error: null,
            })),
          ),
        })
      })
      await page.route(/\/storage\/v1\/object\/public-test\/cover-/, async (route) => {
        const id = /cover-([0-9a-f-]+)\.svg/.exec(route.request().url())?.[1] ?? ''
        const [, colour, word] = coverPaths[id] ?? ['', '#444', '?']
        return route.fulfill({
          status: 200,
          contentType: 'image/svg+xml',
          body: cover(colour, word),
        })
      })
      await page.route(
        /\/rest\/v1\/rpc\/(get_campaign_content|set_campaign_content|set_campaign_content_pack|get_campaign_content_pack_changes|update_campaign_content_pack|list_campaign_content_entries|set_campaign_content_hidden)$/,
        async (route) => {
          const method = new URL(route.request().url()).pathname.split('/').at(-1)!
          let body: Json = {}
          try {
            body = route.request().postDataJSON() ?? {}
          } catch {
            /* GET */
          }
          calls.push({ method, body })
          const respond = (data: unknown, status = 200) =>
            route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) })
          if (options.delay) await new Promise((resolve) => setTimeout(resolve, options.delay))
          if (options.forbidden) return respond({ message: 'Forbidden' }, 403)
          const pack = String(body.target_pack ?? '')
          switch (method) {
            case 'get_campaign_content':
              if (flags.failList) return respond({ message: 'down' }, 500)
              return respond(packs())
            case 'set_campaign_content': {
              // Off keeps the pinned version; the SRD creatures also forget their hidden entries.
              const row = rows[pack]?.[body.target_category as Category]
              if (!row) return respond({ message: 'Invalid pack' }, 400)
              row.enabled = Boolean(body.enabled)
              row.pinned = row.pinned ?? meta(pack).version
              if (!row.enabled && pack === srdPackId && body.target_category === 'creatures')
                hiddenKeys.clear()
              return respond(packs())
            }
            case 'set_campaign_content_pack': {
              if (!ids.includes(pack)) return respond({ message: 'Invalid pack' }, 400)
              if (body.enabled && options.withdrawn && pack === northPackId)
                return respond({ message: 'Invalid pack' }, 400)
              for (const row of Object.values(rows[pack]!)) {
                row.enabled = Boolean(body.enabled)
                row.pinned = row.pinned ?? meta(pack).version
              }
              if (!body.enabled && pack === srdPackId) hiddenKeys.clear()
              return respond(packs())
            }
            case 'get_campaign_content_pack_changes':
              if (flags.failDigest) return respond({ message: 'down' }, 500)
              if (pack === northPackId)
                return respond({
                  version: 2,
                  new: 4,
                  changed: 0,
                  withdrawn: 0,
                  campaign_versions: 0,
                  hidden: 0,
                  categories: [
                    { category: 'creatures', pinned_version: 1, new: 4, changed: 0, withdrawn: 0 },
                  ],
                  affected: [],
                  affected_more: 0,
                })
              return respond(digest())
            case 'update_campaign_content_pack': {
              if (options.stale) return respond({ message: 'Stale revision' }, 400)
              for (const row of Object.values(rows[pack]!))
                if (row.enabled) row.pinned = Number(body.expected_version)
              return respond(packs())
            }
            case 'list_campaign_content_entries': {
              const category = body.target_category as Category
              const q = String(body.search ?? '').toLowerCase()
              const all = entriesOf(pack, category).map((row) => ({
                ...row,
                hidden: hiddenKeys.has(`${row.kind}:${row.key}`),
              }))
              const found = all.filter(
                (c) =>
                  (!q ||
                    c.name_en.toLowerCase().includes(q) ||
                    c.name_es.toLowerCase().includes(q)) &&
                  (!body.only_hidden || c.hidden),
              )
              const page = Number(body.page ?? 0)
              return respond({
                total: found.length,
                hidden_total: all.filter((c) => c.hidden).length,
                entries: found.slice(page * 100, page * 100 + 100),
              })
            }
            case 'set_campaign_content_hidden': {
              if (options.hideInvalid) return respond({ message: 'Invalid entry' }, 400)
              const id = `${body.target_kind}:${body.target_key}`
              if (body.hidden) hiddenKeys.add(id)
              else hiddenKeys.delete(id)
              return respond({ kind: body.target_kind, key: body.target_key, hidden: body.hidden })
            }
          }
          return respond({ message: 'Unhandled content route' }, 500)
        },
      )
    },
  }
}
