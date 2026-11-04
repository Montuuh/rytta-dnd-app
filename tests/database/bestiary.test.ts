import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-046/047/048 (ADR 028): full stat blocks on templates, alias, rolled hit points and trackers.
const migration = '20261109120000_bestiary.sql'
const db = new PGlite()
const dm = randomUUID(),
  player = randomUUID(),
  outsider = randomUUID(),
  otherDm = randomUUID()
const asUser = async (id: string) => {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
}
const asAnon = async () => {
  await db.exec('reset role; set role anon')
  await db.query("select set_config('request.jwt.claim.sub', '', false)")
}
type Json = Record<string, unknown>
const one = async <T = Json>(sql: string, args: unknown[] = []) =>
  (await db.query<T>(sql, args)).rows[0]!
const res = async (sql: string, args: unknown[] = []) =>
  (await one<{ result: Json }>(sql, args)).result

type Tracker = { key: string; kind: string; spent?: boolean; used?: number; min?: number }
type Combatant = {
  id: string
  name: string
  public_name?: string
  srd_id?: string
  template_id?: string
  trackers?: Tracker[]
  image_path?: string
  hp?: { current: number; max: number }
}
type Event = { kind: string; target_name?: string; amount?: number; detail: Json }
type State = {
  combatants: Combatant[]
  events: Event[]
  encounter: { summary?: { combatants: { name: string }[] } | null }
}

const block = {
  name: 'Shadow Hound',
  meta: 'Medium Monstrosity, Neutral Evil',
  ac: '14',
  initiative: '+3 (13)',
  hp: '27 (5d8 + 5)',
  hpFormula: '5d8+5',
  speed: '40 ft.',
  abilities: { str: { score: 14, mod: 2, save: 2 } },
  details: { senses: 'Darkvision 60 ft.; Passive Perception 13' },
  cr: '1 (XP 200; PB +2)',
  sections: [
    {
      kind: 'actions',
      entries: [
        { key: 'bite', name: 'Bite', text: ['*Melee Attack Roll:* +5, reach 5 ft.'] },
        {
          key: 'shadow-breath',
          name: 'Shadow Breath (Recharge 5–6)',
          text: ['Each creature in a cone.'],
          usage: { recharge: 5 },
        },
      ],
    },
  ],
}

function api(schema = 'public') {
  const call = (fn: string, args: unknown[]) =>
    res(`select ${schema}.${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) result`, args)
  return {
    create: async (c: string, name: string) =>
      ((await call('create_encounter', [c, name, randomUUID()])) as { encounter_id: string })
        .encounter_id,
    status: (c: string, e: string, s: string) =>
      call('set_encounter_status', [c, e, s, randomUUID()]),
    add: (c: string, e: string, entries: Json[]) =>
      call('add_combatants', [c, e, JSON.stringify(entries), randomUUID()]),
    update: (c: string, id: string, patch: Json) =>
      call('update_combatant', [c, id, JSON.stringify(patch), randomUUID()]),
    turn: (c: string, e: string, expected: string | null) =>
      call('advance_turn', [c, e, 1, expected, randomUUID()]),
    jump: (c: string, e: string, target: string, expected: string | null) =>
      call('set_active_turn', [c, e, target, expected, randomUUID()]),
    tracker: (c: string, id: string, key: string, value: number, request = randomUUID()) =>
      call('set_combatant_tracker', [c, id, key, value, request]),
    template: async (c: string, data: Json, id: string | null = null, rev: number | null = null) =>
      (await call('save_combatant_template', [c, id, rev, JSON.stringify(data), randomUUID()])) as {
        id: string
        revision: number
      },
    templates: async (c: string) =>
      (await res(`select ${schema}.list_combatant_templates($1) result`, [c])) as unknown as Json[],
    state: async (c: string, e: string, table = false) =>
      (await res(`select ${schema}.get_combat_state($1,$2,$3) result`, [c, e, table])) as State,
  }
}
const pub = api()

