import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// RYT-162: campaigns choose content packs per category at a pinned version (ADR 051). Existing
// campaigns keep what they used; the campaign bestiary and campaign_content always agree.
const db = new PGlite()
type Json = Record<string, unknown>
const migration = '20261218120000_campaign_content.sql'

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
const count = async (sql: string, args: unknown[] = []) => {
  await asSystem()
  return scalar<number>(`select count(*)::int result from ${sql}`, args)
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
async function campaign(dm: string, name: string) {
  await asUser(dm)
  return scalar<string>('select public.create_campaign($1) result', [name])
}
async function join(c: string, dm: string, who: string) {
  await asUser(dm)
  const invitation = await scalar<string>('select public.invite_campaign_member($1, $2) result', [
    c,
    emails.get(who),
  ])
  await asUser(who)
  await db.query('select public.respond_campaign_invitation($1, true)', [invitation])
}
async function refused(sql: string, args: unknown[] = []) {
  await expect(db.query(sql, args)).rejects.toThrow(/Forbidden|permission denied/)
}

let editor: string, dmA: string, playerA: string, dmB: string, outsider: string
let oldCampaign: string, fresh: string, other: string, srd: string
let wolfEntry: string, koboldEntry: string

const entry = (kind: string, key: string, name: string, data: Json = {}) => ({
  kind,
  key,
  name_en: name,
  name_es: name,
  data: { en: { name }, ...data },
})
async function saveEntry(payload: Json, id: string | null = null, revision: number | null = null) {
  await asUser(editor)
  return scalar<{ id: string; revision: number }>(
    'select public.save_content_entry($1, $2, $3, $4, $5) result',
    [srd, id, revision, JSON.stringify(payload), randomUUID()],
  )
}
async function publish(version: number) {
  await asUser(editor)
  return scalar<Json>('select public.publish_content_pack($1, $2, $3) result', [
    srd,
    version,
    randomUUID(),
  ])
}
const content = async (c: string) =>
  scalar<{ id: string; slug: string; version: number; categories: Json[] }[]>(
    'select public.get_campaign_content($1) result',
    [c],
  )
const category = async (c: string, name: string) =>
  (await content(c)).find((p) => p.id === srd)!.categories.find((x) => x.category === name)!

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
  const files = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files.filter((f) => f < migration))
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))

  editor = await user('editor')
  dmA = await user('dma')
  playerA = await user('playera')
  dmB = await user('dmb')
  outsider = await user('outsider')
  await asSystem()
  await db.query('insert into private.content_editors (user_id) values ($1)', [editor])
  // Before this migration: a campaign downloaded the official bestiary and removed the kobold.
  oldCampaign = await campaign(dmA, 'Sunken Coast')
  await join(oldCampaign, dmA, playerA)
  await asUser(dmA)
  await db.query('select public.set_srd_bestiary($1, $2, null, $3)', [
    oldCampaign,
    'download',
    randomUUID(),
  ])
  await db.query('select public.set_srd_bestiary($1, $2, $3, $4)', [
    oldCampaign,
    'remove',
    'kobold',
    randomUUID(),
  ])
  other = await campaign(dmB, 'Winter Keep')
  // The SRD pack, published as version 1.
  await asUser(editor)
  srd = (
    await scalar<{ id: string }>('select public.save_content_pack(null, null, $1, $2) result', [
      JSON.stringify({ slug: 'srd-5-2-1', title_en: 'SRD 5.2.1', title_es: 'SRD 5.2.1' }),
      randomUUID(),
    ])
  ).id
  await asSystem()
  const pack = await scalar<{ revision: number }>(
    'select to_jsonb(p) result from public.content_packs p where p.id = $1',
    [srd],
  )
  await asUser(editor)
  await db.query('select public.set_content_pack_visibility($1, $2, $3, $4)', [
    srd,
    pack.revision,
    'public',
    randomUUID(),
  ])
  wolfEntry = (await saveEntry(entry('creature', 'wolf', 'Wolf', { index: { hp: 11 } }))).id
  koboldEntry = (await saveEntry(entry('creature', 'kobold', 'Kobold'))).id
  await saveEntry(entry('creature-trait', 'pack-tactics', 'Pack Tactics'))
  await saveEntry(entry('spell', 'fire-bolt', 'Fire Bolt'))
  await saveEntry(entry('condition', 'prone', 'Prone'))
  await publish(0)

  await asSystem()
  for (const file of files.filter((f) => f >= migration))
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  fresh = await campaign(dmA, 'Fresh Start')
}, 180000)
afterAll(() => db.close())

