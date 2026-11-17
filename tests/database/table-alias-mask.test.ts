import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-118: get_combat_state carries the SRD class key of visible, unaliased character combatants,
// and an alias or a hidden combatant is never uncovered through rows or the log.
const migration = '20261126120000_table_view_class_key_alias_mask.sql'
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
type Row = {
  name: string
  kind: string
  class_key?: string
  character_id?: string
  id: string
} & Json
type Event = { kind: string; target_combatant?: string; target_name?: string } & Json
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
 * An active encounter: Arin (the Player's wizard), Bea (unassigned rogue), Cora (the peer's cleric,
 * sharing live vitals, with a portrait, under the alias "Stranger"), Dax (fighter hidden after it
 * joined), Eve (homebrew class), Fenn (forged class key) and Lich.
 */
async function fight(schema = 'public') {
  await asUser(dm)
  const c = await scalar(`select ${schema}.create_campaign('Class keys') result`)
  const make = (name: string) =>
    scalar(`select ${schema}.create_character($1,$2) result`, [c, name])
  const ids = {
    arin: await make('Arin'),
    bea: await make('Bea'),
    cora: await make('Cora'),
    dax: await make('Dax'),
    eve: await make('Eve'),
    fenn: await make('Fenn'),
  }
  const invite = await scalar(`select ${schema}.invite_character_player($1,$2,$3) result`, [
    c,
    ids.arin,
    emails[player],
  ])
  await asUser(player)
  await db.query(`select ${schema}.respond_campaign_invitation($1,true)`, [invite])
  await asUser(dm)
  const peerInvite = await scalar(`select ${schema}.invite_character_player($1,$2,$3) result`, [
    c,
    ids.cora,
    emails[peer],
  ])
  await asUser(peer)
  await db.query(`select ${schema}.respond_campaign_invitation($1,true)`, [peerInvite])
  await asSystem()
  const portrait = (id: string) => `${schema}/${c}/${id}/${randomUUID()}.webp`
  const portraits = { arin: portrait(ids.arin), cora: portrait(ids.cora) }
  await db.query(`update ${schema}.characters set shares_live = true where id = any($1)`, [
    [ids.arin, ids.cora],
  ])
  for (const key of ['arin', 'cora'] as const)
    await db.query(
      `update ${schema}.character_sheets set portrait_path = $2, armor_class = 17 where character_id = $1`,
      [ids[key], portraits[key]],
    )
  const classes: Record<string, string> = {
    arin: 'wizard',
    bea: 'rogue',
    cora: 'cleric',
    dax: 'fighter',
    eve: 'custom',
    fenn: "wizard' or 'x",
  }
  for (const [key, cls] of Object.entries(classes))
    await db.query(
      `update ${schema}.character_sheets set build = coalesce(build, '{}'::jsonb) || $2 where character_id = $1`,
      [ids[key as keyof typeof ids], json({ classKey: cls, classLabel: 'Label' })],
    )
  await asUser(dm)
  const e = (
    await scalar<Json>(`select ${schema}.create_encounter($1,'Crypt',$2) result`, [c, randomUUID()])
  ).encounter_id as string
  await scalar(`select ${schema}.add_combatants($1,$2,$3,$4) result`, [
    c,
    e,
    json([
      ...Object.values(ids).map((id) => ({ kind: 'character', character_id: id })),
      { kind: 'npc', name: 'Lich', max_hp: 40 },
    ]),
    randomUUID(),
  ])
  await scalar(`select ${schema}.set_encounter_status($1,$2,'active',$3) result`, [
    c,
    e,
    randomUUID(),
  ])
  await asSystem()
  const combatant = (character: string) =>
    scalar(
      `select id result from ${schema}.encounter_combatants where encounter_id=$1 and character_id=$2`,
      [e, character],
    )
  const cora = await combatant(ids.cora)
  const dax = await combatant(ids.dax)
  await db.query(
    `update ${schema}.encounter_combatants set public_name = 'Stranger' where id = $1`,
    [cora],
  )
  await db.query(`update ${schema}.encounter_combatants set hidden = true where id = $1`, [dax])
  const state = async (asTable: boolean) => {
    const out = await scalar<{ combatants: Row[]; events: Event[] }>(
      `select ${schema}.get_combat_state($1,null,$2) result`,
      [c, asTable],
    )
    return {
      raw: json(out.combatants),
      all: json(out),
      events: out.events,
      byName: new Map(out.combatants.map((r) => [r.name, r])),
    }
  }
  return { c, e, ids, cora, dax, portraits, state, combatant }
}

