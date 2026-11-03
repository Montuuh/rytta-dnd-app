import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

const migration = '20261104110000_glossary_homebrew.sql'
const db = new PGlite()
const dm = randomUUID(),
  player = randomUUID(),
  inactive = randomUUID(),
  outsider = randomUUID(),
  otherDm = randomUUID()

type Json = Record<string, unknown>
type Entry = { id: string; name: string; revision: number; aliases: string[]; facts: Json[] }
const asUser = async (id: string) => {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
}
const one = async <T = Json>(sql: string, args: unknown[] = []) =>
  (await db.query<T>(sql, args)).rows[0]!

function api(schema = 'public') {
  return {
    save: async (c: string, id: string, revision: number | null, payload: Json) =>
      (
        await one<{ r: Entry }>(`select ${schema}.save_glossary_entry($1,$2,$3,$4) r`, [
          c,
          id,
          revision,
          JSON.stringify(payload),
        ])
      ).r,
    remove: async (c: string, id: string, revision: number) =>
      (
        await one<{ r: Json }>(`select ${schema}.delete_glossary_entry($1,$2,$3) r`, [
          c,
          id,
          revision,
        ])
      ).r,
    list: async (c: string) =>
      (
        await db.query<{ name: string }>(
          `select name from ${schema}.glossary_entries where campaign_id = $1 order by name`,
          [c],
        )
      ).rows.map((r) => r.name),
  }
}
const pub = api()
const entry = (name: string, extra: Json = {}) => ({
  category: 'rule',
  name,
  aliases: [],
  summary: '',
  body: '',
  facts: [],
  ...extra,
})

