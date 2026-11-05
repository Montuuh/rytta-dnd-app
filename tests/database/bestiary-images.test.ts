import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-053: the DM's own image for an SRD creature, per campaign, in the private creature bucket.
const migration = '20261110120000_bestiary_images.sql'
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
type Json = Record<string, unknown>
const one = async <T = Json>(sql: string, args: unknown[] = []) =>
  (await db.query<T>(sql, args)).rows[0]!
const res = async (sql: string, args: unknown[] = []) =>
  (await one<{ result: Json }>(sql, args)).result

function api(schema = 'public') {
  return {
    set: (c: string, srd: string | null, path: string | null, key = randomUUID()) =>
      res(`select ${schema}.set_creature_srd_image($1,$2,$3,$4) result`, [c, srd, path, key]),
    list: async (c: string) =>
      (await res(`select ${schema}.list_creature_srd_images($1) result`, [c])) as unknown as {
        srd_id: string
        image_path: string
      }[],
  }
}
const pub = api()

const upload = (path: string) =>
  db.query("insert into storage.objects(bucket_id, name) values ('creature-images', $1)", [path])
const readable = async (path: string) =>
  (
    await db.query(
      "select name from storage.objects where bucket_id = 'creature-images' and name = $1",
      [path],
    )
  ).rows.length === 1

