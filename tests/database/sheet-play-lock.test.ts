import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-070: the play lock during encounters and the read-only sheet history.
const migration = '20261112120000_sheet_play_lock_history.sql'
const db = new PGlite()
const dm = randomUUID(),
  player = randomUUID(),
  peer = randomUUID(),
  outsider = randomUUID()
const asUser = async (id: string) => {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
}
const asAnon = async () => {
  await db.exec('reset role; set role anon')
  await db.query("select set_config('request.jwt.claim.sub', '', false)")
}
type Json = Record<string, unknown>
const result = async <T = Json>(sql: string, args: unknown[] = []) =>
  (await db.query<{ result: T }>(sql, args)).rows[0]!.result
const build = {
  classKey: 'monk',
  baseAbilities: { str: 10, dex: 15, con: 13, int: 8, wis: 14, cha: 12 },
}

function api(schema: 'public' | 'pre') {
  return {
    save: (c: string, ch: string, rev: number, opts: { maxHp?: number; data?: unknown } = {}) =>
      db.query(`select ${schema}.save_character_sheet($1,$2,$3,3,$4,14,$5,true,$6) result`, [
        c,
        ch,
        rev,
        opts.maxHp ?? 24,
        JSON.stringify(opts.data ?? build),
        randomUUID(),
      ]),
    vitals: (
      c: string,
      ch: string,
      rev: number,
      v: { hp?: number; temp?: number; dice?: number; slots?: number[] } = {},
    ) =>
      db.query(
        `select ${schema}.set_character_vitals($1,$2,$3,$4,$5,$6,0,0,false,$7,$8,$9,$10) result`,
        [
          c,
          ch,
          rev,
          v.hp ?? 24,
          v.temp ?? 0,
          v.dice ?? 0,
          [],
          v.slots ?? [0, 0, 0, 0, 0, 0, 0, 0, 0],
          JSON.stringify({}),
          randomUUID(),
        ],
      ),
    revision: async (ch: string) =>
      (
        await db.query<{ revision: number }>(
          `select revision from ${schema}.character_vitals where character_id=$1`,
          [ch],
        )
      ).rows[0]!.revision,
    lock: (c: string, ch: string) =>
      result<{ locked: boolean; in_encounter: boolean }>(
        `select ${schema}.get_character_play_lock($1,$2) result`,
        [c, ch],
      ),
    history: (c: string, ch: string, before: string | null = null, size: number | null = null) =>
      result<
        {
          kind: string
          actor: string
          actor_name?: string
          at: string
          changes: { field: string; before: unknown; after: unknown }[]
        }[]
      >(`select ${schema}.get_character_history($1,$2,$3,$4) result`, [c, ch, before, size]),
    encounter: async (c: string, characters: string[]) => {
      const e = (
        await result<{ encounter_id: string }>(
          `select ${schema}.create_encounter($1,'Gate',$2) result`,
          [c, randomUUID()],
        )
      ).encounter_id
      await db.query(`select ${schema}.add_combatants($1,$2,$3,$4)`, [
        c,
        e,
        JSON.stringify(characters.map((id) => ({ kind: 'character', character_id: id }))),
        randomUUID(),
      ])
      return e
    },
    status: (c: string, e: string, status: string) =>
      db.query(`select ${schema}.set_encounter_status($1,$2,$3,$4)`, [c, e, status, randomUUID()]),
  }
}
const pub = api('public')

