import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// RYT-164, RYT-165: spells, class features and rules come from the campaign's packs, for
// every active member; the glossary outside a campaign reads the published SRD.
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
async function refused(sql: string, args: unknown[], error = /Forbidden|permission denied/) {
  await expect(db.query(sql, args)).rejects.toThrow(error)
}

type RulePack = {
  id: string
  ref: string
  srd: boolean
  category: string
  version: number
  enabled: boolean
  hidden: string[]
}
let editor: string, dm: string, player: string, otherDm: string, outsider: string, gone: string
let srd: string, north: string, c: string

const glossaryEntry = (kind: string, key: string, name: string, index: Json = {}, es = true) => ({
  kind,
  key,
  name_en: name,
  name_es: es ? `${name} (es)` : '',
  data: {
    index: {
      id: `${kind}.${key}`,
      cat: kind,
      en: name,
      ...(es ? { es: `${name} (es)` } : {}),
      ...index,
    },
    en: { page: 1, summary: `${name} summary`, blocks: [{ p: 'Text' }] },
    ...(es ? { es: { page: 1, summary: `${name} resumen`, blocks: [{ p: 'Texto' }] } } : {}),
  },
})
const packs = async (campaign = c) =>
  scalar<RulePack[]>('select public.get_campaign_rule_packs($1) result', [campaign])
const part = async (target: string, category: string, version: number, which: string) =>
  scalar<Json>('select public.get_campaign_rule_pack($1, $2, $3, $4, $5) result', [
    c,
    target,
    category,
    version,
    which,
  ])

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
  gone = await user('gone')
  otherDm = await user('otherdm')
  outsider = await user('outsider')
  await asSystem()
  await db.query('insert into private.content_editors (user_id) values ($1)', [editor])
  srd = await pack('srd-5-2-1', [
    glossaryEntry('spell', 'fireball', 'Fireball', { lv: 3, sc: 'evocation', cl: ['wizard'] }),
    glossaryEntry('spell', 'wish', 'Wish', { lv: 9, sc: 'conjuration', cl: ['wizard'] }),
    glossaryEntry('feature', 'barbarian-rage', 'Rage', { fc: 'barbarian', lv: 1 }),
    glossaryEntry('condition', 'blinded', 'Blinded'),
    {
      kind: 'table',
      key: 'creature-baselines',
      name_en: 'Baselines',
      name_es: 'Bases',
      data: { rows: [] },
    },
  ])
  north = await pack('northern-lore', [
    glossaryEntry('spell', 'frost-lance', 'Frost Lance', { lv: 1 }, false),
  ])

  await asUser(dm)
  c = await scalar<string>('select public.create_campaign($1) result', ['Sunken Coast'])
  for (const who of [player, gone]) {
    await asUser(dm)
    const invitation = await scalar<string>('select public.invite_campaign_member($1, $2) result', [
      c,
      emails.get(who),
    ])
    await asUser(who)
    await db.query('select public.respond_campaign_invitation($1, true)', [invitation])
  }
  await asSystem()
  await db.query(
    'update public.campaign_members set active = false where campaign_id = $1 and user_id = $2',
    [c, gone],
  )
  await asUser(dm)
  await db.query('select public.set_campaign_content($1, $2, $3, true)', [c, north, 'spells'])
  await db.query('select public.set_campaign_content_hidden($1, $2, $3, $4, true)', [
    c,
    srd,
    'spell',
    'wish',
  ])
  await asUser(otherDm)
  await db.query('select public.create_campaign($1)', ['Winter Keep'])
}, 180000)
afterAll(() => db.close())