async function setup(schema = 'public') {
  await asUser(dm)
  const c = (await one<{ id: string }>(`select ${schema}.create_campaign('Bestiary table') id`)).id
  const arin = (await one<{ id: string }>(`select ${schema}.create_character($1,'Arin') id`, [c]))
    .id
  const invite = (
    await one<{ id: string }>(`select ${schema}.invite_character_player($1,$2,$3) id`, [
      c,
      arin,
      'player@example.com',
    ])
  ).id
  await asUser(player)
  await db.query(`select ${schema}.respond_campaign_invitation($1,true)`, [invite])
  await asUser(dm)
  await db.query(`select ${schema}.save_character_sheet($1,$2,0,3,20,14,'{}'::jsonb,true,$3)`, [
    c,
    arin,
    randomUUID(),
  ])
  return { c, arin }
}

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`)
  for (const [id, email] of [
    [dm, 'dm@example.com'],
    [player, 'player@example.com'],
    [outsider, 'other@example.com'],
    [otherDm, 'otherdm@example.com'],
  ])
    await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [
      id,
      email,
    ])
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
}, 60000)
afterAll(() => db.close())

describe('ADR 028 bestiary templates', () => {
  it('stores full stat blocks with SRD origin, dice, CR and type, and keeps them on quick edits', async () => {
    const s = await setup()
    await asUser(dm)
    const t = await pub.template(s.c, {
      name: 'Shadow Hound',
      max_hp: 27,
      armor_class: 14,
      initiative_bonus: 3,
      stat_block: block,
      srd_id: 'wolf',
      hp_formula: '5d8 + 5',
      challenge: '1',
      creature_type: 'monstrosity',
    })
    expect((await pub.templates(s.c)).find((x) => x.id === t.id)).toMatchObject({
      stat_block: block,
      srd_id: 'wolf',
      hp_formula: '5d8+5',
      challenge: '1',
      creature_type: 'monstrosity',
      revision: 0,
    })
    // The quick dialog sends only core fields: the stat block and its metadata stay.
    await pub.template(s.c, { name: 'Shadow Hound', max_hp: 30 }, t.id, 0)
    expect((await pub.templates(s.c)).find((x) => x.id === t.id)).toMatchObject({
      max_hp: 30,
      stat_block: block,
      hp_formula: '5d8+5',
      revision: 1,
    })
    // Explicit nulls clear them.
    await pub.template(
      s.c,
      { name: 'Shadow Hound', max_hp: 30, stat_block: null, hp_formula: null },
      t.id,
      1,
    )
    const cleared = (await pub.templates(s.c)).find((x) => x.id === t.id)!
    expect(cleared.stat_block).toBeUndefined()
    expect(cleared.hp_formula).toBeUndefined()
    expect(cleared.srd_id).toBe('wolf')
    for (const bad of [
      { stat_block: 'text' },
      { stat_block: { ...block, script: '<b>' } },
      { stat_block: { sections: [{ kind: 'lair', entries: [] }] } },
      {
        stat_block: {
          sections: [{ kind: 'actions', entries: [{ key: 'a', name: 'A', text: [1] }] }],
        },
      },
      { stat_block: { notes: 'x'.repeat(50000) } },
      { hp_formula: '5d7' },
      { hp_formula: '0d8' },
      { challenge: '31' },
      { creature_type: 'robot' },
      { srd_id: 'Wolf!' },
    ])
      await expect(pub.template(s.c, { name: 'Bad', max_hp: 5, ...bad })).rejects.toThrow(
        /Invalid request/,
      )
    for (const user of [player, outsider, otherDm]) {
      await asUser(user)
      await expect(pub.template(s.c, { name: 'Nope', max_hp: 1 })).rejects.toThrow(/Forbidden/)
      await expect(pub.templates(s.c)).rejects.toThrow(/Forbidden/)
    }
    await asAnon()
    await expect(pub.templates(s.c)).rejects.toThrow(/permission denied/)
    await expect(db.query("select private.bestiary_roll('1d6')")).rejects.toThrow(
      /permission denied/,
    )
    await db.exec('reset role')
  })
})

describe('ADR 028 creatures in combat', () => {
  it('rolls hit points on the server, numbers aliases and keeps DM fields out of Player views', async () => {
    const s = await setup()
    await asUser(dm)
    const t = await pub.template(s.c, {
      name: 'Shadow Hound',
      max_hp: 27,
      hp_formula: '5d8+5',
      stat_block: block,
    })
    const e = await pub.create(s.c, 'Crypt')
    await pub.add(s.c, e, [
      { kind: 'character', character_id: s.arin, initiative: 15 },
      { kind: 'npc', template_id: t.id, count: 3, hp_mode: 'roll', public_name: 'Shadow' },
      {
        kind: 'npc',
        name: 'Wolf',
        srd_id: 'wolf',
        max_hp: 11,
        armor_class: 12,
        hp_formula: '2d8+2',
        trackers: [
          { key: 'bite-frenzy', kind: 'recharge', label: 'Frenzy (Recharge 5–6)', min: 5 },
          { key: 'howl', kind: 'uses', label: 'Howl (2/Day)', max: 2 },
        ],
      },
    ])
    let full = await pub.state(s.c, e)
    const hounds = full.combatants.filter((c) => c.name.startsWith('Shadow Hound'))
    expect(hounds.map((h) => [h.name, h.public_name])).toEqual([
      ['Shadow Hound 1', 'Shadow 1'],
      ['Shadow Hound 2', 'Shadow 2'],
      ['Shadow Hound 3', 'Shadow 3'],
    ])
    for (const h of hounds) {
      expect(h.hp!.max).toBeGreaterThanOrEqual(10)
      expect(h.hp!.max).toBeLessThanOrEqual(45)
      expect(h.hp!.current).toBe(h.hp!.max)
      expect(h.template_id).toBe(t.id)
    }
    const wolf = full.combatants.find((c) => c.name === 'Wolf')!
    expect(wolf).toMatchObject({ srd_id: 'wolf', hp: { current: 11, max: 11 } })
    expect(wolf.trackers).toEqual([
      {
        key: 'bite-frenzy',
        kind: 'recharge',
        label: 'Frenzy (Recharge 5–6)',
        min: 5,
        spent: false,
      },
      { key: 'howl', kind: 'uses', label: 'Howl (2/Day)', max: 2, used: 0 },
    ])
    // More aliases continue the numbering.
    await pub.add(s.c, e, [{ kind: 'npc', template_id: t.id, public_name: 'Shadow' }])
    full = await pub.state(s.c, e)
    expect(full.combatants.at(-1)).toMatchObject({
      name: 'Shadow Hound 4',
      public_name: 'Shadow 4',
    })
    for (const bad of [
      { kind: 'npc', name: 'X', max_hp: 5, hp_mode: 'roll' },
      { kind: 'npc', name: 'X', max_hp: 5, hp_mode: 'max' },
      { kind: 'npc', name: 'X', max_hp: 5, hp_formula: 'd20' },
      { kind: 'npc', name: 'X', max_hp: 5, srd_id: '../wolf' },
      {
        kind: 'npc',
        name: 'X',
        max_hp: 5,
        trackers: [{ key: 'A', kind: 'uses', label: 'A', max: 1 }],
      },
      {
        kind: 'npc',
        name: 'X',
        max_hp: 5,
        trackers: [{ key: 'a', kind: 'uses', label: 'A', max: 10 }],
      },
      {
        kind: 'npc',
        name: 'X',
        max_hp: 5,
        trackers: [{ key: 'a', kind: 'recharge', label: 'A', min: 1 }],
      },
      {
        kind: 'npc',
        name: 'X',
        max_hp: 5,
        trackers: [
          { key: 'a', kind: 'uses', label: 'A', max: 1 },
          { key: 'a', kind: 'uses', label: 'B', max: 1 },
        ],
      },
    ])
      await expect(pub.add(s.c, e, [bad])).rejects.toThrow(/Invalid request/)
    await pub.status(s.c, e, 'active')
    // Players and the table read aliases only, without images or DM fields.
    for (const [viewer, table] of [
      [player, false],
      [dm, true],
    ] as const) {
      await asUser(viewer)
      const view = await pub.state(s.c, e, table)
      const text = JSON.stringify(view)
      expect(text).not.toContain('Shadow Hound')
      expect(text).not.toMatch(/public_name|srd_id|template_id|trackers|hp_roll|5d8/)
      expect(view.combatants.map((c) => c.name)).toEqual(
        expect.arrayContaining(['Shadow 1', 'Shadow 2', 'Shadow 3', 'Shadow 4', 'Wolf']),
      )
    }
    // Revealing a name tells the table who it was.
    await asUser(dm)
    await pub.update(s.c, hounds[0]!.id, { public_name: null })
    await expect(pub.update(s.c, hounds[1]!.id, { public_name: 'x'.repeat(81) })).rejects.toThrow(
      /Invalid request/,
    )
    await asUser(player)
    const after = await pub.state(s.c, e)
    expect(after.combatants.map((c) => c.name)).toContain('Shadow Hound 1')
    expect(after.events.find((x) => x.kind === 'reveal')).toMatchObject({
      target_name: 'Shadow Hound 1',
      detail: { alias: 'Shadow 1' },
    })
    // Aliases are DM-only writes; characters have no alias.
    await expect(pub.update(s.c, hounds[1]!.id, { public_name: 'Bob' })).rejects.toThrow(
      /Forbidden/,
    )
    await asUser(dm)
    const arinRow = after.combatants.find((c) => c.name === 'Arin')!
    await expect(pub.update(s.c, arinRow.id, { public_name: 'Bob' })).rejects.toThrow(
      /Invalid request/,
    )
    // The summary keeps aliases for Players.
    await pub.status(s.c, e, 'ended')
    await asUser(player)
    const names = (await pub.state(s.c, e)).encounter.summary!.combatants.map((c) => c.name)
    expect(names).toEqual(expect.arrayContaining(['Shadow Hound 1', 'Shadow 2', 'Wolf']))
    expect(names).not.toContain('Shadow Hound 2')
    await db.exec('reset role')
  })

  it('tracks recharges and uses under DM-only rules and rolls recharges at turn start', async () => {
    const s = await setup()
    await asUser(dm)
    const e = await pub.create(s.c, 'Lair')
    await pub.add(s.c, e, [
      { kind: 'character', character_id: s.arin, initiative: 20 },
      {
        kind: 'npc',
        name: 'Drake',
        max_hp: 30,
        trackers: [
          { key: 'breath', kind: 'recharge', label: 'Breath (Recharge 5–6)', min: 5 },
          {
            key: 'legendary-resistance',
            kind: 'uses',
            label: 'Legendary Resistance (3/Day)',
            max: 3,
          },
        ],
      },
    ])
    const drake = (await pub.state(s.c, e)).combatants.find((c) => c.name === 'Drake')!
    const key = randomUUID()
    await pub.tracker(s.c, drake.id, 'breath', 1, key)
    await pub.tracker(s.c, drake.id, 'breath', 1, key) // replay
    await pub.tracker(s.c, drake.id, 'legendary-resistance', 2)
    for (const [k, v] of [
      ['breath', 2],
      ['legendary-resistance', 4],
      ['legendary-resistance', -1],
      ['missing', 0],
    ] as const)
      await expect(pub.tracker(s.c, drake.id, k, v)).rejects.toThrow(/Invalid request/)
    let trackers = (await pub.state(s.c, e)).combatants.find((c) => c.id === drake.id)!.trackers!
    expect(trackers.map((x) => [x.key, x.spent ?? x.used])).toEqual([
      ['breath', true],
      ['legendary-resistance', 2],
    ])
    for (const user of [player, outsider, otherDm]) {
      await asUser(user)
      await expect(pub.tracker(s.c, drake.id, 'breath', 0)).rejects.toThrow(/Forbidden/)
    }
    await asUser(otherDm)
    const elsewhere = (await one<{ id: string }>("select public.create_campaign('Elsewhere') id"))
      .id
    await expect(pub.tracker(elsewhere, drake.id, 'breath', 0)).rejects.toThrow(
      /Combatant unavailable/,
    )
    await asAnon()
    await expect(pub.tracker(s.c, drake.id, 'breath', 0)).rejects.toThrow(/permission denied/)
    for (const sql of [
      "update public.encounter_combatants set trackers = '[]'",
      "update public.encounter_combatants set public_name = 'x'",
    ]) {
      for (const user of [dm, player]) {
        await asUser(user)
        await expect(db.query(sql)).rejects.toThrow(/permission denied/)
      }
    }
    // The drake's turn starts: the spent recharge rolls on the server until it comes back.
    await asUser(dm)
    await pub.status(s.c, e, 'active')
    let recharged = false
    for (let round = 0; round < 40 && !recharged; round++) {
      const st = await pub.state(s.c, e)
      const active = st.combatants.find((c) => (c as unknown as { is_active: boolean }).is_active)!
      await pub.turn(s.c, e, active.id)
      trackers = (await pub.state(s.c, e)).combatants.find((c) => c.id === drake.id)!.trackers!
      recharged = trackers[0]!.spent === false
    }
    expect(recharged).toBe(true)
    const rolls = (await pub.state(s.c, e)).events.filter((x) => x.kind === 'recharge')
    expect(rolls.length).toBeGreaterThan(0)
    for (const r of rolls) {
      expect(r.amount).toBeGreaterThanOrEqual(1)
      expect(r.amount).toBeLessThanOrEqual(6)
      expect(r.detail.recharged).toBe((r.amount ?? 0) >= 5)
    }
    expect(rolls.filter((r) => r.detail.recharged)).toHaveLength(1)
    // Uses are untouched by turns; rolls and tracker changes never reach Players.
    expect(trackers[1]!.used).toBe(2)
    await asUser(player)
    const view = await pub.state(s.c, e)
    expect(view.events.some((x) => x.kind === 'recharge' || x.kind === 'tracker')).toBe(false)
    await db.exec('reset role')
  })

  it('mirrors the change into a PRE copied before the migration', async () => {
    const pre = api('pre')
    const s = await setup('pre')
    await asUser(dm)
    const t = await pre.template(s.c, {
      name: 'Ghoul',
      max_hp: 22,
      hp_formula: '5d8',
      stat_block: block,
    })
    const e = await pre.create(s.c, 'PRE crypt')
    await pre.add(s.c, e, [
      { kind: 'npc', template_id: t.id, hp_mode: 'roll', public_name: 'Shape' },
      {
        kind: 'npc',
        name: 'Imp',
        max_hp: 10,
        trackers: [{ key: 'a', kind: 'uses', label: 'A', max: 1 }],
      },
    ])
    const imp = (await pre.state(s.c, e)).combatants.find((c) => c.name === 'Imp')!
    await pre.tracker(s.c, imp.id, 'a', 1)
    await pre.status(s.c, e, 'active')
    await asUser(player)
    expect((await pre.state(s.c, e)).combatants.map((c) => c.name)).toContain('Shape')
    await expect(pub.state(s.c, e)).rejects.toThrow(/Forbidden/)
    await db.exec('reset role')
    const sources = (
      await db.query<{ src: string }>(
        "select prosrc src from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('pre','pre_private') and p.proname in ('set_combatant_tracker','bestiary_roll','bestiary_trackers','bestiary_recharge','bestiary_stat_block_ok','combat_tick','get_combat_state','add_combatants','update_combatant','save_combatant_template','list_combatant_templates')",
      )
    ).rows
    expect(sources).toHaveLength(11)
    for (const { src } of sources) expect(src).not.toMatch(/\bpublic\.|\bprivate\./)
  })
})
