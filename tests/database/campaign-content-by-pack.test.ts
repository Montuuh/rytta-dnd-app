import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// RYT-184: the Content section works by pack (ADR 051, addendum "Content by pack"): one switch per
// pack, one update per pack with a digest, the cover picture, kinds per category, hidden entries
// and the creatures the campaign's encounters use.
const db = new PGlite()
type Json = Record<string, unknown>
type Category = {
  category: string
  enabled: boolean
  pinned_version: number | null
  entries: number
  hidden: number
  kinds: Record<string, number>
}
type Pack = {
  id: string
  offered: boolean
  version: number | null
  cover: string | null
  categories: Category[]
}
type Digest = {
  version: number
  new: number
  changed: number
  withdrawn: number
  campaign_versions: number
  hidden: number
  categories: Json[]
  affected: Json[]
  affected_more: number
}

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
async function campaign(by: string, name: string) {
  await asUser(by)
  return scalar<string>('select public.create_campaign($1) result', [name])
}

const picture = (pack: string) => `public/${pack}/${randomUUID()}.webp`
const entry = (kind: string, key: string, name: string, index: Json = {}) => ({
  kind,
  key,
  name_en: name,
  name_es: name,
  data: { index, en: { name } },
})

let admin: string, dm: string, player: string, inactive: string, otherDm: string
let outsider: string
let srd: string, north: string, books: string, big: string, c: string, d: string
let yetiImage: string

async function add(id: string, entries: Json[]) {
  for (const e of entries) {
    await asSystem()
    const current = (
      await db.query<{ id: string; revision: number }>(
        'select id, revision from public.content_entries where pack_id = $1 and kind = $2 and key = $3',
        [id, e.kind, e.key],
      )
    ).rows[0]
    await asUser(admin)
    await db.query('select public.save_content_entry($1, $2, $3, $4, $5)', [
      id,
      current?.id ?? null,
      current?.revision ?? null,
      JSON.stringify(e),
      randomUUID(),
    ])
  }
}
async function withdraw(id: string, kind: string, key: string) {
  await asSystem()
  const row = (
    await db.query<{ id: string; revision: number }>(
      'select id, revision from public.content_entries where pack_id = $1 and kind = $2 and key = $3',
      [id, kind, key],
    )
  ).rows[0]!
  await asUser(admin)
  await db.query('select public.delete_content_entry($1, $2, $3)', [
    row.id,
    row.revision,
    randomUUID(),
  ])
}
async function versionOf(id: string) {
  await asSystem()
  return scalar<number>('select version result from public.content_packs where id = $1', [id])
}
async function publish(id: string) {
  const version = await versionOf(id)
  await asUser(admin)
  await db.query('select public.publish_content_pack($1, $2, $3)', [id, version, randomUUID()])
}
async function visibility(id: string, value: 'public' | 'private') {
  await asSystem()
  const revision = await scalar<number>(
    'select revision result from public.content_packs where id = $1',
    [id],
  )
  await asUser(admin)
  await db.query('select public.set_content_pack_visibility($1, $2, $3, $4)', [
    id,
    revision,
    value,
    randomUUID(),
  ])
}
async function pack(slug: string, entries: Json[], open = true) {
  await asUser(admin)
  const id = (
    await scalar<{ id: string }>('select public.save_content_pack(null, null, $1, $2) result', [
      JSON.stringify({ slug, title_en: slug, title_es: slug }),
      randomUUID(),
    ])
  ).id
  await add(id, entries)
  await publish(id)
  if (open) await visibility(id, 'public')
  return id
}
const content = async (campaign = c, by = dm) => {
  await asUser(by)
  return scalar<Pack[]>('select public.get_campaign_content($1) result', [campaign])
}
const packOf = async (id: string, campaign = c, by = dm) =>
  (await content(campaign, by)).find((p) => p.id === id)
const categoryOf = async (id: string, name: string, campaign = c) =>
  (await packOf(id, campaign))!.categories.find((x) => x.category === name)!
