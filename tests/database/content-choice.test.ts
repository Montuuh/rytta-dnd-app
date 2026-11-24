import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// RYT-167: the DM chooses a new campaign's packs; the published SRD is readable without an account.
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

let editor: string, owner: string, admin: string, dm: string, player: string
let outsider: string
let srd: string, books: string, basics: string, c: string

const item = (key: string, name: string, extra: Json = {}) => ({
  kind: 'item',
  key,
  name_en: name,
  name_es: `${name} (es)`,
  data: {
    index: {
      category: 'weapon',
      icon: 'sword',
      slot_kind: 'one_hand',
      weightLb: 3,
      costCp: 1500,
      properties: {},
      ...extra,
    },
    en: { description: `${name} text` },
    es: { description: `${name} texto` },
  },
})
const spell = (key: string) => ({
  kind: 'spell',
  key,
  name_en: key,
  name_es: key,
  data: { index: { id: `spell.${key}`, cat: 'spell', en: key, es: key } },
})
async function pack(slug: string, entries: Json[], by = admin, open = true) {
  await asUser(by)
  const id = (
    await scalar<{ id: string }>('select public.save_content_pack(null, null, $1, $2) result', [
      JSON.stringify({ slug, title_en: slug, title_es: slug }),
      randomUUID(),
    ])
  ).id
  await add(id, entries, by)
  await publish(id, 0, by)
  if (open) await visibility(id, 'public', by)
  return id
}
async function add(id: string, entries: Json[], by = admin) {
  await asUser(by)
  for (const e of entries) {
    await asSystem()
    const current = (
      await db.query<{ id: string; revision: number }>(
        'select id, revision from public.content_entries where pack_id = $1 and kind = $2 and key = $3',
        [id, e.kind, e.key],
      )
    ).rows[0]
    await asUser(by)
    await db.query('select public.save_content_entry($1, $2, $3, $4, $5)', [
      id,
      current?.id ?? null,
      current?.revision ?? null,
      JSON.stringify(e),
      randomUUID(),
    ])
  }
}
async function publish(id: string, version: number, by = admin) {
  await asUser(by)
  await db.query('select public.publish_content_pack($1, $2, $3)', [id, version, randomUUID()])
}
async function visibility(id: string, value: 'public' | 'private', by = admin) {
  await asSystem()
  const revision = await scalar<number>(
    'select revision result from public.content_packs where id = $1',
    [id],
  )
  await asUser(by)
  await db.query('select public.set_content_pack_visibility($1, $2, $3, $4)', [
    id,
    revision,
    value,
    randomUUID(),
  ])
}
async function refused(sql: string, args: unknown[], error = /Forbidden|permission denied/) {
  await expect(db.query(sql, args)).rejects.toThrow(error)
}
async function campaign(by: string, name: string) {
  await asUser(by)
  return scalar<string>('select public.create_campaign($1) result', [name])
}

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

  editor = await user('editor')
  owner = await user('owner')
  admin = await user('admin')
  dm = await user('dm')
  player = await user('player')
  outsider = await user('outsider')
  await asSystem()
  // RYT-173: only super admins write the library; a content editor grant alone gives nothing.
  await db.query('insert into private.content_editors (user_id) values ($1)', [editor])
  await db.query('insert into private.super_admins (user_id) values ($1), ($2)', [owner, admin])
  srd = await pack('srd-5-2-1', [spell('fireball')], admin)
  // A campaign that exists before the SRD has items.
  c = await campaign(dm, 'Sunken Coast')
  await asUser(dm)
  const invitation = await scalar<string>('select public.invite_campaign_member($1, $2) result', [
    c,
    emails.get(player),
  ])
  await asUser(player)
  await db.query('select public.respond_campaign_invitation($1, true)', [invitation])
  // The SRD publishes its items as version 2.
  await add(
    srd,
    [item('longsword', 'Longsword', { key: 'longsword' }), item('rope', 'Rope')],
    admin,
  )
  await publish(srd, 1, admin)
  basics = await pack(
    'rytta-basics',
    [item('travel-rations', 'Rations', { key: 'travelRations' })],
    admin,
  )
  books = await pack(
    'owner-books',
    [item('moon-blade', 'Moon Blade'), spell('moon-ray')],
    owner,
    false,
  )
}, 180000)
afterAll(() => db.close())

