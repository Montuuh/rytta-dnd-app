import type { Page } from '@playwright/test'
import { campaignId } from './identity.ts'

// RYT-153 SDK contract fixture: the admin RPCs for a super admin. Authorization, expiry and
// auditing are verified against PostgreSQL in tests/database/super-admin.test.ts.
type Json = Record<string, unknown>
export const ironwoodId = '20000000-0000-4000-8000-0000000000a1'

export function adminServer(
  options: { access?: string[]; favourites?: string[]; extra?: number } = {},
) {
  const calls: { method: string; body: Json }[] = []
  const expires = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString()
  const access = new Set(options.access ?? [])
  const favourites = new Set(options.favourites ?? [])
  const campaigns = [
    {
      id: ironwoodId,
      name: 'Ironwood Vale',
      created_at: '2026-11-02T10:00:00Z',
      members: 4,
      dms: ['Mara'],
      last_activity: '2026-11-20T21:00:00Z',
      description: 'Logging towns at war with the forest.',
      players: 3,
      characters: 5,
      encounters: 7,
      dm_emails: ['mara@example.com'],
      viewer_role: null,
    },
    {
      id: campaignId,
      name: 'The Sunken Coast',
      created_at: '2026-10-27T00:00:00Z',
      members: 2,
      dms: ['Table DM'],
      last_activity: '2026-11-21T19:30:00Z',
      description: 'A coastline that keeps its secrets.',
      players: 1,
      characters: 1,
      encounters: 2,
      dm_emails: ['dm@example.com'],
      viewer_role: null,
    },
  ]
  // A long directory, to check that picking a campaign far down brings its summary into view.
  for (let n = 1; n <= (options.extra ?? 0); n++)
    campaigns.push({
      ...campaigns[0]!,
      id: `20000000-0000-4000-8000-${String(n).padStart(12, '0').replace(/^0/, 'b')}`,
      name: `Table ${n}`,
      members: 1,
    })
  const row = (c: (typeof campaigns)[number]) => {
    const { description, players, characters, encounters, dm_emails, viewer_role, ...rest } = c
    void [description, players, characters, encounters, dm_emails, viewer_role]
    return {
      ...rest,
      favourite: favourites.has(c.id),
      access_expires_at: access.has(c.id) ? expires : null,
    }
  }
  const audit: Json[] = [
    {
      id: '90000000-0000-4000-8000-000000000002',
      at: '2026-11-21T18:40:00Z',
      action: 'exit',
      actor: 'admin@example.com',
      campaign_id: ironwoodId,
      campaign: 'Ironwood Vale',
      detail: { seconds: 1260 },
    },
    {
      id: '90000000-0000-4000-8000-000000000001',
      at: '2026-11-21T18:19:00Z',
      action: 'enter',
      actor: 'admin@example.com',
      campaign_id: ironwoodId,
      campaign: 'Ironwood Vale',
      detail: { expires_at: '2026-11-21T20:19:00Z' },
    },
  ]
  return {
    calls,
    async install(page: Page) {
      await page.route(/\/rest\/v1\/rpc\/admin_[a-z_]+$/, async (route) => {
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
        const target = String(body.target_campaign ?? '')
        switch (method) {
          case 'admin_status':
            return respond({
              super_admin: true,
              access: [...access].map((id) => ({ campaign_id: id, expires_at: expires })),
            })
          case 'admin_list_campaigns': {
            const q = String(body.search ?? '').toLowerCase()
            const list = campaigns
              .filter((c) => !q || c.name.toLowerCase().includes(q) || c.dm_emails.includes(q))
              .map(row)
              .sort((a, b) => Number(b.favourite) - Number(a.favourite))
            return respond(list)
          }
          case 'admin_campaign_summary': {
            const c = campaigns.find((x) => x.id === target)
            if (!c) return respond({ message: 'Campaign not found' }, 400)
            return respond({ ...c, ...row(c) })
          }
          case 'admin_favourite_campaigns':
            return respond(campaigns.filter((c) => favourites.has(c.id)).map(row))
          case 'admin_set_favourite':
            if (body.favourite) favourites.add(target)
            else favourites.delete(target)
            return respond(Boolean(body.favourite))
          case 'admin_enter_campaign':
            access.add(target)
            return respond({ campaign_id: target, expires_at: expires })
          case 'admin_exit_campaign': {
            const ended = access.delete(target)
            return respond({ campaign_id: target, ended })
          }
          case 'admin_audit_log':
            return respond(audit)
          case 'admin_usage':
            return respond([
              {
                cohort_week: '2026-11-02',
                campaigns: 6,
                activation_denominator: 6,
                activated_settled: 4,
                solo_preparation: 1,
                return_denominator: 4,
                returned_settled: 3,
                returned_so_far: 3,
              },
              {
                cohort_week: 'total',
                campaigns: 6,
                activation_denominator: 6,
                activated_settled: 4,
                solo_preparation: 1,
                return_denominator: 4,
                returned_settled: 3,
                returned_so_far: 3,
              },
            ])
          case 'admin_find_account':
            return respond(
              String(body.query).toLowerCase() === 'player@example.com'
                ? {
                    email: 'player@example.com',
                    username: 'arin',
                    created_at: '2026-10-27T00:00:00Z',
                    last_sign_in_at: '2026-11-21T19:00:00Z',
                    providers: ['google'],
                    campaigns: [{ id: campaignId, name: 'The Sunken Coast', role: 'player' }],
                  }
                : null,
            )
        }
        return respond({ message: 'Unhandled admin route' }, 500)
      })
    },
  }
}
