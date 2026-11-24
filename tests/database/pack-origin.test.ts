import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  backgroundKeys,
  classKeys,
  conditionKeys,
  speciesKeys,
} from '../../src/features/characters/domain/srd.ts'

// RYT-174: the origin of each entry of the base pack against its baseline version, who reads
// it, and the entries the app's code relies on, which cannot be withdrawn.
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
async function refused(sql: string, args: unknown[], error = /Forbidden|permission denied/) {
  await expect(db.query(sql, args)).rejects.toThrow(error)
}

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

let admin: string, dm: string, player: string, otherDm: string, outsider: string
let srd: string, north: string, c: string, d: string

const entry = (
  kind: string,
  key: string,
  name: string,
  text = `${name} text`,
  index: Json = {},
) => ({
  kind,
  key,
  name_en: name,
  name_es: `${name} (es)`,
  data: { index: { id: `${kind}.${key}`, cat: kind, ...index }, en: { summary: text } },
})
type Row = {
  id: string
  key: string
  state: string
  revision: number
  origin?: string
  protected?: boolean
}
const drafts = async (target: string, kind: string) => {
  await asUser(admin)
  return scalar<Row[]>('select public.list_content_drafts($1, $2) result', [target, kind])
}
const draft = async (target: string, kind: string, key: string) =>
  (await drafts(target, kind)).find((row) => row.key === key)!
/** Saves an entry as the super admin: a new one, or an edit of the existing draft. */
async function save(target: string, value: Json & { kind: string; key: string }) {
  const current = (await drafts(target, value.kind)).find((row) => row.key === value.key)
  await db.query('select public.save_content_entry($1, $2, $3, $4, $5)', [
    target,
    current?.id ?? null,
    current?.revision ?? null,
    JSON.stringify(value),
    randomUUID(),
  ])
}
async function remove(target: string, kind: string, key: string) {
  const row = await draft(target, kind, key)
  return db.query('select public.delete_content_entry($1, $2, $3)', [
    row.id,
    row.revision,
    randomUUID(),
  ])
}
async function publish(target: string) {
  await asSystem()
  const version = await scalar<number>(
    'select version result from public.content_packs where id = $1',
    [target],
  )
  await asUser(admin)
  await db.query('select public.publish_content_pack($1, $2, $3)', [target, version, randomUUID()])
}
async function pack(slug: string, entries: (Json & { kind: string; key: string })[]) {
  await asUser(admin)
  const id = (
    await scalar<{ id: string }>('select public.save_content_pack(null, null, $1, $2) result', [
      JSON.stringify({ slug, title_en: slug, title_es: slug }),
      randomUUID(),
    ])
  ).id
  for (const value of entries) await save(id, value)
  await publish(id)
  await asSystem()
  const revision = await scalar<number>(
    'select revision result from public.content_packs where id = $1',
    [id],
  )
  await asUser(admin)
  await db.query('select public.set_content_pack_visibility($1, $2, $3, $4)', [
    id,
    revision,
    'public',
    randomUUID(),
  ])
  return id
}
type Origins = {
  id: string
  title_en: string
  entries: { kind: string; key: string; origin: string }[]
}[]
const campaignOrigins = async (campaign = c) =>
  scalar<Origins>('select public.get_campaign_content_origins($1) result', [campaign])
const publicOrigins = async () => scalar<Origins>('select public.get_content_origins() result')
const short = (list: Origins, target = srd) =>
  list.find((p) => p.id === target)?.entries.map((e) => `${e.kind}.${e.key}:${e.origin}`)

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
  for (const file of readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))

  admin = await user('admin')
  dm = await user('dm')
  player = await user('player')
  otherDm = await user('otherdm')
  outsider = await user('outsider')
  await asSystem()
  await db.query('insert into private.super_admins (user_id) values ($1)', [admin])
  srd = await pack('srd-5-2-1', [
    entry('spell', 'fireball', 'Fireball'),
    entry('spell', 'shield', 'Shield'),
    entry('spell', 'wish', 'Wish'),
    entry('condition', 'prone', 'Prone'),
    entry('condition', 'exhaustion', 'Exhaustion'),
    {
      kind: 'table',
      key: 'creature-baselines',
      name_en: 'Baselines',
      name_es: 'Bases',
      data: { rows: [] },
    },
  ])
  north = await pack('northern-lore', [entry('condition', 'prone', 'Prone of the north')])
  // The base pack starts from its first published version, as the hosted SRD does.
  await asSystem()
  await db.query('update public.content_packs set baseline_version = version where id = $1', [srd])

  await asUser(dm)
  c = await scalar<string>('select public.create_campaign($1) result', ['Sunken Coast'])
  const invitation = await scalar<string>('select public.invite_campaign_member($1, $2) result', [
    c,
    emails.get(player),
  ])
  await asUser(player)
  await db.query('select public.respond_campaign_invitation($1, true)', [invitation])
  await asUser(otherDm)
  d = await scalar<string>('select public.create_campaign($1) result', ['Winter Keep'])
}, 180000)
afterAll(() => db.close())

