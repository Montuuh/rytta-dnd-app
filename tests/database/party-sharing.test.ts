import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

const migration = '20261103130000_party_live_sharing.sql'
const db = new PGlite()
const dm = randomUUID(),
  player = randomUUID(),
  peer = randomUUID(),
  hidden = randomUUID(),
  outsider = randomUUID()
const asUser = async (id: string) => {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
}
const scalar = async (sql: string, args: unknown[] = []) =>
  (await db.query<{ result: string }>(sql, args)).rows[0]!.result
const overview = async (campaign: string, schema = 'public') =>
  (
    await db.query<Record<string, unknown>>(`select * from ${schema}.get_party_overview($1)`, [
      campaign,
    ])
  ).rows
const toggle = (campaign: string, character: string, enabled: boolean, schema = 'public') =>
  db.query(`select ${schema}.set_character_live_sharing($1,$2,$3) result`, [
    campaign,
    character,
    enabled,
  ])
const liveColumns = [
  'id',
  'name',
  'is_own',
  'is_assigned',
  'shares_live',
  'sheet_status',
  'class_key',
  'class_label',
  'level',
  'current_hp',
  'max_hp',
  'temp_hp',
  'armor_class',
  'exhaustion',
  'conditions',
].sort()

async function setup(schema = 'public') {
  await asUser(dm)
  const c = await scalar(`select ${schema}.create_campaign('Party table') result`)
  const ids: Record<string, string> = {}
  for (const name of ['Arin', 'Bea', 'Cato', 'Npc'])
    ids[name] = await scalar(`select ${schema}.create_character($1, $2) result`, [c, name])
  for (const [user, email, character] of [
    [player, 'player@example.com', ids.Arin],
    [peer, 'peer@example.com', ids.Bea],
    [hidden, 'hidden@example.com', ids.Cato],
  ] as const) {
    await asUser(dm)
    const id = await scalar(`select ${schema}.invite_character_player($1,$2,$3) result`, [
      c,
      character,
      email,
    ])
    await asUser(user)
    await db.query(`select ${schema}.respond_campaign_invitation($1,true)`, [id])
  }
  return { c, ...ids } as { c: string; Arin: string; Bea: string; Cato: string; Npc: string }
}

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`)
  for (const [id, email] of [
    [dm, 'dm@example.com'],
    [player, 'player@example.com'],
    [peer, 'peer@example.com'],
    [hidden, 'hidden@example.com'],
    [outsider, 'other@example.com'],
  ])
    await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [
      id,
      email,
    ])
  const files = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files.filter((f) => f < migration))
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  // A PRE copied before RYT-031 exercises the migration's guarded PRE mirror.
  await db.exec(
    withExposureSql(
      etlCommand(['--apply']).query,
      readFileSync('supabase/maintenance/expose-pre.sql', 'utf8'),
    ),
  )
  for (const file of files.filter((f) => f >= migration))
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
}, 60000)
afterAll(() => db.close())

describe('RYT-031 party live sharing', () => {
  it('shows a Player the own character and shared teammates with live fields only', async () => {
    const { c, Arin, Bea, Cato } = await setup()
    await asUser(dm)
    await db.query('select public.set_character_resources($1,$2,0,500,7,9,2,$3)', [
      c,
      Bea,
      randomUUID(),
    ])
    await db.query(`select public.save_character_sheet($1,$2,0,3,24,15,$3,true,$4)`, [
      c,
      Bea,
      JSON.stringify({ classKey: 'bard', notes: 'secret plan' }),
      randomUUID(),
    ])
    await db.query(`select public.set_character_vitals($1,$2,1,11,3,0,0,0,false,$3,$4,'{}',$5)`, [
      c,
      Bea,
      ['poisoned'],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      randomUUID(),
    ])
    await toggle(c, Cato, false)
    await asUser(player)
    const rows = await overview(c)
    expect(rows.map((row) => row.id)).toEqual([Arin, Bea])
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(liveColumns)
    const bea = rows.find((row) => row.id === Bea)!
    expect(bea).toMatchObject({
      name: 'Bea',
      is_own: false,
      sheet_status: 'complete',
      class_key: 'bard',
      level: 3,
      current_hp: 11,
      max_hp: 24,
      temp_hp: 3,
      armor_class: 15,
      exhaustion: 2,
      conditions: ['poisoned'],
    })
    expect(JSON.stringify(rows)).not.toMatch(/gold|water|ration|secret plan|500/)
    expect(rows.find((row) => row.id === Arin)!.is_own).toBe(true)
    // Base policies stay owner-only.
    expect(
      (await db.query('select * from public.characters where campaign_id=$1', [c])).rows,
    ).toHaveLength(1)
    expect(
      (await db.query('select * from public.character_resources where character_id=$1', [Bea]))
        .rows,
    ).toHaveLength(0)
  })

  it('hides non-shared and unassigned characters from Players; the hidden owner still sees itself', async () => {
    const { c, Cato, Npc } = await setup()
    await asUser(dm)
    await toggle(c, Cato, false)
    await asUser(peer)
    const ids = (await overview(c)).map((row) => row.id)
    expect(ids).not.toContain(Cato)
    expect(ids).not.toContain(Npc)
    await asUser(hidden)
    const own = await overview(c)
    expect(own.find((row) => row.id === Cato)).toMatchObject({ is_own: true, shares_live: false })
  })

  it('gives the DM every character with its sharing flag and audits only real toggles', async () => {
    const { c, Cato, Npc } = await setup()
    await asUser(dm)
    expect((await toggle(c, Cato, false)).rows).toEqual([{ result: false }])
    await toggle(c, Cato, false)
    const rows = await overview(c)
    expect(rows).toHaveLength(4)
    expect(rows.find((row) => row.id === Cato)!.shares_live).toBe(false)
    expect(rows.find((row) => row.id === Npc)!.shares_live).toBe(true)
    const events = (
      await db.query<{
        before_value: { shares_live: boolean }
        after_value: { shares_live: boolean }
      }>(
        "select before_value, after_value from public.character_events where character_id=$1 and kind='characters:UPDATE' and (before_value->>'shares_live') is distinct from (after_value->>'shares_live')",
        [Cato],
      )
    ).rows
    expect(events).toHaveLength(1)
    expect(events[0]!.before_value.shares_live).toBe(true)
    expect(events[0]!.after_value.shares_live).toBe(false)
    await expect(toggle(c, randomUUID(), true)).rejects.toThrow(/Character unavailable/)
  })

  it('denies anon, outsider, Player toggles, cross-campaign DM, inactive Player and direct writes', async () => {
    const { c, Arin, Bea } = await setup()
    await asUser(outsider)
    const other = await scalar("select public.create_campaign('Other table') result")
    const foreign = await scalar("select public.create_character($1, 'Foreign') result", [other])
    await expect(overview(c)).rejects.toThrow(/Forbidden/)
    await expect(toggle(c, Arin, false)).rejects.toThrow(/Forbidden/)
    // Outsider is a DM elsewhere: no cross-campaign reach, and the campaign id cannot be swapped.
    await expect(toggle(other, Arin, false)).rejects.toThrow(/Character unavailable/)
    await asUser(dm)
    await expect(overview(other)).rejects.toThrow(/Forbidden/)
    await expect(toggle(c, foreign, false)).rejects.toThrow(/Character unavailable/)
    for (const actor of [player, peer]) {
      await asUser(actor)
      await expect(toggle(c, actor === player ? Arin : Bea, false)).rejects.toThrow(/Forbidden/)
      await expect(db.query('update public.characters set shares_live = false')).rejects.toThrow(
        /permission denied/,
      )
    }
    await asUser(dm)
    await expect(db.query('update public.characters set shares_live = false')).rejects.toThrow(
      /permission denied/,
    )
    await db.query('select public.change_campaign_member($1,$2,null)', [c, player])
    await asUser(player)
    await expect(overview(c)).rejects.toThrow(/Forbidden/)
    await db.exec('reset role; set role anon')
    await expect(overview(c)).rejects.toThrow(/permission denied/)
    await expect(toggle(c, Arin, false)).rejects.toThrow(/permission denied/)
    await db.exec('reset role')
  })

  it('mirrors the column and RPCs into a PRE copied before the migration', async () => {
    await db.exec('reset role')
    expect(
      (
        await db.query(
          "select column_name from information_schema.columns where table_schema='pre' and table_name='characters' and column_name='shares_live'",
        )
      ).rows,
    ).toHaveLength(1)
    const { c, Arin, Cato } = await setup('pre')
    await asUser(dm)
    await toggle(c, Cato, false, 'pre')
    await asUser(player)
    expect((await overview(c, 'pre')).map((row) => row.id)).toContain(Arin)
    expect((await overview(c, 'pre')).map((row) => row.id)).not.toContain(Cato)
    await expect(toggle(c, Arin, true, 'pre')).rejects.toThrow(/Forbidden/)
    // PRE helpers authorize only against PRE membership.
    await expect(overview(c)).rejects.toThrow(/Forbidden/)
    await db.exec('reset role; set role anon')
    await expect(overview(c, 'pre')).rejects.toThrow(/permission denied/)
    await db.exec('reset role')
    expect(
      (
        await db.query<{ src: string }>(
          "select prosrc src from pg_proc where oid='pre.get_party_overview(uuid)'::regprocedure",
        )
      ).rows[0]!.src,
    ).not.toMatch(/\bpublic\.|\bprivate\./)
  })
})
