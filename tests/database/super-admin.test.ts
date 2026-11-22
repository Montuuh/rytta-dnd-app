import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// RYT-153: the super admin role. Only super admins reach the admin RPCs; entering a campaign gives
// time-limited, audited DM access that never shows them as a member; character history shows
// their changes as the DM's, without a name.
const db = new PGlite()
type Json = Record<string, unknown>

const asUser = async (id: string) => {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
}
const asAnon = async () => {
  await db.exec('reset role; set role anon')
  await db.query("select set_config('request.jwt.claim.sub', '', false)")
}
const asSystem = async () => {
  await db.exec('reset role')
  await db.query("select set_config('request.jwt.claim.sub', '', false)")
}
const scalar = async <T = unknown>(sql: string, args: unknown[] = []) =>
  (await db.query<{ result: T }>(sql, args)).rows[0]!.result

const emails = new Map<string, string>()
async function user(label: string) {
  const id = randomUUID()
  emails.set(id, `${label}-${id.slice(0, 8)}@example.com`)
  await asSystem()
  await db.query(
    'insert into auth.users(id, email, email_confirmed_at, created_at) values ($1, $2, now(), now())',
    [id, emails.get(id)],
  )
  return id
}
async function campaign(dm: string, name: string) {
  await asUser(dm)
  return scalar<string>('select public.create_campaign($1) result', [name])
}
async function join(c: string, dm: string, who: string) {
  await asUser(dm)
  const invitation = await scalar<string>('select public.invite_campaign_member($1, $2) result', [
    c,
    emails.get(who),
  ])
  await asUser(who)
  await db.query('select public.respond_campaign_invitation($1, true)', [invitation])
}
async function refused(sql: string, args: unknown[] = []) {
  await expect(db.query(sql, args)).rejects.toThrow(/Forbidden|permission denied/)
}

