import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-134: the concentration marker in the sheet play state, written with the slots in one call.
const migration = '20261203120000_sheet_concentration.sql'
const db = new PGlite()
type Json = Record<string, unknown>
type Entry = {
  kind: string
  actor: string
  changes: { field: string; before: unknown; after: unknown }[]
}
type Vitals = {
  slots_used: number[]
  concentration: string | null
  revision: number
  current_hp: number
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
const build = { classKey: 'wizard', classLabel: 'Wizard', casterKind: 'full' }
const noSlots = [0, 0, 0, 0, 0, 0, 0, 0, 0]
const oneSlot = [1, 0, 0, 0, 0, 0, 0, 0, 0]

type Write = {
  rev: number
  slots?: number[]
  hp?: number
  id?: string
  // undefined: the old thirteen-argument call; otherwise change_concentration = true.
  concentration?: string | null
  // An explicit pair, to test argument validation.
  raw?: [boolean | null, string | null]
}

function api(schema: Schema) {
  const fn = `${schema}.set_character_vitals`
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
    // Positional, like the existing tests; the new arguments are appended only when given.
    write: (c: string, ch: string, w: Write) => {
      const base = [
        c,
        ch,
        w.rev,
        w.hp ?? 12,
        0,
        0,
        0,
        0,
        false,
        [],
        w.slots ?? noSlots,
        '{}',
        w.id ?? randomUUID(),
      ]
      const extra = w.raw ?? (w.concentration === undefined ? null : [true, w.concentration])
      if (!extra)
        return scalar<number>(
          `select ${fn}($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) result`,
          base,
        )
      return scalar<number>(
        `select ${fn}($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) result`,
        [...base, ...extra],
      )
    },
    // Named notation, as PostgREST calls it: the frontend in production sends these thirteen keys.
    writeNamed: (c: string, ch: string, rev: number, slots: number[], extra = '') =>
      scalar<number>(
        `select ${fn}(target_campaign => $1, target_character => $2, expected_revision => $3,
          new_current_hp => 12, new_temp_hp => 0, new_hit_dice_spent => 0, new_death_successes => 0,
          new_death_failures => 0, new_heroic_inspiration => false, new_conditions => '{}',
          new_slots_used => $4, new_tracker_uses => '{}', request_id => $5${extra}) result`,
        [c, ch, rev, slots, randomUUID()],
      ),
    vitals: async (ch: string) => {
      await asSystem()
      return (
        await rows<Vitals>(
          `select slots_used, concentration, revision::int, current_hp from ${schema}.character_vitals where character_id=$1`,
          [ch],
        )
      )[0]!
    },
    read: (ch: string) =>
      rows<{ concentration: string | null }>(
        `select concentration from ${schema}.character_vitals where character_id=$1`,
        [ch],
      ),
    history: (c: string, ch: string) =>
      scalar<Entry[]>(`select ${schema}.get_character_history($1,$2,null,50) result`, [c, ch]),
    party: (c: string) =>
      rows<{ id: string; concentration: string | null; conditions: string[] | null }>(
        `select id, concentration, conditions from ${schema}.get_party_overview($1)`,
        [c],
      ),
    exportData: () => scalar<Json>(`select ${schema}.export_my_data() result`),
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
  const c = await scalar(`select ${schema}.create_campaign('Casting') result`)
  await asUser(otherDm)
  const other = await scalar(`select ${schema}.create_campaign('Elsewhere') result`)
  await s.join(c, dm, player)
  await s.join(c, dm, peer)
  const arin = await s.own(c, player, 'Arin')
  await s.complete(c, arin)
  const bea = await s.own(c, peer, 'Bea')
  await s.complete(c, bea)
  return { s, c, other, dm, player, peer, outsider, otherDm, arin, bea }
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

describe('the concentration marker', () => {
  it.each(schemas)(
    '%s: starts null; set and cleared with the slots in one write',
    async (schema) => {
      const { s, c, player, arin } = await table(schema)
      expect(await s.vitals(arin)).toMatchObject({ concentration: null, revision: 1 })
      await asUser(player)
      expect(await s.write(c, arin, { rev: 1, slots: oneSlot, concentration: '  Bless ' })).toBe(2)
      expect(await s.vitals(arin)).toMatchObject({
        slots_used: oneSlot,
        concentration: 'Bless',
        revision: 2,
      })
      // Replacing it with another spell and spending another slot is still one revision.
      await asUser(player)
      expect(
        await s.write(c, arin, {
          rev: 2,
          slots: [2, 0, 0, 0, 0, 0, 0, 0, 0],
          concentration: 'Fly',
        }),
      ).toBe(3)
      expect(await s.vitals(arin)).toMatchObject({ concentration: 'Fly', revision: 3 })
      await asUser(player)
      expect(await s.write(c, arin, { rev: 3, slots: noSlots, concentration: null })).toBe(4)
      expect(await s.vitals(arin)).toMatchObject({
        slots_used: noSlots,
        concentration: null,
        revision: 4,
      })
      // The Player reads it directly from the table, like the sheet does.
      await asUser(player)
      await s.write(c, arin, { rev: 4, concentration: 'Haste' })
      await asUser(player)
      expect(await s.read(arin)).toEqual([{ concentration: 'Haste' }])
    },
  )

  it.each(schemas)('%s: the old call keeps working and leaves the marker', async (schema) => {
    const { s, c, player, dm, arin } = await table(schema)
    await asUser(player)
    await s.write(c, arin, { rev: 1, slots: oneSlot, concentration: 'Bless' })
    // Positional thirteen arguments.
    await asUser(player)
    expect(await s.write(c, arin, { rev: 2, slots: noSlots, hp: 10 })).toBe(3)
    expect(await s.vitals(arin)).toMatchObject({
      slots_used: noSlots,
      current_hp: 10,
      concentration: 'Bless',
      revision: 3,
    })
    // Named thirteen arguments, as PostgREST sends the current frontend's call.
    await asUser(dm)
    expect(await s.writeNamed(c, arin, 3, oneSlot)).toBe(4)
    expect(await s.vitals(arin)).toMatchObject({ concentration: 'Bless', revision: 4 })
    // Named, with the new keys.
    await asUser(player)
    expect(
      await s.writeNamed(
        c,
        arin,
        4,
        oneSlot,
        ", change_concentration => true, new_concentration => 'Shield of Faith'",
      ),
    ).toBe(5)
    expect(await s.vitals(arin)).toMatchObject({ concentration: 'Shield of Faith' })
    // change_concentration false with a value is a client error, not a silent no-op.
    await asUser(player)
    await expect(s.write(c, arin, { rev: 5, raw: [false, 'Bless'] })).rejects.toThrow(
      /Invalid request/,
    )
    // Explicit false and null behaves like the old call.
    await asUser(player)
    expect(await s.write(c, arin, { rev: 5, raw: [false, null] })).toBe(6)
    expect(await s.vitals(arin)).toMatchObject({ concentration: 'Shield of Faith', revision: 6 })
    // A single function: no overload for PostgREST to choose between.
    await asSystem()
    expect(
      await rows(
        `select n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' sig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname = $1 and p.proname = 'set_character_vitals'`,
        [schema],
      ),
    ).toEqual([
      {
        sig: `${schema}.set_character_vitals(target_campaign uuid, target_character uuid, expected_revision bigint, new_current_hp integer, new_temp_hp integer, new_hit_dice_spent integer, new_death_successes integer, new_death_failures integer, new_heroic_inspiration boolean, new_conditions text[], new_slots_used integer[], new_tracker_uses jsonb, request_id uuid, change_concentration boolean, new_concentration text)`,
      },
    ])
  })

  it.each(schemas)('%s: a stale revision writes nothing', async (schema) => {
    const { s, c, player, arin } = await table(schema)
    await asUser(player)
    await expect(
      s.write(c, arin, { rev: 0, slots: oneSlot, concentration: 'Bless' }),
    ).rejects.toThrow(/Stale revision/)
    expect(await s.vitals(arin)).toMatchObject({
      slots_used: noSlots,
      concentration: null,
      revision: 1,
    })
  })

  it.each(schemas)('%s: replays an identical request and refuses a reused id', async (schema) => {
    const { s, c, player, arin } = await table(schema)
    const id = randomUUID()
    const updates = async () => {
      await asSystem()
      return scalar<number>(
        `select count(*)::int result from ${schema}.character_events where character_id=$1 and kind='character_vitals:UPDATE'`,
        [arin],
      )
    }
    const before = await updates()
    await asUser(player)
    expect(await s.write(c, arin, { rev: 1, slots: oneSlot, concentration: 'Bless', id })).toBe(2)
    await asUser(player)
    expect(await s.write(c, arin, { rev: 1, slots: oneSlot, concentration: 'Bless', id })).toBe(2)
    expect(await s.vitals(arin)).toMatchObject({ revision: 2, concentration: 'Bless' })
    expect(await updates()).toBe(before + 1)
    await asUser(player)
    await expect(
      s.write(c, arin, { rev: 1, slots: oneSlot, concentration: 'Fly', id }),
    ).rejects.toThrow(/Request mismatch/)
    await asUser(player)
    await expect(
      s.write(c, arin, { rev: 1, slots: oneSlot, concentration: null, id }),
    ).rejects.toThrow(/Request mismatch/)
    // The same id without the marker is a different request too.
    await asUser(player)
    await expect(s.write(c, arin, { rev: 1, slots: oneSlot, id })).rejects.toThrow(
      /Request mismatch/,
    )
    // An old-style request stored before keeps replaying as an old-style request.
    const old = randomUUID()
    await asUser(player)
    expect(await s.write(c, arin, { rev: 2, slots: noSlots, id: old })).toBe(3)
    await asUser(player)
    expect(await s.write(c, arin, { rev: 2, slots: noSlots, id: old })).toBe(3)
    await asUser(player)
    await expect(
      s.write(c, arin, { rev: 2, slots: noSlots, id: old, concentration: null }),
    ).rejects.toThrow(/Request mismatch/)
    expect(await s.vitals(arin)).toMatchObject({ revision: 3, concentration: 'Bless' })
  })

  // Every refused family, by code point: C0, DEL, C1, zero-width and direction marks, bidi
  // embeddings and overrides, invisible operators, bidi isolates and the BOM.
  const refused: [string, number[]][] = [
    ['C0 controls', [0x01, 0x07, 0x09, 0x0a, 0x1f]],
    ['DEL and C1 controls', [0x7f, 0x80, 0x85, 0x9f]],
    ['zero-width and direction marks', [0x200b, 0x200c, 0x200d, 0x200e, 0x200f]],
    ['bidi embeddings and overrides', [0x202a, 0x202b, 0x202c, 0x202d, 0x202e]],
    ['invisible operators', [0x2060, 0x2061, 0x2062, 0x2063, 0x2064]],
    ['bidi isolates', [0x2066, 0x2067, 0x2068, 0x2069]],
    ['byte order mark', [0xfeff]],
  ]
  const spaces = [0x20, 0xa0, 0x1680, 0x2000, 0x200a, 0x202f, 0x205f, 0x3000]

  it.each(schemas)('%s: checks length, emptiness and Unicode spaces', async (schema) => {
    const { s, c, player, arin } = await table(schema)
    const blanks = ['', 'x'.repeat(101), ...spaces.map((cp) => String.fromCodePoint(cp).repeat(3))]
    for (const bad of blanks) {
      await asUser(player)
      await expect(s.write(c, arin, { rev: 1, concentration: bad })).rejects.toThrow(
        /Invalid concentration/,
      )
    }
    // Every Unicode space is trimmed at both ends; one inside the name stays.
    const padded = spaces.map((cp) => String.fromCodePoint(cp)).join('')
    await asUser(player)
    expect(
      await s.write(c, arin, { rev: 1, concentration: `${padded}Shield of Faith${padded}` }),
    ).toBe(2)
    expect((await s.vitals(arin)).concentration).toBe('Shield of Faith')
    await asUser(player)
    expect(await s.write(c, arin, { rev: 2, concentration: 'x'.repeat(100) })).toBe(3)
    expect((await s.vitals(arin)).concentration).toHaveLength(100)
    // Accented and other visible characters are fine.
    await asUser(player)
    expect(await s.write(c, arin, { rev: 3, concentration: 'Protección del mal‐bien' })).toBe(4)
    await asSystem()
    for (const bad of ['', ' Bless', 'Bless ', '　Bless', 'x'.repeat(101)])
      await expect(
        db.query(`update ${schema}.character_vitals set concentration=$1 where character_id=$2`, [
          bad,
          arin,
        ]),
      ).rejects.toThrow(/character_vitals_concentration_check/)
  })

  it.each(
    schemas.flatMap((schema) =>
      refused.map(([family, points]) => [schema, family, points] as const),
    ),
  )('%s: refuses %s in the function and the column', async (schema, _family, points) => {
    const { s, c, player, arin } = await table(schema)
    for (const cp of points) {
      const ch = String.fromCodePoint(cp)
      // Inside the name, alone, and at either end (trimming never removes them).
      for (const bad of [`Bl${ch}ess`, ch, `${ch}Bless`, `Bless${ch}`]) {
        await asUser(player)
        await expect(
          s.write(c, arin, { rev: 1, concentration: bad }),
          `U+${cp.toString(16)}`,
        ).rejects.toThrow(/Invalid concentration/)
      }
      await asSystem()
      await expect(
        db.query(`update ${schema}.character_vitals set concentration=$1 where character_id=$2`, [
          `Bl${ch}ess`,
          arin,
        ]),
        `U+${cp.toString(16)}`,
      ).rejects.toThrow(/character_vitals_concentration_check/)
    }
    expect(await s.vitals(arin)).toMatchObject({ concentration: null, revision: 1 })
  })

  it.each(schemas)(
    '%s: uses the same expressions in the function and the column check',
    async (schema) => {
      await asSystem()
      const [check] = await rows<{ def: string }>(
        `select pg_get_constraintdef(k.oid) def from pg_constraint k
        where k.conname = 'character_vitals_concentration_check' and k.conrelid = '${schema}.character_vitals'::regclass`,
      )
      const src = await scalar(
        `select prosrc result from pg_proc where oid = '${schema}.set_character_vitals(uuid,uuid,bigint,integer,integer,integer,integer,integer,boolean,text[],integer[],jsonb,uuid,boolean,text)'::regprocedure`,
      )
      const refusedClass = String.raw`'[\u0001-\u001f\u007f-\u009f​-‏‪-‮⁠-⁤⁦-⁩﻿]'`
      const spaceClass = String.raw`[    -   　]`
      const trim = `'^${spaceClass}+|${spaceClass}+$'`
      for (const text of [check!.def, src]) {
        expect(text).toContain(refusedClass)
        expect(text).toContain(trim)
      }
    },
  )
})

describe('who can write and read it', () => {
  it.each(schemas)(
    '%s: anon, outsider, another Player and another DM are refused',
    async (schema) => {
      const { s, c, other, dm, peer, outsider, otherDm, arin } = await table(schema)
      await asAnon()
      await expect(s.write(c, arin, { rev: 1, concentration: 'Bless' })).rejects.toThrow(
        /permission denied/,
      )
      await expect(s.read(arin)).rejects.toThrow(/permission denied/)
      for (const actor of [outsider, peer, otherDm]) {
        await asUser(actor)
        await expect(s.write(c, arin, { rev: 1, concentration: 'Bless' })).rejects.toThrow(
          /Forbidden/,
        )
        await asUser(actor)
        expect(await s.read(arin)).toEqual([])
      }
      // Through their own campaign a cross-campaign DM gets nothing either.
      await asUser(otherDm)
      await expect(s.write(other, arin, { rev: 1, concentration: 'Bless' })).rejects.toThrow(
        /Forbidden|Character unavailable/,
      )
      expect(await s.vitals(arin)).toMatchObject({ concentration: null, revision: 1 })
      // The campaign DM may set and read it.
      await asUser(dm)
      expect(await s.write(c, arin, { rev: 1, concentration: 'Bless' })).toBe(2)
      await asUser(dm)
      expect(await s.read(arin)).toEqual([{ concentration: 'Bless' }])
    },
  )

  it.each(schemas)('%s: absent and archived characters keep their rules', async (schema) => {
    const { s, c, dm, player, arin } = await table(schema)
    await asUser(dm)
    await db.query(`select ${schema}.set_character_absent($1,$2,true)`, [c, arin])
    await asUser(player)
    await expect(s.write(c, arin, { rev: 1, concentration: 'Bless' })).rejects.toThrow(
      /Character absent/,
    )
    await asUser(player)
    await expect(s.write(c, arin, { rev: 1 })).rejects.toThrow(/Character absent/)
    await asUser(dm)
    expect(await s.write(c, arin, { rev: 1, concentration: 'Bless' })).toBe(2)
    await db.query(`select ${schema}.set_character_absent($1,$2,false)`, [c, arin])
    // An archived reserve character: unchanged, its Player still writes the play state (today's
    // rule; the function has no archive check), with the old and the new call alike.
    const spare = await s.own(c, player, 'Spare')
    await s.complete(c, spare)
    await asUser(player)
    await db.query(`select ${schema}.archive_character($1,$2)`, [c, spare])
    await asUser(player)
    expect(await s.write(c, spare, { rev: 1 })).toBe(2)
    await asUser(player)
    expect(await s.write(c, spare, { rev: 2, concentration: 'Bless' })).toBe(3)
    expect(await s.vitals(spare)).toMatchObject({ concentration: 'Bless' })
  })

  it.each(schemas)('%s: an inactive member is refused', async (schema) => {
    const { s, c, dm, player, arin } = await table(schema)
    await asUser(player)
    await s.write(c, arin, { rev: 1, concentration: 'Bless' })
    await asUser(dm)
    await db.query(`select ${schema}.change_campaign_member($1,$2,null)`, [c, player])
    await asUser(player)
    await expect(s.write(c, arin, { rev: 2, concentration: null })).rejects.toThrow(/Forbidden/)
    await asUser(player)
    await expect(s.write(c, arin, { rev: 2 })).rejects.toThrow(/Forbidden/)
    await asUser(player)
    expect(await s.read(arin)).toEqual([])
    expect(await s.vitals(arin)).toMatchObject({ concentration: 'Bless', revision: 2 })
  })

  it.each(schemas)(
    '%s: in a live encounter the Player changes the marker but not the hit points',
    async (schema) => {
      const { s, c, dm, player, arin } = await table(schema)
      await asUser(dm)
      const e = (
        await scalar<{ encounter_id: string }>(
          `select ${schema}.create_encounter($1,'Gate',$2) result`,
          [c, randomUUID()],
        )
      ).encounter_id
      await db.query(`select ${schema}.add_combatants($1,$2,$3,$4)`, [
        c,
        e,
        JSON.stringify([{ kind: 'character', character_id: arin }]),
        randomUUID(),
      ])
      await db.query(`select ${schema}.set_encounter_status($1,$2,'active',$3)`, [
        c,
        e,
        randomUUID(),
      ])
      await asUser(player)
      expect(await s.write(c, arin, { rev: 1, slots: oneSlot, concentration: 'Bless' })).toBe(2)
      await asUser(player)
      await expect(
        s.write(c, arin, { rev: 2, slots: oneSlot, hp: 5, concentration: null }),
      ).rejects.toThrow(/Encounter locked/)
      expect(await s.vitals(arin)).toMatchObject({
        concentration: 'Bless',
        current_hp: 12,
        revision: 2,
      })
      await asUser(player)
      expect(await s.write(c, arin, { rev: 2, slots: oneSlot, concentration: null })).toBe(3)
      // The DM is not locked.
      await asUser(dm)
      expect(await s.write(c, arin, { rev: 3, slots: oneSlot, hp: 5, concentration: 'Fly' })).toBe(
        4,
      )
      expect(await s.vitals(arin)).toMatchObject({ concentration: 'Fly', current_hp: 5 })
    },
  )
})

describe('history, party, export and rest', () => {
  it.each(schemas)(
    '%s: the history shows the change to the Player and the DM only',
    async (schema) => {
      const { s, c, dm, player, peer, outsider, otherDm, arin } = await table(schema)
      await asUser(player)
      await s.write(c, arin, { rev: 1, slots: oneSlot, concentration: 'Bless' })
      await asUser(dm)
      await s.write(c, arin, { rev: 2, slots: oneSlot, concentration: null })
      await asUser(player)
      // The newest two vitals entries (the sheet completion wrote the first one).
      const mine = (await s.history(c, arin))
        .filter((e) => e.kind === 'character_vitals:UPDATE')
        .slice(0, 2)
      expect(mine.map((e) => [e.actor, e.changes])).toEqual([
        ['dm', [{ field: 'concentration', before: 'Bless', after: null }]],
        [
          'self',
          [
            { field: 'slots_used', before: noSlots, after: oneSlot },
            { field: 'concentration', before: null, after: 'Bless' },
          ],
        ],
      ])
      await asUser(dm)
      expect(
        (await s.history(c, arin))
          .filter((e) => e.kind === 'character_vitals:UPDATE')
          .slice(0, 2)
          .map((e) => e.actor),
      ).toEqual(['self', 'player'])
      await asAnon()
      await expect(s.history(c, arin)).rejects.toThrow(/permission denied/)
      for (const actor of [outsider, peer, otherDm]) {
        await asUser(actor)
        await expect(s.history(c, arin)).rejects.toThrow(/Forbidden/)
      }
    },
  )

  it.each(schemas)('%s: the party overview follows the conditions rule', async (schema) => {
    const { s, c, dm, player, peer, outsider, arin, bea } = await table(schema)
    await asUser(player)
    await s.write(c, arin, { rev: 1, concentration: 'Bless' })
    const seen = async (who: string) => {
      await asUser(who)
      return Object.fromEntries((await s.party(c)).map((r) => [r.id, r.concentration]))
    }
    expect(await seen(player)).toMatchObject({ [arin]: 'Bless', [bea]: null })
    expect(await seen(peer)).toMatchObject({ [arin]: 'Bless' })
    expect(await seen(dm)).toMatchObject({ [arin]: 'Bless' })
    // Not shared live: a teammate sees neither conditions nor concentration; owner and DM still do.
    await asUser(dm)
    await db.query(`select ${schema}.set_character_live_sharing($1,$2,false)`, [c, arin])
    await asUser(peer)
    const row = (await s.party(c)).find((r) => r.id === arin)!
    expect(row).toMatchObject({ concentration: null, conditions: null })
    expect(await seen(player)).toMatchObject({ [arin]: 'Bless' })
    expect(await seen(dm)).toMatchObject({ [arin]: 'Bless' })
    await asUser(outsider)
    await expect(s.party(c)).rejects.toThrow(/Forbidden/)
  })

  it.each(schemas)('%s: the export carries the marker of own characters', async (schema) => {
    const { s, c, player, arin } = await table(schema)
    await asUser(player)
    await s.write(c, arin, { rev: 1, concentration: 'Bless' })
    await asUser(player)
    const data = await s.exportData()
    const mine = (data.characters as { id: string; vitals: Json }[]).find((x) => x.id === arin)!
    expect(mine.vitals).toMatchObject({ concentration: 'Bless' })
    expect(data.environment).toBe(schema)
  })

  it.each(schemas)('%s: a long rest ends it, a short rest keeps it', async (schema) => {
    const { s, c, dm, player, arin } = await table(schema)
    await asUser(player)
    await s.write(c, arin, { rev: 1, slots: oneSlot, concentration: 'Bless' })
    await asUser(dm)
    let req = await scalar<{ id: string }>(`select ${schema}.request_rest($1,'short',$2) result`, [
      c,
      randomUUID(),
    ])
    await db.query(`select ${schema}.resolve_rest_now($1,$2)`, [c, req.id])
    expect(await s.vitals(arin)).toMatchObject({ concentration: 'Bless', slots_used: oneSlot })
    await asUser(dm)
    req = await scalar<{ id: string }>(`select ${schema}.request_rest($1,'long',$2) result`, [
      c,
      randomUUID(),
    ])
    await db.query(`select ${schema}.resolve_rest_now($1,$2)`, [c, req.id])
    expect(await s.vitals(arin)).toMatchObject({ concentration: null, slots_used: noSlots })
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
      pub: boolean
    }>(
      `select n.nspname || '.' || p.proname fn, p.prosecdef, p.provolatile::text, p.proconfig, p.prosrc,
         has_function_privilege('anon', p.oid, 'execute') anon,
         has_function_privilege('authenticated', p.oid, 'execute') auth,
         exists (select 1 from aclexplode(p.proacl) a where a.grantee = 0 and a.privilege_type = 'EXECUTE') pub
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private', 'pre', 'pre_private')
         and p.proname in ('set_character_vitals', 'rest_apply', 'history_changes',
           'get_party_overview', 'export_my_data')
       order by 1`,
    )
    expect(fns.map((f) => f.fn)).toEqual([
      'pre.export_my_data',
      'pre.get_party_overview',
      'pre.set_character_vitals',
      'pre_private.history_changes',
      'pre_private.rest_apply',
      'private.history_changes',
      'private.rest_apply',
      'public.export_my_data',
      'public.get_party_overview',
      'public.set_character_vitals',
    ])
    for (const f of fns) {
      const helper = /history_changes|rest_apply/.test(f.fn)
      expect(f.proconfig).toEqual(['search_path=""'])
      expect(f.anon, f.fn).toBe(false)
      expect(f.pub, f.fn).toBe(false)
      expect(f.auth, f.fn).toBe(!helper)
      expect(f.prosecdef, f.fn).toBe(!f.fn.endsWith('history_changes'))
      if (f.fn.endsWith('history_changes')) expect(f.provolatile).toBe('i')
      if (f.fn.startsWith('pre')) expect(f.prosrc).not.toMatch(/\bpublic\.|\bprivate\./)
      expect(f.prosrc).toMatch(/concentration/)
    }
    // The PRE table has the same column and check.
    expect(
      await rows(
        `select table_schema from information_schema.columns
          where table_name = 'character_vitals' and column_name = 'concentration' order by 1`,
      ),
    ).toEqual([{ table_schema: 'pre' }, { table_schema: 'public' }])
    expect(
      await rows(
        `select n.nspname from pg_constraint k join pg_class t on t.oid = k.conrelid
           join pg_namespace n on n.oid = t.relnamespace
          where k.conname = 'character_vitals_concentration_check' order by 1`,
      ),
    ).toEqual([{ nspname: 'pre' }, { nspname: 'public' }])
  })

  it('names what is missing when it cannot update PRE', async () => {
    // A database without PRE: production changes and a notice lists the missing PRE objects.
    const bare = new PGlite()
    const notices: string[] = []
    try {
      await bare.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
        create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
        create publication supabase_realtime; create schema storage;
        create table storage.buckets(id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
        create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text, owner uuid, metadata jsonb);`)
      const files = readdirSync('supabase/migrations')
        .filter((f) => f.endsWith('.sql'))
        .sort()
      for (const file of files)
        await bare.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'), {
          onNotice: (n) => {
            if (file === migration) notices.push(n.message ?? '')
          },
        })
      expect(notices).toHaveLength(1)
      expect(notices[0]).toMatch(/^20261203120000: PRE not updated, missing /)
      expect(notices[0]).toContain('pre.character_vitals')
      expect(notices[0]).toContain('pre_private.rest_apply(uuid,uuid,text,integer,integer)')
      expect(notices[0]).not.toContain('pre_admin.remap(text)')
      const cols = await bare.query(
        `select table_schema from information_schema.columns
          where table_name = 'character_vitals' and column_name = 'concentration'`,
      )
      expect(cols.rows).toEqual([{ table_schema: 'public' }])
    } finally {
      await bare.close()
    }
  }, 120000)

  it('keeps PRE writes in PRE', async () => {
    const { s, c, player, arin } = await table('pre')
    await asUser(player)
    await s.write(c, arin, { rev: 1, slots: oneSlot, concentration: 'Bless' })
    await asSystem()
    expect(
      await rows(`select 1 from public.character_vitals where character_id=$1`, [arin]),
    ).toEqual([])
    expect(
      await rows(`select 1 from private.sheet_requests where character_id=$1`, [arin]),
    ).toEqual([])
    expect(
      await scalar<number>(
        `select count(*)::int result from pre_private.sheet_requests where character_id=$1`,
        [arin],
      ),
    ).toBeGreaterThan(0)
  })
})