async function setup(schema: 'public' | 'pre' = 'public') {
  await asUser(dm)
  const one = async (sql: string, args: unknown[] = []) =>
    (await db.query<{ id: string }>(sql, args)).rows[0]!.id
  const c = await one(`select ${schema}.create_campaign('Lock table') id`)
  const arin = await one(`select ${schema}.create_character($1,'Arin') id`, [c])
  const bea = await one(`select ${schema}.create_character($1,'Bea') id`, [c])
  for (const [user, email, character] of [
    [player, 'player@example.com', arin],
    [peer, 'peer@example.com', bea],
  ] as const) {
    await asUser(dm)
    const id = await one(`select ${schema}.invite_character_player($1,$2,$3) id`, [
      c,
      character,
      email,
    ])
    await asUser(user)
    await db.query(`select ${schema}.respond_campaign_invitation($1,true)`, [id])
  }
  const s = api(schema)
  for (const [user, character] of [
    [player, arin],
    [peer, bea],
  ] as const) {
    await asUser(user)
    await s.save(c, character, 0)
  }
  return { c, arin, bea }
}

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`)
  for (const [id, email, name] of [
    [dm, 'dm@example.com', 'Dana DM'],
    [player, 'player@example.com', 'Pia'],
    [peer, 'peer@example.com', 'Pere'],
    [outsider, 'other@example.com', 'Otto'],
  ])
    await db.query(
      'insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values ($1,$2,now(),$3)',
      [id, email, JSON.stringify({ full_name: name })],
    )
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
}, 90000)
afterAll(() => db.close())

describe('RYT-070 play lock during encounters', () => {
  it('locks HP, temporary HP and hit dice for a Player whose character fights; the DM keeps control', async () => {
    const s = await setup()
    await asUser(player)
    await pub.vitals(s.c, s.arin, await pub.revision(s.arin), { hp: 20 })
    expect(await pub.lock(s.c, s.arin)).toEqual({ in_encounter: false, locked: false })
    await asUser(dm)
    const e = await pub.encounter(s.c, [s.arin])
    // A draft encounter is not live yet.
    await asUser(player)
    expect((await pub.lock(s.c, s.arin)).locked).toBe(false)
    await asUser(dm)
    await pub.status(s.c, e, 'initiative')
    await asUser(player)
    expect(await pub.lock(s.c, s.arin)).toEqual({ in_encounter: true, locked: true })
    let rev = await pub.revision(s.arin)
    for (const change of [{ hp: 24 }, { hp: 20, temp: 5 }, { hp: 20, dice: 1 }])
      await expect(pub.vitals(s.c, s.arin, rev, Object.assign({ hp: 20 }, change))).rejects.toThrow(
        /Encounter locked/,
      )
    // Resources stay with the Player: spending a slot is not an HP change.
    await pub.vitals(s.c, s.arin, rev, { hp: 20, slots: [1, 0, 0, 0, 0, 0, 0, 0, 0] })
    await asUser(dm)
    await pub.status(s.c, e, 'active')
    expect(await pub.lock(s.c, s.arin)).toEqual({ in_encounter: true, locked: false })
    rev = await pub.revision(s.arin)
    await pub.vitals(s.c, s.arin, rev, { hp: 12, temp: 3 })
    // A teammate outside the encounter is not locked.
    await asUser(peer)
    expect((await pub.lock(s.c, s.bea)).locked).toBe(false)
    await pub.vitals(s.c, s.bea, await pub.revision(s.bea), { hp: 10 })
    await asUser(dm)
    await pub.status(s.c, e, 'ended')
    await asUser(player)
    expect((await pub.lock(s.c, s.arin)).locked).toBe(false)
    await pub.vitals(s.c, s.arin, await pub.revision(s.arin), { hp: 24 })
  })

  it('denies the lock query to anon, outsiders, another Player and a cross-campaign DM', async () => {
    const s = await setup()
    await asAnon()
    await expect(pub.lock(s.c, s.arin)).rejects.toThrow(/permission denied/)
    await asUser(outsider)
    await expect(pub.lock(s.c, s.arin)).rejects.toThrow(/Forbidden/)
    await db.query("select public.create_campaign('Elsewhere')")
    await expect(pub.lock(s.c, s.arin)).rejects.toThrow(/Forbidden/)
    await asUser(peer)
    await expect(pub.lock(s.c, s.arin)).rejects.toThrow(/Forbidden/)
  })
})

describe('RYT-070 sheet history', () => {
  it('returns field-level changes newest first to the DM and the assigned Player', async () => {
    const s = await setup()
    await asUser(player)
    await pub.save(s.c, s.arin, 1, {
      maxHp: 30,
      data: { ...build, baseAbilities: { ...build.baseAbilities, wis: 16 } },
    })
    await pub.vitals(s.c, s.arin, await pub.revision(s.arin), { hp: 25, temp: 4 })
    await asUser(dm)
    await pub.vitals(s.c, s.arin, await pub.revision(s.arin), { hp: 18, temp: 4 })
    await asUser(player)
    const mine = await pub.history(s.c, s.arin)
    expect(mine[0]).toMatchObject({ kind: 'character_vitals:UPDATE', actor: 'dm' })
    expect(mine[0]!.changes).toEqual([{ field: 'current_hp', before: 25, after: 18 }])
    expect(mine[0]!.actor_name).toBeNull()
    expect(mine[1]).toMatchObject({ kind: 'character_vitals:UPDATE', actor: 'self' })
    const sheetEdit = mine.find(
      (item) =>
        item.kind === 'character_sheets:UPDATE' &&
        item.changes.some((change) => change.field === 'max_hp'),
    )!
    // Inventory recomputes armor class after a save, so that column may also appear.
    expect(sheetEdit.changes.map((change) => change.field)).toEqual(
      expect.arrayContaining(['max_hp', 'build.baseAbilities']),
    )
    expect(sheetEdit.changes.find((change) => change.field === 'build.baseAbilities')).toEqual({
      field: 'build.baseAbilities',
      before: build.baseAbilities,
      after: { ...build.baseAbilities, wis: 16 },
    })
    expect(mine.at(-1)).toMatchObject({ kind: 'characters:INSERT', changes: [] })
    // Paging: the first item only, then the rest before it.
    const first = await pub.history(s.c, s.arin, null, 1)
    expect(first).toHaveLength(1)
    const rest = await pub.history(s.c, s.arin, first[0]!.at, 50)
    expect(rest.length).toBe(mine.length - 1)
    await asUser(dm)
    const full = await pub.history(s.c, s.arin)
    expect(full[0]).toMatchObject({ actor: 'self', actor_name: 'Dana DM' })
    expect(full[1]).toMatchObject({ actor: 'player', actor_name: 'Pia' })
  })

  it('denies the history to anon, outsiders, another Player and a cross-campaign DM', async () => {
    const s = await setup()
    await asAnon()
    await expect(pub.history(s.c, s.arin)).rejects.toThrow(/permission denied/)
    await asUser(outsider)
    await expect(pub.history(s.c, s.arin)).rejects.toThrow(/Forbidden/)
    await db.query("select public.create_campaign('Elsewhere too')")
    await expect(pub.history(s.c, s.arin)).rejects.toThrow(/Forbidden/)
    await asUser(peer)
    await expect(pub.history(s.c, s.arin)).rejects.toThrow(/Forbidden/)
  })
})

describe('RYT-072 rename from the quick and blank sheets', () => {
  const rename = (c: string, ch: string, name: string) =>
    result<string>('select public.rename_character($1,$2,$3) result', [c, ch, name])
  it('lets the assigned Player and the DM rename, trimmed, and records it in the history', async () => {
    const s = await setup()
    await asUser(player)
    expect(await rename(s.c, s.arin, '  Ilsa Brezo ')).toBe('Ilsa Brezo')
    await expect(rename(s.c, s.arin, '   ')).rejects.toThrow(/Invalid name/)
    await expect(rename(s.c, s.arin, 'x'.repeat(101))).rejects.toThrow(/Invalid name/)
    await asUser(dm)
    await rename(s.c, s.arin, 'Ilsa')
    await asUser(player)
    const history = await pub.history(s.c, s.arin)
    expect(history[0]).toMatchObject({ kind: 'characters:UPDATE', actor: 'dm' })
    expect(history[0]!.changes).toEqual([{ field: 'name', before: 'Ilsa Brezo', after: 'Ilsa' }])
  })
  it('denies rename to anon, outsiders, another Player and a cross-campaign DM', async () => {
    const s = await setup()
    await asAnon()
    await expect(rename(s.c, s.arin, 'Nope')).rejects.toThrow(/permission denied/)
    await asUser(outsider)
    await expect(rename(s.c, s.arin, 'Nope')).rejects.toThrow(/Forbidden/)
    await db.query("select public.create_campaign('Elsewhere again')")
    await expect(rename(s.c, s.arin, 'Nope')).rejects.toThrow(/Forbidden/)
    await asUser(peer)
    await expect(rename(s.c, s.arin, 'Nope')).rejects.toThrow(/Forbidden/)
    await db.exec('reset role')
    expect(
      (await db.query<{ name: string }>('select name from public.characters where id=$1', [s.arin]))
        .rows[0]!.name,
    ).toBe('Arin')
  })
})

describe('RYT-074 portraits outside combat', () => {
  const visible = async (path: string) =>
    (
      await db.query(
        "select name from storage.objects where bucket_id = 'character-portraits' and name = $1",
        [path],
      )
    ).rows.length === 1
  const portraits = async (c: string) =>
    result<{ character_id: string; portrait_path: string }[]>(
      'select public.list_character_portraits($1) result',
      [c],
    )
  it('shows the current portrait of assigned characters to every member, never old ones', async () => {
    const s = await setup()
    const old = `public/${s.c}/${s.arin}/${randomUUID()}.webp`
    const current = `public/${s.c}/${s.arin}/${randomUUID()}.webp`
    await db.exec('reset role')
    for (const path of [old, current])
      await db.query(
        "insert into storage.objects(bucket_id, name) values ('character-portraits', $1)",
        [path],
      )
    await asUser(player)
    await db.query('select public.set_character_portrait($1,$2,$3)', [s.c, s.arin, old])
    await db.query('select public.set_character_portrait($1,$2,$3)', [s.c, s.arin, current])
    await asUser(peer)
    expect(await visible(current)).toBe(true)
    expect(await visible(old)).toBe(false)
    expect(await portraits(s.c)).toEqual([{ character_id: s.arin, portrait_path: current }])
    await asUser(player)
    expect(await visible(old)).toBe(true)
    await asUser(dm)
    expect(await portraits(s.c)).toEqual([{ character_id: s.arin, portrait_path: current }])
    // An archived character's portrait goes private again (owner and DM still read it).
    await db.query('select public.archive_character($1,$2)', [s.c, s.arin]).catch(() => undefined)
    await asUser(outsider)
    expect(await visible(current)).toBe(false)
    await expect(portraits(s.c)).rejects.toThrow(/Forbidden/)
    await db.query("select public.create_campaign('Elsewhere portraits')")
    await expect(portraits(s.c)).rejects.toThrow(/Forbidden/)
    await asAnon()
    await expect(portraits(s.c)).rejects.toThrow(/permission denied/)
  })
})

describe('RYT-070 PRE mirror', () => {
  it('mirrors the lock and the history into a PRE copied before the migration', async () => {
    const pre = api('pre')
    const s = await setup('pre')
    await asUser(dm)
    const e = await pre.encounter(s.c, [s.arin])
    await pre.status(s.c, e, 'active')
    await asUser(player)
    expect((await pre.lock(s.c, s.arin)).locked).toBe(true)
    await expect(pre.vitals(s.c, s.arin, await pre.revision(s.arin), { hp: 3 })).rejects.toThrow(
      /Encounter locked/,
    )
    expect((await pre.history(s.c, s.arin)).length).toBeGreaterThan(0)
    await expect(pub.lock(s.c, s.arin)).rejects.toThrow(/Forbidden/)
    await db.exec('reset role')
    const sources = (
      await db.query<{ src: string }>(
        "select prosrc src from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('pre','pre_private') and p.proname in ('character_in_live_encounter','get_character_play_lock','set_character_vitals','history_changes','get_character_history','rename_character','can_view_portrait','list_character_portraits')",
      )
    ).rows
    expect(sources).toHaveLength(8)
    for (const { src } of sources) expect(src).not.toMatch(/\bpublic\.|\bprivate\./)
  })
})