describe('pack rules (RYT-164, RYT-165)', () => {
  it('lets every active member read, and refuses anon, outsiders, inactive members and other campaigns', async () => {
    const reads: [string, unknown[]][] = [
      ['select public.get_campaign_rule_packs($1)', [c]],
      ['select public.get_campaign_rule_pack($1, $2, $3, 1, $4)', [c, srd, 'spells', 'index']],
    ]
    for (const [sql, args] of reads) {
      await asAnon()
      await refused(sql, args)
      for (const who of [outsider, gone, otherDm]) {
        await asUser(who)
        await refused(sql, args)
      }
      for (const who of [dm, player]) {
        await asUser(who)
        await db.query(sql, args)
      }
    }
    await asAnon()
    await refused('select public.get_srd_rule_pack($1, $2)', ['rules', 'index'])
  })

  it('lists the spells, classes and rules packs with their hidden glossary ids', async () => {
    await asUser(player)
    const ref = north.replace(/-/g, '').slice(0, 8)
    expect((await packs()).map((p) => [p.id, p.category, p.version, p.enabled, p.hidden])).toEqual([
      [srd, 'spells', 1, true, ['spell.wish']],
      [srd, 'classes', 1, true, []],
      [srd, 'rules', 1, true, []],
      [north, 'spells', 1, true, []],
    ])
    expect((await packs()).find((p) => p.id === north)!.ref).toBe(ref)
  })

  it('serves glossary rows and bodies: SRD ids as stored, other packs namespaced, no tables', async () => {
    await asUser(player)
    const spells = (await part(srd, 'spells', 1, 'index')) as { rows: Json[] }
    expect(spells.rows.map((r) => r.id)).toEqual(['spell.fireball', 'spell.wish'])
    expect(spells.rows[0]).toMatchObject({
      id: 'spell.fireball',
      cat: 'spell',
      lv: 3,
      sc: 'evocation',
    })
    const rules = (await part(srd, 'rules', 1, 'index')) as { rows: Json[] }
    expect(rules.rows.map((r) => r.id)).toEqual(['condition.blinded'])
    const ref = north.replace(/-/g, '').slice(0, 8)
    const lore = (await part(north, 'spells', 1, 'index')) as { rows: Json[] }
    expect(lore.rows).toEqual([
      expect.objectContaining({
        id: `spell.${ref}--frost-lance`,
        cat: 'spell',
        en: 'Frost Lance',
        es: 'Frost Lance',
      }),
    ])
    const es = (await part(north, 'spells', 1, 'es')) as { bodies: Json }
    expect(Object.keys(es.bodies)).toEqual([`spell.${ref}--frost-lance`])
    expect(es.bodies[`spell.${ref}--frost-lance`]).toMatchObject({ summary: 'Frost Lance summary' })
  })

  it('refuses other versions, categories outside the glossary and packs no longer offered', async () => {
    await asUser(player)
    await refused(
      'select public.get_campaign_rule_pack($1, $2, $3, 2, $4)',
      [c, srd, 'spells', 'index'],
      /Stale revision/,
    )
    await refused(
      'select public.get_campaign_rule_pack($1, $2, $3, 1, $4)',
      [c, srd, 'creatures', 'index'],
      /Invalid request/,
    )
    await refused(
      'select public.get_campaign_rule_pack($1, $2, $3, 1, $4)',
      [c, srd, 'spells', 'fr'],
      /Invalid request/,
    )
    await visibility(north, 'private')
    await asUser(player)
    expect((await packs()).some((p) => p.id === north)).toBe(false)
    await refused(
      'select public.get_campaign_rule_pack($1, $2, $3, 1, $4)',
      [c, north, 'spells', 'index'],
      /Invalid request/,
    )
    await visibility(north, 'public')
  })

  it('serves the published SRD outside a campaign to any signed-in account', async () => {
    await asUser(outsider)
    const rules = await scalar<{ version: number; rows: Json[]; pack: string }>(
      'select public.get_srd_rule_pack($1, $2) result',
      ['rules', 'index'],
    )
    expect(rules).toMatchObject({ version: 1, pack: srd })
    expect(rules.rows.map((r) => r.id)).toEqual(['condition.blinded'])
    const en = await scalar<{ bodies: Json }>('select public.get_srd_rule_pack($1, $2) result', [
      'spells',
      'en',
    ])
    expect(Object.keys(en.bodies).sort()).toEqual(['spell.fireball', 'spell.wish'])
    await refused('select public.get_srd_rule_pack($1, $2)', ['items', 'index'], /Invalid request/)
  })

  it('keeps the new functions closed to anon', async () => {
    await asSystem()
    // The helpers do no authorization of their own: nobody but the RPCs may call them.
    for (const fn of [
      'private.rule_pack_part(uuid,text,integer,text)',
      'private.campaign_rule_require_member(uuid)',
    ])
      for (const role of ['anon', 'authenticated'])
        expect(
          await scalar<boolean>(
            `select has_function_privilege('${role}', '${fn}', 'execute') result`,
          ),
        ).toBe(false)
    for (const fn of [
      'public.get_campaign_rule_packs(uuid)',
      'public.get_campaign_rule_pack(uuid,uuid,text,integer,text)',
      'public.get_srd_rule_pack(text,text)',
    ])
      expect(
        await scalar<boolean>(`select has_function_privilege('anon', '${fn}', 'execute') result`),
      ).toBe(false)
  })
})
