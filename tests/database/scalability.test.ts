import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-114: foreign key indexes, set-based read policies with identical visibility, and retention.
const migration = '20261123120000_scalability_indexes_policies_retention.sql'
const db = new PGlite()
const dm = randomUUID(),
  player = randomUUID(),
  peer = randomUUID(),
  inactive = randomUUID(),
  invitee = randomUUID(),
  outsider = randomUUID(),
  otherDm = randomUUID(),
  otherPlayer = randomUUID(),
  otherPeer = randomUUID()
const users = { dm, player, peer, inactive, invitee, outsider, otherDm, otherPlayer, otherPeer }
const emails: Record<string, string> = Object.fromEntries(
  Object.entries(users).map(([name, id]) => [id, `${name.toLowerCase()}@example.com`]),
)
const readTables = [
  'campaigns',
  'campaign_members',
  'characters',
  'campaign_invitations',
  'character_sheets',
  'character_vitals',
  'character_resources',
  'character_events',
  'item_definitions',
  'inventory_items',
  'inventory_events',
  'trades',
  'trade_offer_items',
  'glossary_entries',
  'encounters',
  'encounter_signals',
  'encounter_combatants',
  'encounter_effects',
  'encounter_events',
  'combatant_templates',
  'campaign_creature_images',
  'campaign_srd_bestiary',
  'campaign_srd_removed',
  'rest_requests',
  'tabletop_scenes',
  'tabletop_items',
  'tabletop_cards',
  'tabletop_tracks',
  'tabletop_live',
]
const requestTables = [
  'resource_requests',
  'sheet_requests',
  'inventory_requests',
  'combat_requests',
  'tabletop_requests',
  'character_requests',
  'content_requests',
]
const perRowHelpers = /is_campaign_member|is_campaign_dm|can_play_character|can_use_glossary/

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

type Ids = Record<string, string>
const A: Ids = {}
const B: Ids = {}

