import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-115: account data export and self-service account deletion; explicit delete actions on
// every foreign key to auth.users.
const migration = '20261125120000_account_deletion_export.sql'
const db = new PGlite()
type Json = Record<string, unknown>
const json = (value: unknown) => JSON.stringify(value)

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
const scalar = async <T = string>(sql: string, args: unknown[] = []) =>
  (await db.query<{ result: T }>(sql, args)).rows[0]!.result
const rows = async (sql: string, args: unknown[] = []) => (await db.query<Json>(sql, args)).rows

const emails = new Map<string, string>()
async function user(label: string) {
  const id = randomUUID()
  emails.set(id, `${label}-${id.slice(0, 8)}@example.com`)
  await asSystem()
  await db.query(
    'insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values ($1,$2,now(),$3)',
    [id, emails.get(id), json({ full_name: `${label} Full Name` })],
  )
  return id
}
// Kept in memory so reading an email does not change the session role.
const emailOf = async (id: string) => emails.get(id)!

/** A campaign of `owner` with `player` holding Arin, who carries a priced item. */
async function campaign(owner: string, player: string | null, schema = 'public', name = 'Keep') {
  await asUser(owner)
  const c = await scalar(`select ${schema}.create_campaign($1) result`, [name])
  const arin = await scalar(`select ${schema}.create_character($1,'Arin') result`, [c])
  const def = await scalar<{ id: string }>(
    `select ${schema}.save_item_definition($1,null,null,$2,$3) result`,
    [c, json({ name: 'Ruby', category: 'treasure', value_gp: 900 }), randomUUID()],
  )
  await db.query(`select ${schema}.grant_item($1,$2,$3,2,$4)`, [c, arin, def.id, randomUUID()])
  if (player) {
    const invite = await scalar(`select ${schema}.invite_character_player($1,$2,$3) result`, [
      c,
      arin,
      await emailOf(player),
    ])
    await asUser(player)
    await db.query(`select ${schema}.respond_campaign_invitation($1,true)`, [invite])
  }
  return { c, arin, def: def.id }
}
const invite = async (schema: string, c: string, by: string, to: string) => {
  const email = await emailOf(to)
  await asUser(by)
  return scalar(`select ${schema}.invite_campaign_member($1,$2) result`, [c, email])
}
const join = async (schema: string, c: string, by: string, to: string, role = 'player') => {
  const id = await invite(schema, c, by, to)
  await asUser(to)
  await db.query(`select ${schema}.respond_campaign_invitation($1,true)`, [id])
  if (role === 'dm') {
    await asUser(by)
    await db.query(`select ${schema}.change_campaign_member($1,$2,'dm')`, [c, to])
  }
}
const exportOf = async (id: string, schema = 'public') => {
  await asUser(id)
  return scalar<Json>(`select ${schema}.export_my_data() result`)
}
const deleteAccount = async (
  id: string,
  key = randomUUID(),
  schema = 'public',
  word = 'DELETE',
) => {
  await asUser(id)
  // 20261128120000: the deletion runs on a prepared request (prepare_account_deletion).
  await db.query(`select ${schema}.prepare_account_deletion($1)`, [key])
  return scalar<Json>(`select ${schema}.delete_my_account($1,$2) result`, [word, key])
}
const authExists = async (id: string) => {
  await asSystem()
  return Number(await scalar('select count(*) result from auth.users where id = $1', [id])) === 1
}

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
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
  for (const file of files.filter((f) => f < migration))
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  // A PRE copied before this file receives the remapped DDL.
  await db.exec(
    withExposureSql(
      etlCommand(['--apply']).query,
      readFileSync('supabase/maintenance/expose-pre.sql', 'utf8'),
    ),
  )
  for (const file of files.filter((f) => f >= migration))
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
}, 120000)
afterAll(() => db.close())

