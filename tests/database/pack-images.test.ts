import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// RYT-172: entries carry a picture in the private pack-images bucket, published with the pack
// version; campaign members read the pictures of their campaign's packs.
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

let editor: string, owner: string, admin: string, dm: string, player: string, otherDm: string
let outsider: string
let srd: string, books: string, c: string, d: string

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
async function pack(slug: string, entries: Json[], by = editor, open = true) {
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
async function add(id: string, entries: Json[], by = editor) {
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
async function publish(id: string, version: number, by = editor) {
  await asUser(by)
  await db.query('select public.publish_content_pack($1, $2, $3)', [id, version, randomUUID()])
}
async function visibility(id: string, value: 'public' | 'private', by = editor) {
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
  otherDm = await user('otherdm')
  outsider = await user('outsider')
  await asSystem()
  await db.query('insert into private.content_editors (user_id) values ($1), ($2), ($3)', [
    editor,
    owner,
    admin,
  ])
  await db.query('insert into private.super_admins (user_id) values ($1)', [admin])
  srd = await pack('srd-5-2-1', [item('rope', 'Rope')], admin)
  c = await campaign(dm, 'Sunken Coast')
  await asUser(dm)
  const invitation = await scalar<string>('select public.invite_campaign_member($1, $2) result', [
    c,
    emails.get(player),
  ])
  await asUser(player)
  await db.query('select public.respond_campaign_invitation($1, true)', [invitation])
  d = await campaign(otherDm, 'Winter Keep')
  books = await pack('owner-books', [item('moon-blade', 'Moon Blade')], owner, false)
}, 180000)
afterAll(() => db.close())

const picture = (pack: string) => `public/${pack}/${randomUUID()}.webp`
const access = async (path: string, writing: boolean) =>
  scalar<boolean>('select private.pack_image_access($1, $2) result', [path, writing])
const images = async (campaign = c) =>
  scalar<{ kind: string; id: string; path: string }[]>(
    'select public.get_campaign_pack_images($1) result',
    [campaign],
  )
const packVersion = async () => {
  await asSystem()
  return scalar<number>('select version result from public.content_packs where id = $1', [srd])
}
const pinned = async () => {
  await asSystem()
  return scalar<number>(
    "select version result from public.campaign_content where campaign_id = $1 and pack_id = $2 and category = 'items'",
    [c, srd],
  )
}

describe('pack images (RYT-172)', () => {
  it('lets only content editors upload, into an existing pack', async () => {
    const path = picture(srd)
    for (const who of [editor, owner, admin]) {
      await asUser(who)
      expect(await access(path, true)).toBe(true)
    }
    for (const who of [dm, player, otherDm, outsider]) {
      await asUser(who)
      expect(await access(path, true)).toBe(false)
    }
    await asAnon()
    await expect(access(path, true)).rejects.toThrow(/permission denied/)
    await asUser(editor)
    expect(await access(picture(randomUUID()), true)).toBe(false)
    expect(await access(`public/${srd}/x.webp`, true)).toBe(false)
    expect(await access(`public/${srd}/${randomUUID()}.gif`, true)).toBe(false)
    expect(await access(`other/${srd}/${randomUUID()}.webp`, true)).toBe(false)
  })

  it('accepts only a pack-images path as an entry picture', async () => {
    await asUser(editor)
    const id = (
      await scalar<{ id: string }>('select public.save_content_pack(null, null, $1, $2) result', [
        JSON.stringify({ slug: 'bad-pictures', title_en: 'Bad', title_es: 'Bad' }),
        randomUUID(),
      ])
    ).id
    for (const image of ['https://example.com/x.png', 'public/x/y.webp', 42])
      await expect(
        db.query('select public.save_content_entry($1, null, null, $2, $3)', [
          id,
          JSON.stringify(item('axe', 'Axe', { image })),
          randomUUID(),
        ]),
      ).rejects.toThrow()
    await db.query('select public.save_content_entry($1, null, null, $2, $3)', [
      id,
      JSON.stringify(item('axe', 'Axe', { image: picture(id) })),
      randomUUID(),
    ])
  })

  it('shows a campaign the pictures of its pinned version, to its members only', async () => {
    const first = picture(srd)
    await add(srd, [item('rope', 'Rope', { image: first })], admin)
    await publish(srd, await packVersion(), admin)
    const latest = await packVersion()
    await asUser(dm)
    await db.query('select public.update_campaign_content($1, $2, $3, $4)', [
      c,
      srd,
      'items',
      latest,
    ])
    expect(await pinned()).toBe(latest)
    await asUser(dm)
    expect(await images()).toEqual([{ kind: 'item', id: 'rope', path: first }])
    // A Player sees an item picture only for items the campaign's storeroom holds.
    await asUser(player)
    expect(await images()).toEqual([])
    await asSystem()
    await db.query(
      "insert into public.item_definitions(campaign_id, name, category, origin, created_by, basic_key) values ($1, 'Rope', 'gear', 'srd', $2, 'rope')",
      [c, dm],
    )
    await asUser(player)
    expect(await images()).toEqual([{ kind: 'item', id: 'rope', path: first }])
    // An entry the DM hid never reaches a Player; the DM keeps it.
    await asSystem()
    await db.query(
      "insert into public.campaign_content_hidden(campaign_id, pack_id, category, kind, key) values ($1, $2, 'items', 'item', 'rope')",
      [c, srd],
    )
    await asUser(player)
    expect(await images()).toEqual([])
    await asUser(dm)
    expect(await images()).toHaveLength(1)
    await asSystem()
    await db.query('delete from public.campaign_content_hidden where campaign_id = $1', [c])
    for (const who of [outsider, otherDm]) {
      await asUser(who)
      await refused('select public.get_campaign_pack_images($1)', [c])
    }
    await asAnon()
    await refused('select public.get_campaign_pack_images($1)', [c])
    // A new picture in the draft, and even published, waits for the DM's update.
    const second = picture(srd)
    await add(srd, [item('rope', 'Rope', { image: second })], admin)
    await asUser(player)
    expect((await images())[0]!.path).toBe(first)
    await publish(srd, await packVersion(), admin)
    await asUser(player)
    expect((await images())[0]!.path).toBe(first)
    // Published pictures of a public pack are readable by any signed-in account; a draft or an
    // unnamed object is not, even with its path.
    await asUser(outsider)
    expect(await access(first, false)).toBe(true)
    expect(await access(second, false)).toBe(true)
    expect(await access(picture(srd), false)).toBe(false)
    await asAnon()
    await expect(access(first, false)).rejects.toThrow(/permission denied/)
  })

  it('keeps private pack pictures to its editors, owner and offered campaigns, published only', async () => {
    const named = picture(books)
    const draft = picture(books)
    await add(books, [item('moon-blade', 'Moon Blade', { image: named })], owner)
    await asSystem()
    const version = await scalar<number>(
      'select version result from public.content_packs where id = $1',
      [books],
    )
    await publish(books, version, owner)
    await add(books, [item('moon-blade', 'Moon Blade', { image: draft })], owner)
    for (const path of [named, draft]) {
      await asUser(owner)
      expect(await access(path, false)).toBe(true)
      await asUser(editor)
      expect(await access(path, false)).toBe(true)
    }
    for (const who of [dm, player, otherDm, outsider]) {
      await asUser(who)
      expect(await access(named, false)).toBe(false)
    }
    // A super admin offers the private pack to the campaign.
    await asUser(admin)
    await db.query('select public.set_content_pack_offer($1, $2, $3)', [books, c, true])
    for (const who of [dm, player]) {
      await asUser(who)
      expect(await access(named, false)).toBe(true)
      expect(await access(draft, false)).toBe(false)
    }
    for (const who of [otherDm, outsider]) {
      await asUser(who)
      expect(await access(named, false)).toBe(false)
    }
    await asUser(dm)
    expect(await access(picture(d), false)).toBe(false)
  })

  it('gives Players the creatures of public packs only', async () => {
    const yeti = picture(books)
    await add(
      books,
      [
        {
          kind: 'creature',
          key: 'yeti',
          name_en: 'Yeti',
          name_es: 'Yeti',
          data: { index: { cr: 3, image: yeti } },
        },
      ],
      owner,
    )
    await asSystem()
    const version = await scalar<number>(
      'select version result from public.content_packs where id = $1',
      [books],
    )
    await publish(books, version, owner)
    await asSystem()
    await db.query(
      "insert into public.campaign_content(campaign_id, pack_id, category, version) values ($1, $2, 'creatures', $3) on conflict (campaign_id, pack_id, category) do update set version = excluded.version, enabled = true",
      [c, books, version + 1],
    )
    await asUser(dm)
    expect((await images()).filter((row) => row.kind === 'creature')).toHaveLength(1)
    await asUser(player)
    expect((await images()).filter((row) => row.kind === 'creature')).toEqual([])
  })
})
