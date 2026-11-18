import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-130 follow-up: the level up in the character history and the absent-character rule.
const migration = '20261202120000_level_up_history_absent.sql'
const db = new PGlite()
type Json = Record<string, unknown>
type Entry = {
  id: string
  at: string
  kind: string
  actor: string
  actor_name: string | null
  changes: { field: string; before: unknown; after: unknown }[]
}
const schemas = ['public', 'pre'] as const
type Schema = (typeof schemas)[number]

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
const scalar = async <T = string>(sql: string, args: unknown[] = []) =>
  (await db.query<{ result: T }>(sql, args)).rows[0]!.result
const rows = async <T = Json>(sql: string, args: unknown[] = []) =>
  (await db.query<T>(sql, args)).rows

const emails = new Map<string, string>()
async function user(label: string) {
  const id = randomUUID()
  emails.set(id, `${label}-${id.slice(0, 8)}@example.com`)
  await asSystem()
  await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [
    id,
    emails.get(id),
  ])
  return id
}
const build = { classKey: 'fighter', classLabel: 'Fighter' }

function api(schema: Schema) {
  return {
    join: async (c: string, dm: string, who: string) => {
      await asUser(dm)
      const invitation = await scalar(`select ${schema}.invite_campaign_member($1,$2) result`, [
        c,
        emails.get(who),
      ])
      await asUser(who)
      await db.query(`select ${schema}.respond_campaign_invitation($1,true)`, [invitation])
    },
    own: async (c: string, who: string, name: string) => {
      await asUser(who)
      return scalar(`select ${schema}.create_own_character($1,$2,$3) result`, [
        c,
        name,
        randomUUID(),
      ])
    },
    complete: (c: string, ch: string) =>
      db.query(`select ${schema}.save_character_sheet($1,$2,0,1,12,14,$3,true,$4)`, [
        c,
        ch,
        JSON.stringify(build),
        randomUUID(),
      ]),
    party: (c: string, level: number) =>
      db.query(`select ${schema}.set_party_level($1,$2,$3)`, [c, level, randomUUID()]),
    absent: (c: string, ch: string, value: boolean) =>
      db.query(`select ${schema}.set_character_absent($1,$2,$3)`, [c, ch, value]),
    levelUp: (
      c: string,
      ch: string,
      rev: number,
      level: number,
      maxHp: number,
      id = randomUUID(),
    ) =>
      scalar<number>(`select ${schema}.apply_level_up($1,$2,$3,$4,$5,$6,$7) result`, [
        c,
        ch,
        rev,
        level,
        maxHp,
        JSON.stringify({ ...build, level }),
        id,
      ]),
    history: (c: string, ch: string) =>
      scalar<Entry[]>(`select ${schema}.get_character_history($1,$2,null,50) result`, [c, ch]),
    levelUps: async (c: string, ch: string) =>
      (
        await scalar<Entry[]>(`select ${schema}.get_character_history($1,$2,null,50) result`, [
          c,
          ch,
        ])
      ).filter((e) => e.kind === 'level_up'),
    sheet: async (ch: string) => {
      await asSystem()
      return (
        await rows<{ level: number; max_hp: number; revision: number }>(
          `select level, max_hp, revision::int from ${schema}.character_sheets where character_id=$1`,
          [ch],
        )
      )[0]!
    },
  }
}

async function table(schema: Schema) {
  const s = api(schema)
  const dm = await user('dm'),
    player = await user('player'),
    peer = await user('peer'),
    outsider = await user('outsider'),
    otherDm = await user('otherdm')
  await asUser(dm)
  const c = await scalar(`select ${schema}.create_campaign('Levels') result`)
  await asUser(otherDm)
  const other = await scalar(`select ${schema}.create_campaign('Elsewhere') result`)
  await s.join(c, dm, player)
  await s.join(c, dm, peer)
  const arin = await s.own(c, player, 'Arin')
  await s.complete(c, arin)
  await asUser(dm)
  await s.party(c, 3)
  return { s, c, other, dm, player, peer, outsider, otherDm, arin }
}

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
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
  // A PRE copied before this file receives the remapped DDL.
  await db.exec(
    withExposureSql(
      etlCommand(['--apply']).query,
      readFileSync('supabase/maintenance/expose-pre.sql', 'utf8'),
    ),
  )
  for (const file of files.filter((f) => f >= migration))
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
}, 120000)
afterAll(() => db.close())