let admin: string, dmA: string, playerA: string, dmB: string, outsider: string
let campaignA: string, campaignB: string, characterA: string

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz,
      raw_app_meta_data jsonb default '{}', raw_user_meta_data jsonb default '{}',
      created_at timestamptz, last_sign_in_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
    create publication supabase_realtime;
    create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated, anon;
    grant select, insert, delete on storage.objects to authenticated;`)
  const files = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files) await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))

  admin = await user('admin')
  dmA = await user('dma')
  playerA = await user('playera')
  dmB = await user('dmb')
  outsider = await user('outsider')
  campaignA = await campaign(dmA, 'Sunken Coast')
  campaignB = await campaign(dmB, 'Winter Keep')
  await join(campaignA, dmA, playerA)
  await asUser(playerA)
  characterA = await scalar<string>('select public.create_own_character($1, $2, $3) result', [
    campaignA,
    'Arin',
    randomUUID(),
  ])
  await asSystem()
  await db.query('insert into private.super_admins(user_id) values ($1)', [admin])
}, 180000)
afterAll(() => db.close())

const adminCalls: [string, unknown[]][] = [
  ['select public.admin_list_campaigns(null)', []],
  ['select public.admin_campaign_summary($1)', ['A']],
  ['select public.admin_enter_campaign($1)', ['A']],
  ['select public.admin_exit_campaign($1)', ['A']],
  ['select public.admin_set_favourite($1, true)', ['A']],
  ['select public.admin_favourite_campaigns()', []],
  ['select public.admin_audit_log(null, 10)', []],
  ['select public.admin_usage()', []],
  ['select public.admin_find_account($1)', ['someone@example.com']],
]
const withCampaign = (args: unknown[]) => args.map((a) => (a === 'A' ? campaignA : a))

describe('super admin role (RYT-153)', () => {
  it('refuses every admin RPC to anon, outsider, Player, own DM and other DM', async () => {
    for (const who of ['anon', 'outsider', 'player', 'dmA', 'dmB'] as const) {
      if (who === 'anon') await asAnon()
      else await asUser({ outsider, player: playerA, dmA, dmB }[who])
      for (const [sql, args] of adminCalls) await refused(sql, withCampaign(args))
    }
    await asAnon()
    await refused('select public.admin_status()')
    for (const id of [outsider, playerA, dmA]) {
      await asUser(id)
      expect(await scalar<Json>('select public.admin_status() result')).toEqual({
        super_admin: false,
        access: [],
      })
    }
  })

  it('keeps the role tables closed to clients', async () => {
    for (const table of [
      'private.super_admins',
      'private.admin_campaign_access',
      'private.admin_favourites',
      'private.admin_audit',
    ]) {
      await asUser(admin)
      await refused(`select * from ${table}`)
      await refused(
        `update ${table} set created_at = now()`.replace(
          'created_at',
          table === 'private.admin_campaign_access'
            ? 'started_at'
            : table === 'private.super_admins'
              ? 'granted_at'
              : 'created_at',
        ),
      )
      await refused(`delete from ${table}`)
      await asAnon()
      await refused(`select * from ${table}`)
    }
    await asUser(outsider)
    await refused('insert into private.super_admins(user_id) values ($1)', [outsider])
  })

  it('lists every campaign with favourites first and searches by name or DM email', async () => {
    await asUser(admin)
    expect(await scalar<Json>('select public.admin_status() result')).toEqual({
      super_admin: true,
      access: [],
    })
    expect(await scalar<boolean>('select public.admin_set_favourite($1, true) result', [campaignB]))
    const list = await scalar<Json[]>('select public.admin_list_campaigns(null) result')
    expect(list.map((c) => c.name)).toEqual(['Winter Keep', 'Sunken Coast'])
    expect(list[0]).toMatchObject({ favourite: true, members: 1 })
    expect(list[1]).toMatchObject({ favourite: false, members: 2 })
    const byName = await scalar<Json[]>("select public.admin_list_campaigns('sunken') result")
    expect(byName.map((c) => c.id)).toEqual([campaignA])
    const byEmail = await scalar<Json[]>('select public.admin_list_campaigns($1) result', [
      emails.get(dmB),
    ])
    expect(byEmail.map((c) => c.id)).toEqual([campaignB])
    // A username no longer finds campaigns: only names, or a DM's exact (audited) email.
    expect(await scalar<Json[]>("select public.admin_list_campaigns('dmb') result")).toEqual([])
    const favourites = await scalar<Json[]>('select public.admin_favourite_campaigns() result')
    expect(favourites.map((c) => c.id)).toEqual([campaignB])
    await db.query('select public.admin_set_favourite($1, false)', [campaignB])
    expect(await scalar<Json[]>('select public.admin_favourite_campaigns() result')).toEqual([])
    const summary = await scalar<Json>('select public.admin_campaign_summary($1) result', [
      campaignA,
    ])
    expect(summary).toMatchObject({ name: 'Sunken Coast', players: 1, characters: 1 })
    expect(summary.dm_emails).toEqual([emails.get(dmA)])
    expect(summary.viewer_role).toBeNull()
  })

  it('gives DM access only to the entered campaign, for two hours, never as a member', async () => {
    await asUser(admin)
    expect(await scalar<boolean>('select private.is_campaign_dm($1) result', [campaignA])).toBe(
      false,
    )
    const entered = await scalar<Json>('select public.admin_enter_campaign($1) result', [campaignA])
    const hours = (new Date(String(entered.expires_at)).getTime() - Date.now()) / (60 * 60 * 1000)
    expect(hours).toBeGreaterThan(1.9)
    expect(hours).toBeLessThanOrEqual(2)
    expect(await scalar<boolean>('select private.is_campaign_dm($1) result', [campaignA])).toBe(
      true,
    )
    expect(await scalar<boolean>('select private.is_campaign_member($1) result', [campaignA])).toBe(
      true,
    )
    expect(await scalar<boolean>('select private.is_campaign_dm($1) result', [campaignB])).toBe(
      false,
    )
    // A DM action works while inside; its campaign event names nobody.
    await db.query('select public.set_party_level($1, 3, $2)', [campaignA, randomUUID()])
    await asSystem()
    expect(
      await scalar<number>(
        "select count(*)::int result from public.campaign_events where campaign_id = $1 and kind = 'party_level' and actor_id is null",
        [campaignA],
      ),
    ).toBe(1)
    await asUser(admin)
    const mine = (
      await db.query<{ id: string; role: string }>(
        'select id, role from public.list_my_campaigns_with_modules()',
      )
    ).rows
    expect(mine).toEqual([{ id: campaignA, role: 'dm' }].map((r) => expect.objectContaining(r)))
    // Members, the DM's list and the Player's list never show the super admin.
    await asUser(dmA)
    const members = (
      await db.query<Json>('select to_jsonb(m) row from public.list_campaign_members($1) m', [
        campaignA,
      ])
    ).rows
    expect(members).toHaveLength(2)
    expect(JSON.stringify(members)).not.toContain(admin)
    expect(JSON.stringify(members)).not.toContain(emails.get(admin))
    for (const viewer of [dmA, playerA]) {
      await asUser(viewer)
      const rows = await scalar<Json[]>(
        'select coalesce(jsonb_agg(m), $2::jsonb) result from public.campaign_members m where m.campaign_id = $1',
        [campaignA, '[]'],
      )
      expect(JSON.stringify(rows)).not.toContain(admin)
    }
    await asSystem()
    expect(
      await scalar<number>(
        'select count(*)::int result from public.campaign_members where user_id = $1',
        [admin],
      ),
    ).toBe(0)
    // Admin access never manages membership: no invitation, no role change, no seat.
    await asUser(admin)
    await refused('select public.invite_campaign_member($1, $2)', [campaignA, emails.get(admin)])
    await refused('select public.change_campaign_member($1, $2, $3)', [campaignA, playerA, 'dm'])
    await refused('select public.change_campaign_member($1, $2, null)', [campaignA, playerA])
    // The campaign's own DM still invites, and the super admin may revoke that invitation.
    await asUser(dmA)
    const invitation = await scalar<string>('select public.invite_campaign_member($1, $2) result', [
      campaignA,
      'guest@example.com',
    ])
    await asUser(admin)
    await db.query('select public.revoke_campaign_invitation($1)', [invitation])
    await asSystem()
    expect(
      await scalar<string>('select status result from public.campaign_invitations where id = $1', [
        invitation,
      ]),
    ).toBe('revoked')
    // Promoting themself finds no seat to change.
    await asUser(admin)
    await expect(
      db.query('select public.change_campaign_member($1, $2, $3)', [campaignA, admin, 'dm']),
    ).rejects.toThrow(/Member unavailable/)
    await asSystem()
    expect(
      await scalar<number>(
        'select count(*)::int result from public.campaign_members where user_id = $1',
        [admin],
      ),
    ).toBe(0)
    await asUser(admin)
    await db.query('select public.admin_exit_campaign($1)', [campaignA])
    expect(await scalar<boolean>('select private.is_campaign_dm($1) result', [campaignA])).toBe(
      false,
    )
    await refused('select public.set_party_level($1, 4, $2)', [campaignA, randomUUID()])
  })

  it('ends access when it expires or the role is withdrawn', async () => {
    await asUser(admin)
    await db.query('select public.admin_enter_campaign($1)', [campaignB])
    expect(await scalar<boolean>('select private.is_campaign_dm($1) result', [campaignB])).toBe(
      true,
    )
    await asSystem()
    await db.query(
      "update private.admin_campaign_access set started_at = now() - interval '3 hours', expires_at = now() - interval '1 hour' where campaign_id = $1 and ended_at is null",
      [campaignB],
    )
    await asUser(admin)
    expect(await scalar<boolean>('select private.is_campaign_dm($1) result', [campaignB])).toBe(
      false,
    )
    await db.query('select public.admin_enter_campaign($1)', [campaignB])
    await asSystem()
    await db.query('delete from private.super_admins where user_id = $1', [admin])
    await asUser(admin)
    expect(await scalar<boolean>('select private.is_campaign_dm($1) result', [campaignB])).toBe(
      false,
    )
    await refused('select public.admin_list_campaigns(null)')
    await asSystem()
    await db.query('insert into private.super_admins(user_id) values ($1)', [admin])
    // Withdrawing the role closed the access: granting it again does not revive it.
    await asUser(admin)
    expect(await scalar<boolean>('select private.is_campaign_dm($1) result', [campaignB])).toBe(
      false,
    )
    expect(await scalar<Json>('select public.admin_status() result')).toMatchObject({ access: [] })
  })

  it('refuses admin access to a super admin who already plays in the campaign', async () => {
    await asSystem()
    await db.query('insert into private.super_admins(user_id) values ($1)', [playerA])
    await asUser(playerA)
    const summary = await scalar<Json>('select public.admin_campaign_summary($1) result', [
      campaignA,
    ])
    expect(summary.viewer_role).toBe('player')
    await expect(db.query('select public.admin_enter_campaign($1)', [campaignA])).rejects.toThrow(
      /already a member/,
    )
    expect(await scalar<boolean>('select private.is_campaign_dm($1) result', [campaignA])).toBe(
      false,
    )
    await asSystem()
    await db.query('delete from private.super_admins where user_id = $1', [playerA])
  })

  it('shows a super admin change in character history as the DM, without a name', async () => {
    await asSystem()
    await db.query(
      `insert into public.character_events(campaign_id, character_id, actor_id, kind, before_value, after_value)
       values ($1, $2, $3, 'characters:UPDATE', '{"name":"Arin"}', '{"name":"Arin Vale"}')`,
      [campaignA, characterA, admin],
    )
    for (const viewer of [playerA, dmA]) {
      await asUser(viewer)
      const history = await scalar<Json[]>(
        'select public.get_character_history($1, $2, null, 10) result',
        [campaignA, characterA],
      )
      const change = history.find((h) => JSON.stringify(h.changes).includes('Arin Vale'))!
      expect(change).toMatchObject({ actor: 'dm', actor_name: null })
    }
  })

  it('makes super admins content editors', async () => {
    // The helper is internal: evaluate it as the owner with each caller's identity.
    for (const [who, expected] of [
      [admin, true],
      [dmA, false],
    ] as const) {
      await asSystem()
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [who])
      expect(await scalar<boolean>('select private.is_content_editor() result')).toBe(expected)
    }
  })

  it('finds an account by exact email or username only, and audits every action', async () => {
    await asUser(admin)
    const account = await scalar<Json>('select public.admin_find_account($1) result', [
      emails.get(playerA)!.toUpperCase(),
    ])
    expect(account).toMatchObject({ email: emails.get(playerA) })
    expect(account.campaigns).toEqual([{ id: campaignA, name: 'Sunken Coast', role: 'player' }])
    expect(await scalar('select public.admin_find_account($1) result', ['playera'])).toBeNull()
    const usage = await scalar<Json[]>('select public.admin_usage() result')
    expect(usage.at(-1)).toMatchObject({ cohort_week: 'total' })
    const log = await scalar<Json[]>('select public.admin_audit_log(null, 50) result')
    const actions = log.map((l) => l.action)
    for (const action of ['enter', 'exit', 'favourite', 'unfavourite', 'account_lookup'])
      expect(actions).toContain(action)
    const exit = log.find((l) => l.action === 'exit' && l.campaign_id === campaignA)!
    expect((exit.detail as Json).seconds).toBeGreaterThanOrEqual(0)
    expect(log.filter((l) => l.action === 'account_lookup').map((l) => l.detail)).toEqual([
      { found: false, account_id: null },
      { found: true, account_id: playerA },
      { found: true, via: 'campaigns' },
    ])
  })
})
