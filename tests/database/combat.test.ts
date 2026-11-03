import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

const migration = '20261104120000_combat.sql'
const db = new PGlite()
const dm = randomUUID(),
  player = randomUUID(),
  peer = randomUUID(),
  third = randomUUID(),
  outsider = randomUUID()
const asUser = async (id: string) => {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
}
type Json = Record<string, unknown>
const one = async <T = Json>(sql: string, args: unknown[] = []) =>
  (await db.query<T>(sql, args)).rows[0]!
const res = async (sql: string, args: unknown[] = []) =>
  (await one<{ result: Json }>(sql, args)).result

type Combatant = {
  id: string
  kind: string
  side: string
  name: string
  initiative?: number
  is_active: boolean
  is_own: boolean
  can_act: boolean
  defeated: boolean
  hidden?: boolean
  dm_notes?: string
  hp?: { current: number; max: number; temp: number }
  hp_status?: string
  armor_class?: number
  conditions?: string[]
  concentration?: string
  death_saves?: { successes: number; failures: number }
  exhaustion?: number
}
type State = {
  viewer: { role: string }
  encounter: {
    id: string
    status: string
    round: number
    active_combatant?: string | null
    revision: number
    summary?: { rounds: number; combatants: Json[] } | null
  } | null
  combatants: Combatant[]
  effects: { id: string; label: string; remaining_rounds?: number; condition?: string }[]
  events: {
    id: string
    kind: string
    amount?: number
    target_name?: string
    undone: boolean
    undoable: boolean
    detail: Json
  }[]
}

function api(schema = 'public') {
  const call = (fn: string, args: unknown[]) =>
    res(`select ${schema}.${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) result`, args)
  return {
    create: (c: string, name: string) => call('create_encounter', [c, name, randomUUID()]),
    status: (c: string, e: string, s: string, key = randomUUID()) =>
      call('set_encounter_status', [c, e, s, key]),
    add: (c: string, e: string, entries: Json[], key = randomUUID()) =>
      call('add_combatants', [c, e, JSON.stringify(entries), key]),
    update: (c: string, id: string, patch: Json) =>
      call('update_combatant', [c, id, JSON.stringify(patch), randomUUID()]),
    remove: (c: string, id: string) => call('remove_combatant', [c, id, randomUUID()]),
    initiative: (c: string, id: string, total: number, bonus: number | null = null) =>
      call('set_initiative', [c, id, total, bonus, randomUUID()]),
    roll: (c: string, e: string) => call('roll_npc_initiative', [c, e, randomUUID()]),
    order: (c: string, e: string, ids: string[]) =>
      res(`select ${schema}.set_turn_order($1,$2,$3::uuid[],$4) result`, [c, e, ids, randomUUID()]),
    turn: (c: string, e: string, dir: number, expected: string | null, key = randomUUID()) =>
      call('advance_turn', [c, e, dir, expected, key]),
    jump: (c: string, e: string, target: string, expected: string | null) =>
      call('set_active_turn', [c, e, target, expected, randomUUID()]),
    hp: (c: string, e: string, mode: string, hits: Json[], key = randomUUID()) =>
      call('apply_combat_hp', [c, e, mode, JSON.stringify(hits), key]),
    condition: (c: string, id: string, key: string, on: boolean) =>
      call('set_combat_condition', [c, id, key, on, randomUUID()]),
    concentrate: (c: string, id: string, spell: string | null) =>
      call('set_concentration', [c, id, spell, randomUUID()]),
    deathSave: (c: string, id: string, outcome: string) =>
      call('record_death_save', [c, id, outcome, randomUUID()]),
    effect: (c: string, e: string, effect: Json) =>
      call('add_combat_effect', [c, e, JSON.stringify(effect), randomUUID()]),
    dropEffect: (c: string, id: string) => call('remove_combat_effect', [c, id, randomUUID()]),
    undo: (c: string, id: string) => call('undo_combat_event', [c, id, randomUUID()]),
    saveTemplate: (c: string, id: string | null, rev: number | null, data: Json) =>
      call('save_combatant_template', [c, id, rev, JSON.stringify(data), randomUUID()]),
    templates: async (c: string) =>
      (await res(`select ${schema}.list_combatant_templates($1) result`, [c])) as unknown as Json[],
    list: async (c: string) =>
      (await res(`select ${schema}.list_encounters($1) result`, [c])) as unknown as Json[],
    state: async (c: string, e: string | null = null, table = false) =>
      (await res(`select ${schema}.get_combat_state($1,$2,$3) result`, [c, e, table])) as State,
    del: (c: string, e: string) => call('delete_encounter', [c, e]),
  }
}
const pub = api()

