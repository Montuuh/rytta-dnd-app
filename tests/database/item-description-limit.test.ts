import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

// RYT-176: an item description holds 10000 characters, so a magic item of the SRD keeps its whole
// text when it is taken into a campaign. Who may write an item is unchanged.
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

let dm: string, player: string, peer: string, otherDm: string, outsider: string
let c: string, arin: string, bea: string

const text = (length: number) => 'a'.repeat(length)
// Four bytes each in UTF-8: the worst case for the byte ceilings behind the character limits.
const wide = (length: number) => '𝔞'.repeat(length)
const propose = (campaign: string, character: string, draft: Json) =>
  scalar<{ id: string }>('select public.propose_item($1, $2, $3, 1, $4) result', [
    campaign,
    character,
    JSON.stringify(draft),
    randomUUID(),
  ])
const define = (campaign: string, item: Json) =>
  scalar<{ id: string }>('select public.save_item_definition($1, null, null, $2, $3) result', [
    campaign,
    JSON.stringify(item),
    randomUUID(),
  ])
const importItems = (campaign: string, items: Json[]) =>
  scalar<{ created_count: number; created: { key: string; id: string }[] }>(
    'select public.import_basic_items($1, $2, $3, false) result',
    [campaign, JSON.stringify(items), randomUUID()],
  )
const stored = async (id: string) => {
  await asSystem()
  return (
    await db.query<{ description: string; rarity: string; translations: Json | null }>(
      'select description, rarity, translations from public.item_definitions where id = $1',
      [id],
    )
  ).rows[0]!
}
const relic = (extra: Json = {}): Json => ({
  name: 'Relic',
  category: 'gear',
  description: 'A relic.',
  ...extra,
})

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

  dm = await user('dm')
  player = await user('player')
  peer = await user('peer')
  otherDm = await user('otherdm')
  outsider = await user('outsider')
  await asUser(dm)
  c = await scalar<string>('select public.create_campaign($1) result', ['Sunken Coast'])
  arin = await scalar<string>("select public.create_character($1, 'Arin') result", [c])
  bea = await scalar<string>("select public.create_character($1, 'Bea') result", [c])
  for (const [member, character] of [
    [player, arin],
    [peer, bea],
  ] as const) {
    await asUser(dm)
    const invitation = await scalar<string>(
      'select public.invite_character_player($1, $2, $3) result',
      [c, character, emails.get(member)],
    )
    await asUser(member)
    await db.query('select public.respond_campaign_invitation($1, true)', [invitation])
  }
  await asUser(otherDm)
  await db.query('select public.create_campaign($1)', ['Winter Keep'])
}, 120_000)

afterAll(async () => {
  await db.close()
})

describe('item description limit (RYT-176)', () => {
  it('stores a description and its translations of 10000 characters whole', async () => {
    await asUser(dm)
    const saved = await define(
      c,
      relic({
        description: text(10000),
        translations: { en: { name: 'Relic', description: text(10000) } },
      }),
    )
    const row = await stored(saved.id)
    expect(row.description).toHaveLength(10000)
    expect((row.translations as { en: { description: string } }).en.description).toHaveLength(10000)
  })

  it('holds both languages at their longest in four-byte characters', async () => {
    await asUser(dm)
    const saved = await define(c, {
      name: wide(100),
      category: 'gear',
      description: wide(10000),
      translations: {
        en: { name: wide(100), description: wide(10000) },
        es: { name: wide(100), description: wide(10000) },
      },
    })
    const row = await stored(saved.id)
    expect([...row.description]).toHaveLength(10000)
    const kept = row.translations as Record<'en' | 'es', { description: string }>
    expect([...kept.en.description]).toHaveLength(10000)
    expect([...kept.es.description]).toHaveLength(10000)
  })

  it('leaves no check with the old limit and keeps the validators closed', async () => {
    await asSystem()
    const checks = (
      await db.query<{ def: string }>(
        `select pg_get_constraintdef(k.oid) def from pg_constraint k
          where k.conrelid = 'public.item_definitions'::regclass and k.contype = 'c'
            and (pg_get_constraintdef(k.oid) like '%description%'
              or pg_get_constraintdef(k.oid) like '%translations%')`,
      )
    ).rows.map((r) => r.def)
    expect(checks).toHaveLength(2)
    expect(checks.some((def) => def.includes('char_length(description) <= 10000'))).toBe(true)
    expect(checks.some((def) => def.includes('pg_column_size(translations) <= 81920'))).toBe(true)
    for (const role of ['anon', 'authenticated'])
      for (const fn of ['private.item_draft(jsonb)', 'private.item_translations(jsonb)'])
        expect(
          await scalar<boolean>('select has_function_privilege($1, $2, $3) result', [
            role,
            fn,
            'execute',
          ]),
          `${role} ${fn}`,
        ).toBe(false)
  })

  it('keeps a Player proposal at its old size and its denials', async () => {
    const draft = relic({ description: text(2000) })
    await asUser(player)
    expect((await propose(c, arin, draft)).id).toBeTruthy()
    // The draft ceiling did not grow: a long text is the pack's, not a proposal's.
    await expect(propose(c, arin, relic({ description: wide(10000) }))).rejects.toThrow(
      /item_proposals_draft_check/,
    )
    // Someone else's character, an outsider, the DM of another campaign and anon.
    await expect(propose(c, bea, draft)).rejects.toThrow(/Forbidden/)
    for (const actor of [outsider, otherDm]) {
      await asUser(actor)
      await expect(propose(c, arin, draft)).rejects.toThrow(/Forbidden/)
    }
    await asAnon()
    await expect(propose(c, arin, draft)).rejects.toThrow(/permission denied/)
  })

  it('refuses one character more, in the description and in a translation', async () => {
    await asUser(dm)
    await expect(define(c, relic({ description: text(10001) }))).rejects.toThrow(/Invalid request/)
    await expect(
      define(c, relic({ translations: { es: { name: 'Reliquia', description: text(10001) } } })),
    ).rejects.toThrow(/Invalid request/)
    await asSystem()
    await expect(
      db.query('update public.item_definitions set description = $1', [text(10001)]),
    ).rejects.toThrow(/item_definitions_description_check/)
  })

  it('takes a pack item with a long text and its rarity into the campaign', async () => {
    await asUser(dm)
    const result = await importItems(c, [
      {
        key: 'mysteriousDeck',
        name: 'Mysterious Deck',
        description: text(8500),
        translations: {
          en: { name: 'Mysterious Deck', description: text(7800) },
          es: { name: 'Baraja misteriosa', description: text(8500) },
        },
        category: 'gear',
        icon: 'sparkles',
        slot_kind: 'none',
        rarity: 'legendary',
        properties: {},
        weight_lb: 0,
        value_gp: 200000,
      },
    ])
    expect(result.created_count).toBe(1)
    const row = await stored(result.created[0]!.id)
    expect(row.rarity).toBe('legendary')
    expect(row.description).toHaveLength(8500)
  })

  it('still refuses anon, an outsider, a Player and the DM of another campaign', async () => {
    const item = relic({ description: text(3000) })
    await asAnon()
    await expect(define(c, item)).rejects.toThrow(/permission denied/)
    await expect(importItems(c, [{ key: 'relic', ...item }])).rejects.toThrow(/permission denied/)
    for (const actor of [outsider, otherDm, player]) {
      await asUser(actor)
      await expect(define(c, item)).rejects.toThrow(/Forbidden/)
      await expect(importItems(c, [{ key: 'relic', ...item }])).rejects.toThrow(/Forbidden/)
    }
  })
})
