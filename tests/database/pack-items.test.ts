import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// RYT-166: items come from the campaign's packs (DM readers). RYT-163: private packs are offered
// only to the campaigns a super admin adds (RYT-173: super admins alone write the library).
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

type ItemPack = {
  id: string
  ref: string
  slug: string
  srd: boolean
  version: number
  enabled: boolean
  hidden: string[]
}
let editor: string, owner: string, admin: string, dm: string, player: string, otherDm: string
let outsider: string
let srd: string, books: string, c: string, d: string, impostor: string

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
const itemPacks = async (campaign = c) =>
  scalar<ItemPack[]>('select public.get_campaign_item_packs($1) result', [campaign])
const itemPack = async (target: string, version: number, campaign = c) =>
  scalar<{ version: number; entries: Json[] }>(
    'select public.get_campaign_item_pack($1, $2, $3) result',
    [campaign, target, version],
  )
const content = async (campaign = c) =>
  scalar<{ id: string; offered: boolean }[]>('select public.get_campaign_content($1) result', [
    campaign,
  ])
const offer = async (target: string, campaign: string, offered: boolean) =>
  scalar<{ offered: { id: string }[]; mine: { id: string }[] }>(
    'select public.set_content_pack_offer($1, $2, $3) result',
    [target, campaign, offered],
  )

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
  otherDm = await user('otherdm')
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
  d = await campaign(otherDm, 'Winter Keep')
  // The SRD publishes its items as version 2.
  await add(
    srd,
    [item('longsword', 'Longsword', { key: 'longsword' }), item('rope', 'Rope')],
    admin,
  )
  await publish(srd, 1, admin)
  // A default slug owned by an account that neither owns the SRD nor is a super admin reaches no
  // one: the pack is published private, handed to that account and only then made public.
  impostor = await pack(
    'rytta-basics',
    [item('travel-rations', 'Rations', { key: 'travelRations' })],
    admin,
    false,
  )
  await asSystem()
  await db.query('update public.content_packs set owner_id = $1 where id = $2', [editor, impostor])
  await visibility(impostor, 'public')
  books = await pack(
    'owner-books',
    [item('moon-blade', 'Moon Blade'), spell('moon-ray')],
    owner,
    false,
  )
}, 180000)
afterAll(() => db.close())

describe('pack items (RYT-166)', () => {
  it('lets only the campaign DM read item packs', async () => {
    const reads: [string, unknown[]][] = [
      ['select public.get_campaign_item_packs($1)', [c]],
      ['select public.get_campaign_item_pack($1, $2, 2)', [c, srd]],
    ]
    for (const [sql, args] of reads) {
      await asAnon()
      await refused(sql, args)
      for (const who of [outsider, player, otherDm]) {
        await asUser(who)
        await refused(sql, args)
      }
      await asUser(dm)
      await db.query(sql, args)
    }
  })

  it('enables the first SRD and Rytta items everywhere and advances unchanged categories', async () => {
    // The Rytta basics only count when the SRD's owner or a super admin owns them.
    await asUser(dm)
    expect((await itemPacks()).map((p) => p.slug)).toEqual(['srd-5-2-1'])
    await asSystem()
    await db.query('update public.content_packs set owner_id = $1 where id = $2', [admin, impostor])
    await visibility(impostor, 'private')
    await visibility(impostor, 'public')
    await asUser(dm)
    expect((await itemPacks()).map((p) => [p.slug, p.version, p.enabled, p.hidden])).toEqual([
      ['srd-5-2-1', 2, true, []],
      ['rytta-basics', 1, true, []],
    ])
    await asSystem()
    // Spells did not change in version 2: the campaign follows without a review.
    expect(
      await scalar<number>(
        "select version result from public.campaign_content where campaign_id = $1 and pack_id = $2 and category = 'spells'",
        [c, srd],
      ),
    ).toBe(2)
    const fresh = await campaign(outsider, 'New Table')
    await asUser(outsider)
    expect((await itemPacks(fresh)).map((p) => [p.slug, p.version])).toEqual([
      ['srd-5-2-1', 2],
      ['rytta-basics', 1],
    ])
  })

  it('serves the items at the pinned version with their data and hidden keys', async () => {
    await asUser(dm)
    const part = await itemPack(srd, 2)
    expect(part.entries.map((e) => e.key)).toEqual(['longsword', 'rope'])
    expect(part.entries[0]).toMatchObject({
      name_en: 'Longsword',
      data: { index: { key: 'longsword', costCp: 1500 }, en: { description: 'Longsword text' } },
    })
    await refused('select public.get_campaign_item_pack($1, $2, 1)', [c, srd], /Stale revision/)
    await db.query('select public.set_campaign_content_hidden($1, $2, $3, $4, true)', [
      c,
      srd,
      'item',
      'rope',
    ])
    expect((await itemPacks()).find((p) => p.srd)!.hidden).toEqual(['rope'])
    // A changed item asks for review: the campaign keeps version 2 until its DM updates.
    await add(srd, [item('rope', 'Silk Rope')], admin)
    await publish(srd, 2, admin)
    await asUser(dm)
    expect((await itemPacks()).find((p) => p.srd)!.version).toBe(2)
  })
})