async function setup(schema = 'public') {
  await asUser(dm)
  const c = (await one<{ id: string }>(`select ${schema}.create_campaign('Combat table') id`)).id
  const ids: Record<string, string> = {}
  for (const name of ['Arin', 'Bea', 'Cato'])
    ids[name] = (
      await one<{ id: string }>(`select ${schema}.create_character($1,$2) id`, [c, name])
    ).id
  for (const [user, email, character] of [
    [player, 'player@example.com', ids.Arin],
    [peer, 'peer@example.com', ids.Bea],
    [third, 'third@example.com', ids.Cato],
  ] as const) {
    await asUser(dm)
    const id = (
      await one<{ id: string }>(`select ${schema}.invite_character_player($1,$2,$3) id`, [
        c,
        character,
        email,
      ])
    ).id
    await asUser(user)
    await db.query(`select ${schema}.respond_campaign_invitation($1,true)`, [id])
  }
  await asUser(dm)
  for (const [character, hp, ac] of [
    [ids.Arin, 20, 15],
    [ids.Bea, 12, 13],
    [ids.Cato, 30, 18],
  ] as const)
    await db.query(`select ${schema}.save_character_sheet($1,$2,0,3,$3,$4,'{}'::jsonb,true,$5)`, [
      c,
      character,
      hp,
      ac,
      randomUUID(),
    ])
  // Cato does not share live state with the party (ADR 020).
  await db.query(`select ${schema}.set_character_live_sharing($1,$2,false)`, [c, ids.Cato])
  return { c, ...(ids as { Arin: string; Bea: string; Cato: string }) }
}