const switchPack = async (id: string, enabled: boolean, campaign = c, by = dm) => {
  await asUser(by)
  return scalar<Pack[]>('select public.set_campaign_content_pack($1, $2, $3) result', [
    campaign,
    id,
    enabled,
  ])
}
const digest = async (id: string, campaign = c) => {
  await asUser(dm)
  return scalar<Digest>('select public.get_campaign_content_pack_changes($1, $2) result', [
    campaign,
    id,
  ])
}
const listEntries = async (
  id: string,
  category: string,
  onlyHidden = false,
  search: string | null = null,
) => {
  await asUser(dm)
  return scalar<{ total: number; hidden_total: number; entries: Json[] }>(
    'select public.list_campaign_content_entries($1, $2, $3, $4, 0, $5) result',
    [c, id, category, search, onlyHidden],
  )
}
const hide = async (id: string, kind: string, key: string, hidden = true) => {
  await asUser(dm)
  await db.query('select public.set_campaign_content_hidden($1, $2, $3, $4, $5)', [
    c,
    id,
    kind,
    key,
    hidden,
  ])
}
const pinned = async (id: string, campaign = c) => {
  await asSystem()
  return (
    await db.query<{ category: string; version: number; enabled: boolean }>(
      'select category, version, enabled from public.campaign_content where campaign_id = $1 and pack_id = $2 order by category',
      [campaign, id],
    )
  ).rows
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

  admin = await user('admin')
  dm = await user('dm')
  player = await user('player')
  inactive = await user('inactive')
  otherDm = await user('otherdm')
  outsider = await user('outsider')
  await asSystem()
  await db.query('insert into private.super_admins (user_id) values ($1)', [admin])
  srd = await pack('srd-5-2-1', [
    entry('creature', 'wolf', 'Wolf'),
    entry('creature', 'kobold', 'Kobold'),
    entry('creature-trait', 'pack-tactics', 'Pack Tactics'),
    entry('spell', 'fire-bolt', 'Fire Bolt'),
    entry('condition', 'prone', 'Prone'),
  ])
  c = await campaign(dm, 'Sunken Coast')
  await asUser(dm)
  const invitation = await scalar<string>('select public.invite_campaign_member($1, $2) result', [
    c,
    emails.get(player),
  ])
  await asUser(player)
  await db.query('select public.respond_campaign_invitation($1, true)', [invitation])
  await asSystem()
  await db.query(
    "insert into public.campaign_members (campaign_id, user_id, role, active) values ($1, $2, 'dm', false)",
    [c, inactive],
  )
  d = await campaign(otherDm, 'Winter Keep')
  // A public pack with creatures (one pictured), class content, spells and an item.
  await asUser(admin)
  north = (
    await scalar<{ id: string }>('select public.save_content_pack(null, null, $1, $2) result', [
      JSON.stringify({ slug: 'north', title_en: 'North', title_es: 'Norte' }),
      randomUUID(),
    ])
  ).id
  yetiImage = picture(north)
  await add(north, [
    entry('creature', 'yeti', 'Yeti', { cr: 3, image: yetiImage }),
    entry('creature', 'mammoth', 'Mammoth', { cr: 6 }),
    entry('creature-trait', 'snow-camouflage', 'Snow Camouflage'),
    entry('class', 'skald', 'Skald'),
    entry('subclass', 'skald-frost', 'Frost Skald', { class: 'skald' }),
    entry('feature', 'skald-song', 'Skald Song'),
    entry('feature', 'skald-chill', 'Chill'),
    entry('spell', 'ice-lance', 'Ice Lance'),
    entry('spell', 'frost-ward', 'Frost Ward'),
    entry('item', 'fur-cloak', 'Fur Cloak'),
  ])
  await publish(north)
  await visibility(north, 'public')
  // A private pack offered to campaign c only.
  books = await pack(
    'owner-books',
    [entry('spell', 'moon-ray', 'Moon Ray'), entry('item', 'moon-blade', 'Moon Blade')],
    false,
  )
  await asUser(admin)
  await db.query('select public.set_content_pack_offer($1, $2, true)', [books, c])
  // A public pack for the digest cap: 205 spells and two creatures.
  big = await pack('big', [
    entry('creature', 'troll', 'Troll'),
    entry('creature', 'aardvark', 'Aardvark'),
  ])
  await asUser(admin)
  await db.query('select public.import_content_entries($1, $2, $3, false, $4)', [
    big,
    'spell',
    JSON.stringify(
      Array.from({ length: 205 }, (_, i) => ({
        key: `chant-${String(i).padStart(3, '0')}`,
        name_en: `Chant ${String(i).padStart(3, '0')}`,
        name_es: `Canto ${String(i).padStart(3, '0')}`,
        data: { index: { n: i } },
      })),
    ),
    randomUUID(),
  ])
  await publish(big)
}, 240000)
afterAll(() => db.close())