describe('foreign keys to auth.users', () => {
  it('have an explicit delete action in production and in PRE', async () => {
    await asSystem()
    const keys =
      await rows(`select n.nspname schema, c.conrelid::regclass::text tbl, c.confdeltype action
      from pg_constraint c join pg_namespace n on n.oid = c.connamespace
      where c.contype = 'f' and c.confrelid = 'auth.users'::regclass order by 1, 2`)
    expect(keys.filter((k) => k.action === 'a')).toEqual([])
    const bySchema = (s: string) => keys.filter((k) => k.schema === s).length
    // RYT-006 adds quests.created_by (set null) and private.quest_reads (cascade).
    // RYT-162 adds campaign_content.updated_by (set null).
    expect(bySchema('public')).toBe(24)
    expect(bySchema('pre')).toBe(24)
    expect(
      keys
        .filter((k) => k.action === 'c')
        .map((k) => k.tbl)
        .sort(),
    ).toEqual([
      'campaign_members',
      'pre.campaign_members',
      'pre.profiles',
      // RYT-153: the role, admin accesses and favourites go with the account; campaign requests
      // now reference the account instead of the membership.
      'pre_private.admin_campaign_access',
      'pre_private.admin_favourites',
      'pre_private.campaign_requests',
      'pre_private.content_editors',
      'pre_private.quest_reads',
      'pre_private.super_admins',
      'private.admin_campaign_access',
      'private.admin_favourites',
      'private.campaign_requests',
      'private.content_editors',
      'private.quest_reads',
      'private.super_admins',
      'profiles',
    ])
  })

  it('lets a direct Auth deletion remove a campaign owner who acted in history and proposed items', async () => {
    const owner = await user('owner'),
      coDm = await user('codm'),
      dm = await user('dm')
    const a = await campaign(owner, null, 'public', 'Owned')
    await join('public', a.c, owner, coDm, 'dm')
    // The owner plays in another campaign: history, a proposal and an inventory event.
    const b = await campaign(dm, owner, 'public', 'Played')
    await asUser(owner)
    await db.query("select public.rename_character($1,$2,'Arin Vale')", [b.c, b.arin])
    await db.query('select public.propose_item($1,$2,$3,1,$4)', [
      b.c,
      b.arin,
      json({ name: 'Idea', category: 'gear' }),
      randomUUID(),
    ])
    await asSystem()
    await db.query('delete from auth.users where id = $1', [owner])
    expect(await rows('select owner_id from public.campaigns where id = $1', [a.c])).toEqual([
      { owner_id: null },
    ])
    expect(
      await rows('select user_id, is_active from public.characters where id = $1', [b.arin]),
    ).toEqual([{ user_id: null, is_active: true }])
    expect(
      await rows('select proposed_by from public.item_proposals where campaign_id = $1', [b.c]),
    ).toEqual([{ proposed_by: null }])
    expect(
      Number(
        await scalar('select count(*) result from public.campaign_members where user_id = $1', [
          owner,
        ]),
      ),
    ).toBe(0)
    expect(
      Number(
        await scalar(
          "select count(*) result from public.character_events where character_id = $1 and kind = 'characters:UPDATE' and actor_id is null",
          [b.arin],
        ),
      ),
    ).toBeGreaterThan(0)
  })
})

describe('anonymous and foreign access', () => {
  it('denies anon every new function in both environments', async () => {
    for (const schema of ['public', 'pre']) {
      await asAnon()
      for (const sql of [
        `select ${schema}.export_my_data()`,
        `select * from ${schema}.account_deletion_blockers()`,
        `select * from ${schema}.account_storage_paths()`,
        `select ${schema}.delete_my_account('DELETE', '${randomUUID()}')`,
      ])
        await expect(db.query(sql)).rejects.toThrow(/permission denied/)
    }
    await asSystem()
    expect(
      await rows(
        "select count(*)::int n from information_schema.role_routine_grants where grantee in ('anon','PUBLIC') and routine_name in ('export_my_data','account_deletion_blockers','account_storage_paths','delete_my_account')",
      ),
    ).toEqual([{ n: 0 }])
  })

  it('requires a session and validates confirmation and request id', async () => {
    await asSystem()
    await db.exec('set role authenticated')
    await expect(db.query('select public.export_my_data()')).rejects.toThrow(/Forbidden/)
    await expect(
      db.query("select public.delete_my_account('DELETE', $1)", [randomUUID()]),
    ).rejects.toThrow(/Forbidden/)
    const someone = await user('someone')
    await expect(deleteAccount(someone, randomUUID(), 'public', 'delete')).rejects.toThrow(
      /Confirmation required/,
    )
    await asUser(someone)
    await expect(db.query("select public.delete_my_account('DELETE', null)")).rejects.toThrow(
      /Invalid request/,
    )
    expect(await authExists(someone)).toBe(true)
  })
})