type Choice = {
  id: string
  slug: string
  private: boolean
  categories: { category: string; entries: number; default: boolean }[]
}
const choices = async () => scalar<Choice[]>('select public.get_content_choices() result')
const create = async (name: string, chosen: { pack: string; category: string }[]) =>
  scalar<string>('select public.create_campaign_with_content($1, $2, $3) result', [
    name,
    '',
    JSON.stringify(chosen),
  ])
const enabled = async (campaign: string) => {
  await asSystem()
  return (
    await db.query<{ slug: string; category: string; version: number }>(
      `select p.slug, c.category, c.version from public.campaign_content c
         join public.content_packs p on p.id = c.pack_id
        where c.campaign_id = $1 and c.enabled order by 1, 2`,
      [campaign],
    )
  ).rows.map((row) => `${row.slug}:${row.category}`)
}

describe('campaign content choice (RYT-167)', () => {
  it('lists public packs and the caller own private ones, with the defaults marked', async () => {
    await asAnon()
    await refused('select public.get_content_choices()', [])
    // Anyone signed in may list the choices: they are the public packs.
    await asUser(outsider)
    expect((await choices()).map((item) => item.slug)).not.toContain('owner-books')
    await asUser(dm)
    const list = await choices()
    expect(list.map((item) => item.slug)).toEqual(['srd-5-2-1', 'rytta-basics'])
    expect(list[0]!.categories.map((item) => [item.category, item.default])).toEqual([
      ['spells', true],
      ['items', true],
    ])
    await asUser(owner)
    expect((await choices()).map((item) => item.slug)).toContain('owner-books')
  })

  it('creates a campaign with exactly the chosen categories', async () => {
    await asUser(dm)
    const id = await create('Chosen', [{ pack: srd, category: 'items' }])
    expect(await enabled(id)).toEqual(['srd-5-2-1:items'])
    await asUser(dm)
    const all = await create('Defaults', [
      { pack: srd, category: 'spells' },
      { pack: srd, category: 'items' },
      { pack: basics, category: 'items' },
    ])
    expect(await enabled(all)).toEqual([
      'rytta-basics:items',
      'srd-5-2-1:items',
      'srd-5-2-1:spells',
    ])
  })

  it('offers the caller own private pack, and refuses packs that are not theirs', async () => {
    await asUser(owner)
    const own = await create('Owner Table', [{ pack: books, category: 'items' }])
    expect(await enabled(own)).toEqual(['owner-books:items'])
    await asSystem()
    const before = await scalar<number>('select count(*)::int result from public.campaigns')
    await asUser(dm)
    await refused(
      'select public.create_campaign_with_content($1, $2, $3)',
      ['Not mine', '', JSON.stringify([{ pack: books, category: 'items' }])],
      /Invalid request|permission denied/,
    )
    await refused(
      'select public.create_campaign_with_content($1, $2, $3)',
      ['Bad', '', JSON.stringify([{ pack: srd, category: 'creatures' }])],
      /Invalid request|permission denied/,
    )
    for (const bad of [
      { pack: '------------------------------------', category: 'items' },
      { pack: srd, category: 'treasure' },
      { pack: srd, category: 'items', extra: 1 },
    ])
      await refused(
        'select public.create_campaign_with_content($1, $2, $3)',
        ['Bad', '', JSON.stringify([bad])],
        /Invalid request/,
      )
    await asSystem()
    expect(await scalar<number>('select count(*)::int result from public.campaigns')).toBe(before)
  })

  it('serves the published SRD creatures to signed-in accounts only', async () => {
    await asAnon()
    await refused('select public.get_srd_rule_pack($1, $2)', ['spells', 'index'])
    await refused('select public.get_srd_creature_pack($1)', ['index'])
    await refused('select public.get_content_choices()', [])
    await refused('select public.create_campaign_with_content($1, $2, $3)', ['Anon', '', '[]'])
    await asUser(outsider)
    const creatures = await scalar<{ rows: Json[]; baselines: unknown[] }>(
      'select public.get_srd_creature_pack($1) result',
      ['index'],
    )
    expect(creatures).toMatchObject({ rows: [], baselines: [] })
    await refused('select public.get_srd_creature_pack($1)', ['fr'], /Invalid request/)
    await asSystem()
    for (const fn of [
      'public.get_content_choices()',
      'public.create_campaign_with_content(text,text,jsonb)',
      'public.get_srd_creature_pack(text)',
    ])
      expect(
        await scalar<boolean>(`select has_function_privilege('anon', '${fn}', 'execute') result`),
      ).toBe(false)
  })
})