/** A campaign with an active Player, an inactive Player, plus another campaign and its DM. */
async function setup(schema = 'public', modules = ['party', 'glossary']) {
  await asUser(dm)
  const c = (await one<{ id: string }>(`select ${schema}.create_campaign('Glossary table') id`)).id
  await asUser(otherDm)
  const other = (await one<{ id: string }>(`select ${schema}.create_campaign('Elsewhere') id`)).id
  await db.exec('reset role')
  await db.query(
    `insert into ${schema}.campaign_members(campaign_id, user_id, role, active) values ($1,$2,'player',true), ($1,$3,'player',false)`,
    [c, player, inactive],
  )
  await asUser(dm)
  await db.query(`select ${schema}.set_campaign_modules($1, $2)`, [c, modules])
  return { c, other }
}

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`)
  for (const id of [dm, player, inactive, outsider, otherDm])
    await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [
      id,
      `${id}@example.com`,
    ])
  const files = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files.filter((f) => f < migration))
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  // A PRE copied before RYT-008 exercises the migration's guarded PRE mirror.
  await db.exec(
    withExposureSql(
      etlCommand(['--apply']).query,
      readFileSync('supabase/maintenance/expose-pre.sql', 'utf8'),
    ),
  )
  for (const file of files.filter((f) => f >= migration))
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
}, 60000)
afterAll(() => db.close())

describe('RYT-008 homebrew glossary', () => {
  it('lets the DM and an enabled Player create, edit and delete any entry', async () => {
    const { c } = await setup()
    await asUser(dm)
    const id = randomUUID()
    const created = await pub.save(
      c,
      id,
      null,
      entry('  Gritty Rest ', {
        aliases: ['Descanso duro', 'descanso DURO', 'Rest'],
        facts: [{ label: 'Duration', value: '7 days' }],
        srd_ref: 'rule.long-rest',
      }),
    )
    expect(created).toMatchObject({ name: 'Gritty Rest', revision: 1, srd_ref: 'rule.long-rest' })
    // Aliases are trimmed and de-duplicated case-insensitively.
    expect(created.aliases).toEqual(['Descanso duro', 'Rest'])
    await asUser(player)
    expect(await pub.list(c)).toEqual(['Gritty Rest'])
    const edited = await pub.save(c, id, 1, entry('Gritty Rest', { body: 'A week of rest.' }))
    expect(edited).toMatchObject({ revision: 2, updated_by: player })
    const own = randomUUID()
    await pub.save(c, own, null, entry('Mano Hundida', { category: 'lore' }))
    await asUser(dm)
    expect(await pub.remove(c, own, 1)).toMatchObject({ deleted: true })
    expect(await pub.list(c)).toEqual(['Gritty Rest'])
    await db.exec('reset role')
  })

  it('replays a retried create and rejects stale revisions and duplicate names', async () => {
    const { c } = await setup()
    await asUser(player)
    const id = randomUUID()
    const payload = entry('Flanking', { summary: 'Advantage when surrounding a foe.' })
    const first = await pub.save(c, id, null, payload)
    expect(await pub.save(c, id, null, payload)).toEqual(first)
    await expect(pub.save(c, id, null, entry('Flanking', { summary: 'Other' }))).rejects.toThrow(
      /Stale revision/,
    )
    await pub.save(c, id, 1, entry('Flanking', { body: 'v2' }))
    await expect(pub.save(c, id, 1, entry('Flanking', { body: 'v3' }))).rejects.toThrow(
      /Stale revision/,
    )
    await expect(pub.remove(c, id, 1)).rejects.toThrow(/Stale revision/)
    await expect(pub.save(c, randomUUID(), null, entry('flanking'))).rejects.toThrow(
      /Duplicate name/,
    )
    await expect(pub.save(c, randomUUID(), 3, entry('New'))).rejects.toThrow(/Stale revision/)
    // A retried delete of an already deleted entry succeeds.
    await pub.remove(c, id, 2)
    expect(await pub.remove(c, id, 2)).toMatchObject({ deleted: true })
    await db.exec('reset role')
  })

  it('validates the payload on the server', async () => {
    const { c } = await setup()
    await asUser(dm)
    const bad = [
      entry(''),
      entry('x'.repeat(81)),
      entry('Ok', { category: 'monster' }),
      entry('Ok', { summary: 'x'.repeat(281) }),
      entry('Ok', { body: 'x'.repeat(8001) }),
      entry('Ok', { aliases: Array.from({ length: 11 }, (_, i) => `a${i}`) }),
      entry('Ok', { aliases: ['x'.repeat(61)] }),
      entry('Ok', { aliases: [1] }),
      entry('Ok', { facts: Array.from({ length: 9 }, () => ({ label: 'a', value: 'b' })) }),
      entry('Ok', { facts: [{ label: '', value: 'b' }] }),
      entry('Ok', { srd_ref: 'Rule.<script>' }),
    ]
    for (const payload of bad)
      await expect(pub.save(c, randomUUID(), null, payload)).rejects.toThrow(/Invalid request/)
    await db.exec('reset role')
  })

  it('denies anon, outsiders, inactive members and cross-campaign DMs', async () => {
    const { c, other } = await setup()
    await asUser(dm)
    const id = randomUUID()
    await pub.save(c, id, null, entry('Secret rule'))
    for (const user of [outsider, inactive, otherDm]) {
      await asUser(user)
      expect(await pub.list(c)).toEqual([])
      await expect(pub.save(c, randomUUID(), null, entry('Intruder'))).rejects.toThrow(/Forbidden/)
      await expect(pub.save(c, id, 1, entry('Hijack'))).rejects.toThrow(/Forbidden/)
      await expect(pub.remove(c, id, 1)).rejects.toThrow(/Forbidden/)
    }
    // A DM cannot move or delete an entry through another campaign it controls.
    await asUser(otherDm)
    await expect(pub.save(other, id, 1, entry('Hijack'))).rejects.toThrow(/Forbidden/)
    await expect(pub.remove(other, id, 1)).rejects.toThrow(/Forbidden/)
    // No direct table writes for members either.
    await asUser(dm)
    await expect(
      db.query("update public.glossary_entries set name = 'x' where id = $1", [id]),
    ).rejects.toThrow(/permission denied/)
    await expect(
      db.query(
        "insert into public.glossary_entries(id, campaign_id, category, name) values ($1,$2,'rule','x')",
        [randomUUID(), c],
      ),
    ).rejects.toThrow(/permission denied/)
    await db.exec('reset role; set role anon')
    await expect(db.query('select * from public.glossary_entries')).rejects.toThrow(
      /permission denied/,
    )
    await expect(
      db.query('select public.save_glossary_entry($1,$2,null,$3)', [
        c,
        randomUUID(),
        JSON.stringify(entry('Anon')),
      ]),
    ).rejects.toThrow(/permission denied/)
    await db.exec('reset role')
  })

  it('follows the DM module switch for Players only', async () => {
    const { c } = await setup('public', ['party'])
    await asUser(dm)
    const id = randomUUID()
    await pub.save(c, id, null, entry('Hidden house rule'))
    expect(await pub.list(c)).toEqual(['Hidden house rule'])
    await asUser(player)
    expect(await pub.list(c)).toEqual([])
    await expect(pub.save(c, randomUUID(), null, entry('Player rule'))).rejects.toThrow(/Forbidden/)
    await asUser(dm)
    await db.query('select public.set_campaign_modules($1, $2)', [c, ['party', 'glossary']])
    await asUser(player)
    expect(await pub.list(c)).toEqual(['Hidden house rule'])
    await db.exec('reset role')
  })

  it('mirrors the table, policy and RPCs into a PRE copied before the migration', async () => {
    await db.exec('reset role')
    expect((await one("select to_regclass('pre.glossary_entries') t")).t).toBe(
      'pre.glossary_entries',
    )
    const pre = api('pre')
    const { c } = await setup('pre')
    await asUser(player)
    const id = randomUUID()
    expect(await pre.save(c, id, null, entry('Pre rule'))).toMatchObject({ revision: 1 })
    expect(await pre.list(c)).toEqual(['Pre rule'])
    // PRE helpers authorize only against PRE membership.
    await expect(pub.save(c, randomUUID(), null, entry('Prod'))).rejects.toThrow(/Forbidden/)
    await asUser(outsider)
    expect(await pre.list(c)).toEqual([])
    await db.exec('reset role')
    const sources = (
      await db.query<{ src: string }>(
        "select prosrc src from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('pre','pre_private') and p.proname like '%glossary%'",
      )
    ).rows
    expect(sources.length).toBe(5)
    for (const { src } of sources) expect(src).not.toMatch(/\bpublic\.|\bprivate\./)
  })
})