describe('export_my_data', () => {
  it('exports the Player their own data without DM-only fields or other users', async () => {
    const dm = await user('dm'),
      player = await user('player'),
      peer = await user('peer'),
      outsider = await user('outsider'),
      otherDm = await user('otherdm')
    const s = await campaign(dm, player, 'public', 'Shared')
    await asUser(dm)
    const bea = await scalar("select public.create_character($1,'Bea') result", [s.c])
    const beaInvite = await scalar('select public.invite_character_player($1,$2,$3) result', [
      s.c,
      bea,
      await emailOf(peer),
    ])
    await asUser(peer)
    await db.query('select public.respond_campaign_invitation($1,true)', [beaInvite])
    await asUser(player)
    await db.query("select public.set_my_username('Arin_Player')")
    await db.query('select public.propose_item($1,$2,$3,1,$4)', [
      s.c,
      s.arin,
      json({ name: 'Idea', category: 'gear', suggested_value_gp: 3 }),
      randomUUID(),
    ])
    const other = await campaign(otherDm, null, 'public', 'Elsewhere')
    await invite('public', other.c, otherDm, player)

    const data = await exportOf(player)
    expect(data).toMatchObject({
      format: 'rytta-account-export',
      version: 1,
      environment: 'public',
      limits: { rows_per_section: 500 },
      truncated: [],
      profile: { user_id: player, username: 'Arin_Player', name: 'player Full Name' },
    })
    expect(data.memberships).toEqual([
      expect.objectContaining({
        campaign_id: s.c,
        campaign_name: 'Shared',
        role: 'player',
        active: true,
        is_owner: false,
      }),
    ])
    const characters = data.characters as Json[]
    expect(characters.map((c) => c.id)).toEqual([s.arin])
    expect(characters[0]).toMatchObject({
      sheet: expect.objectContaining({ level: expect.any(Number) }),
      vitals: expect.objectContaining({ current_hp: expect.any(Number) }),
      resources: expect.objectContaining({ gold: expect.anything() }),
    })
    const inventory = data.inventory as Json[]
    expect(inventory).toHaveLength(1)
    expect(inventory[0]).toMatchObject({
      character_id: s.arin,
      quantity: 2,
      item: { name: 'Ruby' },
    })
    expect((data.invitations as Json[]).map((i) => i.campaign_id).sort()).toEqual(
      [s.c, other.c].sort(),
    )
    expect(data.item_proposals).toEqual([expect.objectContaining({ character_id: s.arin })])
    const text = json(data)
    // Never the DM-only value, the DM's notes, another member or the other campaign's content.
    expect(text).not.toMatch(/"value_gp"|dm_note|:900\b/)
    for (const foreign of [bea, peer, dm, otherDm, other.arin]) expect(text).not.toContain(foreign)

    for (const id of [outsider, peer]) {
      const own = await exportOf(id)
      expect(json(own)).not.toContain(s.arin)
      expect(json(own)).not.toContain(player)
    }
    const foreignDm = await exportOf(otherDm)
    expect(json(foreignDm)).not.toContain(s.c)
    expect((await exportOf(outsider)).characters).toEqual([])
  })

  it('caps every section and says so', async () => {
    const dm = await user('cap')
    const s = await campaign(dm, null, 'public', 'Busy')
    await asSystem()
    await db.query(
      `insert into public.character_events(campaign_id, character_id, actor_id, kind, after_value)
        select $1, $2, $3, 'characters:UPDATE', '{}'::jsonb from generate_series(1, 520)`,
      [s.c, s.arin, dm],
    )
    const data = await exportOf(dm)
    expect((data.character_events as Json[]).length).toBe(500)
    expect(data.truncated).toEqual(['character_events'])
  })
})

