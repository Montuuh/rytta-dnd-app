import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-113: get_tabletop masks a character that the live encounter shows under a table alias, the
// same way get_combat_state does: alias as label, no character_id and no SRD art.
const migration = '20261127120000_tabletop_alias_mask.sql'
const db = new PGlite()
const dm = randomUUID(),
  player = randomUUID(),
  peer = randomUUID(),
  outsider = randomUUID(),
  otherDm = randomUUID()
const emails: Record<string, string> = {
  [dm]: 'dm@example.com',
  [player]: 'player@example.com',
  [peer]: 'peer@example.com',
  [outsider]: 'outsider@example.com',
  [otherDm]: 'otherdm@example.com',
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
type Json = Record<string, unknown>
type Item = {
  id: string
  kind: string
  label: string | null
  character_id: string | null
  combatant_id: string | null
  controllable?: boolean
  data: Json
}
const scalar = async <T = string>(sql: string, args: unknown[] = []) =>
  (await db.query<{ result: T }>(sql, args)).rows[0]!.result
const json = (value: unknown) => JSON.stringify(value)

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
    create publication supabase_realtime;`)
  for (const [id, email] of Object.entries(emails))
    await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [
      id,
      email,
    ])
  await db.exec(`create schema storage;
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

/**
 * A live scene with an active encounter: Arin (the Player's, alias "Masked"), Cora (the peer's,
 * alias "Stranger") and Bea (unassigned, no alias). Each of Arin and Cora has one token linked to
 * the character and one linked to its combatant; Bea has a character token.
 */
async function table(schema = 'public') {
  await asUser(dm)
  const c = await scalar(`select ${schema}.create_campaign('Masked map') result`)
  const make = (name: string) =>
    scalar(`select ${schema}.create_character($1,$2) result`, [c, name])
  const ids = { arin: await make('Arin'), cora: await make('Cora'), bea: await make('Bea') }
  for (const [key, user] of [
    ['arin', player],
    ['cora', peer],
  ] as const) {
    await asUser(dm)
    const invite = await scalar(`select ${schema}.invite_character_player($1,$2,$3) result`, [
      c,
      ids[key],
      emails[user],
    ])
    await asUser(user)
    await db.query(`select ${schema}.respond_campaign_invitation($1,true)`, [invite])
  }
  await asUser(dm)
  await db.query(`select ${schema}.set_campaign_modules($1, $2::text[])`, [
    c,
    ['party', 'tabletop'],
  ])
  const scene = (
    await scalar<{ id: string }>(
      `select ${schema}.save_tabletop_scene($1,null,$2,null,$3) result`,
      [c, json({ name: 'Road', cols: 20, rows: 20 }), randomUUID()],
    )
  ).id
  const encounter = async (name: string) =>
    (
      await scalar<Json>(`select ${schema}.create_encounter($1,$2,$3) result`, [
        c,
        name,
        randomUUID(),
      ])
    ).encounter_id as string
  const status = (e: string, s: string) =>
    scalar(`select ${schema}.set_encounter_status($1,$2,$3,$4) result`, [c, e, s, randomUUID()])
  const e = await encounter('Ambush')
  await scalar(`select ${schema}.add_combatants($1,$2,$3,$4) result`, [
    c,
    e,
    json([
      { kind: 'character', character_id: ids.arin },
      { kind: 'character', character_id: ids.cora },
      { kind: 'npc', name: 'Bandit', max_hp: 11 },
    ]),
    randomUUID(),
  ])
  await status(e, 'active')
  await asSystem()
  const combatant = (encounterId: string, character: string) =>
    scalar(
      `select id result from ${schema}.encounter_combatants where encounter_id=$1 and character_id=$2`,
      [encounterId, character],
    )
  const arinC = await combatant(e, ids.arin)
  const coraC = await combatant(e, ids.cora)
  const alias = (id: string, name: string | null) =>
    db.query(`update ${schema}.encounter_combatants set public_name = $2 where id = $1`, [id, name])
  await alias(arinC, 'Masked')
  await alias(coraC, 'Stranger')
  await asUser(dm)
  const token = (x: number, link: Json) => ({
    kind: 'token',
    x,
    y: 2,
    ...link,
    data: { color: 'azure', srd_id: 'acolyte' },
  })
  await scalar(`select ${schema}.put_tabletop_items($1,$2,$3,$4) result`, [
    c,
    scene,
    json([
      token(1, { character_id: ids.arin }),
      token(2, { combatant_id: arinC }),
      token(3, { character_id: ids.cora }),
      token(4, { combatant_id: coraC }),
      token(5, { character_id: ids.bea }),
    ]),
    randomUUID(),
  ])
  await scalar(`select ${schema}.set_tabletop_live($1,$2,$3) result`, [
    c,
    json({ scene_id: scene }),
    randomUUID(),
  ])
  const view = async (asTable: boolean) => {
    const out = await scalar<{ items: Item[] }>(
      `select ${schema}.get_tabletop($1,null,$2) result`,
      [c, asTable],
    )
    const at = new Map(
      out.items.map((i) => [Number((i as unknown as { x: number }).x), i] as const),
    )
    return { raw: json(out), items: out.items, at }
  }
  return { c, e, ids, arinC, coraC, alias, status, encounter, combatant, view, schema }
}

const masked = (item: Item | undefined, alias: string) => {
  expect(item).toMatchObject({ label: alias, character_id: null })
  // The key stays (as null), so the projection keeps its shape for every client.
  expect(item).toHaveProperty('character_id', null)
  expect(item!.data).not.toHaveProperty('srd_id')
}

describe('get_tabletop alias mask', () => {
  it('PoC: a teammate under an alias showed its real name and character on the map; now its alias', async () => {
    const { ids, coraC, view } = await table()
    await asUser(player)
    const { raw, at } = await view(false)
    masked(at.get(3), 'Stranger')
    masked(at.get(4), 'Stranger')
    expect(at.get(4)).toMatchObject({ combatant_id: coraC, controllable: false })
    expect(raw).not.toContain('Cora')
    expect(raw).not.toContain(ids.cora)
    // Unaliased characters keep their name and link.
    expect(at.get(5)).toMatchObject({ label: 'Bea', character_id: ids.bea })
  })

  it('keeps the own token whole for its Player, not on the table screen', async () => {
    const { ids, view } = await table()
    await asUser(player)
    const own = await view(false)
    expect(own.at.get(1)).toMatchObject({
      label: 'Arin',
      character_id: ids.arin,
      controllable: true,
      data: { srd_id: 'acolyte' },
    })
    expect(own.at.get(2)).toMatchObject({
      label: 'Arin',
      character_id: ids.arin,
      controllable: true,
    })
    const screen = await view(true)
    masked(screen.at.get(1), 'Masked')
    masked(screen.at.get(2), 'Masked')
    expect(screen.raw).not.toMatch(/Arin|Cora/)
    expect(screen.raw).not.toContain(ids.arin)
    // The peer sees Cora whole and Arin masked.
    await asUser(peer)
    const peerView = await view(false)
    expect(peerView.at.get(3)).toMatchObject({ label: 'Cora', character_id: ids.cora })
    masked(peerView.at.get(1), 'Masked')
  })

  it('masks the table screen for the DM and leaves the full view unchanged', async () => {
    const { ids, arinC, coraC, view } = await table()
    await asUser(dm)
    const screen = await view(true)
    for (const x of [1, 2]) masked(screen.at.get(x), 'Masked')
    for (const x of [3, 4]) masked(screen.at.get(x), 'Stranger')
    expect(screen.raw).not.toMatch(/Arin|Cora/)
    const full = await view(false)
    expect(full.at.get(1)).toMatchObject({ character_id: ids.arin, label: null, hidden: false })
    expect(full.at.get(3)).toMatchObject({ character_id: ids.cora, data: { srd_id: 'acolyte' } })
    expect(full.at.get(2)).toMatchObject({ combatant_id: arinC, character_id: null })
    expect(full.at.get(4)).toMatchObject({ combatant_id: coraC })
  })

  it('masks only while the alias is on a visible combatant of the live encounter', async () => {
    const { ids, coraC, alias, status, encounter, combatant, view, c, e } = await table()
    // Without the alias, the real name returns.
    await asSystem()
    await alias(coraC, null)
    await asUser(player)
    expect((await view(false)).at.get(3)).toMatchObject({ label: 'Cora', character_id: ids.cora })
    // A hidden combatant's alias is not public: its token is left out, the character token is not.
    await asSystem()
    await alias(coraC, 'Stranger')
    await db.query('update public.encounter_combatants set hidden = true where id = $1', [coraC])
    await asUser(player)
    const hidden = await view(false)
    expect(hidden.at.has(4)).toBe(false)
    expect(hidden.at.get(3)).toMatchObject({ label: 'Cora', character_id: ids.cora })
    expect(hidden.raw).not.toContain('Stranger')
    await asSystem()
    await db.query('update public.encounter_combatants set hidden = false where id = $1', [coraC])
    // An ended encounter no longer disguises anyone.
    await asUser(dm)
    await status(e, 'ended')
    await asUser(player)
    const ended = await view(false)
    expect(ended.at.get(3)).toMatchObject({ label: 'Cora', character_id: ids.cora })
    expect(ended.at.get(4)).toMatchObject({ label: 'Cora', character_id: ids.cora })
    // A draft does not leak a prepared alias; once it is live, it masks every token of the character.
    await asUser(dm)
    const next = await encounter('Rematch')
    await scalar('select public.add_combatants($1,$2,$3,$4) result', [
      c,
      next,
      json([{ kind: 'character', character_id: ids.cora }]),
      randomUUID(),
    ])
    await asSystem()
    await alias(await combatant(next, ids.cora), 'Veiled')
    await asUser(player)
    const draft = await view(false)
    expect(draft.at.get(3)).toMatchObject({ label: 'Cora', character_id: ids.cora })
    expect(draft.raw).not.toContain('Veiled')
    await asUser(dm)
    await status(next, 'active')
    await asUser(player)
    const live = await view(false)
    masked(live.at.get(3), 'Veiled')
    // The token of the ended encounter's combatant takes the live alias, not the old one.
    masked(live.at.get(4), 'Veiled')
    expect(live.raw).not.toContain(ids.cora)
  })

  it('denies anon, outsiders and DMs of other campaigns', async () => {
    const { c } = await table()
    await asUser(otherDm)
    await scalar("select public.create_campaign('Elsewhere') result")
    for (const user of [outsider, otherDm]) {
      await asUser(user)
      for (const asTable of [false, true])
        await expect(
          db.query('select public.get_tabletop($1,null,$2)', [c, asTable]),
        ).rejects.toThrow(/Forbidden/)
    }
    await asAnon()
    await expect(db.query('select public.get_tabletop($1,null,false)', [c])).rejects.toThrow(
      /permission denied/,
    )
  })

  it('applies in PRE with remapped references and unchanged privileges', async () => {
    const pre = await table('pre')
    await asUser(player)
    const { raw, at } = await pre.view(false)
    masked(at.get(3), 'Stranger')
    expect(at.get(1)).toMatchObject({ label: 'Arin', character_id: pre.ids.arin })
    expect(raw).not.toContain(pre.ids.cora)
    await asSystem()
    const fns = (
      await db.query<Json>(
        `select n.nspname, p.prosecdef, p.proconfig, p.prosrc,
          has_function_privilege('anon', p.oid, 'execute') anon,
          has_function_privilege('authenticated', p.oid, 'execute') authed
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where p.proname = 'get_tabletop' and n.nspname in ('public', 'pre') order by 1`,
      )
    ).rows
    expect(fns.map((f) => f.nspname)).toEqual(['pre', 'public'])
    for (const fn of fns) {
      expect(fn).toMatchObject({
        prosecdef: true,
        proconfig: ['search_path=""'],
        anon: false,
        authed: true,
      })
      expect(fn.prosrc).toContain('RYT-113')
      if (fn.nspname === 'pre') expect(fn.prosrc).not.toMatch(/\bpublic\.|\bprivate\./)
    }
  })
})
