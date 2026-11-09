import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-078: one username per account, used as the member name in every campaign.
const migration = '20261113120000_profiles_username.sql'
const db = new PGlite()
const dm = randomUUID(),
  player = randomUUID(),
  outsider = randomUUID(),
  otherDm = randomUUID()
const asUser = async (id: string) => {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
}
const asAnon = async () => {
  await db.exec('reset role; set role anon')
  await db.query("select set_config('request.jwt.claim.sub', '', false)")
}
const value = async <T>(sql: string, args: unknown[] = []) =>
  (await db.query<{ v: T }>(sql, args)).rows[0]!.v

async function table(schema: 'public' | 'pre' = 'public') {
  await asUser(dm)
  const c = await value<string>(`select ${schema}.create_campaign('Name table') v`)
  const invite = await value<string>(
    `select ${schema}.invite_campaign_member($1, 'player@example.com') v`,
    [c],
  )
  await asUser(player)
  await db.query(`select ${schema}.respond_campaign_invitation($1, true)`, [invite])
  return c
}

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`)
  for (const [id, email, name] of [
    [dm, 'dm@example.com', 'Dana DM'],
    [player, 'player@example.com', ''],
    [outsider, 'other@example.com', 'Otto'],
    [otherDm, 'otherdm@example.com', 'Olga'],
  ])
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values ($1,$2,now(),$3)',
      [id, email, JSON.stringify({ full_name: name })],
    )
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
  // A PRE copied (ETL) before this migration exercises its guarded PRE mirror.
  await db.exec(
    withExposureSql(
      etlCommand(['--apply']).query,
      readFileSync('supabase/maintenance/expose-pre.sql', 'utf8'),
    ),
  )
  for (const file of files.filter((f) => f >= migration))
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
}, 90000)
afterAll(() => db.close())

describe('RYT-078 username per account', () => {
  it('denies anonymous callers every RPC and the table', async () => {
    await asAnon()
    for (const sql of [
      'select public.get_my_username()',
      "select public.username_available('Somebody')",
      "select public.set_my_username('Somebody')",
      'select * from public.profiles',
    ])
      await expect(db.query(sql)).rejects.toThrow(/permission denied/)
  })

  it('stores one username per account, case-insensitively unique, validated and not reserved', async () => {
    await asUser(dm)
    expect(await value('select public.get_my_username() v')).toBeNull()
    expect(await value("select public.username_available('Dana_DM') v")).toBe(true)
    expect(await value("select public.set_my_username('  Dana_DM ') v")).toBe('Dana_DM')
    expect(await value('select public.get_my_username() v')).toBe('Dana_DM')
    // The owner may change only the case of their own name; it stays available to them.
    expect(await value("select public.username_available('dana_dm') v")).toBe(true)
    expect(await value("select public.set_my_username('dana_dm') v")).toBe('dana_dm')

    await asUser(outsider)
    expect(await value("select public.username_available('DANA_DM') v")).toBe(false)
    await expect(db.query("select public.set_my_username('DANA_DM')")).rejects.toThrow(
      /Username taken/,
    )
    for (const bad of ['ab', 'a'.repeat(25), 'with space', 'tilde_ñ', 'semi;colon'])
      await expect(db.query('select public.set_my_username($1)', [bad])).rejects.toThrow(
        /Invalid username/,
      )
    expect(await value("select public.username_available('ab') v")).toBe(false)
    await expect(db.query("select public.set_my_username('Admin')")).rejects.toThrow(
      /Username reserved/,
    )
    expect(await value("select public.username_available('DM') v")).toBe(false)
    expect(await value('select public.get_my_username() v')).toBeNull()
  })

  it('never lets a signed-in user read or write profile rows directly', async () => {
    await asUser(outsider)
    for (const sql of [
      'select * from public.profiles',
      `insert into public.profiles(user_id, username) values ('${outsider}', 'Sneaky')`,
      "update public.profiles set username = 'Hijack'",
      'delete from public.profiles',
    ])
      await expect(db.query(sql)).rejects.toThrow(/permission denied/)
  })

  it('shows the username to the campaign DM only; Players, outsiders and other DMs are refused', async () => {
    const c = await table()
    await asUser(player)
    await db.query("select public.set_my_username('Pia_the_Bold')")
    await asUser(dm)
    const members = (
      await db.query<{ user_id: string; display_name: string }>(
        'select user_id, display_name from public.list_campaign_members($1)',
        [c],
      )
    ).rows
    expect(Object.fromEntries(members.map((m) => [m.user_id, m.display_name]))).toEqual({
      [dm]: 'dana_dm',
      [player]: 'Pia_the_Bold',
    })
    await asUser(otherDm)
    await db.query("select public.create_campaign('Elsewhere')")
    for (const actor of [player, outsider, otherDm]) {
      await asUser(actor)
      await expect(db.query('select * from public.list_campaign_members($1)', [c])).rejects.toThrow(
        /Forbidden/,
      )
    }
  })

  it('falls back to the Google name, then the email, and names the actor in the sheet history', async () => {
    await asUser(otherDm)
    const c = await value<string>("select public.create_campaign('Fallback') v")
    const character = await value<string>("select public.create_character($1, 'Arin') v", [c])
    const history = async () =>
      value<{ actor_name: string }[]>('select public.get_character_history($1,$2,null,null) v', [
        c,
        character,
      ])
    expect((await history())[0]!.actor_name).toBe('Olga')
    await db.query("select public.set_my_username('Olga_Rules')")
    expect((await history())[0]!.actor_name).toBe('Olga_Rules')
    const members = await db.query<{ display_name: string }>(
      'select display_name from public.list_campaign_members($1)',
      [c],
    )
    expect(members.rows[0]!.display_name).toBe('Olga_Rules')
  })

  it('mirrors into PRE with its own profiles, never PROD rows', async () => {
    await asUser(outsider)
    expect(await value('select pre.get_my_username() v')).toBeNull()
    expect(await value("select pre.set_my_username('Otto_Pre') v")).toBe('Otto_Pre')
    expect(await value('select public.get_my_username() v')).toBeNull()
    // PROD's dana_dm does not exist in PRE, so the same name is free there.
    expect(await value("select pre.username_available('dana_dm') v")).toBe(true)
    const c = await table('pre')
    await asUser(dm)
    const names = (
      await db.query<{ display_name: string }>(
        'select display_name from pre.list_campaign_members($1)',
        [c],
      )
    ).rows.map((r) => r.display_name)
    expect(names).toEqual(['Dana DM', 'player@example.com'])
    await asAnon()
    await expect(db.query("select pre.set_my_username('Nobody')")).rejects.toThrow(
      /permission denied/,
    )
  })
})