describe('level up in the character history', () => {
  it.each(schemas)('%s: the Player and the DM read it with level and max_hp', async (schema) => {
    const { s, c, dm, player, arin } = await table(schema)
    await asUser(player)
    expect(await s.levelUp(c, arin, 1, 2, 20)).toBe(2)
    const mine = await s.levelUps(c, arin)
    expect(mine).toHaveLength(1)
    expect(mine[0]).toMatchObject({
      kind: 'level_up',
      actor: 'self',
      actor_name: null,
      changes: [
        { field: 'level', before: 1, after: 2 },
        { field: 'max_hp', before: 12, after: 20 },
      ],
    })
    expect(Object.keys(mine[0]!).sort()).toEqual(
      ['actor', 'actor_name', 'at', 'changes', 'id', 'kind'].sort(),
    )
    // The rows of the same write are kept and share the time of the level up.
    const all = await s.history(c, arin)
    const sheetRow = all.find((e) => e.kind === 'character_sheets:UPDATE')!
    expect(sheetRow.at).toBe(mine[0]!.at)
    await asUser(dm)
    const dms = await s.levelUps(c, arin)
    expect(dms).toHaveLength(1)
    expect(dms[0]).toMatchObject({ id: mine[0]!.id, actor: 'player', changes: mine[0]!.changes })
    expect(typeof dms[0]!.actor_name).toBe('string')
    // A DM level up that keeps max HP lists the level only; party_level never appears.
    expect(await s.levelUp(c, arin, 2, 4, 20)).toBe(3)
    await asUser(player)
    const both = await s.levelUps(c, arin)
    expect(both.map((e) => [e.actor, e.changes])).toEqual([
      ['dm', [{ field: 'level', before: 2, after: 4 }]],
      ['self', mine[0]!.changes],
    ])
    expect(JSON.stringify(both)).not.toMatch(/party_level/)
    // The raw audit row stays DM-only.
    expect(
      await rows(`select id from ${schema}.character_events where character_id=$1`, [arin]),
    ).toEqual([])
  })

  it.each(schemas)('%s: nobody else reads it', async (schema) => {
    const { s, c, other, player, peer, outsider, otherDm, arin } = await table(schema)
    await asUser(player)
    await s.levelUp(c, arin, 1, 2, 20)
    await asAnon()
    await expect(s.history(c, arin)).rejects.toThrow(/permission denied/)
    for (const actor of [outsider, peer, otherDm]) {
      await asUser(actor)
      await expect(s.history(c, arin)).rejects.toThrow(/Forbidden/)
      expect(
        await rows(`select id from ${schema}.character_events where character_id=$1`, [arin]),
      ).toEqual([])
    }
    // Through their own campaign, a cross-campaign DM passes the DM check but the read is scoped
    // to that campaign, so the character's entries never come back.
    await asUser(otherDm)
    expect(await s.history(other, arin)).toEqual([])
  })

  it.each(schemas)('%s: an idempotent replay adds no second entry', async (schema) => {
    const { s, c, player, arin } = await table(schema)
    await asUser(player)
    const id = randomUUID()
    expect(await s.levelUp(c, arin, 1, 2, 20, id)).toBe(2)
    expect(await s.levelUp(c, arin, 1, 2, 20, id)).toBe(2)
    await expect(s.levelUp(c, arin, 1, 2, 21, id)).rejects.toThrow(/Request mismatch/)
    expect(await s.levelUps(c, arin)).toHaveLength(1)
    expect(await s.sheet(arin)).toEqual({ level: 2, max_hp: 20, revision: 2 })
  })
})

