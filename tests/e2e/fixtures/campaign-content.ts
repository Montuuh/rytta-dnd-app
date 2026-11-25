import type { Page } from '@playwright/test'

// RYT-162 SDK contract fixture: the campaign content RPCs for one campaign using the SRD
// creatures pack at version 1 while version 2 is published. Authorization, pinned versions and
// the bestiary mirror are verified in tests/database/campaign-content.test.ts.
type Json = Record<string, unknown>
export const srdPackId = '80000000-0000-4000-8000-000000000001'
export const northPackId = '80000000-0000-4000-8000-000000000002'

export function contentServer(options: { stale?: boolean; northUpdate?: boolean } = {}) {
  const calls: { method: string; body: Json }[] = []
  const creatures = [
    { kind: 'creature', key: 'aboleth', name_en: 'Aboleth', name_es: 'Aboleth', hidden: false },
    { kind: 'creature', key: 'kobold', name_en: 'Kobold', name_es: 'Kobold', hidden: true },
    { kind: 'creature', key: 'wolf', name_en: 'Wolf', name_es: 'Lobo', hidden: false },
  ]
  const state = {
    srd: { enabled: true, pinned: 1 as number | null },
    // northUpdate: a second pack in use whose newer version waits, to see more than one row to review.
    north: {
      enabled: Boolean(options.northUpdate),
      pinned: options.northUpdate ? (1 as number | null) : (null as number | null),
    },
  }
  const packs = () => [
    {
      id: srdPackId,
      slug: 'srd-5-2-1',
      srd: true,
      title_en: 'SRD 5.2.1',
      title_es: 'SRD 5.2.1',
      version: 2,
      categories: [
        {
          category: 'creatures',
          enabled: state.srd.enabled,
          pinned_version: state.srd.pinned,
          entries: creatures.length,
          hidden: state.srd.enabled ? creatures.filter((c) => c.hidden).length : 0,
        },
        { category: 'spells', enabled: true, pinned_version: 2, entries: 339, hidden: 0 },
      ],
    },
    {
      id: northPackId,
      slug: 'northern-beasts',
      title_en: 'Northern Beasts',
      title_es: 'Bestias del Norte',
      version: options.northUpdate ? 2 : 1,
      categories: [
        {
          category: 'creatures',
          enabled: state.north.enabled,
          pinned_version: state.north.pinned,
          entries: 42,
          hidden: 0,
        },
      ],
    },
  ]
  return {
    calls,
    async install(page: Page) {
      await page.route(
        /\/rest\/v1\/rpc\/(get_campaign_content|set_campaign_content|get_campaign_content_changes|update_campaign_content|list_campaign_content_entries|set_campaign_content_hidden)$/,
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
          const which = body.target_pack === srdPackId ? state.srd : state.north
          switch (method) {
            case 'get_campaign_content':
              return respond(packs())
            case 'set_campaign_content':
              // Off keeps the pinned version; the SRD creatures also forget their hidden entries.
              which.enabled = Boolean(body.enabled)
              which.pinned = which.pinned ?? 1
              if (!which.enabled && body.target_pack === srdPackId)
                for (const c of creatures) c.hidden = false
              return respond(packs())
            case 'get_campaign_content_changes':
              return respond({
                pinned_version: 1,
                version: 2,
                changes: [
                  {
                    kind: 'creature',
                    key: 'owlbear',
                    name_en: 'Owlbear',
                    name_es: 'Oso lechuza',
                    change: 'new',
                    hidden: false,
                    campaign_version: false,
                  },
                  {
                    kind: 'creature',
                    key: 'wolf',
                    name_en: 'Wolf',
                    name_es: 'Lobo',
                    change: 'changed',
                    hidden: false,
                    campaign_version: true,
                  },
                  {
                    kind: 'creature',
                    key: 'kobold',
                    name_en: 'Kobold',
                    name_es: 'Kobold',
                    change: 'withdrawn',
                    hidden: true,
                    campaign_version: false,
                  },
                ],
              })
            case 'update_campaign_content':
              if (options.stale) return respond({ message: 'Stale revision' }, 400)
              state.srd.pinned = Number(body.expected_version)
              return respond(packs())
            case 'list_campaign_content_entries': {
              const q = String(body.search ?? '').toLowerCase()
              const rows = creatures.filter(
                (c) =>
                  !q || c.name_en.toLowerCase().includes(q) || c.name_es.toLowerCase().includes(q),
              )
              return respond({ total: rows.length, entries: rows })
            }
            case 'set_campaign_content_hidden': {
              const row = creatures.find((c) => c.key === body.target_key)
              if (row) row.hidden = Boolean(body.hidden)
              return respond({ kind: body.target_kind, key: body.target_key, hidden: body.hidden })
            }
          }
          return respond({ message: 'Unhandled content route' }, 500)
        },
      )
    },
  }
}