describe('entry origin (RYT-174)', () => {
  it('reads every entry of the baseline as the SRD, and other packs without an origin', async () => {
    expect((await drafts(srd, 'spell')).map((row) => row.origin)).toEqual(['srd', 'srd', 'srd'])
    expect(await draft(north, 'condition', 'prone')).not.toHaveProperty('origin')
    await asUser(outsider)
    expect(short(await publicOrigins())).toEqual([])
    expect((await publicOrigins()).map((p) => p.id)).toEqual([srd])
  })

  it('marks an edited entry as changed and a new one as the pack own; a picture is no change', async () => {
    await save(srd, entry('spell', 'shield', 'Shield', 'A sturdier shield'))
    await save(srd, entry('spell', 'moon-ray', 'Moon Ray'))
    await save(
      srd,
      entry('spell', 'fireball', 'Fireball', 'Fireball text', {
        image: `public/${srd}/${randomUUID()}.webp`,
      }),
    )
    const rows = await drafts(srd, 'spell')
    expect(rows.map((row) => `${row.key}:${row.origin}`)).toEqual([
      'fireball:srd',
      'moon-ray:own',
      'shield:changed',
      'wish:srd',
    ])
    // The editor gets the original of a changed entry only.
    const detail = async (key: string) =>
      scalar<Json>('select public.get_content_draft($1) result', [
        rows.find((row) => row.key === key)!.id,
      ])
    expect(await detail('shield')).toMatchObject({
      origin: 'changed',
      baseline: { name_en: 'Shield', data: { en: { summary: 'Shield text' } } },
    })
    expect((await detail('fireball')).baseline).toBeNull()
    expect((await detail('moon-ray')).baseline).toBeNull()
    // Drafts are not published yet: readers still see the baseline.
    await asUser(outsider)
    expect(short(await publicOrigins())).toEqual([])
  })

  it('gives readers the changed and own entries once published, at the pinned version', async () => {
    await publish(srd)
    await asUser(outsider)
    expect(short(await publicOrigins())).toEqual(['spell.moon-ray:own', 'spell.shield:changed'])
    // The campaign still pins the baseline version.
    await asUser(dm)
    expect(short(await campaignOrigins())).toEqual([])
    await db.query('select public.update_campaign_content($1, $2, $3, $4)', [c, srd, 'spells', 2])
    expect(short(await campaignOrigins())).toEqual(['spell.moon-ray:own', 'spell.shield:changed'])
    expect((await campaignOrigins())[0]).toMatchObject({ id: srd, title_en: 'srd-5-2-1' })
    await asUser(player)
    expect(short(await campaignOrigins())).toEqual(['spell.moon-ray:own', 'spell.shield:changed'])
    // A hidden entry is left out.
    await asUser(dm)
    await db.query('select public.set_campaign_content_hidden($1, $2, $3, $4, true)', [
      c,
      srd,
      'spell',
      'moon-ray',
    ])
    await asUser(player)
    expect(short(await campaignOrigins())).toEqual(['spell.shield:changed'])
  })

  it('refuses anon, outsiders and members of another campaign', async () => {
    await asAnon()
    await refused('select public.get_campaign_content_origins($1)', [c])
    await refused('select public.get_content_origins()', [])
    for (const who of [outsider, otherDm]) {
      await asUser(who)
      await refused('select public.get_campaign_content_origins($1)', [c])
    }
    // The other campaign reads its own, still at the baseline.
    await asUser(otherDm)
    expect(short(await campaignOrigins(d))).toEqual([])
    // Drafts, and with them origin and protection, stay with super admins.
    for (const who of [dm, player, outsider]) {
      await asUser(who)
      await refused('select public.list_content_drafts($1, $2)', [srd, 'spell'])
    }
    await asSystem()
    for (const fn of [
      'private.content_baseline(uuid,text,text)',
      'private.content_origin(uuid,text,text,text,text,jsonb)',
      'private.content_entry_protected(uuid,text,text)',
      'private.content_origins_at(uuid,text,integer)',
      'private.content_draft_row(public.content_entries)',
    ])
      for (const role of ['anon', 'authenticated'])
        expect(
          await scalar<boolean>(
            `select has_function_privilege('${role}', '${fn}', 'execute') result`,
          ),
          fn,
        ).toBe(false)
  })
})