describe('delete_my_account', () => {
  it('blocks the only DM of a campaign with other members and lists it', async () => {
    const dm = await user('dm'),
      player = await user('player')
    const s = await campaign(dm, player, 'public', 'Blocked')
    await asUser(dm)
    expect(await rows('select * from public.account_deletion_blockers()')).toEqual([
      { campaign_id: s.c, campaign_name: 'Blocked', other_members: 1 },
    ])
    expect(await rows('select * from public.account_storage_paths()')).toEqual([])
    await expect(deleteAccount(dm)).rejects.toThrow(/Account deletion blocked/)
    expect(await authExists(dm)).toBe(true)
    // The Player is never blocked by someone else's campaign.
    await asUser(player)
    expect(await rows('select * from public.account_deletion_blockers()')).toEqual([])
    // A second DM unblocks it.
    const coDm = await user('codm')
    await join('public', s.c, dm, coDm, 'dm')
    await asUser(dm)
    expect(await rows('select * from public.account_deletion_blockers()')).toEqual([])
  })

  it('deletes a solo campaign with its data, lists only its active-environment paths and replays', async () => {
    const solo = await user('solo'),
      outsider = await user('outsider')
    const s = await campaign(solo, null, 'public', 'Alone')
    const p = await campaign(solo, null, 'pre', 'Alone PRE')
    await asUser(solo)
    await db.query("select public.rename_character($1,$2,'Arin Solo')", [s.c, s.arin])
    await db.query("select public.set_my_username('Solo_User')")
    // Shops, a completed order, inventory history and an encounter go with the campaign.
    const shop = await scalar('select public.save_shop($1,null,null,$2,$3) result', [
      s.c,
      json({ name: 'Market', visibility: 'party', mode: 'auto' }),
      randomUUID(),
    ])
    const listing = await scalar('select public.save_listing($1,$2,null,null,$3,$4) result', [
      s.c,
      shop,
      json({ definition_id: s.def, price: 0 }),
      randomUUID(),
    ])
    await db.query("select public.checkout($1,$2,$3,$4,'',$5)", [
      s.c,
      shop,
      s.arin,
      json([{ listing_id: listing, quantity: 1 }]),
      randomUUID(),
    ])
    await db.query("select public.create_encounter($1,'Ambush',$2)", [s.c, randomUUID()])
    await asSystem()
    expect(
      Number(
        await scalar('select count(*) result from public.shop_orders where campaign_id = $1', [
          s.c,
        ]),
      ),
    ).toBe(1)
    const portrait = `public/${s.c}/${s.arin}/${randomUUID()}.webp`
    await db.query('insert into storage.objects(bucket_id, name) values ($1,$2),($3,$4),($5,$6)', [
      'character-portraits',
      portrait,
      'tabletop-media',
      `pre/${p.c}/map/${randomUUID()}.webp`,
      'tabletop-media',
      `public/${randomUUID()}/map/${randomUUID()}.webp`,
    ])
    await asUser(solo)
    expect(await rows('select * from public.account_storage_paths()')).toEqual([
      { bucket_id: 'character-portraits', object_path: portrait, campaign_id: s.c },
    ])
    expect(
      (await rows('select * from pre.account_storage_paths()')).map((r) => r.object_path),
    ).toEqual([expect.stringMatching(new RegExp(`^pre/${p.c}/`))])

    const key = randomUUID()
    const result = await deleteAccount(solo, key)
    expect(result).toEqual({
      deleted: true,
      data_deleted: true,
      environment: 'public',
      auth_user: 'deleted',
      campaigns_deleted: [s.c],
      campaigns_left: [],
    })
    await asSystem()
    for (const t of [
      'campaigns',
      'characters',
      'item_definitions',
      'inventory_items',
      'character_events',
    ])
      expect(
        Number(
          await scalar(
            `select count(*) result from public.${t} where ${t === 'campaigns' ? 'id' : 'campaign_id'} = $1`,
            [s.c],
          ),
        ),
      ).toBe(0)
    expect(
      Number(
        await scalar('select count(*) result from public.profiles where user_id = $1', [solo]),
      ),
    ).toBe(0)
    expect(await authExists(solo)).toBe(false)
    // PRE data is not touched by the production function beyond the Auth cascade.
    expect(
      Number(await scalar('select count(*) result from pre.campaigns where id = $1', [p.c])),
    ).toBe(1)
    // Replay with the same key: same result; another caller cannot reuse it.
    expect(await deleteAccount(solo, key)).toEqual(result)
    await expect(deleteAccount(outsider, key)).rejects.toThrow(/Request mismatch/)
    expect(await authExists(outsider)).toBe(true)
    // A fresh key finds nothing left.
    expect(await deleteAccount(solo)).toMatchObject({ campaigns_deleted: [], campaigns_left: [] })
  })

  it('leaves a shared campaign: characters return to the pool, history stays readable by the DM', async () => {
    const dm = await user('dm'),
      player = await user('player'),
      peer = await user('peer')
    const s = await campaign(dm, player, 'public', 'Party')
    await join('public', s.c, dm, peer)
    await asUser(player)
    await db.query("select public.rename_character($1,$2,'Arin Gone')", [s.c, s.arin])
    await db.query('select public.propose_item($1,$2,$3,1,$4)', [
      s.c,
      s.arin,
      json({ name: 'Idea', category: 'gear' }),
      randomUUID(),
    ])
    const spare = await scalar("select public.create_own_character($1,'Spare',$2) result", [
      s.c,
      randomUUID(),
    ])
    await db.query('select public.archive_character($1,$2)', [s.c, spare])
    await db.query("select public.set_my_username('Leaving_One')")
    // A pending invitation to the leaving player from another campaign disappears too.
    const otherDm = await user('otherdm')
    const other = await campaign(otherDm, null, 'public', 'Other')
    await invite('public', other.c, otherDm, player)

    const result = await deleteAccount(player)
    expect(result).toMatchObject({
      auth_user: 'deleted',
      campaigns_deleted: [],
      campaigns_left: [s.c],
    })
    await asSystem()
    expect(
      await rows(
        'select id, user_id, is_active, archived_at is not null archived from public.characters where id = any($1) order by name',
        [[s.arin, spare]],
      ),
    ).toEqual([
      { id: s.arin, user_id: null, is_active: true, archived: false },
      { id: spare, user_id: null, is_active: false, archived: true },
    ])
    expect(
      await rows('select proposed_by from public.item_proposals where campaign_id = $1', [s.c]),
    ).toEqual([{ proposed_by: null }])
    expect(
      Number(
        await scalar(
          "select count(*) result from public.character_events where before_value->>'user_id' = $1 or after_value->>'user_id' = $1 or actor_id = $1::uuid",
          [player],
        ),
      ),
    ).toBe(0)
    expect(
      Number(
        await scalar(
          'select count(*) result from public.campaign_invitations where email = $1 or created_by = $2 or responded_by = $2',
          [emails.get(player), player],
        ),
      ),
    ).toBe(0)
    // The DM still reads the history, with the actor shown without identity.
    await asUser(dm)
    const history = await scalar<Json[]>(
      'select public.get_character_history($1,$2,null,50) result',
      [s.c, s.arin],
    )
    const renamed = history.find((h) => json(h.changes).includes('Arin Gone'))
    expect(renamed).toMatchObject({ actor: 'system', actor_name: null })
    expect(
      (await rows('select user_id from public.list_campaign_members($1)', [s.c])).map(
        (r) => r.user_id,
      ),
    ).toEqual([dm, peer])
    // The other members keep everything.
    expect(await authExists(peer)).toBe(true)
  })

  it('hands ownership to the remaining DM', async () => {
    const owner = await user('owner'),
      coDm = await user('codm'),
      player = await user('player')
    const s = await campaign(owner, player, 'public', 'Handover')
    await join('public', s.c, owner, coDm, 'dm')
    expect(await deleteAccount(owner)).toMatchObject({ campaigns_left: [s.c] })
    await asSystem()
    expect(await rows('select owner_id from public.campaigns where id = $1', [s.c])).toEqual([
      { owner_id: coDm },
    ])
    await asUser(coDm)
    expect(
      (await rows('select role from public.list_campaign_members($1)', [s.c])).map((r) => r.role),
    ).toEqual(['player', 'dm'])
  })

  it('keeps the data deletion when the Auth row cannot be removed and reports it', async () => {
    const stuck = await user('stuck')
    await asSystem()
    await db.exec('create schema if not exists retained_copy')
    await db.exec(
      'create table if not exists retained_copy.members(user_id uuid references auth.users(id))',
    )
    await db.query('insert into retained_copy.members values ($1)', [stuck])
    await asUser(stuck)
    await db.query("select public.set_my_username('Stuck_User')")
    expect(await deleteAccount(stuck)).toMatchObject({
      auth_user: 'kept',
      deleted: false,
      data_deleted: true,
    })
    expect(await authExists(stuck)).toBe(true)
    await asSystem()
    expect(
      Number(
        await scalar('select count(*) result from public.profiles where user_id = $1', [stuck]),
      ),
    ).toBe(0)
  })
})

