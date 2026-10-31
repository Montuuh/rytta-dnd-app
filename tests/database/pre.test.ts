import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'
const db = new PGlite()
const dm = randomUUID(),
  player = randomUUID(),
  outsider = randomUUID()
let campaign: string, character: string, backupId: string
const asUser = async (id: string) => {
  await db.exec('reset role;set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id])
}
const scalar = async (sql: string, args: unknown[] = []) =>
  (await db.query<{ id: string }>(sql, args)).rows[0]!.id
beforeAll(async () => {
  await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`)
  for (const [id, email] of [
    [dm, 'dm@example.com'],
    [player, 'player@example.com'],
    [outsider, 'other@example.com'],
  ])
    await db.query('insert into auth.users(id,email,email_confirmed_at) values($1,$2,now())', [
      id,
      email,
    ])
  for (const file of readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  await asUser(dm)
  campaign = await scalar("select public.create_campaign('Source campaign') id")
  character = await scalar("select public.create_character($1,'Arin') id", [campaign])
  await db.exec('reset role')
  await db.query(
    "insert into public.campaign_members(campaign_id,user_id,role) values($1,$2,'player')",
    [campaign, player],
  )
  await asUser(dm)
  await db.query('select public.assign_character($1,$2,$3)', [campaign, character, player])
  await db.exec('reset role')
}, 30000)
afterAll(() => db.close())
describe('public to pre bulk refresh', () => {
  it('requires a stable transaction and dry-run writes nothing', async () => {
    await expect(db.query('select pre_admin.refresh()')).rejects.toThrow(/REPEATABLE READ/)
    await db.exec('begin isolation level repeatable read read only')
    const report = await db.query<{ result: { dryRun: boolean; tables: unknown[] } }>(
      'select pre_admin.refresh() result',
    )
    expect(report.rows[0]!.result.dryRun).toBe(true)
    expect(report.rows[0]!.result.tables).toHaveLength(15)
    expect((await db.query("select to_regnamespace('pre') ns")).rows).toEqual([{ ns: null }])
    await db.exec('commit')
  })
  it('clones data, foreign keys, audit triggers, grants and RLS; writes stay in PRE', async () => {
    await db.exec(
      withExposureSql(
        etlCommand(['--apply']).query,
        readFileSync('supabase/maintenance/expose-pre.sql', 'utf8'),
      ),
    )
    expect((await db.query('select * from pre.characters')).rows).toEqual(
      (await db.query('select * from public.characters')).rows,
    )
    expect((await db.query('select * from pre.character_events order by id')).rows).toEqual(
      (await db.query('select * from public.character_events order by id')).rows,
    )
    const baseline = await db.query('select * from public.character_resources')
    await asUser(dm)
    await db.query('select pre.set_character_resources($1,$2,0,99,3,4,1,$3)', [
      campaign,
      character,
      randomUUID(),
    ])
    expect((await db.query('select gold from pre.character_resources')).rows).toEqual([
      { gold: 99 },
    ])
    expect((await db.query('select * from public.character_resources')).rows).toEqual(baseline.rows)
    expect((await db.query('select * from pre.character_events')).rows).toHaveLength(4)
    expect((await db.query('select * from public.character_events')).rows).toHaveLength(3)
    await expect(db.query('update pre.character_resources set gold=123')).rejects.toThrow(
      /permission denied/,
    )
    await asUser(player)
    expect((await db.query('select * from pre.characters')).rows).toHaveLength(1)
    await expect(db.query("select pre.create_character($1,'Bad')", [campaign])).rejects.toThrow(
      /Forbidden/,
    )
    await expect(db.query('select pre_admin.refresh()')).rejects.toThrow(/permission denied/)
    await expect(db.query('select * from pre.character_events')).resolves.toHaveProperty('rows', [])
    await asUser(outsider)
    expect((await db.query('select * from pre.characters')).rows).toHaveLength(0)
    await db.exec('reset role;set role anon')
    await expect(db.query('select * from pre.characters')).rejects.toThrow(/permission denied/)
    await expect(db.query('select pre_admin.snapshot()')).rejects.toThrow(/permission denied/)
    await db.exec('reset role;set role service_role')
    await expect(db.query('select pre_admin.refresh()')).rejects.toThrow(/permission denied/)
    await db.exec('reset role')
  })
  it('refuses unsupported source views before creating a partial copy', async () => {
    await db.exec('create view public.unsupported_view as select id from public.characters')
    await db.exec('begin isolation level repeatable read')
    await expect(db.query('select pre_admin.refresh(true,false)')).rejects.toThrow(/Unsupported/)
    await db.exec('rollback')
    expect((await db.query('select gold from pre.character_resources')).rows).toEqual([
      { gold: 99 },
    ])
    await db.exec('drop view public.unsupported_view')
  })
  it('requires explicit replacement, captures previous PRE and safely refreshes', async () => {
    await db.exec('begin isolation level repeatable read')
    await expect(db.query('select pre_admin.refresh(false,false)')).rejects.toThrow(/PRE exists/)
    await db.exec('rollback')
    const snapshot = (
      await db.query<{ data: Record<string, unknown> }>('select pre_admin.snapshot() data')
    ).rows[0]!.data
    expect(snapshot['pre.character_resources']).toEqual(
      expect.arrayContaining([expect.objectContaining({ gold: 99 })]),
    )
    await db.exec('begin isolation level repeatable read')
    const result = await db.query<{ result: { backupId: string } }>(
      'select pre_admin.refresh(true,false) result',
    )
    backupId = result.rows[0]!.result.backupId
    await db.exec('commit')
    expect((await db.query('select * from pre.character_resources')).rows).toEqual(
      (await db.query('select * from public.character_resources')).rows,
    )
  })
  it('refuses external dependencies and rolls back replacement without affecting PROD', async () => {
    await db.exec(
      'create schema outside;create view outside.reference as select * from pre.characters',
    )
    await db.exec('begin isolation level repeatable read')
    await expect(db.query('select pre_admin.refresh(true,false)')).rejects.toThrow(/depend/)
    await db.exec('rollback')
    expect((await db.query('select * from outside.reference')).rows).toHaveLength(1)
    expect((await db.query('select * from public.characters')).rows).toHaveLength(1)
    await expect(db.query('select pre_admin.restore($1)', [backupId])).rejects.toThrow(
      /dependencies/,
    )
    await db.exec('drop view outside.reference')
  })
  it('restores a registered full PRE backup and preserves the current one', async () => {
    const restored = await db.query<{ result: { backupId: string } }>(
      'select pre_admin.restore($1) result',
      [backupId],
    )
    expect(restored.rows[0]!.result.backupId).toBeTruthy()
    expect((await db.query('select gold from pre.character_resources')).rows).toEqual([
      { gold: 99 },
    ])
    expect((await db.query('select gold from public.character_resources')).rows).toEqual([
      { gold: 0 },
    ])
    await expect(db.query('select pre_admin.restore($1)', [backupId])).rejects.toThrow(
      /unavailable/,
    )
    await asUser(dm)
    await db.query("select pre.create_character($1,'After restore')", [campaign])
    expect((await db.query('select * from public.characters')).rows).toHaveLength(1)
    await db.exec('reset role')
  })
  it('does not use PROD membership to authorize PRE operations', async () => {
    await asUser(dm)
    const prodOnly = await scalar("select public.create_campaign('Only PROD') id")
    await expect(db.query("select pre.create_character($1,'Bad')", [prodOnly])).rejects.toThrow(
      /Forbidden/,
    )
    await asUser(outsider)
    await db.query("select pre.create_campaign('Other campaign')")
    await expect(
      db.query("select pre.create_character($1,'Cross-campaign')", [campaign]),
    ).rejects.toThrow(/Forbidden/)
    await asUser(dm)
    await db.query('select pre.change_campaign_member($1,$2,null)', [campaign, player])
    await asUser(player)
    expect((await db.query('select * from pre.characters')).rows).toHaveLength(0)
    expect((await db.query('select * from public.characters')).rows).toHaveLength(1)
    await db.exec('reset role')
  })
})
