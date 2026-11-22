import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// RYT-094: the bestiary, combat and the encounter builder read creatures from the campaign's
// packs. Creatures from packs other than the SRD are stored as '<ref>--<key>'.
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

type Pack = {
  id: string
  ref: string
  srd: boolean
  version: number
  enabled: boolean
  hidden: string[]
}
let editor: string, dm: string, player: string, otherDm: string, outsider: string
let srd: string, north: string, unused: string, c: string, otherCampaign: string

const creature = (key: string, name: string, languages: ('en' | 'es')[], hp = 11) => ({
  kind: 'creature',
  key,
  name_en: name,
  name_es: languages.includes('es') ? name : '',
  data: {
    index: { en: name, es: name, cr: '1', hp },
    ...Object.fromEntries(languages.map((l) => [l, { name: `${name} (${l})` }])),
  },
})
async function pack(slug: string, entries: Json[]) {
  await asUser(editor)
  const id = (
    await scalar<{ id: string }>('select public.save_content_pack(null, null, $1, $2) result', [
      JSON.stringify({ slug, title_en: slug, title_es: slug }),
      randomUUID(),
    ])
  ).id
  for (const e of entries)
    await db.query('select public.save_content_entry($1, null, null, $2, $3)', [
      id,
      JSON.stringify(e),
      randomUUID(),
    ])
  await publish(id, 0)
  await visibility(id, 'public')
  return id
}
async function publish(id: string, version: number) {
  await asUser(editor)
  await db.query('select public.publish_content_pack($1, $2, $3)', [id, version, randomUUID()])
}
async function visibility(id: string, value: 'public' | 'private') {
  await asSystem()
  const revision = await scalar<number>(
    'select revision result from public.content_packs where id = $1',
    [id],
  )
  await asUser(editor)
  await db.query('select public.set_content_pack_visibility($1, $2, $3, $4)', [
    id,
    revision,
    value,
    randomUUID(),
  ])
}
const packs = async (campaign = c) =>
  scalar<Pack[]>('select public.get_campaign_creature_packs($1) result', [campaign])
const part = async (target: string, version: number, which: string) =>
  scalar<Json>('select public.get_campaign_creature_pack($1, $2, $3, $4) result', [
    c,
    target,
    version,
    which,
  ])
async function refused(sql: string, args: unknown[], error = /Forbidden|permission denied/) {
  await expect(db.query(sql, args)).rejects.toThrow(error)
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
  dm = await user('dm')
  player = await user('player')
  otherDm = await user('otherdm')
  outsider = await user('outsider')
  await asSystem()
  await db.query('insert into private.content_editors (user_id) values ($1)', [editor])
  srd = await pack('srd-5-2-1', [
    creature('wolf', 'Wolf', ['en', 'es']),
    creature('kobold', 'Kobold', ['en', 'es']),
    {
      kind: 'creature-trait',
      key: 'pack-tactics',
      name_en: 'Pack Tactics',
      name_es: 'Tácticas de manada',
      data: {
        index: { from: 'wolf', count: 2 },
        en: { name: 'Pack Tactics', text: ['Advantage.'] },
        es: { name: 'Tácticas de manada', text: ['Ventaja.'] },
      },
    },
  ])
  north = await pack('northern-beasts', [
    creature('yeti', 'Yeti', ['en'], 51),
    creature('snow-wolf', 'Snow Wolf', ['en']),
  ])
  unused = await pack('unused-beasts', [creature('mole', 'Mole', ['en'])])

  await asUser(dm)
  c = await scalar<string>('select public.create_campaign($1) result', ['Sunken Coast'])
  const invitation = await scalar<string>('select public.invite_campaign_member($1, $2) result', [
    c,
    emails.get(player),
  ])
  await asUser(player)
  await db.query('select public.respond_campaign_invitation($1, true)', [invitation])
  await asUser(dm)
  await db.query('select public.set_campaign_content($1, $2, $3, true)', [c, north, 'creatures'])
  await db.query('select public.set_campaign_content_hidden($1, $2, $3, $4, true)', [
    c,
    north,
    'creature',
    'snow-wolf',
  ])
  await db.query('select public.set_campaign_content_hidden($1, $2, $3, $4, true)', [
    c,
    srd,
    'creature',
    'kobold',
  ])
  await asUser(otherDm)
  otherCampaign = await scalar<string>('select public.create_campaign($1) result', ['Winter Keep'])
}, 180000)
afterAll(() => db.close())