describe('protected entries (RYT-174)', () => {
  it('protects exactly the keys the app code names, in the base pack only', async () => {
    await asSystem()
    const check = (target: string, kind: string, key: string) =>
      scalar<boolean>('select private.content_entry_protected($1, $2, $3) result', [
        target,
        kind,
        key,
      ])
    const named: [string, readonly string[]][] = [
      ['condition', conditionKeys],
      ['class', classKeys],
      ['species', speciesKeys],
      ['background', backgroundKeys],
      ['table', ['creature-baselines']],
    ]
    expect(named.reduce((total, [, keys]) => total + keys.length, 0)).toBe(40)
    for (const [kind, keys] of named)
      for (const key of keys) expect(await check(srd, kind, key), `${kind}.${key}`).toBe(true)
    for (const [kind, key] of [
      ['condition', 'exhaustion'],
      ['spell', 'prone'],
      ['subclass', 'wizard'],
      ['table', 'other'],
    ] as const)
      expect(await check(srd, kind, key), `${kind}.${key}`).toBe(false)
    expect(await check(north, 'condition', 'prone')).toBe(false)
  })

  it('refuses to withdraw a protected entry and keeps its text editable', async () => {
    expect(await draft(srd, 'condition', 'prone')).toMatchObject({ protected: true })
    expect(await draft(srd, 'condition', 'exhaustion')).not.toHaveProperty('protected')
    await expect(remove(srd, 'condition', 'prone')).rejects.toThrow(/Entry protected/)
    await expect(remove(srd, 'table', 'creature-baselines')).rejects.toThrow(/Entry protected/)
    // Not even the owner removes the row while the pack exists.
    await asSystem()
    await expect(
      db.query("delete from public.content_entries where pack_id = $1 and key = 'prone'", [srd]),
    ).rejects.toThrow(/Entry protected/)
    await expect(
      db.query(
        "update public.content_entries set deleted = true where pack_id = $1 and key = 'prone'",
        [srd],
      ),
    ).rejects.toThrow(/Entry protected/)
    await save(srd, entry('condition', 'prone', 'Prone', 'Lying on the ground'))
    expect(await draft(srd, 'condition', 'prone')).toMatchObject({
      state: 'changed',
      origin: 'changed',
      protected: true,
    })
  })

  it('lets other entries go: unprotected ones, drafts never published and other packs', async () => {
    await remove(srd, 'condition', 'exhaustion')
    expect(await draft(srd, 'condition', 'exhaustion')).toMatchObject({ state: 'deleted' })
    // A protected key that was never published is only a draft.
    await save(srd, entry('condition', 'stunned', 'Stunned'))
    expect(await draft(srd, 'condition', 'stunned')).not.toHaveProperty('protected')
    await remove(srd, 'condition', 'stunned')
    expect((await drafts(srd, 'condition')).map((row) => row.key)).not.toContain('stunned')
    await remove(north, 'condition', 'prone')
    expect(await draft(north, 'condition', 'prone')).toMatchObject({ state: 'deleted' })
    // Publishing withdraws the unprotected entry and keeps the protected ones.
    await publish(srd)
    expect((await drafts(srd, 'condition')).map((row) => row.key)).toEqual(['prone'])
  })
})