describe('campaign content (RYT-162)', () => {
  it('keeps every content table closed to clients', async () => {
    for (const table of [
      'public.content_entry_versions',
      'public.campaign_content',
      'public.campaign_content_hidden',
    ]) {
      for (const who of [dmA, playerA]) {
        await asUser(who)
        await refused(`select * from ${table}`)
        await refused(`delete from ${table}`)
      }
      await asAnon()
      await refused(`select * from ${table}`)
    }
  })

  it('refuses every campaign content RPC to anon, outsider, Player and the DM of another campaign', async () => {
    const calls: [string, unknown[]][] = [
      ['select public.get_campaign_content($1)', ['C']],
      ['select public.set_campaign_content($1, $2, $3, true)', ['C', 'P', 'spells']],
      ['select public.get_campaign_content_changes($1, $2, $3)', ['C', 'P', 'spells']],
      ['select public.update_campaign_content($1, $2, $3, 1)', ['C', 'P', 'spells']],
      ['select public.list_campaign_content_entries($1, $2, $3, null, 0)', ['C', 'P', 'spells']],
      [
        'select public.set_campaign_content_hidden($1, $2, $3, $4, true)',
        ['C', 'P', 'spell', 'fire-bolt'],
      ],
    ]
    const args = (list: unknown[]) =>
      list.map((a) => (a === 'C' ? oldCampaign : a === 'P' ? srd : a))
    await asAnon()
    for (const [sql, list] of calls) await refused(sql, args(list))
    for (const who of [outsider, playerA, dmB]) {
      await asUser(who)
      for (const [sql, list] of calls) await refused(sql, args(list))
    }
  })

  it('keeps what an existing campaign used, and gives a new one the whole SRD', async () => {
    await asUser(dmA)
    const old = (await content(oldCampaign)).find((p) => p.id === srd)!
    expect(old.categories.map((c) => [c.category, c.enabled, c.pinned_version])).toEqual([
      ['creatures', true, 1],
      ['spells', true, 1],
      ['rules', true, 1],
    ])
    expect(await category(oldCampaign, 'creatures')).toMatchObject({ entries: 2, hidden: 1 })
    // The campaign that never downloaded the bestiary keeps no creatures.
    await asUser(dmB)
    expect((await category(other, 'creatures')).enabled).toBe(false)
    expect((await category(other, 'spells')).enabled).toBe(true)
    // A new campaign starts with every SRD category, its bestiary included.
    await asUser(dmA)
    for (const name of ['creatures', 'spells', 'rules'])
      expect((await category(fresh, name)).enabled).toBe(true)
    expect(await scalar<Json>('select public.get_srd_bestiary($1) result', [fresh])).toMatchObject({
      downloaded: true,
      removed: [],
    })
  })

  it('lists entries at the campaign version and hides through the bestiary for SRD creatures', async () => {
    await asUser(dmA)
    const listed = await scalar<{ total: number; entries: Json[] }>(
      'select public.list_campaign_content_entries($1, $2, $3, null, 0) result',
      [oldCampaign, srd, 'creatures'],
    )
    // Creature traits are not chosen one by one.
    expect(listed.entries.map((e) => [e.key, e.hidden])).toEqual([
      ['kobold', true],
      ['wolf', false],
    ])
    expect(
      (
        await scalar<{ entries: Json[] }>(
          'select public.list_campaign_content_entries($1, $2, $3, $4, 0) result',
          [oldCampaign, srd, 'creatures', 'wol'],
        )
      ).entries.map((e) => e.key),
    ).toEqual(['wolf'])
    await db.query('select public.set_campaign_content_hidden($1, $2, $3, $4, true)', [
      oldCampaign,
      srd,
      'creature',
      'wolf',
    ])
    expect(
      await scalar<Json>('select public.get_srd_bestiary($1) result', [oldCampaign]),
    ).toMatchObject({
      removed: ['kobold', 'wolf'],
    })
    await db.query('select public.set_campaign_content_hidden($1, $2, $3, $4, false)', [
      oldCampaign,
      srd,
      'creature',
      'wolf',
    ])
    // Other kinds use the campaign's own hidden list.
    await db.query('select public.set_campaign_content_hidden($1, $2, $3, $4, true)', [
      oldCampaign,
      srd,
      'spell',
      'fire-bolt',
    ])
    expect(await category(oldCampaign, 'spells')).toMatchObject({ hidden: 1 })
    await expect(
      db.query('select public.set_campaign_content_hidden($1, $2, $3, $4, true)', [
        oldCampaign,
        srd,
        'spell',
        'not-a-spell',
      ]),
    ).rejects.toThrow(/Invalid/)
  })

  it('pins the version: a new pack version waits for the DM, who reviews and accepts it', async () => {
    const wolf = await scalar<{ revision: number }>('select public.get_content_draft($1) result', [
      wolfEntry,
    ]).catch(async () => {
      await asUser(editor)
      return scalar<{ revision: number }>('select public.get_content_draft($1) result', [wolfEntry])
    })
    await saveEntry(
      entry('creature', 'wolf', 'Wolf', { index: { hp: 13 } }),
      wolfEntry,
      wolf.revision,
    )
    await asUser(editor)
    const kobold = await scalar<{ revision: number }>(
      'select public.get_content_draft($1) result',
      [koboldEntry],
    )
    await db.query('select public.delete_content_entry($1, $2, $3)', [
      koboldEntry,
      kobold.revision,
      randomUUID(),
    ])
    await saveEntry(entry('creature', 'owlbear', 'Owlbear'))
    await publish(1)

    await asUser(dmA)
    // Nothing changed for the campaign yet.
    expect(await category(oldCampaign, 'creatures')).toMatchObject({
      pinned_version: 1,
      entries: 2,
    })
    const changes = await scalar<{ pinned_version: number; version: number; changes: Json[] }>(
      'select public.get_campaign_content_changes($1, $2, $3) result',
      [oldCampaign, srd, 'creatures'],
    )
    expect(changes).toMatchObject({ pinned_version: 1, version: 2 })
    expect(changes.changes.map((c) => [c.key, c.change, c.hidden])).toEqual([
      ['kobold', 'withdrawn', true],
      ['owlbear', 'new', false],
      ['wolf', 'changed', false],
    ])
    await expect(
      db.query('select public.update_campaign_content($1, $2, $3, 1)', [
        oldCampaign,
        srd,
        'creatures',
      ]),
    ).rejects.toThrow(/Stale revision/)
    await db.query('select public.update_campaign_content($1, $2, $3, 2)', [
      oldCampaign,
      srd,
      'creatures',
    ])
    expect(await category(oldCampaign, 'creatures')).toMatchObject({
      pinned_version: 2,
      entries: 2,
      hidden: 0,
    })
    // The bestiary keeps its removal: until RYT-094 it still lists its bundled creatures.
    expect(await count('public.campaign_srd_removed where campaign_id = $1', [oldCampaign])).toBe(1)
    expect(
      await count('public.campaign_content_hidden where campaign_id = $1 and category = $2', [
        oldCampaign,
        'creatures',
      ]),
    ).toBe(0)
  })

  it('keeps the bestiary and campaign content in step both ways', async () => {
    await asUser(dmA)
    await db.query('select public.set_campaign_content($1, $2, $3, false)', [
      fresh,
      srd,
      'creatures',
    ])
    expect(await scalar<Json>('select public.get_srd_bestiary($1) result', [fresh])).toMatchObject({
      downloaded: false,
    })
    await db.query('select public.set_srd_bestiary($1, $2, null, $3)', [
      fresh,
      'download',
      randomUUID(),
    ])
    expect((await category(fresh, 'creatures')).enabled).toBe(true)
    await db.query('select public.set_srd_bestiary($1, $2, null, $3)', [
      fresh,
      'remove_all',
      randomUUID(),
    ])
    expect((await category(fresh, 'creatures')).enabled).toBe(false)
    // Turning a category off keeps its version and hidden entries; turning it on resumes them,
    // so a newer pack version still waits for review.
    await db.query('select public.set_campaign_content($1, $2, $3, false)', [
      oldCampaign,
      srd,
      'spells',
    ])
    expect(await category(oldCampaign, 'spells')).toMatchObject({ enabled: false })
    await expect(
      db.query('select public.list_campaign_content_entries($1, $2, $3, null, 0) result', [
        oldCampaign,
        srd,
        'spells',
      ]),
    ).rejects.toThrow(/Invalid/)
    await db.query('select public.set_campaign_content($1, $2, $3, true)', [
      oldCampaign,
      srd,
      'spells',
    ])
    // Version 2 did not change spells, so the campaign followed it on publish (RYT-166).
    expect(await category(oldCampaign, 'spells')).toMatchObject({
      enabled: true,
      pinned_version: 2,
      hidden: 1,
    })
    await asUser(dmA)
    await expect(
      db.query('select public.set_campaign_content($1, $2, $3, true)', [oldCampaign, srd, 'items']),
    ).rejects.toThrow(/Invalid/)
    await expect(
      db.query('select public.set_campaign_content($1, $2, $3, true)', [oldCampaign, srd, 'magic']),
    ).rejects.toThrow(/Invalid/)
  })

  it('records each published version of the entries', async () => {
    await asSystem()
    const rows = (
      await db.query<{ key: string; version: number; withdrawn: boolean }>(
        "select key, version, data is null withdrawn from public.content_entry_versions where pack_id = $1 and kind = 'creature' order by key, version",
        [srd],
      )
    ).rows
    expect(rows).toEqual([
      { key: 'kobold', version: 1, withdrawn: false },
      { key: 'kobold', version: 2, withdrawn: true },
      { key: 'owlbear', version: 2, withdrawn: false },
      { key: 'wolf', version: 1, withdrawn: false },
      { key: 'wolf', version: 2, withdrawn: false },
    ])
    const def = await scalar<string>(
      "select pg_get_functiondef('public.delete_my_account(text,uuid)'::regprocedure) result",
    )
    expect(def).toContain(
      'update public.campaign_content set updated_by = null where updated_by = viewer;',
    )
  })

  it('refuses creature traits, and a pack that stopped being public keeps only its switch', async () => {
    await asUser(dmA)
    await expect(
      db.query('select public.set_campaign_content_hidden($1, $2, $3, $4, true)', [
        oldCampaign,
        srd,
        'creature-trait',
        'pack-tactics',
      ]),
    ).rejects.toThrow(/Invalid/)
    // The SRD made private: the campaign still sees what it uses, nothing newer.
    await asSystem()
    await db.query("update public.content_packs set visibility = 'private' where id = $1", [srd])
    await asUser(dmA)
    const pack = (await content(oldCampaign)).find((p) => p.id === srd)! as Json
    expect(pack).toMatchObject({ offered: false, version: null })
    for (const [sql, args] of [
      ['select public.get_campaign_content_changes($1, $2, $3)', [oldCampaign, srd, 'creatures']],
      ['select public.update_campaign_content($1, $2, $3, 2)', [oldCampaign, srd, 'creatures']],
      [
        'select public.list_campaign_content_entries($1, $2, $3, null, 0)',
        [oldCampaign, srd, 'creatures'],
      ],
      [
        'select public.set_campaign_content_hidden($1, $2, $3, $4, true)',
        [oldCampaign, srd, 'creature', 'wolf'],
      ],
      ['select public.set_campaign_content($1, $2, $3, false)', [oldCampaign, srd, 'rules']],
    ] as [string, unknown[]][])
      await expect(db.query(sql, args)).rejects.toThrow(/Invalid/)
    // Another campaign that uses it for spells still lists it, to turn it off.
    await asUser(dmB)
    expect((await content(other)).some((p) => p.id === srd)).toBe(true)
    await asSystem()
    await db.query("update public.content_packs set visibility = 'public' where id = $1", [srd])
  })
})