describe('pack creatures (RYT-094)', () => {
  it('refuses both reads to anon, outsiders, Players and the DM of another campaign', async () => {
    const reads: [string, unknown[]][] = [
      ['select public.get_campaign_creature_packs($1)', [c]],
      ['select public.get_campaign_creature_pack($1, $2, 1, $3)', [c, srd, 'index']],
    ]
    for (const [sql, args] of reads) {
      await asAnon()
      await refused(sql, args)
      for (const who of [outsider, player, otherDm]) {
        await asUser(who)
        await refused(sql, args)
      }
    }
  })

  it('lists the creature packs the campaign has, SRD first, with fixed refs and hidden keys', async () => {
    await asUser(dm)
    const list = await packs()
    expect(list.map((p) => [p.id, p.srd, p.version, p.enabled, p.hidden])).toEqual([
      [srd, true, 1, true, ['kobold']],
      [north, false, 1, true, ['snow-wolf']],
    ])
    for (const p of list) expect(p.ref).toMatch(/^[0-9a-f]{8}$/)
    expect(list[1]!.ref).toBe(north.replace(/-/g, '').slice(0, 8))
    // A new campaign starts with the SRD creatures only.
    await asUser(otherDm)
    expect((await packs(otherCampaign)).map((p) => p.id)).toEqual([srd])
  })

  it('returns the index rows and the stat blocks in a language, falling back to the other', async () => {
    await asUser(dm)
    const index = (await part(srd, 1, 'index')) as { version: number; rows: Json[] }
    expect(index.version).toBe(1)
    expect(index.rows.map((r) => r.id)).toEqual(['kobold', 'wolf'])
    expect(index.rows[1]).toMatchObject({ id: 'wolf', hp: 11, cr: '1' })
    const es = (await part(srd, 1, 'es')) as { monsters: Json; traits: Json[] }
    expect(es.monsters.wolf).toEqual({ name: 'Wolf (es)' })
    expect(es.traits).toEqual([
      {
        key: 'pack-tactics',
        from: 'wolf',
        count: 2,
        name: 'Tácticas de manada',
        text: ['Ventaja.'],
      },
    ])
    const northEs = (await part(north, 1, 'es')) as { monsters: Json; traits: Json[] }
    expect(northEs.monsters.yeti).toEqual({ name: 'Yeti (en)' })
    expect(northEs.traits).toEqual([])
  })

  it('refuses another version, unknown parts, unused packs and packs no longer offered', async () => {
    await asUser(dm)
    await refused(
      'select public.get_campaign_creature_pack($1, $2, 2, $3)',
      [c, srd, 'index'],
      /Stale revision/,
    )
    await refused(
      'select public.get_campaign_creature_pack($1, $2, 1, $3)',
      [c, srd, 'fr'],
      /Invalid request/,
    )
    await refused(
      'select public.get_campaign_creature_pack($1, $2, 1, $3)',
      [c, unused, 'index'],
      /Invalid request/,
    )
    await visibility(unused, 'private')
    await visibility(north, 'private')
    await asUser(dm)
    expect((await packs()).map((p) => p.id)).toEqual([srd])
    await refused(
      'select public.get_campaign_creature_pack($1, $2, 1, $3)',
      [c, north, 'index'],
      /Invalid request/,
    )
    await visibility(north, 'public')
    // Turned off, the pack stays listed (fights and recaps still read its creatures).
    await asUser(dm)
    await db.query('select public.set_campaign_content($1, $2, $3, false)', [c, north, 'creatures'])
    expect((await packs()).find((p) => p.id === north)).toMatchObject({
      enabled: false,
      version: 1,
    })
    expect(((await part(north, 1, 'index')) as { rows: Json[] }).rows).toHaveLength(2)
    await db.query('select public.set_campaign_content($1, $2, $3, true)', [c, north, 'creatures'])
  })

  it('stores pack creatures as <ref>--<key> in fights, campaign versions, tokens and images', async () => {
    await asUser(dm)
    const ref = (await packs()).find((p) => p.id === north)!.ref
    const reference = `${ref}--yeti`
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
      JSON.stringify([{ kind: 'npc', name: 'Yeti', count: 1, max_hp: 51, srd_id: reference }]),
      randomUUID(),
    ])
    await asSystem()
    expect(
      await scalar<number>(
        'select count(*)::int result from public.encounter_combatants where srd_id = $1',
        [reference],
      ),
    ).toBe(1)
    // The SRD only as its bare key; never a pack the campaign does not use.
    const srdRef = srd.replace(/-/g, '').slice(0, 8)
    const unusedRef = unused.replace(/-/g, '').slice(0, 8)
    for (const bad of [
      'Yeti',
      `${ref.slice(0, 7)}--yeti`,
      `${ref}--`,
      'zzzzzzzz--yeti',
      `${srdRef}--wolf`,
      `${unusedRef}--mole`,
    ]) {
      await asUser(dm)
      await expect(
        db.query('select public.add_combatants($1, $2, $3, $4)', [
          c,
          fight,
          JSON.stringify([{ kind: 'npc', name: 'Bad', count: 1, max_hp: 5, srd_id: bad }]),
          randomUUID(),
        ]),
      ).rejects.toThrow(/check constraint|Invalid request/)
    }
    // A campaign version of the yeti, flagged when the pack changes it.
    await asUser(dm)
    await db.query('select public.save_combatant_template($1, null, null, $2, $3)', [
      c,
      JSON.stringify({ name: 'Yeti', max_hp: 60, srd_id: reference, srd_override: true }),
      randomUUID(),
    ])
    await asSystem()
    const yeti = await scalar<{ id: string; revision: number }>(
      "select jsonb_build_object('id', id, 'revision', revision) result from public.content_entries where pack_id = $1 and key = 'yeti'",
      [north],
    )
    await asUser(editor)
    await db.query('select public.save_content_entry($1, $2, $3, $4, $5)', [
      north,
      yeti.id,
      yeti.revision,
      JSON.stringify(creature('yeti', 'Yeti', ['en'], 55)),
      randomUUID(),
    ])
    await publish(north, 1)
    await asUser(dm)
    const changes = await scalar<{ changes: Json[] }>(
      'select public.get_campaign_content_changes($1, $2, $3) result',
      [c, north, 'creatures'],
    )
    expect(changes.changes).toEqual([
      expect.objectContaining({ key: 'yeti', change: 'changed', campaign_version: true }),
    ])
    // Board tokens and creature images accept the reference too.
    await asSystem()
    expect(
      await scalar<boolean>("select private.tabletop_data_ok('token', $1, '{}') result", [
        JSON.stringify({ srd_id: reference }),
      ]),
    ).toBe(true)
    expect(
      await scalar<boolean>("select private.tabletop_data_ok('token', $1, '{}') result", [
        JSON.stringify({ srd_id: `${reference}--x` }),
      ]),
    ).toBe(false)
    const path = `public/${c}/srd-${reference}/${randomUUID()}.webp`
    await db.query("insert into storage.objects(bucket_id, name) values ('creature-images', $1)", [
      path,
    ])
    await asUser(dm)
    expect(
      await scalar<boolean>('select private.creature_image_access($1, true) result', [path]),
    ).toBe(true)
    await db.query('select public.set_creature_srd_image($1, $2, $3, $4)', [
      c,
      reference,
      path,
      randomUUID(),
    ])
    await asUser(outsider)
    expect(
      await scalar<boolean>('select private.creature_image_access($1, false) result', [path]),
    ).toBe(false)
    await asUser(dm)
    await expect(
      db.query('select public.set_creature_srd_image($1, $2, $3, $4)', [
        c,
        `${unusedRef}--mole`,
        `public/${c}/srd-${unusedRef}--mole/${randomUUID()}.webp`,
        randomUUID(),
      ]),
    ).rejects.toThrow(/Invalid request/)
  })

  it('limits creature keys to 70 characters so a reference fits in 80', async () => {
    await asUser(editor)
    const long = 'a'.repeat(71)
    await expect(
      db.query('select public.save_content_entry($1, null, null, $2, $3)', [
        north,
        JSON.stringify(creature(long, 'Long', ['en'])),
        randomUUID(),
      ]),
    ).rejects.toThrow()
    await db.query('select public.save_content_entry($1, null, null, $2, $3)', [
      north,
      JSON.stringify({ ...creature('b', 'Long rule', ['en']), kind: 'rule', key: 'b'.repeat(71) }),
      randomUUID(),
    ])
  })

  it('keeps execution closed to anon and the new functions out of the public role', async () => {
    await asSystem()
    for (const fn of [
      'public.get_campaign_creature_packs(uuid)',
      'public.get_campaign_creature_pack(uuid,uuid,integer,text)',
    ]) {
      expect(
        await scalar<boolean>(`select has_function_privilege('anon', '${fn}', 'execute') result`),
      ).toBe(false)
      expect(
        await scalar<boolean>(
          `select has_function_privilege('authenticated', '${fn}', 'execute') result`,
        ),
      ).toBe(true)
    }
  })
})