describe('campaign content by pack (RYT-184)', () => {
  it('refuses every campaign function to anon, outsider, inactive member, Player and another DM', async () => {
    const calls: [string, unknown[]][] = [
      ['select public.get_campaign_content($1)', [c]],
      ['select public.set_campaign_content_pack($1, $2, true)', [c, north]],
      ['select public.set_campaign_content_pack($1, $2, false)', [c, north]],
      ['select public.get_campaign_content_pack_changes($1, $2)', [c, srd]],
      ['select public.update_campaign_content_pack($1, $2, 1)', [c, srd]],
      [
        'select public.list_campaign_content_entries($1, $2, $3, null, 0, true)',
        [c, srd, 'spells'],
      ],
      ['select public.get_campaign_used_creatures($1)', [c]],
    ]
    await asAnon()
    for (const [sql, args] of calls) await refused(sql, args)
    await refused('select public.get_content_choices()', [])
    for (const who of [outsider, inactive, player, otherDm]) {
      await asUser(who)
      for (const [sql, args] of calls) await refused(sql, args)
    }
    // Private helpers stay closed to every client.
    await asUser(dm)
    await refused('select private.content_pack_cover($1)', [north])
    await refused('select private.campaign_content_apply($1, $2, $3, true)', [c, north, 'spells'])
    await asUser(outsider)
    expect(Array.isArray(await scalar('select public.get_content_choices() result'))).toBe(true)
  })

  it('refuses a private pack to a campaign it is not offered to', async () => {
    for (const [sql, args] of [
      ['select public.set_campaign_content_pack($1, $2, true)', [d, books]],
      ['select public.get_campaign_content_pack_changes($1, $2)', [d, books]],
      ['select public.update_campaign_content_pack($1, $2, 1)', [d, books]],
      [
        'select public.list_campaign_content_entries($1, $2, $3, null, 0, false)',
        [d, books, 'spells'],
      ],
    ] as [string, unknown[]][]) {
      await asUser(otherDm)
      await refused(sql, args, /Invalid request/)
    }
    expect(await packOf(books, d, otherDm)).toBeUndefined()
    // Unknown packs and a pack without any enabled row are refused too.
    await asUser(dm)
    await refused(
      'select public.set_campaign_content_pack($1, $2, true)',
      [c, randomUUID()],
      /Invalid request/,
    )
    await refused(
      'select public.get_campaign_content_pack_changes($1, $2)',
      [c, north],
      /Invalid request/,
    )
    await refused(
      'select public.update_campaign_content_pack($1, $2, 1)',
      [c, north],
      /Invalid request/,
    )
  })

  it('switches every category of a pack on, and counts entries per kind', async () => {
    const before = await packOf(north)
    expect(before!.categories.every((x) => !x.enabled)).toBe(true)
    await switchPack(north, true)
    const after = (await packOf(north))!
    expect(after.categories.map((x) => [x.category, x.enabled, x.pinned_version])).toEqual([
      ['creatures', true, 1],
      ['spells', true, 1],
      ['classes', true, 1],
      ['items', true, 1],
    ])
    // Creature traits are not listed; kinds add up to entries.
    const creatures = after.categories.find((x) => x.category === 'creatures')!
    expect(creatures).toMatchObject({ entries: 2, hidden: 0, kinds: { creature: 2 } })
    expect(after.categories.find((x) => x.category === 'classes')!.kinds).toEqual({
      class: 1,
      subclass: 1,
      feature: 2,
    })
    await hide(north, 'feature', 'skald-chill')
    expect(await categoryOf(north, 'classes')).toMatchObject({ entries: 4, hidden: 1 })
    // Switching on again is idempotent and keeps the hidden entry.
    await switchPack(north, true)
    expect(await categoryOf(north, 'classes')).toMatchObject({ enabled: true, hidden: 1 })
    // The SRD categories carry kinds as well.
    expect((await categoryOf(srd, 'rules')).kinds).toEqual({ condition: 1 })
  })

  it('turns the base pack off with its bestiary record, and on again', async () => {
    await asUser(dm)
    expect(await scalar<Json>('select public.get_srd_bestiary($1) result', [c])).toMatchObject({
      downloaded: true,
    })
    await hide(srd, 'creature', 'kobold')
    await switchPack(srd, false)
    expect((await packOf(srd))!.categories.every((x) => !x.enabled)).toBe(true)
    await asUser(dm)
    expect(await scalar<Json>('select public.get_srd_bestiary($1) result', [c])).toMatchObject({
      downloaded: false,
    })
    await asSystem()
    expect(
      await scalar<number>(
        'select count(*)::int result from public.campaign_srd_removed where campaign_id = $1',
        [c],
      ),
    ).toBe(0)
    await switchPack(srd, true)
    expect((await packOf(srd))!.categories.every((x) => x.enabled)).toBe(true)
    await asUser(dm)
    expect(await scalar<Json>('select public.get_srd_bestiary($1) result', [c])).toMatchObject({
      downloaded: true,
      removed: [],
    })
  })

  it('lets a DM turn off a pack that is no longer offered, and nothing else', async () => {
    await switchPack(books, true)
    expect((await packOf(books))!.categories.map((x) => [x.category, x.enabled])).toEqual([
      ['spells', true],
      ['items', true],
    ])
    await asUser(admin)
    await db.query('select public.set_content_pack_offer($1, $2, false)', [books, c])
    expect(await packOf(books)).toMatchObject({ offered: false, version: null, cover: null })
    await asUser(dm)
    await refused(
      'select public.set_campaign_content_pack($1, $2, true)',
      [c, books],
      /Invalid request/,
    )
    await refused(
      'select public.get_campaign_content_pack_changes($1, $2)',
      [c, books],
      /Invalid request/,
    )
    await switchPack(books, false)
    expect(await packOf(books)).toBeUndefined()
    expect((await pinned(books)).map((x) => x.enabled)).toEqual([false, false])
    await asUser(admin)
    await db.query('select public.set_content_pack_offer($1, $2, true)', [books, c])
  })

  it('lists hidden entries only, with the hidden total and each entry index', async () => {
    await hide(north, 'spell', 'frost-ward')
    const all = await listEntries(north, 'spells')
    expect(all).toMatchObject({ total: 2, hidden_total: 1 })
    expect(all.entries.map((e) => [e.key, e.hidden])).toEqual([
      ['frost-ward', true],
      ['ice-lance', false],
    ])
    const hidden = await listEntries(north, 'spells', true)
    expect(hidden).toMatchObject({ total: 1, hidden_total: 1 })
    expect(hidden.entries.map((e) => e.key)).toEqual(['frost-ward'])
    // The search narrows the total, never the hidden total.
    expect(await listEntries(north, 'spells', false, 'lance')).toMatchObject({
      total: 1,
      hidden_total: 1,
    })
    expect(await listEntries(north, 'spells', true, 'lance')).toMatchObject({
      total: 0,
      hidden_total: 1,
    })
    const creatures = await listEntries(north, 'creatures')
    expect(creatures.entries.find((e) => e.key === 'yeti')!.index).toEqual({
      cr: 3,
      image: yetiImage,
    })
    // An entry without an index object gets {}.
    await asSystem()
    await db.query(
      "update public.content_entry_versions set data = data - 'index' where pack_id = $1 and key = 'ice-lance'",
      [north],
    )
    expect(
      (await listEntries(north, 'spells')).entries.find((e) => e.key === 'ice-lance')!.index,
    ).toEqual({})
    // Five arguments still resolve.
    await asUser(dm)
    expect(
      await scalar<{ total: number }>(
        'select public.list_campaign_content_entries($1, $2, $3, null, 0) result',
        [c, north, 'spells'],
      ),
    ).toMatchObject({ total: 2 })
  })

  it('gives the pack a cover, and a cover-only version asks for no update', async () => {
    // Fallback: the first pictured creature, item or class.
    expect((await packOf(north))!.cover).toBe(yetiImage)
    expect((await packOf(srd))!.cover).toBeNull()
    const cover = picture(north)
    await add(north, [
      {
        kind: 'pack',
        key: 'cover',
        name_en: 'Cover',
        name_es: 'Portada',
        data: { index: { image: cover } },
      },
    ])
    await publish(north)
    const after = (await packOf(north))!
    expect(after).toMatchObject({ version: 2, cover })
    // Every category advanced on publish: nothing to review, and kind pack is never a category.
    expect(after.categories.map((x) => [x.category, x.pinned_version])).toEqual([
      ['creatures', 2],
      ['spells', 2],
      ['classes', 2],
      ['items', 2],
    ])
    await refused(
      'select public.update_campaign_content_pack($1, $2, 1)',
      [c, north],
      /Stale revision/,
    )
    expect(await digest(north)).toMatchObject({
      version: 2,
      new: 0,
      changed: 0,
      withdrawn: 0,
      categories: [],
    })
    await asUser(dm)
    const choice = (
      await scalar<{ id: string; cover: string | null }[]>(
        'select public.get_content_choices() result',
      )
    ).find((p) => p.id === north)!
    expect(choice.cover).toBe(cover)
    // Any signed-in account may sign a public pack's published cover.
    await asUser(dm)
    expect(await scalar('select private.pack_image_access($1, false) result', [cover])).toBe(true)
    // The library reads the cover draft by its kind.
    await asUser(admin)
    const drafts = await scalar<Json[]>('select public.list_content_drafts($1, $2) result', [
      north,
      'pack',
    ])
    expect(drafts).toHaveLength(1)
    expect(drafts[0]).toMatchObject({
      kind: 'pack',
      key: 'cover',
      state: 'published',
      index: { image: cover },
    })
  })

  it('falls back to the content picture when a published cover is removed', async () => {
    await add(north, [
      { kind: 'pack', key: 'cover', name_en: 'Cover', name_es: 'Portada', data: { index: {} } },
    ])
    const before = await versionOf(north)
    await asUser(admin)
    const summary = await scalar<Json>('select public.publish_content_pack($1, $2, $3) result', [
      north,
      before,
      randomUUID(),
    ])
    expect(summary).toMatchObject({ added: 0, changed: 1, removed: 0 })
    const after = (await packOf(north))!
    expect(after.cover).toBe(yetiImage)
    expect(after.categories.every((x) => x.pinned_version === after.version)).toBe(true)
    await asUser(admin)
    expect(
      (
        await scalar<Json[]>('select public.list_content_drafts($1, $2) result', [north, 'pack'])
      )[0],
    ).toMatchObject({ key: 'cover', index: {} })
  })

  it('lets the DM of an offered campaign read a private pack cover, and no one else', async () => {
    const cover = picture(books)
    await add(books, [
      {
        kind: 'pack',
        key: 'cover',
        name_en: 'Cover',
        name_es: 'Portada',
        data: { index: { image: cover } },
      },
    ])
    await publish(books)
    expect((await packOf(books))!.cover).toBe(cover)
    await asUser(dm)
    expect(await scalar('select private.pack_image_access($1, false) result', [cover])).toBe(true)
    for (const who of [otherDm, outsider]) {
      await asUser(who)
      expect(await scalar('select private.pack_image_access($1, false) result', [cover])).toBe(
        false,
      )
    }
    await asUser(otherDm)
    expect(
      (await scalar<{ id: string }[]>('select public.get_content_choices() result')).some(
        (p) => p.id === books,
      ),
    ).toBe(false)
  })

  it('updates a whole pack: refuses a stale version and advances only enabled rows', async () => {
    // Spells turned off before version 4 changes spells and creatures.
    await asUser(dm)
    await db.query('select public.set_campaign_content($1, $2, $3, false)', [c, north, 'spells'])
    await hide(north, 'creature', 'mammoth')
    await add(north, [
      entry('creature', 'yeti', 'Yeti', { cr: 4, image: yetiImage }),
      entry('spell', 'ice-lance', 'Ice Lance II'),
    ])
    await withdraw(north, 'creature', 'mammoth')
    await publish(north)
    const changes = await digest(north)
    expect(changes).toMatchObject({
      version: 4,
      new: 0,
      changed: 1,
      withdrawn: 1,
      hidden: 1,
      campaign_versions: 0,
    })
    expect(changes.categories).toEqual([
      { category: 'creatures', pinned_version: 3, new: 0, changed: 1, withdrawn: 1 },
    ])
    expect(changes.affected).toEqual([
      {
        kind: 'creature',
        key: 'mammoth',
        name_en: 'Mammoth',
        name_es: 'Mammoth',
        category: 'creatures',
        change: 'withdrawn',
        hidden: true,
        campaign_version: false,
      },
    ])
    await refused(
      'select public.update_campaign_content_pack($1, $2, 3)',
      [c, north],
      /Stale revision/,
    )
    await refused(
      'select public.update_campaign_content_pack($1, $2, null)',
      [c, north],
      /Stale revision/,
    )
    await asUser(dm)
    const result = await scalar<Pack[]>(
      'select public.update_campaign_content_pack($1, $2, 4) result',
      [c, north],
    )
    expect(
      result.find((p) => p.id === north)!.categories.find((x) => x.category === 'creatures'),
    ).toMatchObject({
      pinned_version: 4,
      entries: 1,
      hidden: 0,
    })
    expect(await pinned(north)).toEqual([
      { category: 'classes', version: 4, enabled: true },
      { category: 'creatures', version: 4, enabled: true },
      { category: 'items', version: 4, enabled: true },
      { category: 'spells', version: 3, enabled: false },
    ])
    await asSystem()
    expect(
      await scalar<number>(
        "select count(*)::int result from public.campaign_content_hidden where campaign_id = $1 and pack_id = $2 and key = 'mammoth'",
        [c, north],
      ),
    ).toBe(0)
    // Repeating the accepted version is harmless.
    await asUser(dm)
    await db.query('select public.update_campaign_content_pack($1, $2, 4)', [c, north])
    await refused('select public.update_campaign_content_pack($1, $2, 4)', [d, north], /Forbidden/)
  })

  it('orders the digest with own versions first and caps the affected list', async () => {
    await switchPack(big, true)
    const ref = big.replace(/-/g, '').slice(0, 8)
    await asUser(dm)
    await db.query('select public.save_combatant_template($1, null, null, $2, $3)', [
      c,
      JSON.stringify({ name: 'Troll', max_hp: 90, srd_id: `${ref}--troll`, srd_override: true }),
      randomUUID(),
    ])
    // Every chant hidden, then changed; the aardvark withdrawn; the troll changed.
    await asSystem()
    await db.query(
      `insert into public.campaign_content_hidden (campaign_id, pack_id, category, kind, key)
         select $1, $2, 'spells', 'spell', key from public.content_entries where pack_id = $2 and kind = 'spell'`,
      [c, big],
    )
    await asUser(admin)
    await db.query('select public.import_content_entries($1, $2, $3, false, $4)', [
      big,
      'spell',
      JSON.stringify(
        Array.from({ length: 205 }, (_, i) => ({
          key: `chant-${String(i).padStart(3, '0')}`,
          name_en: `Chant ${String(i).padStart(3, '0')}`,
          name_es: `Canto ${String(i).padStart(3, '0')}`,
          data: { index: { n: i + 1 } },
        })),
      ),
      randomUUID(),
    ])
    await add(big, [
      entry('creature', 'troll', 'Troll', { cr: 5 }),
      entry('creature', 'bog-imp', 'Bog Imp'),
    ])
    await withdraw(big, 'creature', 'aardvark')
    await publish(big)
    const changes = await digest(big)
    // The pack published its chants as version 2, which the campaign enabled.
    expect(changes).toMatchObject({
      version: 3,
      new: 1,
      changed: 206,
      withdrawn: 1,
      hidden: 205,
      campaign_versions: 1,
      affected_more: 7,
    })
    expect(changes.categories).toEqual([
      { category: 'creatures', pinned_version: 2, new: 1, changed: 1, withdrawn: 1 },
      { category: 'spells', pinned_version: 2, new: 0, changed: 205, withdrawn: 0 },
    ])
    expect(changes.affected).toHaveLength(200)
    expect(
      changes.affected.slice(0, 3).map((x) => [x.key, x.change, x.campaign_version, x.hidden]),
    ).toEqual([
      ['troll', 'changed', true, false],
      ['aardvark', 'withdrawn', false, false],
      ['chant-000', 'changed', false, true],
    ])
    expect(changes.affected.at(-1)).toMatchObject({ key: 'chant-197', category: 'spells' })
    // New entries that are not hidden are counted, never listed as affected.
    expect(changes.affected.some((x) => x.key === 'bog-imp')).toBe(false)
  })

  it('lists the creatures and templates the encounters use', async () => {
    await asUser(dm)
    expect(await scalar<Json>('select public.get_campaign_used_creatures($1) result', [c])).toEqual(
      {
        references: [],
        templates: [],
      },
    )
    const template = (
      await scalar<{ id: string }>(
        'select public.save_combatant_template($1, null, null, $2, $3) result',
        [c, JSON.stringify({ name: 'Bandit', max_hp: 11 }), randomUUID()],
      )
    ).id
    const fight = (
      await scalar<Json>('select public.create_encounter($1, $2, $3) result', [
        c,
        'Pass',
        randomUUID(),
      ])
    ).encounter_id as string
    await db.query('select public.add_combatants($1, $2, $3, $4)', [
      c,
      fight,
      JSON.stringify([
        { kind: 'npc', name: 'Wolf', count: 2, max_hp: 11, srd_id: 'wolf' },
        {
          kind: 'npc',
          name: 'Yeti',
          count: 1,
          max_hp: 51,
          srd_id: `${north.replace(/-/g, '').slice(0, 8)}--yeti`,
        },
        { kind: 'npc', template_id: template },
      ]),
      randomUUID(),
    ])
    const used = await scalar<{ references: string[]; templates: string[] }>(
      'select public.get_campaign_used_creatures($1) result',
      [c],
    )
    expect(used.references).toEqual([`${north.replace(/-/g, '').slice(0, 8)}--yeti`, 'wolf'].sort())
    expect(used.templates).toEqual([template])
    await asUser(otherDm)
    expect(await scalar<Json>('select public.get_campaign_used_creatures($1) result', [d])).toEqual(
      {
        references: [],
        templates: [],
      },
    )
  })

  it('stops reading an enabled pack whose offer was withdrawn, cover included', async () => {
    await switchPack(books, true)
    const offered = (await packOf(books))!
    expect(offered.cover).not.toBeNull()
    await asUser(admin)
    await db.query('select public.set_content_pack_offer($1, $2, false)', [books, c])
    // Listed only to be turned off: no version, no cover, no entries and no update.
    expect(await packOf(books)).toMatchObject({ offered: false, version: null, cover: null })
    await asUser(dm)
    await refused(
      'select public.list_campaign_content_entries($1, $2, $3, null, 0, false)',
      [c, books, 'spells'],
      /Invalid request/,
    )
    await refused(
      'select public.update_campaign_content_pack($1, $2, $3)',
      [c, books, offered.version],
      /Invalid request/,
    )
    await refused(
      'select public.get_campaign_content_pack_changes($1, $2)',
      [c, books],
      /Invalid request/,
    )
    const before = await pinned(books)
    expect(before.every((x) => x.enabled)).toBe(true)
    await switchPack(books, false)
    expect((await pinned(books)).map((x) => [x.category, x.version, x.enabled])).toEqual(
      before.map((x) => [x.category, x.version, false]),
    )
    await asUser(admin)
    await db.query('select public.set_content_pack_offer($1, $2, true)', [books, c])
  })

  it('refuses pack switches and updates while the base pack is not the public SRD', async () => {
    const version = await versionOf(srd)
    await asSystem()
    await db.query("update public.content_packs set visibility = 'private' where id = $1", [srd])
    await asUser(dm)
    for (const [sql, args] of [
      ['select public.set_campaign_content_pack($1, $2, true)', [c, srd]],
      ['select public.set_campaign_content_pack($1, $2, false)', [c, srd]],
      ['select public.update_campaign_content_pack($1, $2, $3)', [c, srd, version]],
      ['select public.get_campaign_content_pack_changes($1, $2)', [c, srd]],
    ] as [string, unknown[]][])
      await refused(sql, args, /Invalid request/)
    expect((await pinned(srd)).every((x) => x.enabled)).toBe(true)
    await asSystem()
    await db.query("update public.content_packs set visibility = 'public' where id = $1", [srd])
  })

  it('lets a super admin act only inside a campaign they entered, as the DM functions do', async () => {
    const calls: [string, unknown[]][] = [
      ['select public.get_campaign_content($1)', [c]],
      ['select public.set_campaign_content_pack($1, $2, true)', [c, north]],
      ['select public.get_campaign_content_pack_changes($1, $2)', [c, north]],
      ['select public.update_campaign_content_pack($1, $2, 1)', [c, north]],
      [
        'select public.list_campaign_content_entries($1, $2, $3, null, 0, true)',
        [c, north, 'spells'],
      ],
      ['select public.get_campaign_used_creatures($1)', [c]],
    ]
    await asUser(admin)
    for (const [sql, args] of calls) await refused(sql, args)
    await refused('select public.get_campaign_content($1)', [c])
    await db.query('select public.admin_enter_campaign($1)', [c])
    expect((await packOf(north, c, admin))!.offered).toBe(true)
    await switchPack(north, true, c, admin)
    await asUser(admin)
    expect(
      await scalar<{ total: number }>(
        'select public.list_campaign_content_entries($1, $2, $3, null, 0, true) result',
        [c, north, 'spells'],
      ),
    ).toMatchObject({ total: 1, hidden_total: 1 })
    expect(
      (
        await scalar<{ references: string[] }>(
          'select public.get_campaign_used_creatures($1) result',
          [c],
        )
      ).references,
    ).toContain('wolf')
    // Turning North on again resumed its spells at version 3, so they wait for this update.
    const version = await versionOf(north)
    await asUser(admin)
    const changes = await scalar<Digest>(
      'select public.get_campaign_content_pack_changes($1, $2) result',
      [c, north],
    )
    expect(changes).toMatchObject({ version, changed: 1, affected_more: 0 })
    expect(changes.categories).toEqual([
      { category: 'spells', pinned_version: 3, new: 0, changed: 1, withdrawn: 0 },
    ])
    await db.query('select public.update_campaign_content_pack($1, $2, $3)', [c, north, version])
    expect((await pinned(north)).every((x) => x.version === version && x.enabled)).toBe(true)
    await asUser(admin)
    // Entering one campaign opens no other.
    await refused('select public.get_campaign_content($1)', [d])
    await refused('select public.get_campaign_used_creatures($1)', [d])
  })
})