describe('PRE mirror', () => {
  it('deletes only PRE data and never the shared Auth user', async () => {
    const dm = await user('predm'),
      player = await user('preplayer')
    const prod = await campaign(dm, player, 'public', 'Prod')
    const pre = await campaign(dm, player, 'pre', 'Pre')
    const solo = await campaign(player, null, 'pre', 'Pre solo')
    const result = await deleteAccount(player, randomUUID(), 'pre')
    expect(result).toEqual({
      deleted: true,
      data_deleted: true,
      environment: 'pre',
      auth_user: 'shared',
      campaigns_deleted: [solo.c],
      campaigns_left: [pre.c],
    })
    expect(await authExists(player)).toBe(true)
    await asSystem()
    expect(await rows('select user_id from pre.characters where id = $1', [pre.arin])).toEqual([
      { user_id: null },
    ])
    expect(await rows('select user_id from public.characters where id = $1', [prod.arin])).toEqual([
      { user_id: player },
    ])
    expect((await exportOf(player, 'pre')).environment).toBe('pre')
    expect((await exportOf(player)).characters).toHaveLength(1)
    const sources = await rows(
      "select p.prosrc src from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('pre','pre_private') and p.proname in ('export_my_data','delete_my_account','account_storage_paths','account_deletion_blockers','account_blockers','account_solo_campaigns','release_member_characters')",
    )
    expect(sources).toHaveLength(7)
    for (const { src } of sources) expect(src).not.toMatch(/\bpublic\.|\bprivate\./)
  })
})