describe('absent characters', () => {
  it.each(schemas)('%s: refused for the Player, allowed for the DM', async (schema) => {
    const { s, c, dm, player, arin } = await table(schema)
    await asUser(player)
    const earlier = randomUUID()
    expect(await s.levelUp(c, arin, 1, 2, 20, earlier)).toBe(2)
    await asUser(dm)
    await s.absent(c, arin, true)
    await asUser(player)
    await expect(s.levelUp(c, arin, 2, 3, 28)).rejects.toThrow(/Character unavailable/)
    // A retry of a level up stored before the absence returns the stored revision.
    expect(await s.levelUp(c, arin, 1, 2, 20, earlier)).toBe(2)
    expect(await s.sheet(arin)).toEqual({ level: 2, max_hp: 20, revision: 2 })
    // The Player still reads the history of the absent character.
    await asUser(player)
    expect(await s.levelUps(c, arin)).toHaveLength(1)
    await asUser(dm)
    expect(await s.levelUp(c, arin, 2, 3, 28)).toBe(3)
    // Present again: the Player levels as before.
    await s.absent(c, arin, false)
    await s.party(c, 4)
    await asUser(player)
    expect(await s.levelUp(c, arin, 3, 4, 36)).toBe(4)
    expect((await s.levelUps(c, arin)).map((e) => e.actor)).toEqual(['self', 'dm', 'self'])
  })
})

describe('grants and the PRE mirror', () => {
  it('keeps attributes and grants and remaps the PRE copies', async () => {
    await asSystem()
    const fns = await rows<{
      fn: string
      prosecdef: boolean
      provolatile: string
      proconfig: string[]
      prosrc: string
      anon: boolean
      auth: boolean
    }>(
      `select n.nspname || '.' || p.proname fn, p.prosecdef, p.provolatile::text, p.proconfig, p.prosrc,
         has_function_privilege('anon', p.oid, 'execute') anon,
         has_function_privilege('authenticated', p.oid, 'execute') auth
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private', 'pre', 'pre_private')
         and p.proname in ('apply_level_up', 'get_character_history', 'history_changes')
       order by 1`,
    )
    expect(fns.map((f) => f.fn)).toEqual([
      'pre.apply_level_up',
      'pre.get_character_history',
      'pre_private.history_changes',
      'private.history_changes',
      'public.apply_level_up',
      'public.get_character_history',
    ])
    for (const f of fns) {
      const helper = f.fn.endsWith('history_changes')
      expect(f.proconfig).toEqual(['search_path=""'])
      expect(f.anon, f.fn).toBe(false)
      expect(f.auth, f.fn).toBe(!helper)
      expect(f.prosecdef, f.fn).toBe(!helper)
      if (helper) expect(f.provolatile).toBe('i')
      if (f.fn.startsWith('pre')) expect(f.prosrc).not.toMatch(/\bpublic\.|\bprivate\./)
      if (!helper && f.fn.endsWith('apply_level_up')) expect(f.prosrc).toMatch(/ch\.absent/)
      if (f.fn.endsWith('get_character_history')) expect(f.prosrc).toMatch(/'level_up'/)
    }
  })

  it('keeps PRE writes in PRE', async () => {
    const { s, c, player, arin } = await table('pre')
    await asUser(player)
    await s.levelUp(c, arin, 1, 2, 20)
    await asSystem()
    expect(
      await rows(`select 1 from public.character_events where character_id=$1`, [arin]),
    ).toEqual([])
    expect(
      await scalar<number>(
        `select count(*)::int result from pre.character_events where character_id=$1 and kind='level_up'`,
        [arin],
      ),
    ).toBe(1)
  })
})