describe('get_combat_state class_key', () => {
  it('gives Players the class of visible, unaliased characters only', async () => {
    const { ids, cora, dax, state } = await fight()
    await asUser(player)
    const { raw, byName } = await state(false)
    expect(byName.get('Arin')).toMatchObject({ class_key: 'wizard', character_id: ids.arin })
    expect(byName.get('Bea')).toMatchObject({ class_key: 'rogue' })
    expect(byName.get('Bea')).not.toHaveProperty('character_id')
    // The alias keeps the class (and the character) secret.
    const stranger = byName.get('Stranger')!
    expect(stranger.id).toBe(cora)
    expect(stranger).not.toHaveProperty('class_key')
    expect(stranger).not.toHaveProperty('character_id')
    expect(raw).not.toContain('cleric')
    expect(raw).not.toContain(ids.cora)
    // A hidden combatant is absent, with its class.
    expect(byName.has('Dax')).toBe(false)
    expect(raw).not.toContain(dax)
    expect(raw).not.toContain('fighter')
    // Homebrew or forged keys and creatures carry none.
    expect(byName.get('Eve')).not.toHaveProperty('class_key')
    expect(byName.get('Fenn')).not.toHaveProperty('class_key')
    expect(byName.get('Lich')).not.toHaveProperty('class_key')
  })

  it('masks the table screen the same way, even for the DM', async () => {
    const { state } = await fight()
    await asUser(dm)
    const { raw, byName } = await state(true)
    expect(byName.get('Arin')).toMatchObject({ class_key: 'wizard' })
    expect(byName.get('Arin')).not.toHaveProperty('character_id')
    expect(byName.get('Stranger')).not.toHaveProperty('class_key')
    expect(byName.has('Dax')).toBe(false)
    expect(raw).not.toMatch(/cleric|fighter/)
  })

  it('gives the DM every character class, hidden and aliased included', async () => {
    const { ids, state } = await fight()
    await asUser(dm)
    const { byName } = await state(false)
    expect(byName.get('Cora')).toMatchObject({ class_key: 'cleric', character_id: ids.cora })
    expect(byName.get('Dax')).toMatchObject({ class_key: 'fighter', hidden: true })
    expect(byName.get('Arin')).toMatchObject({ class_key: 'wizard' })
    expect(byName.get('Eve')).not.toHaveProperty('class_key')
    expect(byName.get('Lich')).not.toHaveProperty('class_key')
  })

  it('denies anon, outsiders and DMs of other campaigns', async () => {
    const { c } = await fight()
    await asUser(otherDm)
    await scalar("select public.create_campaign('Elsewhere') result")
    for (const user of [outsider, otherDm]) {
      await asUser(user)
      for (const asTable of [false, true])
        await expect(
          db.query('select public.get_combat_state($1,null,$2)', [c, asTable]),
        ).rejects.toThrow(/Forbidden/)
    }
    await asAnon()
    await expect(db.query('select public.get_combat_state($1,null,false)', [c])).rejects.toThrow(
      /permission denied/,
    )
  })

  it('applies in PRE with remapped references', async () => {
    const { state } = await fight('pre')
    await asUser(player)
    const { raw, byName } = await state(false)
    expect(byName.get('Arin')).toMatchObject({ class_key: 'wizard' })
    expect(byName.get('Stranger')).not.toHaveProperty('class_key')
    expect(raw).not.toMatch(/cleric|fighter/)
    await asSystem()
    const fns = (
      await db.query<Json>(
        `select n.nspname, p.prosecdef, p.proconfig, p.prosrc,
          has_function_privilege('anon', p.oid, 'execute') anon
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where p.proname = 'get_combat_state' and n.nspname in ('public', 'pre') order by 1`,
      )
    ).rows
    expect(fns.map((f) => f.nspname)).toEqual(['pre', 'public'])
    for (const fn of fns) {
      expect(fn).toMatchObject({ prosecdef: true, proconfig: ['search_path=""'], anon: false })
      expect(fn.prosrc).toContain('class_key')
      if (fn.nspname === 'pre') expect(fn.prosrc).not.toMatch(/\bpublic\.|\bprivate\./)
    }
  })

  it('PoC: an aliased character no longer leaks its portrait, class or shared vitals', async () => {
    const { cora, portraits, state } = await fight()
    for (const [user, asTable] of [
      [player, false],
      [player, true],
      [dm, true],
    ] as const) {
      await asUser(user)
      const { all, byName } = await state(asTable)
      const stranger = byName.get('Stranger')!
      expect(stranger.id).toBe(cora)
      for (const field of [
        'image_path',
        'class_key',
        'character_id',
        'hp',
        'armor_class',
        'conditions',
        'concentration',
        'death_saves',
        'exhaustion',
        'shares_live',
        'public_name',
      ])
        expect(stranger).not.toHaveProperty(field)
      expect(stranger).toMatchObject({ hp_status: 'unknown', hp_band: 'unknown', is_own: false })
      expect(all).not.toContain(portraits.cora)
      expect(all).not.toContain('Cora')
    }
    // The DM's full view is unchanged.
    await asUser(dm)
    const { byName } = await state(false)
    expect(byName.get('Cora')).toMatchObject({
      image_path: portraits.cora,
      public_name: 'Stranger',
      shares_live: true,
      armor_class: 17,
      class_key: 'cleric',
    })
    expect(byName.get('Cora')).toHaveProperty('hp')
  })

  it('keeps the own character whole for its Player under an alias, not on the table screen', async () => {
    const { ids, portraits, state, combatant } = await fight()
    const arin = await combatant(ids.arin)
    await asSystem()
    await db.query("update public.encounter_combatants set public_name = 'Masked' where id = $1", [
      arin,
    ])
    await asUser(player)
    const own = (await state(false)).byName.get('Masked')!
    expect(own).toMatchObject({
      is_own: true,
      character_id: ids.arin,
      image_path: portraits.arin,
      armor_class: 17,
    })
    const table = await state(true)
    expect(table.byName.get('Masked')).not.toHaveProperty('image_path')
    expect(table.byName.get('Masked')).not.toHaveProperty('armor_class')
    expect(table.all).not.toContain(portraits.arin)
    // Without the alias, a teammate sharing live vitals shows them on the table screen again.
    await asSystem()
    await db.query('update public.encounter_combatants set public_name = null where id = $1', [
      arin,
    ])
    await asUser(dm)
    expect((await state(true)).byName.get('Arin')).toMatchObject({
      image_path: portraits.arin,
      armor_class: 17,
    })
  })

  it('PoC: a combatant hidden after joining kept its join event; now its events are left out', async () => {
    const { dax, state } = await fight()
    for (const [user, asTable] of [
      [player, false],
      [dm, true],
    ] as const) {
      await asUser(user)
      const { all, events } = await state(asTable)
      expect(events.length).toBeGreaterThan(0)
      expect(events.length).toBeLessThanOrEqual(60)
      expect(events.some((x) => x.target_combatant === dax)).toBe(false)
      expect(all).not.toContain(dax)
      expect(all).not.toContain('Dax')
    }
    await asUser(dm)
    const full = await state(false)
    expect(full.events.some((x) => x.kind === 'join' && x.target_combatant === dax)).toBe(true)
  })

  it('PoC: a removed aliased combatant showed its real name in the log; now its alias', async () => {
    const { c, cora, state } = await fight()
    await asUser(dm)
    await scalar('select public.remove_combatant($1,$2,$3) result', [c, cora, randomUUID()])
    for (const [user, asTable] of [
      [player, false],
      [dm, true],
    ] as const) {
      await asUser(user)
      const { all, events } = await state(asTable)
      const about = events.filter((x) => x.target_combatant === cora)
      expect(about.map((x) => x.kind).sort()).toEqual(['join', 'leave'])
      expect(about.every((x) => x.target_name === 'Stranger')).toBe(true)
      expect(all).not.toContain('Cora')
    }
    // The DM's log keeps the real name.
    await asUser(dm)
    const full = await state(false)
    expect(
      full.events.find((x) => x.kind === 'leave' && x.target_combatant === cora),
    ).toMatchObject({ target_name: 'Cora', detail: { target_alias: 'Stranger' } })
  })

  it('masks aliases and hidden combatants in PRE too', async () => {
    const pre = await fight('pre')
    await asUser(dm)
    await scalar('select pre.remove_combatant($1,$2,$3) result', [pre.c, pre.cora, randomUUID()])
    await asUser(player)
    const { all, events } = await pre.state(false)
    expect(all).not.toMatch(/Cora|Dax/)
    expect(all).not.toContain(pre.portraits.cora)
    expect(all).not.toContain(pre.dax)
    expect(events.filter((x) => x.target_combatant === pre.cora).map((x) => x.target_name)).toEqual(
      ['Stranger', 'Stranger'],
    )
    await asSystem()
    const log = (
      await db.query<Json>(
        `select n.nspname, p.prosecdef, p.proconfig, p.prosrc,
          has_function_privilege('anon', p.oid, 'execute') anon,
          has_function_privilege('authenticated', p.oid, 'execute') authed
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where p.proname = 'combat_log' and n.nspname in ('private', 'pre_private') order by 1`,
      )
    ).rows
    expect(log.map((f) => f.nspname)).toEqual(['pre_private', 'private'])
    for (const fn of log) {
      expect(fn).toMatchObject({
        prosecdef: true,
        proconfig: ['search_path=""'],
        anon: false,
        authed: false,
      })
      expect(fn.prosrc).toContain('target_alias')
      if (fn.nspname === 'pre_private') expect(fn.prosrc).not.toMatch(/\bpublic\.|\bprivate\./)
    }
  })
})