/** Two campaigns with every table of the rewritten policies populated, inserted as the owner. */
async function seed() {
  for (const key of [
    'c',
    'arin',
    'bryn',
    'spare',
    'pool',
    'dCarried',
    'dAuthored',
    'dPeer',
    'dHidden',
    'iArin',
    'iBryn',
    'trade',
    'draft',
    'live',
    'npc',
    'scene',
    'track',
    'card',
    'rest',
  ]) {
    A[key] = randomUUID()
    B[key] = randomUUID()
  }
  const sql = (s: string, args: unknown[] = []) => db.query(s, args)
  for (const [dmId, players, X, modules] of [
    [dm, [player, peer, inactive], A, ['party', 'glossary']],
    [otherDm, [otherPlayer, otherPeer], B, ['party']],
  ] as const) {
    await sql(
      'insert into public.campaigns(id, owner_id, name, player_modules) values ($1,$2,$3,$4)',
      [X.c, dmId, 'Campaign', modules],
    )
    await sql(
      "insert into public.campaign_members(campaign_id, user_id, role) values ($1,$2,'dm') on conflict do nothing",
      [X.c, dmId],
    )
    for (const p of players)
      await sql(
        "insert into public.campaign_members(campaign_id, user_id, role, active) values ($1,$2,'player',$3)",
        [X.c, p, p !== inactive],
      )
    const [mainPlayer, second, third] = players
    await sql(
      'insert into public.characters(id, campaign_id, user_id, name) values ($1,$2,$3,$4)',
      [X.arin, X.c, mainPlayer, 'Arin'],
    )
    await sql(
      'insert into public.characters(id, campaign_id, user_id, name) values ($1,$2,$3,$4)',
      [X.bryn, X.c, second, 'Bryn'],
    )
    await sql(
      // The inactive member's only character, or a benched second character of the main Player.
      'insert into public.characters(id, campaign_id, user_id, name, is_active) values ($1,$2,$3,$4,$5)',
      [X.spare, X.c, third ?? mainPlayer, 'Spare', Boolean(third)],
    )
    await sql(
      'insert into public.characters(id, campaign_id, user_id, name) values ($1,$2,null,$3)',
      [X.pool, X.c, 'Pool'],
    )
    for (const id of [X.arin, X.bryn, X.spare, X.pool]) {
      await sql(
        'insert into public.character_sheets(character_id, campaign_id) values ($1,$2) on conflict do nothing',
        [id, X.c],
      )
      await sql(
        'insert into public.character_vitals(character_id, campaign_id) values ($1,$2) on conflict do nothing',
        [id, X.c],
      )
      await sql(
        'insert into public.character_resources(character_id, campaign_id) values ($1,$2) on conflict do nothing',
        [id, X.c],
      )
    }
    const def = (id: string, name: string, origin: string, by: string) =>
      sql(
        "insert into public.item_definitions(id, campaign_id, name, category, origin, created_by) values ($1,$2,$3,'gear',$4,$5)",
        [id, X.c, name, origin, by],
      )
    await def(X.dCarried!, 'Rope', 'dm', dmId)
    await def(X.dAuthored!, 'Charm', 'player', mainPlayer!)
    await def(X.dPeer!, 'Lantern', 'dm', dmId)
    await def(X.dHidden!, 'Relic', 'dm', dmId)
    const item = (id: string, character: string, definition: string) =>
      sql(
        "insert into public.inventory_items(id, campaign_id, character_id, definition_id, quantity, source) values ($1,$2,$3,$4,2,'dm')",
        [id, X.c, character, definition],
      )
    await item(X.iArin!, X.arin!, X.dCarried!)
    await item(X.iBryn!, X.bryn!, X.dPeer!)
    for (const [character, itemId] of [
      [X.arin, X.iArin],
      [X.bryn, X.iBryn],
    ])
      await sql(
        "insert into public.inventory_events(campaign_id, character_id, item_id, kind, after_value, request_id) values ($1,$2,$3,'grant','{}',$4)",
        [X.c, character, itemId, randomUUID()],
      )
    await sql(
      "insert into public.trades(id, campaign_id, initiator_character, partner_character, expires_at) values ($1,$2,$3,$4, now() + interval '1 day')",
      [X.trade, X.c, X.arin, X.bryn],
    )
    await sql(
      "insert into public.trade_offer_items(trade_id, campaign_id, side, item_id, quantity) values ($1,$2,'partner',$3,1)",
      [X.trade, X.c, X.iBryn],
    )
    await sql(
      "insert into public.glossary_entries(id, campaign_id, category, name) values ($1,$2,'rule',$3)",
      [randomUUID(), X.c, 'House rule'],
    )
    await sql("insert into public.encounters(id, campaign_id, name) values ($1,$2,'Draft')", [
      X.draft,
      X.c,
    ])
    await sql(
      "insert into public.encounters(id, campaign_id, name, status) values ($1,$2,'Live','active')",
      [X.live, X.c],
    )
    await sql(
      "insert into public.encounter_combatants(id, campaign_id, encounter_id, kind, name, max_hp, current_hp) values ($1,$2,$3,'npc','Wolf',9,9)",
      [X.npc, X.c, X.live],
    )
    await sql(
      "insert into public.encounter_effects(campaign_id, encounter_id, target_combatant, label) values ($1,$2,$3,'Bless')",
      [X.c, X.live, X.npc],
    )
    await sql(
      "insert into public.encounter_events(campaign_id, encounter_id, kind) values ($1,$2,'status')",
      [X.c, X.live],
    )
    await sql(
      "insert into public.combatant_templates(campaign_id, name, max_hp) values ($1,'Ogre',30)",
      [X.c],
    )
    await sql(
      "insert into public.campaign_creature_images(campaign_id, srd_id, image_path) values ($1,'wolf','x')",
      [X.c],
    )
    await sql('insert into public.campaign_srd_bestiary(campaign_id) values ($1)', [X.c])
    await sql("insert into public.campaign_srd_removed(campaign_id, srd_id) values ($1,'ogre')", [
      X.c,
    ])
    await sql(
      "insert into public.rest_requests(id, campaign_id, kind, requested_by, expires_at) values ($1,$2,'short',$3, now() + interval '1 hour')",
      [X.rest, X.c, mainPlayer],
    )
    await sql("insert into public.tabletop_scenes(id, campaign_id, name) values ($1,$2,'Hall')", [
      X.scene,
      X.c,
    ])
    await sql(
      "insert into public.tabletop_items(campaign_id, scene_id, kind, x, y) values ($1,$2,'prop',1,1)",
      [X.c, X.scene],
    )
    await sql("insert into public.tabletop_cards(id, campaign_id, title) values ($1,$2,'Note')", [
      X.card,
      X.c,
    ])
    await sql(
      "insert into public.tabletop_tracks(id, campaign_id, title, path, mime, size_bytes) values ($1,$2,'Song',$3,'audio/ogg',10)",
      [X.track, X.c, `public/${X.c}/audio/${X.track}.ogg`],
    )
    await sql('insert into public.tabletop_live(campaign_id, scene_id) values ($1,$2)', [
      X.c,
      X.scene,
    ])
  }
  // Pending (visible to the invitee), expired and foreign invitations.
  await sql(
    'insert into public.campaign_invitations(campaign_id, email, created_by) values ($1,$2,$3)',
    [A.c, emails[invitee], dm],
  )
  await sql(
    "insert into public.campaign_invitations(campaign_id, email, created_by, created_at, expires_at) values ($1,$2,$3, now() - interval '9 days', now() - interval '1 day')",
    [B.c, emails[invitee], otherDm],
  )
  await sql(
    'insert into public.campaign_invitations(campaign_id, email, created_by) values ($1,$2,$3)',
    [B.c, emails[outsider], otherDm],
  )
}