async function setup(schema = 'public') {
  await asUser(dm)
  const c = (await one<{ id: string }>(`select ${schema}.create_campaign('Art table') id`)).id
  const arin = (await one<{ id: string }>(`select ${schema}.create_character($1,'Arin') id`, [c]))
    .id
  const invite = (
    await one<{ id: string }>(`select ${schema}.invite_character_player($1,$2,$3) id`, [
      c,
      arin,
      'player@example.com',
    ])
  ).id
  await asUser(player)
  await db.query(`select ${schema}.respond_campaign_invitation($1,true)`, [invite])
  await asUser(dm)
  return c
}

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`)
  for (const [id, email] of [
    [dm, 'dm@example.com'],
    [player, 'player@example.com'],
    [outsider, 'other@example.com'],
    [otherDm, 'otherdm@example.com'],
  ])
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
  // A PRE copied (ETL) before this migration exercises its guarded PRE mirror.
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

describe('RYT-053 SRD creature images', () => {
  it('attaches, replaces, replays and clears the DM image of an SRD creature', async () => {
    const c = await setup()
    const first = `public/${c}/srd-adult-red-dragon/${randomUUID()}.webp`
    const second = `public/${c}/srd-adult-red-dragon/${randomUUID()}.webp`
    await upload(first)
    await upload(second)
    expect(await readable(first)).toBe(true)
    const key = randomUUID()
    expect(await pub.set(c, 'adult-red-dragon', first, key)).toEqual({
      srd_id: 'adult-red-dragon',
      image_path: first,
    })
    await pub.set(c, 'adult-red-dragon', first, key) // replay
    await expect(pub.set(c, 'adult-red-dragon', second, key)).rejects.toThrow(/Request mismatch/)
    await pub.set(c, 'adult-red-dragon', second)
    await upload(`public/${c}/srd-wolf/${randomUUID()}.png`)
    const wolf = (
      await db.query<{ name: string }>(
        "select name from storage.objects where name like '%/srd-wolf/%'",
      )
    ).rows[0]!.name
    await pub.set(c, 'wolf', wolf)
    expect((await pub.list(c)).map((i) => [i.srd_id, i.image_path])).toEqual([
      ['adult-red-dragon', second],
      ['wolf', wolf],
    ])
    await pub.set(c, 'wolf', null)
    expect((await pub.list(c)).map((i) => i.srd_id)).toEqual(['adult-red-dragon'])
    // Invalid creature ids, paths of another creature, campaign or environment, missing objects.
    for (const [srd, path] of [
      ['Adult Red Dragon', null],
      ['-wolf', null],
      ['a'.repeat(81), null],
      [null, null],
      ['wolf', second],
      ['wolf', `pre/${c}/srd-wolf/${randomUUID()}.webp`],
      ['wolf', `public/${randomUUID()}/srd-wolf/${randomUUID()}.webp`],
      ['wolf', `public/${c}/srd-wolf/${randomUUID()}.gif`],
      ['wolf', `public/${c}/srd-wolf/${randomUUID()}.webp`],
    ] as const)
      await expect(pub.set(c, srd, path)).rejects.toThrow(/Invalid request|Image unavailable/)
    await db.exec('reset role')
  })

  it('keeps SRD images to the campaign DM: RPCs, table and storage', async () => {
    const c = await setup()
    const path = `public/${c}/srd-ghoul/${randomUUID()}.webp`
    await upload(path)
    await pub.set(c, 'ghoul', path)
    for (const user of [player, outsider, otherDm]) {
      await asUser(user)
      await expect(pub.set(c, 'ghoul', null)).rejects.toThrow(/Forbidden/)
      await expect(pub.list(c)).rejects.toThrow(/Forbidden/)
      expect(
        (
          await db.query('select * from public.campaign_creature_images where campaign_id = $1', [
            c,
          ])
        ).rows,
      ).toHaveLength(0)
      // Storage: no read, no upload under the campaign's SRD prefix.
      expect(await readable(path)).toBe(false)
      await expect(upload(`public/${c}/srd-ghoul/${randomUUID()}.webp`)).rejects.toThrow(
        /row-level security/,
      )
    }
    // A DM of another campaign is refused through the target campaign id.
    await asUser(otherDm)
    const elsewhere = (await one<{ id: string }>("select public.create_campaign('Elsewhere') id"))
      .id
    await expect(pub.set(elsewhere, 'ghoul', path)).rejects.toThrow(/Invalid request/)
    await asAnon()
    await expect(pub.set(c, 'ghoul', null)).rejects.toThrow(/permission denied/)
    await expect(pub.list(c)).rejects.toThrow(/permission denied/)
    await expect(db.query('select * from public.campaign_creature_images')).rejects.toThrow(
      /permission denied/,
    )
    // Writes go through the RPC only, for the DM too.
    for (const sql of [
      `insert into public.campaign_creature_images values ('${c}', 'wolf', 'x')`,
      "update public.campaign_creature_images set image_path = 'x'",
      'delete from public.campaign_creature_images',
    ]) {
      await asUser(dm)
      await expect(db.query(sql)).rejects.toThrow(/permission denied/)
    }
    // The DM reads and deletes the object; template image rules are unchanged by the new prefix.
    await asUser(dm)
    expect(await readable(path)).toBe(true)
    expect((await pub.list(c)).map((i) => i.image_path)).toEqual([path])
    await db.query(
      "delete from storage.objects where bucket_id = 'creature-images' and name = $1",
      [path],
    )
    expect(await readable(path)).toBe(false)
    for (const name of [
      `public/${c}/srd-/${randomUUID()}.webp`,
      `public/${c}/srd-Wolf/${randomUUID()}.webp`,
      `public/${c}/${randomUUID()}/${randomUUID()}.webp`,
    ])
      await expect(upload(name)).rejects.toThrow(/row-level security/)
    await db.exec('reset role')
  })

  it('mirrors the change into a PRE copied before the migration', async () => {
    const pre = api('pre')
    const c = await setup('pre')
    const path = `pre/${c}/srd-lich/${randomUUID()}.webp`
    await upload(path)
    await pre.set(c, 'lich', path)
    expect((await pre.list(c)).map((i) => i.image_path)).toEqual([path])
    await expect(pre.set(c, 'lich', `public/${c}/srd-lich/${randomUUID()}.webp`)).rejects.toThrow(
      /Invalid request/,
    )
    await expect(pub.list(c)).rejects.toThrow(/Forbidden/)
    await asUser(player)
    expect(await readable(path)).toBe(false)
    await db.exec('reset role')
    const sources = (
      await db.query<{ src: string }>(
        "select prosrc src from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('pre','pre_private') and p.proname in ('set_creature_srd_image','list_creature_srd_images')",
      )
    ).rows
    expect(sources).toHaveLength(2)
    for (const { src } of sources) expect(src).not.toMatch(/\bpublic\.|\bprivate\./)
  })
})