describe('private packs (RYT-163)', () => {
  it('keeps a private pack away from campaigns it is not offered to', async () => {
    await asUser(dm)
    expect((await content()).some((p) => p.id === books)).toBe(false)
    await refused(
      'select public.set_campaign_content($1, $2, $3, true)',
      [c, books, 'items'],
      /Invalid request/,
    )
    await refused(
      'select public.list_campaign_content_entries($1, $2, $3, null, 50)',
      [c, books, 'items'],
      /Invalid request/,
    )
  })

  it('lets only a super admin manage offers', async () => {
    const sql = 'select public.get_content_pack_offers($1)'
    await asAnon()
    await refused(sql, [books])
    // RYT-173: a content editor grant alone manages nothing.
    for (const who of [outsider, dm, player, editor]) {
      await asUser(who)
      await refused(sql, [books])
      await refused('select public.set_content_pack_offer($1, $2, true)', [books, c])
    }
    // Owning the pack is not enough either.
    await asSystem()
    await db.query('update public.content_packs set owner_id = $1 where id = $2', [editor, books])
    await asUser(editor)
    await refused(sql, [books])
    await refused('select public.set_content_pack_offer($1, $2, true)', [books, c])
    await asSystem()
    await db.query('update public.content_packs set owner_id = $1 where id = $2', [owner, books])
    await asUser(owner)
    expect(await scalar<Json>(`${sql} result`, [books])).toMatchObject({
      pack: books,
      offered: [],
      super_admin: true,
    })
  })

  it('lets a super admin offer a private pack to any campaign', async () => {
    const own = await campaign(owner, 'Owner Table')
    await asUser(owner)
    const mine = await offer(books, own, true)
    expect(mine.offered.map((x) => x.id)).toEqual([own])
    expect(mine.mine.map((x) => x.id)).toEqual([own])
    await asUser(admin)
    const all = await offer(books, c, true)
    expect(all.offered.map((x) => x.id).sort()).toEqual([own, c].sort())
    // Public packs take no offers, but an old offer can always be removed.
    await refused('select public.set_content_pack_offer($1, $2, true)', [srd, c], /Invalid request/)
    await db.query('select public.set_content_pack_offer($1, $2, false)', [srd, c])
    // A missing campaign is refused.
    await asUser(owner)
    await refused(
      'select public.set_content_pack_offer($1, $2, true)',
      [books, randomUUID()],
      /Invalid request/,
    )
  })

  it('lets an offered campaign use the pack, and stops reading it once removed', async () => {
    await asUser(dm)
    expect((await content()).find((p) => p.id === books)).toMatchObject({ offered: true })
    await db.query('select public.set_campaign_content($1, $2, $3, true)', [c, books, 'items'])
    expect((await itemPacks()).some((p) => p.id === books)).toBe(true)
    expect((await itemPack(books, 1)).entries.map((e) => e.key)).toEqual(['moon-blade'])
    await asUser(otherDm)
    expect((await content(d)).some((p) => p.id === books)).toBe(false)
    await refused(
      'select public.list_campaign_content_entries($1, $2, $3, null, 50)',
      [d, books, 'items'],
      /Invalid request/,
    )
    await asUser(owner)
    await offer(books, c, false)
    await asUser(dm)
    expect((await content()).find((p) => p.id === books)).toMatchObject({ offered: false })
    expect((await itemPacks()).some((p) => p.id === books)).toBe(false)
    await refused('select public.get_campaign_item_pack($1, $2, 1)', [c, books], /Invalid request/)
    // Its DM can still turn it off; then it leaves the list.
    await db.query('select public.set_campaign_content($1, $2, $3, false)', [c, books, 'items'])
    expect((await content()).some((p) => p.id === books)).toBe(false)
  })

  it('clears a deleted account from the offers and drops the one-argument check', async () => {
    await asSystem()
    expect(
      await scalar<string | null>(
        "select to_regprocedure('private.content_offered(uuid)')::text result",
      ),
    ).toBeNull()
    const def = await scalar<string>(
      "select pg_get_functiondef('public.delete_my_account(text,uuid)'::regprocedure) result",
    )
    expect(def).toContain('content_pack_offers set added_by = null where added_by = viewer')
  })

  it('keeps the new functions and the offers table closed', async () => {
    await asSystem()
    for (const fn of [
      'private.content_offered(uuid,uuid)',
      'private.content_offer_manager(uuid,boolean)',
      'private.content_default_item_pack(uuid)',
    ])
      for (const role of ['anon', 'authenticated'])
        expect(
          await scalar<boolean>(
            `select has_function_privilege('${role}', '${fn}', 'execute') result`,
          ),
        ).toBe(false)
    for (const fn of [
      'public.get_content_pack_offers(uuid)',
      'public.set_content_pack_offer(uuid,uuid,boolean)',
      'public.get_campaign_item_packs(uuid)',
      'public.get_campaign_item_pack(uuid,uuid,integer)',
    ])
      expect(
        await scalar<boolean>(`select has_function_privilege('anon', '${fn}', 'execute') result`),
      ).toBe(false)
    expect(
      await scalar<boolean>(
        "select has_table_privilege('authenticated', 'public.content_pack_offers', 'select') result",
      ),
    ).toBe(false)
  })
})