type Snapshot = Record<string, string>
/** Every row each actor can read on every rewritten table, in both environments. */
async function visibility(): Promise<Snapshot> {
  const result: Snapshot = {}
  for (const schema of ['public', 'pre']) {
    for (const [name, id] of Object.entries(users)) {
      await asUser(id)
      // Rows are compared without columns added by later migrations (20261130120000).
      for (const table of readTables)
        result[`${schema}.${table}:${name}`] = await scalar(
          `select coalesce(string_agg(r, '|' order by r), '') result from (select
            (to_jsonb(t) - array['party_level', 'dice_mode', 'roll_visibility'])::text r
            from ${schema}.${table} t) x`,
        )
    }
    await asAnon()
    for (const table of readTables)
      result[`${schema}.${table}:anon`] = await db.query(`select 1 from ${schema}.${table}`).then(
        () => 'allowed',
        (error: Error) => error.message,
      )
  }
  await asSystem()
  return result
}

const playerPlan = async (schema: string) => {
  await asUser(player)
  const plan = (
    await db.query<{ 'QUERY PLAN': string }>(`explain select * from ${schema}.item_definitions`)
  ).rows
    .map((row) => row['QUERY PLAN'])
    .join('\n')
  await asSystem()
  return plan
}

let before: Snapshot
let after: Snapshot
let planBefore: string

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
    create publication supabase_realtime;`)
  for (const [id, email] of Object.entries(emails))
    await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [
      id,
      email,
    ])
  await db.exec(`create schema storage;
    create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated, anon;
    grant select, insert, delete on storage.objects to authenticated;`)
  const files = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files.filter((f) => f < migration))
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  await seed()
  // A PRE copied before this migration (with the seed) exercises the guarded PRE mirror.
  await db.exec(
    withExposureSql(
      etlCommand(['--apply']).query,
      readFileSync('supabase/maintenance/expose-pre.sql', 'utf8'),
    ),
  )
  before = await visibility()
  planBefore = await playerPlan('public')
  for (const file of files.filter((f) => f >= migration))
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  after = await visibility()
}, 120000)
afterAll(() => db.close())

describe('RYT-114 foreign key indexes', () => {
  it('leaves no foreign key without an index on exactly its columns, in either environment', async () => {
    const missing = await db.query<{ fk: string }>(`
      select c.conrelid::regclass || ' ' || c.conname fk from pg_constraint c
        join pg_class r on r.oid = c.conrelid join pg_namespace n on n.oid = r.relnamespace
       where c.contype = 'f' and n.nspname in ('public', 'private', 'pre', 'pre_private')
         and not exists (select 1 from pg_index i where i.indrelid = c.conrelid and i.indpred is null
           and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] @> c.conkey
           and (i.indkey::int2[])[0:array_length(c.conkey, 1) - 1] <@ c.conkey)`)
    expect(missing.rows).toEqual([])
    expect(
      await scalar<string>(
        "select indexdef result from pg_indexes where schemaname = 'public' and indexname = 'inventory_items_definition_id_fk'",
      ),
    ).toMatch(/\(campaign_id, definition_id\)/)
  })
})

describe('RYT-114 read policies', () => {
  it('returns exactly the same rows for anon, outsider, invitee, inactive member, Players and both DMs', () => {
    expect(Object.keys(after)).toHaveLength(Object.keys(before).length)
    for (const key of Object.keys(before))
      expect({ key, rows: after[key] }).toEqual({ key, rows: before[key] })
    // The fixture is not trivially empty: each role sees what it should and nothing else.
    for (const schema of ['public', 'pre']) {
      expect(after[`${schema}.item_definitions:player`]).toContain('Rope')
      expect(after[`${schema}.item_definitions:player`]).toContain('Charm')
      expect(after[`${schema}.item_definitions:player`]).not.toMatch(/Lantern|Relic/)
      expect(after[`${schema}.item_definitions:dm`]).toMatch(/Relic/)
      for (const actor of ['outsider', 'otherPlayer', 'inactive'])
        expect(after[`${schema}.item_definitions:${actor}`]).not.toContain(A.dAuthored)
      expect(after[`${schema}.trades:peer`]).not.toBe('')
      expect(after[`${schema}.trade_offer_items:player`]).not.toBe('')
      expect(after[`${schema}.trade_offer_items:outsider`]).toBe('')
      expect(after[`${schema}.glossary_entries:player`]).not.toBe('')
      expect(after[`${schema}.glossary_entries:otherPlayer`]).toBe('')
      expect(after[`${schema}.glossary_entries:otherDm`]).not.toBe('')
      expect(after[`${schema}.encounter_signals:player`].split('|')).toHaveLength(1)
      expect(after[`${schema}.encounters:player`]).toBe('')
      expect(after[`${schema}.campaign_invitations:invitee`].split('|')).toHaveLength(1)
      // The outsider only sees the pending invitation addressed to them, never campaign A.
      expect(after[`${schema}.campaign_invitations:outsider`]).toContain(B.c)
      expect(after[`${schema}.campaign_invitations:outsider`].split('|')).toHaveLength(1)
      expect(after[`${schema}.inventory_items:otherDm`]).not.toBe('')
      for (const table of readTables) {
        expect(after[`${schema}.${table}:anon`]).toMatch(/permission denied/)
        if (table !== 'campaign_invitations')
          expect(after[`${schema}.${table}:outsider`], table).toBe('')
        for (const actor of ['outsider', 'otherDm', 'otherPlayer', 'inactive'])
          expect(after[`${schema}.${table}:${actor}`], `${table}:${actor}`).not.toContain(A.c)
      }
    }
  })

  it('runs no membership helper per row: read policies compare against sets computed once', async () => {
    const policies = await db.query<{ name: string; qual: string }>(
      `select schemaname || '.' || tablename || '.' || policyname name, qual from pg_policies
        where schemaname in ('public', 'pre') and cmd = 'SELECT' and qual is not null`,
    )
    expect(policies.rows.length).toBeGreaterThanOrEqual(2 * readTables.length - 2)
    for (const { name, qual } of policies.rows)
      expect({ name, qual }).not.toMatchObject({ qual: expect.stringMatching(perRowHelpers) })
    expect(planBefore).toMatch(/is_campaign_dm/)
    for (const schema of ['public', 'pre']) {
      const plan = await playerPlan(schema)
      expect(plan).not.toMatch(perRowHelpers)
      expect(plan).toMatch(/SubPlan|InitPlan/)
    }
  })

  it('keeps the set helpers away from anon and grants them to authenticated only', async () => {
    for (const helper of ['private', 'pre_private'])
      for (const fn of [
        'my_campaign_ids()',
        'my_dm_campaign_ids()',
        'my_character_keys()',
        'my_carried_definitions()',
        "my_module_campaign_ids('glossary')",
      ]) {
        await asAnon()
        await expect(db.query(`select * from ${helper}.${fn}`)).rejects.toThrow(/permission denied/)
        await asUser(outsider)
        expect((await db.query(`select * from ${helper}.${fn}`)).rows).toEqual([])
      }
    await asUser(player)
    expect(
      (await db.query<{ c: string }>('select c from private.my_dm_campaign_ids() c')).rows,
    ).toEqual([])
    expect(
      (
        await db.query<{ character_id: string }>(
          'select character_id from private.my_character_keys()',
        )
      ).rows.map((row) => row.character_id),
    ).toEqual([A.arin])
    await asUser(inactive)
    expect((await db.query('select * from private.my_campaign_ids()')).rows).toEqual([])
    await asSystem()
  })
})

describe('RYT-114 retention', () => {
  async function requestRows(helper: string, age: string) {
    const ids: Record<string, string> = {}
    for (const table of requestTables) {
      const id = randomUUID()
      ids[table] = id
      const cols: Record<string, string> = {
        resource_requests: `(request_id, actor_id, character_id, payload, result_revision, created_at) values ($1, '${dm}', '${A.arin}', '[]', 1, now() - interval '${age}')`,
        sheet_requests: `(request_id, actor_id, character_id, payload, result_revision, created_at) values ($1, '${dm}', '${A.arin}', '[]', 1, now() - interval '${age}')`,
        inventory_requests: `(request_id, actor_id, payload, result, created_at) values ($1, '${dm}', '[]', '{}', now() - interval '${age}')`,
        combat_requests: `(request_id, actor_id, payload, result, created_at) values ($1, '${dm}', '[]', '{}', now() - interval '${age}')`,
        tabletop_requests: `(request_id, actor_id, payload, result, created_at) values ($1, '${dm}', '[]', '{}', now() - interval '${age}')`,
        character_requests: `(request_id, actor_id, payload, character_id, created_at) values ($1, '${dm}', '[]', '${A.arin}', now() - interval '${age}')`,
        content_requests: `(request_id, actor_id, payload, result, created_at) values ($1, '${dm}', '[]', '{}', now() - interval '${age}')`,
      }
      await db.query(`insert into ${helper}.${table} ${cols[table]}`, [id])
    }
    return ids
  }
  const present = async (helper: string, ids: Record<string, string>) => {
    const found: string[] = []
    for (const [table, id] of Object.entries(ids))
      if (
        (await db.query(`select 1 from ${helper}.${table} where request_id = $1`, [id])).rows.length
      )
        found.push(table)
    return found
  }

  it('adds created_at to every idempotency table, stamping existing rows with the apply time', async () => {
    await asSystem()
    for (const helper of ['private', 'pre_private'])
      for (const table of requestTables)
        expect(
          await scalar<string>(
            `select is_nullable || ':' || column_default result from information_schema.columns
              where table_schema = $1 and table_name = $2 and column_name = 'created_at'`,
            [helper, table],
          ),
        ).toBe('NO:now()')
  })

  it('deletes only idempotency rows older than 30 days, per environment', async () => {
    await asSystem()
    const old = await requestRows('private', '31 days')
    const recent = await requestRows('private', '29 days')
    const preOld = await requestRows('pre_private', '31 days')
    const counts = await scalar<Record<string, number>>('select private.prune_stale_rows() result')
    for (const table of requestTables) expect(counts[table]).toBeGreaterThanOrEqual(1)
    expect(await present('private', old)).toEqual([])
    expect(await present('private', recent)).toEqual(requestTables)
    // The production job leaves PRE alone; PRE has its own copy.
    expect(await present('pre_private', preOld)).toEqual(requestTables)
    await scalar('select pre_private.prune_stale_rows() result')
    expect(await present('pre_private', preOld)).toEqual([])
    expect(await present('private', recent)).toEqual(requestTables)
  })

  it('still replays a retried request inside the window after pruning', async () => {
    await asUser(dm)
    const request = randomUUID()
    const first = await scalar<Record<string, string>>(
      'select public.create_encounter($1, $2, $3) result',
      [A.c, 'Retry', request],
    )
    await asSystem()
    await scalar('select private.prune_stale_rows() result')
    await asUser(dm)
    const again = await scalar<Record<string, string>>(
      'select public.create_encounter($1, $2, $3) result',
      [A.c, 'Retry', request],
    )
    expect(again.encounter_id).toBe(first.encounter_id)
    await asSystem()
    expect(
      await scalar<number>(
        "select count(*)::int result from public.encounters where campaign_id = $1 and name = 'Retry'",
        [A.c],
      ),
    ).toBe(1)
  })

  it('trims only ended encounters older than 30 days to the events combat state can show', async () => {
    await asSystem()
    const make = async (status: string, endedAgo: string | null) => {
      const id = randomUUID()
      await db.query(
        `insert into public.encounters(id, campaign_id, name, status, ended_at) values ($1, $2, 'Old', $3, ${
          endedAgo ? `now() - interval '${endedAgo}'` : 'null'
        })`,
        [id, B.c, status],
      )
      // 150 events, every third one hidden from Players, with undo snapshots.
      await db.query(
        `insert into public.encounter_events(campaign_id, encounter_id, kind, visible, before_state, after_state, created_at)
         select $1, $2, 'damage', g % 3 <> 0, '{"hp": 9}', '{"hp": 4}', now() - interval '40 days' + g * interval '1 minute'
           from generate_series(1, 150) g`,
        [B.c, id],
      )
      return id
    }
    const stale = await make('ended', '31 days')
    const fresh = await make('ended', '2 days')
    const draft = await make('draft', null)
    const expected = await db.query<{ id: string }>(
      `select id from (select id, row_number() over (order by created_at desc, id desc) a,
          row_number() over (partition by visible order by created_at desc, id desc) v, visible
        from public.encounter_events where encounter_id = $1) k
       where a <= 60 or (visible and v <= 60) order by id`,
      [stale],
    )
    const counts = await scalar<Record<string, number>>('select private.prune_stale_rows() result')
    expect(counts.encounter_events_deleted).toBe(150 - expected.rows.length)
    const kept = await db.query<{ id: string }>(
      'select id from public.encounter_events where encounter_id = $1 order by id',
      [stale],
    )
    expect(kept.rows).toEqual(expected.rows)
    // The DM's 60 newest and the Players' 60 newest visible events survive.
    expect(
      await scalar<number>(
        'select count(*)::int result from public.encounter_events where encounter_id = $1 and visible',
        [stale],
      ),
    ).toBe(60)
    expect(
      await scalar<number>(
        'select count(*)::int result from public.encounter_events where encounter_id = $1 and (before_state is not null or after_state is not null)',
        [stale],
      ),
    ).toBe(0)
    for (const id of [fresh, draft])
      expect(
        await scalar<number>(
          'select count(*)::int result from public.encounter_events where encounter_id = $1 and before_state is not null',
          [id],
        ),
      ).toBe(150)
    // Live encounters keep everything an undo needs.
    expect(
      await scalar<number>(
        'select count(*)::int result from public.encounter_events where encounter_id = $1',
        [A.live],
      ),
    ).toBe(1)
  })

  it('is not executable by anon, authenticated users or the service role', async () => {
    for (const helper of ['private', 'pre_private']) {
      await asAnon()
      await expect(db.query(`select ${helper}.prune_stale_rows()`)).rejects.toThrow(
        /permission denied/,
      )
      for (const id of [dm, player, outsider]) {
        await asUser(id)
        await expect(db.query(`select ${helper}.prune_stale_rows()`)).rejects.toThrow(
          /permission denied/,
        )
      }
      await db.exec('reset role; set role service_role')
      await expect(db.query(`select ${helper}.prune_stale_rows()`)).rejects.toThrow(
        /permission denied/,
      )
    }
    await asSystem()
    const acl = await db.query<{ grantee: string }>(
      `select coalesce(r.rolname, 'PUBLIC') grantee from pg_proc p
         cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
         left join pg_roles r on r.oid = a.grantee
        where p.proname = 'prune_stale_rows' and a.grantee <> p.proowner`,
    )
    expect(acl.rows).toEqual([])
  })

  it('schedules nothing without pg_cron and leaves the function for an owner-run schedule', async () => {
    await asSystem()
    expect(
      await scalar<boolean>(
        "select exists (select 1 from pg_extension where extname = 'pg_cron') result",
      ),
    ).toBe(false)
    expect(await scalar<string | null>("select to_regnamespace('cron')::text result")).toBeNull()
    expect(
      await scalar<string>(
        "select prosecdef::text || ':' || array_to_string(proconfig, ',') result from pg_proc where oid = 'private.prune_stale_rows()'::regprocedure",
      ),
    ).toBe('true:search_path=""')
  })
})