/** An encounter with the three characters, two goblins sharing initiative and a hidden ogre. */
async function prepared(s: Awaited<ReturnType<typeof setup>>, schema = 'public') {
  const a = api(schema)
  await asUser(dm)
  const { encounter_id: e } = (await a.create(s.c, 'Ambush')) as { encounter_id: string }
  await a.add(s.c, e, [
    { kind: 'character', character_id: s.Arin },
    { kind: 'character', character_id: s.Bea },
    { kind: 'character', character_id: s.Cato },
    {
      kind: 'npc',
      name: 'Goblin',
      count: 2,
      max_hp: 7,
      armor_class: 15,
      initiative_bonus: 2,
      share_initiative: true,
      dm_notes: 'Flee at half',
    },
    { kind: 'npc', name: 'Ogre', max_hp: 59, armor_class: 11, hidden: true },
  ])
  const state = await a.state(s.c, e)
  const by = (name: string) => state.combatants.find((x) => x.name === name)!.id
  return {
    e,
    arin: by('Arin'),
    bea: by('Bea'),
    cato: by('Cato'),
    gob1: by('Goblin 1'),
    gob2: by('Goblin 2'),
    ogre: by('Ogre'),
  }
}
const vitals = async (character: string, schema = 'public') => {
  await db.exec('reset role')
  return one<{
    current_hp: number
    temp_hp: number
    conditions: string[]
    death_successes: number
    death_failures: number
  }>(
    `select current_hp, temp_hp, conditions, death_successes, death_failures from ${schema}.character_vitals where character_id=$1`,
    [character],
  )
}

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`)
  for (const [id, email] of [
    [dm, 'dm@example.com'],
    [player, 'player@example.com'],
    [peer, 'peer@example.com'],
    [third, 'third@example.com'],
    [outsider, 'other@example.com'],
  ])
    await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [
      id,
      email,
    ])
  const files = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files.filter((f) => f < migration))
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  // A PRE copied before the combat migration exercises its guarded PRE mirror.
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

describe('RYT-007 shared combat', () => {
  it('runs initiative, turns, rounds and ends with a summary', async () => {
    const s = await setup()
    const x = await prepared(s)
    // Players do not see drafts.
    await asUser(player)
    expect(await pub.list(s.c)).toEqual([])
    await expect(pub.state(s.c, x.e)).rejects.toThrow(/Encounter unavailable/)
    expect((await pub.state(s.c)).encounter).toBeNull()
    await asUser(dm)
    await pub.status(s.c, x.e, 'initiative')
    await asUser(player)
    expect(await pub.list(s.c)).toMatchObject([
      { id: x.e, status: 'initiative', needs_initiative: true, combatants: 5 },
    ])
    // The Player sets only the own initiative (with the DEX tiebreak).
    await pub.initiative(s.c, x.arin, 17, 3)
    await expect(pub.initiative(s.c, x.bea, 12)).rejects.toThrow(/Forbidden/)
    await expect(pub.initiative(s.c, x.gob1, 12)).rejects.toThrow(/Forbidden/)
    await expect(pub.initiative(s.c, x.ogre, 12)).rejects.toThrow(/Combatant unavailable/)
    expect((await pub.list(s.c))[0]).toMatchObject({ needs_initiative: false })
    await asUser(peer)
    await pub.initiative(s.c, x.bea, 17, 1)
    await asUser(dm)
    await pub.initiative(s.c, x.cato, 5)
    // Server roll: one value for the shared goblin group; the hidden ogre rolls too.
    expect(await pub.roll(s.c, x.e)).toMatchObject({ rolled: 2 })
    const rolled = await pub.state(s.c, x.e)
    const gob = rolled.combatants.filter((c) => c.name.startsWith('Goblin'))
    expect(gob[0]!.initiative).toBe(gob[1]!.initiative)
    expect(gob[0]!.initiative).toBeGreaterThanOrEqual(3)
    expect(gob[0]!.initiative).toBeLessThanOrEqual(22)
    // Pin the order for deterministic turns: Arin 17 (+3), Bea 17 (+1), goblins 10, Cato 5.
    await pub.update(s.c, x.ogre, { hidden: false })
    await pub.initiative(s.c, x.gob1, 10)
    await pub.initiative(s.c, x.ogre, 1)
    await pub.update(s.c, x.ogre, { hidden: true })
    let st = await pub.state(s.c, x.e)
    expect(st.combatants.map((c) => c.name)).toEqual([
      'Arin',
      'Bea',
      'Goblin 1',
      'Goblin 2',
      'Cato',
      'Ogre',
    ])
    // The DM reorders a tie (goblins).
    await pub.order(s.c, x.e, [x.gob2, x.gob1])
    st = await pub.state(s.c, x.e)
    expect(st.combatants.map((c) => c.name).slice(2, 4)).toEqual(['Goblin 2', 'Goblin 1'])
    await pub.status(s.c, x.e, 'active')
    st = await pub.state(s.c, x.e)
    expect(st.encounter).toMatchObject({ status: 'active', round: 1, active_combatant: x.arin })
    // Double taps are rejected by the expected active guard; retries replay.
    const key = randomUUID()
    await pub.turn(s.c, x.e, 1, x.arin, key)
    expect(await pub.turn(s.c, x.e, 1, x.arin, key)).toMatchObject({ active_combatant: x.bea })
    await expect(pub.turn(s.c, x.e, 1, x.arin)).rejects.toThrow(/Stale turn/)
    // A Player ends only its own active turn and never goes back.
    await asUser(player)
    await expect(pub.turn(s.c, x.e, 1, x.bea)).rejects.toThrow(/Forbidden/)
    await asUser(peer)
    await expect(pub.turn(s.c, x.e, -1, x.bea)).rejects.toThrow(/Forbidden/)
    expect(await pub.turn(s.c, x.e, 1, x.bea)).toMatchObject({ active_combatant: x.gob2 })
    await asUser(dm)
    await pub.turn(s.c, x.e, 1, x.gob2)
    await pub.turn(s.c, x.e, 1, x.gob1)
    // The hidden ogre is skipped; the round advances on wrap.
    expect(await pub.turn(s.c, x.e, 1, x.cato)).toMatchObject({
      round: 2,
      active_combatant: x.arin,
    })
    expect(await pub.turn(s.c, x.e, -1, x.arin)).toMatchObject({
      round: 1,
      active_combatant: x.cato,
    })
    await pub.turn(s.c, x.e, 1, x.cato)
    await expect(pub.jump(s.c, x.e, x.ogre, x.arin)).rejects.toThrow(/Invalid request/)
    expect(await pub.jump(s.c, x.e, x.cato, x.arin)).toMatchObject({ active_combatant: x.cato })
    // Only one live encounter per campaign.
    const second = (await pub.create(s.c, 'Second')) as { encounter_id: string }
    await expect(pub.status(s.c, second.encounter_id, 'initiative')).rejects.toThrow(
      /Encounter busy/,
    )
    await expect(pub.del(s.c, x.e)).rejects.toThrow(/Encounter live/)
    // Damage dealt during Cato's turn is attributed to Cato.
    await pub.hp(s.c, x.e, 'damage', [{ combatant_id: x.gob1, amount: 9 }])
    await pub.status(s.c, x.e, 'ended')
    st = await pub.state(s.c, x.e)
    expect(st.encounter).toMatchObject({ status: 'ended', active_combatant: null })
    const summary = st.encounter!.summary!
    expect(summary.rounds).toBe(2)
    expect(summary.combatants).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'Cato', damage_dealt: 9 }),
        expect.objectContaining({ name: 'Goblin 1', damage_taken: 9, defeated: true }),
      ]),
    )
    // Players see the summary without the never-revealed ogre.
    await asUser(player)
    const seen = (await pub.state(s.c, x.e)).encounter!.summary!
    expect(seen.combatants.map((c) => c.name)).not.toContain('Ogre')
    await asUser(dm)
    expect(await pub.del(s.c, x.e)).toEqual({ deleted: true })
  })

  it('applies hit points, conditions, death saves and concentration through one source of truth', async () => {
    const s = await setup()
    const x = await prepared(s)
    await pub.status(s.c, x.e, 'active')
    // Temporary HP do not stack and absorb damage first.
    await asUser(player)
    await pub.hp(s.c, x.e, 'temp', [{ combatant_id: x.arin, amount: 5 }])
    await pub.hp(s.c, x.e, 'temp', [{ combatant_id: x.arin, amount: 3 }])
    expect(await vitals(s.Arin)).toMatchObject({ current_hp: 20, temp_hp: 5 })
    await asUser(player)
    await pub.concentrate(s.c, x.arin, 'Bless')
    const hit = (await pub.hp(s.c, x.e, 'damage', [{ combatant_id: x.arin, amount: 8 }])) as {
      hits: Json[]
    }
    expect(hit.hits[0]).toMatchObject({ concentration_dc: 10, concentration: 'Bless' })
    expect(await vitals(s.Arin)).toMatchObject({ current_hp: 17, temp_hp: 0 })
    // A Player never damages others; the DM hits several targets in one transaction.
    await asUser(player)
    await expect(pub.hp(s.c, x.e, 'damage', [{ combatant_id: x.bea, amount: 1 }])).rejects.toThrow(
      /Forbidden/,
    )
    await expect(pub.hp(s.c, x.e, 'damage', [{ combatant_id: x.gob1, amount: 1 }])).rejects.toThrow(
      /Forbidden/,
    )
    await asUser(dm)
    const multi = (await pub.hp(s.c, x.e, 'damage', [
      { combatant_id: x.arin, amount: 40 },
      { combatant_id: x.bea, amount: 3 },
      { combatant_id: x.gob1, amount: 3 },
    ])) as { hits: Json[] }
    expect(multi.hits[0]).toMatchObject({ result: 'down', concentration_lost: true })
    expect(await vitals(s.Arin)).toMatchObject({ current_hp: 0, conditions: ['unconscious'] })
    expect(await vitals(s.Bea)).toMatchObject({ current_hp: 9 })
    // Death saves: damage at 0 is a failure; nat1 counts two; three failures defeat.
    await asUser(player)
    await pub.deathSave(s.c, x.arin, 'success')
    await pub.hp(s.c, x.e, 'damage', [{ combatant_id: x.arin, amount: 2 }])
    expect(await vitals(s.Arin)).toMatchObject({ death_successes: 1, death_failures: 1 })
    // Healing wakes the character and resets the saves.
    await pub.hp(s.c, x.e, 'heal', [{ combatant_id: x.arin, amount: 4 }])
    expect(await vitals(s.Arin)).toMatchObject({
      current_hp: 4,
      conditions: [],
      death_successes: 0,
      death_failures: 0,
    })
    await expect(pub.deathSave(s.c, x.arin, 'success')).rejects.toThrow(/Not dying/)
    await asUser(dm)
    await pub.hp(s.c, x.e, 'damage', [{ combatant_id: x.arin, amount: 4 }])
    await asUser(player)
    await pub.deathSave(s.c, x.arin, 'nat20')
    expect(await vitals(s.Arin)).toMatchObject({ current_hp: 1, conditions: [] })
    await asUser(dm)
    await pub.hp(s.c, x.e, 'damage', [{ combatant_id: x.arin, amount: 1 }])
    await asUser(player)
    await pub.deathSave(s.c, x.arin, 'nat1')
    expect(await pub.deathSave(s.c, x.arin, 'failure')).toMatchObject({ result: 'dead' })
    let st = await pub.state(s.c, x.e)
    expect(st.combatants.find((c) => c.id === x.arin)).toMatchObject({
      defeated: true,
      hp_status: 'down',
    })
    // NPCs at 0 are defeated; healing revives them.
    await asUser(dm)
    await pub.hp(s.c, x.e, 'damage', [{ combatant_id: x.gob2, amount: 50 }])
    st = await pub.state(s.c, x.e)
    expect(st.combatants.find((c) => c.id === x.gob2)).toMatchObject({
      defeated: true,
      hp: { current: 0, max: 7, temp: 0 },
    })
    await pub.hp(s.c, x.e, 'heal', [{ combatant_id: x.gob2, amount: 2 }])
    expect((await pub.state(s.c, x.e)).combatants.find((c) => c.id === x.gob2)).toMatchObject({
      defeated: false,
    })
    // Conditions on characters live in character_vitals (the sheet sees them).
    await asUser(peer)
    await pub.condition(s.c, x.bea, 'prone', true)
    expect(await vitals(s.Bea)).toMatchObject({ conditions: ['prone'] })
    await asUser(dm)
    await pub.condition(s.c, x.gob1, 'frightened', true)
    await asUser(peer)
    await expect(pub.condition(s.c, x.gob1, 'prone', true)).rejects.toThrow(/Forbidden/)
    await expect(pub.condition(s.c, x.bea, 'cursed', true)).rejects.toThrow(/Invalid request/)
    await expect(pub.hp(s.c, x.e, 'damage', [{ combatant_id: x.bea, amount: -1 }])).rejects.toThrow(
      /Invalid request/,
    )
    await expect(
      pub.hp(s.c, x.e, 'damage', [
        { combatant_id: x.bea, amount: 1 },
        { combatant_id: x.bea, amount: 1 },
      ]),
    ).rejects.toThrow(/Invalid request/)
    // A retried damage request applies once.
    const key = randomUUID()
    await pub.hp(s.c, x.e, 'damage', [{ combatant_id: x.bea, amount: 2 }], key)
    await pub.hp(s.c, x.e, 'damage', [{ combatant_id: x.bea, amount: 2 }], key)
    expect(await vitals(s.Bea)).toMatchObject({ current_hp: 7 })
    await asUser(peer)
    await expect(
      pub.hp(s.c, x.e, 'damage', [{ combatant_id: x.bea, amount: 3 }], key),
    ).rejects.toThrow(/Request mismatch/)
    // Every vitals change of a character in a live encounter bumps its revision (realtime).
    await asUser(dm)
    const before = (await pub.state(s.c, x.e)).encounter!.revision
    await db.query(
      'select public.set_character_resources($1,$2,(select revision from public.character_resources where character_id=$2),0,0,0,2,$3)',
      [s.c, s.Bea, randomUUID()],
    )
    expect((await pub.state(s.c, x.e)).encounter!.revision).toBeGreaterThan(before)
  })

  it('ticks timed effects and undoes events with compensation', async () => {
    const s = await setup()
    const x = await prepared(s)
    await asUser(player)
    await expect(
      pub.effect(s.c, x.e, { target_combatant: x.arin, label: 'Bless' }),
    ).rejects.toThrow(/Encounter unavailable/)
    await asUser(dm)
    await pub.initiative(s.c, x.arin, 20)
    await pub.initiative(s.c, x.bea, 15)
    await pub.initiative(s.c, x.cato, 10)
    await pub.initiative(s.c, x.gob1, 5)
    await pub.status(s.c, x.e, 'active')
    // Hold on Bea for 1 round, ending at the end of Arin's turn (the source).
    await pub.effect(s.c, x.e, {
      target_combatant: x.bea,
      source_combatant: x.arin,
      label: 'Hold',
      condition: 'paralyzed',
      rounds: 1,
      ticks_on: 'end',
    })
    // A secret effect the Players do not see.
    await pub.effect(s.c, x.e, { target_combatant: x.gob1, label: 'Marked', visible: false })
    expect(await vitals(s.Bea)).toMatchObject({ conditions: ['paralyzed'] })
    await asUser(peer)
    let seen = await pub.state(s.c, x.e)
    expect(seen.effects.map((f) => f.label)).toEqual(['Hold'])
    // Players add effects only to their own character.
    await expect(
      pub.effect(s.c, x.e, { target_combatant: x.gob1, label: 'Hex', rounds: 10 }),
    ).rejects.toThrow(/Forbidden/)
    const own = (await pub.effect(s.c, x.e, {
      target_combatant: x.bea,
      label: 'Shield of Faith',
      rounds: 2,
      ticks_on: 'start',
    })) as { effect_id: string }
    await asUser(dm)
    await pub.turn(s.c, x.e, 1, x.arin)
    expect(await vitals(s.Bea)).toMatchObject({ conditions: [] })
    let st = await pub.state(s.c, x.e)
    expect(st.effects.map((f) => f.label).sort()).toEqual(['Marked', 'Shield of Faith'])
    // Bea's turn starts: Shield of Faith counts down.
    expect(st.effects.find((f) => f.label === 'Shield of Faith')!.remaining_rounds).toBe(1)
    expect(st.events.some((e) => e.kind === 'effect_expired' && e.target_name === 'Bea')).toBe(true)
    await asUser(peer)
    await pub.dropEffect(s.c, own.effect_id)
    const marked = st.effects.find((f) => f.label === 'Marked')!
    await expect(pub.dropEffect(s.c, marked.id)).rejects.toThrow(
      /Combatant unavailable|Forbidden|Effect unavailable/,
    )
    // Undo: the Player undoes its own damage; a later change blocks a stale undo.
    await pub.hp(s.c, x.e, 'damage', [{ combatant_id: x.bea, amount: 5 }])
    seen = await pub.state(s.c, x.e)
    const dmg = seen.events.find((e) => e.kind === 'damage')!
    expect(dmg).toMatchObject({ amount: 5, undoable: true })
    await pub.undo(s.c, dmg.id)
    expect(await vitals(s.Bea)).toMatchObject({ current_hp: 12 })
    await expect(pub.undo(s.c, dmg.id)).rejects.toThrow(/Already undone/)
    await asUser(dm)
    await pub.hp(s.c, x.e, 'damage', [{ combatant_id: x.bea, amount: 2 }])
    st = await pub.state(s.c, x.e)
    const dmDamage = st.events.find((e) => e.kind === 'damage' && !e.undone)!
    await asUser(peer)
    // Not the Player's event.
    await expect(pub.undo(s.c, dmDamage.id)).rejects.toThrow(/Forbidden/)
    await asUser(dm)
    await pub.condition(s.c, x.bea, 'prone', true)
    await expect(pub.undo(s.c, dmDamage.id)).rejects.toThrow(/Undo conflict/)
    st = await pub.state(s.c, x.e)
    await pub.undo(s.c, st.events.find((e) => e.kind === 'condition_on' && !e.undone)!.id)
    await pub.undo(s.c, dmDamage.id)
    expect(await vitals(s.Bea)).toMatchObject({ current_hp: 12, conditions: [] })
    // Turn events are not undoable.
    st = await pub.state(s.c, x.e)
    await expect(pub.undo(s.c, st.events.find((e) => e.kind === 'turn')!.id)).rejects.toThrow(
      /Not undoable/,
    )
  })

  it('projects roles: no hidden combatants, NPC numbers, DM notes or unshared vitals', async () => {
    const s = await setup()
    const x = await prepared(s)
    await pub.status(s.c, x.e, 'active')
    await pub.effect(s.c, x.e, { target_combatant: x.ogre, label: 'Lurking' })
    await pub.hp(s.c, x.e, 'damage', [{ combatant_id: x.gob1, amount: 4 }])
    await pub.hp(s.c, x.e, 'damage', [{ combatant_id: x.ogre, amount: 1 }])
    const dmView = await pub.state(s.c, x.e)
    expect(dmView.viewer.role).toBe('dm')
    expect(dmView.combatants.find((c) => c.id === x.ogre)).toMatchObject({ hidden: true })
    expect(dmView.combatants.find((c) => c.id === x.gob1)).toMatchObject({
      dm_notes: 'Flee at half',
      armor_class: 15,
      hp: { current: 3, max: 7, temp: 0 },
    })
    for (const [who, table] of [
      [player, false],
      [dm, true],
    ] as const) {
      await asUser(who)
      const view = await pub.state(s.c, x.e, table)
      const text = JSON.stringify(view)
      expect(view.viewer.role).toBe(table ? 'table' : 'player')
      expect(view.combatants.map((c) => c.name)).not.toContain('Ogre')
      expect(text).not.toMatch(/Ogre|Lurking|Flee at half|dm_notes|"hidden"/)
      const gob = view.combatants.find((c) => c.id === x.gob1)!
      expect(gob.hp).toBeUndefined()
      expect(gob.armor_class).toBeUndefined()
      expect(gob.hp_status).toBe('bloodied')
      expect(view.combatants.find((c) => c.id === x.gob2)!.hp_status).toBe('unhurt')
      // Cato does not share live: name and order only.
      const cato = view.combatants.find((c) => c.id === x.cato)!
      expect(cato.hp_status).toBe('unknown')
      expect(cato.hp).toBeUndefined()
      expect(cato.conditions).toBeUndefined()
      // Bea shares live.
      expect(view.combatants.find((c) => c.id === x.bea)).toMatchObject({
        hp: { current: 12, max: 12 },
        armor_class: 13,
        is_own: false,
        can_act: false,
      })
      expect(view.combatants.find((c) => c.id === x.arin)).toMatchObject({
        is_own: !table,
        can_act: !table,
      })
      expect(view.events.every((e) => !table || !e.undoable)).toBe(true)
    }
    // The DM reveals exact hit points of one goblin.
    await asUser(dm)
    await pub.update(s.c, x.gob1, { hp_revealed: true })
    await asUser(player)
    expect((await pub.state(s.c, x.e)).combatants.find((c) => c.id === x.gob1)!.hp).toMatchObject({
      current: 3,
      max: 7,
    })
    // Players read the encounters row (realtime) but no combat table directly.
    expect(
      (await db.query('select id from public.encounters where campaign_id=$1', [s.c])).rows,
    ).toHaveLength(1)
    for (const table of [
      'encounter_combatants',
      'encounter_effects',
      'encounter_events',
      'combatant_templates',
    ])
      expect(
        (await db.query(`select * from public.${table} where campaign_id=$1`, [s.c])).rows,
      ).toHaveLength(0)
  })

  it('keeps a homebrew bestiary and adds numbered combatants from templates', async () => {
    const s = await setup()
    await asUser(dm)
    const { id } = (await pub.saveTemplate(s.c, null, null, {
      name: 'Bandit',
      max_hp: 11,
      armor_class: 12,
      initiative_bonus: 1,
      notes: 'Scimitar',
    })) as { id: string }
    await expect(pub.saveTemplate(s.c, id, 5, { name: 'Bandit', max_hp: 11 })).rejects.toThrow(
      /Stale revision/,
    )
    await pub.saveTemplate(s.c, id, 0, { name: 'Bandit', max_hp: 12, armor_class: 12 })
    expect(await pub.templates(s.c)).toMatchObject([{ name: 'Bandit', max_hp: 12, revision: 1 }])
    const { encounter_id: e } = (await pub.create(s.c, 'Road')) as { encounter_id: string }
    await pub.add(s.c, e, [{ kind: 'npc', template_id: id, count: 2 }])
    await pub.add(s.c, e, [
      { kind: 'npc', template_id: id },
      { kind: 'lair', name: 'Cave' },
    ])
    const st = await pub.state(s.c, e)
    expect(st.combatants.map((c) => c.name).sort()).toEqual([
      'Bandit 1',
      'Bandit 2',
      'Bandit 3',
      'Cave',
    ])
    expect(st.combatants.find((c) => c.name === 'Cave')).toMatchObject({
      kind: 'lair',
      initiative: 20,
    })
    expect(st.combatants.find((c) => c.name === 'Bandit 3')).toMatchObject({
      hp: { current: 12, max: 12 },
      armor_class: 12,
    })
    await pub.remove(s.c, st.combatants.find((c) => c.name === 'Bandit 3')!.id)
    expect((await pub.state(s.c, e)).combatants).toHaveLength(3)
    await asUser(player)
    await expect(pub.templates(s.c)).rejects.toThrow(/Forbidden/)
    await expect(pub.saveTemplate(s.c, null, null, { name: 'X', max_hp: 1 })).rejects.toThrow(
      /Forbidden/,
    )
    await asUser(dm)
    await expect(pub.add(s.c, e, [{ kind: 'npc', name: 'Bad', max_hp: 0 }])).rejects.toThrow(
      /Invalid request/,
    )
    await expect(pub.add(s.c, e, [{ kind: 'dragon' }])).rejects.toThrow(/Invalid request/)
  })

  it('denies anon, outsiders, cross-campaign DMs, inactive members and direct writes', async () => {
    const s = await setup()
    const x = await prepared(s)
    await pub.status(s.c, x.e, 'active')
    await asUser(outsider)
    const other = (await one<{ id: string }>("select public.create_campaign('Other') id")).id
    await expect(pub.state(s.c, x.e)).rejects.toThrow(/Forbidden/)
    await expect(pub.list(s.c)).rejects.toThrow(/Forbidden/)
    await expect(pub.create(s.c, 'Nope')).rejects.toThrow(/Forbidden/)
    await expect(pub.hp(s.c, x.e, 'damage', [{ combatant_id: x.arin, amount: 1 }])).rejects.toThrow(
      /Forbidden/,
    )
    // A DM of another campaign cannot swap campaign ids.
    await expect(pub.state(other, x.e)).rejects.toThrow(/Encounter unavailable/)
    await expect(
      pub.hp(other, x.e, 'damage', [{ combatant_id: x.arin, amount: 1 }]),
    ).rejects.toThrow(/Encounter unavailable/)
    await expect(pub.update(other, x.gob1, { name: 'Mine' })).rejects.toThrow(
      /Combatant unavailable/,
    )
    await expect(pub.turn(other, x.e, 1, x.arin)).rejects.toThrow(/Encounter unavailable/)
    await expect(
      pub.add(other, x.e, [{ kind: 'character', character_id: s.Arin }]),
    ).rejects.toThrow(/Encounter unavailable/)
    expect((await db.query('select * from public.encounters')).rows).toHaveLength(0)
    // Players never run DM operations.
    await asUser(player)
    await expect(pub.create(s.c, 'Mine')).rejects.toThrow(/Forbidden/)
    await expect(pub.status(s.c, x.e, 'ended')).rejects.toThrow(/Forbidden/)
    await expect(pub.add(s.c, x.e, [{ kind: 'npc', name: 'Imp', max_hp: 3 }])).rejects.toThrow(
      /Forbidden/,
    )
    await expect(pub.update(s.c, x.gob1, { defeated: true })).rejects.toThrow(/Forbidden/)
    await expect(pub.remove(s.c, x.gob1)).rejects.toThrow(/Forbidden/)
    await expect(pub.roll(s.c, x.e)).rejects.toThrow(/Forbidden/)
    await expect(pub.order(s.c, x.e, [x.arin])).rejects.toThrow(/Forbidden/)
    await expect(pub.jump(s.c, x.e, x.arin, x.arin)).rejects.toThrow(/Forbidden/)
    await expect(pub.del(s.c, x.e)).rejects.toThrow(/Forbidden/)
    await expect(pub.concentrate(s.c, x.bea, 'Bless')).rejects.toThrow(/Forbidden/)
    await expect(pub.deathSave(s.c, x.bea, 'success')).rejects.toThrow(/Forbidden/)
    // Direct writes are closed for every signed-in role.
    for (const actor of [player, dm]) {
      await asUser(actor)
      for (const sql of [
        "update public.encounters set status='ended'",
        'delete from public.encounter_combatants',
        'update public.encounter_events set visible=true',
        'delete from public.combatant_templates',
      ])
        await expect(db.query(sql)).rejects.toThrow(/permission denied/)
    }
    // Inactive members lose access.
    await asUser(dm)
    await db.query('select public.change_campaign_member($1,$2,null)', [s.c, third])
    await asUser(third)
    await expect(pub.state(s.c, x.e)).rejects.toThrow(/Forbidden/)
    await expect(pub.initiative(s.c, x.cato, 3)).rejects.toThrow(/Forbidden/)
    expect(
      (await db.query('select * from public.encounters where campaign_id=$1', [s.c])).rows,
    ).toHaveLength(0)
    await db.exec('reset role; set role anon')
    await expect(pub.state(s.c, x.e)).rejects.toThrow(/permission denied/)
    await expect(pub.create(s.c, 'x')).rejects.toThrow(/permission denied/)
    await expect(db.query('select * from public.encounters')).rejects.toThrow(/permission denied/)
    await db.exec('reset role')
  })

  it('accepts exactly the SRD conditions of the client', async () => {
    const { combatConditions } = await import('../../src/features/combat/domain/combat.ts')
    const { conditionKeys } = await import('../../src/features/characters/domain/srd.ts')
    // The combat client, the sheet and both SQL checks share one SRD list.
    expect([...combatConditions]).toEqual([...conditionKeys])
    const s = await setup()
    const x = await prepared(s)
    await pub.status(s.c, x.e, 'active')
    for (const key of combatConditions) await pub.condition(s.c, x.gob1, key, true)
    const gob = (await pub.state(s.c, x.e)).combatants.find((c) => c.id === x.gob1)!
    expect(gob.conditions!.sort()).toEqual([...combatConditions].sort())
  })

  it('returns states the client schema accepts before any turn is active', async () => {
    const { combatStateSchema } = await import('../../src/features/combat/domain/combat.ts')
    for (const schema of ['public', 'pre']) {
      const a = api(schema)
      const s = await setup(schema)
      const x = await prepared(s, schema)
      // A character without a linked player keeps is_own/can_act as booleans for Players.
      const npcHero = (
        await one<{ id: string }>(`select ${schema}.create_character($1,'Dara') id`, [s.c])
      ).id
      await a.add(s.c, x.e, [{ kind: 'character', character_id: npcHero }])
      // Draft and initiative have no active combatant: is_active must still be a boolean.
      const draft = await a.state(s.c, x.e)
      expect(() => combatStateSchema.parse(draft)).not.toThrow()
      expect(draft.combatants.every((c) => c.is_active === false)).toBe(true)
      await a.status(s.c, x.e, 'initiative')
      // A visible effect on an NPC: Players get can_remove false, not null.
      await a.effect(s.c, x.e, { target_combatant: x.gob1, label: 'Marked' })
      for (const [user, table] of [
        [dm, false],
        [dm, true],
        [player, false],
      ] as const) {
        await asUser(user)
        const view = await a.state(s.c, x.e, table)
        expect(() => combatStateSchema.parse(view)).not.toThrow()
        expect(view.combatants.find((c) => c.name === 'Dara')).toMatchObject({ is_own: false })
      }
    }
  })

  it('mirrors tables, triggers and RPCs into a PRE copied before the migration', async () => {
    await db.exec('reset role')
    expect((await db.query("select to_regclass('pre.encounters') t")).rows[0]).toEqual({
      t: 'pre.encounters',
    })
    const s = await setup('pre')
    const pre = api('pre')
    const x = await prepared(s, 'pre')
    await pre.status(s.c, x.e, 'active')
    await asUser(player)
    await pre.hp(s.c, x.e, 'damage', [{ combatant_id: x.arin, amount: 5 }])
    expect(await vitals(s.Arin, 'pre')).toMatchObject({ current_hp: 15 })
    await asUser(player)
    const view = await pre.state(s.c, x.e)
    expect(view.combatants.map((c) => c.name)).not.toContain('Ogre')
    // PRE helpers authorize only against PRE membership.
    await expect(pub.state(s.c, x.e)).rejects.toThrow(/Forbidden/)
    await db.exec('reset role')
    const triggers = (
      await db.query<{ n: string }>(
        "select tgname n from pg_trigger where tgrelid='pre.character_vitals'::regclass and tgname='vitals_combat'",
      )
    ).rows
    expect(triggers).toHaveLength(1)
    const sources = (
      await db.query<{ src: string }>(
        "select prosrc src from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('pre','pre_private') and (p.proname like '%combat%' or p.proname like '%encounter%' or p.proname like '%initiative%')",
      )
    ).rows
    expect(sources.length).toBeGreaterThanOrEqual(30)
    for (const { src } of sources) expect(src).not.toMatch(/\bpublic\.|\bprivate\./)
  })
})
