import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-079 absence and the DM's active choice; RYT-080 the group rest with a vote (ADR 037).
const migration = '20261114120000_group_rest_absence.sql'
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
const asSystem = () => db.exec('reset role')
type Json = Record<string, unknown>
type Effect = {
  can_rest: boolean
  hp_before: number
  hp_after: number
  dice_left_before: number
  dice_left_after: number
  trackers: { id: string; before: number; after: number; max: number }[]
  slots: number[]
}
type Person = {
  id: string
  name: string
  own: boolean
  controlled: boolean
  dm_controlled: boolean
  vote: string | null
  can_rest?: boolean
  shares: boolean
  rested?: boolean
  effect: Effect | null
}
type State = {
  id: string
  kind: string
  status: string
  mine: boolean
  dm: boolean
  can_cancel: boolean
  requester_name: string | null
  participants: Person[]
}
const result = async <T = Json>(sql: string, args: unknown[] = []) =>
  (await db.query<{ result: T }>(sql, args)).rows[0]!.result
// Monk 3, CON 14 (+2), d8 hit dice, a short-rest pool and a long-rest pool.
const build = {
  classKey: 'monk',
  hitDie: 8,
  casterKind: 'none',
  baseAbilities: { str: 10, dex: 15, con: 14, int: 8, wis: 14, cha: 12 },
  bonuses: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
  trackers: [
    { id: 'ki', name: 'Ki', max: 3, reset: 'short' },
    { id: 'luck', name: 'Luck', max: 2, reset: 'long' },
  ],
}

function api(schema: 'public' | 'pre') {
  const vitalsRow = async (ch: string) =>
    (
      await db.query<{
        current_hp: number
        temp_hp: number
        hit_dice_spent: number
        slots_used: number[]
        tracker_uses: Record<string, number>
        revision: number
      }>(`select * from ${schema}.character_vitals where character_id=$1`, [ch])
    ).rows[0]!
  return {
    save: (c: string, ch: string, rev: number) =>
      db.query(`select ${schema}.save_character_sheet($1,$2,$3,3,24,14,$4,true,$5) result`, [
        c,
        ch,
        rev,
        JSON.stringify(build),
        randomUUID(),
      ]),
    vitals: async (
      c: string,
      ch: string,
      v: { hp?: number; temp?: number; dice?: number; uses?: Json; slots?: number[] } = {},
    ) =>
      db.query(
        `select ${schema}.set_character_vitals($1,$2,$3,$4,$5,$6,0,0,false,$7,$8,$9,$10) result`,
        [
          c,
          ch,
          (await vitalsRow(ch)).revision,
          v.hp ?? 24,
          v.temp ?? 0,
          v.dice ?? 0,
          [],
          v.slots ?? [0, 0, 0, 0, 0, 0, 0, 0, 0],
          JSON.stringify(v.uses ?? {}),
          randomUUID(),
        ],
      ),
    row: vitalsRow,
    character: async (ch: string) =>
      (
        await db.query<{ is_active: boolean; absent: boolean; archived_at: string | null }>(
          `select is_active, absent, archived_at from ${schema}.characters where id=$1`,
          [ch],
        )
      ).rows[0]!,
    absent: (c: string, ch: string, on: boolean) =>
      result<{ absent: boolean; is_active: boolean }>(
        `select ${schema}.set_character_absent($1,$2,$3) result`,
        [c, ch, on],
      ),
    activate: (c: string, ch: string) =>
      db.query(`select ${schema}.set_active_character($1,$2)`, [c, ch]),
    state: (c: string) => result<State | null>(`select ${schema}.get_rest_state($1) result`, [c]),
    request: (c: string, kind: string, id = randomUUID()) =>
      result<State>(`select ${schema}.request_rest($1,$2,$3) result`, [c, kind, id]),
    vote: (
      c: string,
      r: string,
      ch: string,
      vote: string,
      spent: number | null = null,
      roll: number | null = null,
    ) =>
      result<State>(`select ${schema}.vote_rest($1,$2,$3,$4,$5,$6) result`, [
        c,
        r,
        ch,
        vote,
        spent,
        roll,
      ]),
    now: (c: string, r: string) =>
      result<State>(`select ${schema}.resolve_rest_now($1,$2) result`, [c, r]),
    cancel: (c: string, r: string) =>
      result<State>(`select ${schema}.cancel_rest($1,$2) result`, [c, r]),
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
  const c = await one(`select ${schema}.create_campaign('Rest table') id`)
  const arin = await one(`select ${schema}.create_character($1,'Arin') id`, [c])
  const bea = await one(`select ${schema}.create_character($1,'Bea') id`, [c])
  const npc = await one(`select ${schema}.create_character($1,'Garra') id`, [c])
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
    [dm, npc],
  ] as const) {
    await asUser(user)
    await s.save(c, character, 0)
  }
  return { c, arin, bea, npc }
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

describe('RYT-079 absence', () => {
  it('takes an absent character out of play and leaves the sheet read-only for its Player', async () => {
    const s = await setup()
    await asUser(dm)
    expect(await pub.absent(s.c, s.arin, true)).toMatchObject({ absent: true, is_active: false })
    // Idempotent.
    expect(await pub.absent(s.c, s.arin, true)).toMatchObject({ absent: true, is_active: false })
    await asUser(player)
    const listed = await db.query(
      'select id from public.characters where campaign_id=$1 and is_active order by name',
      [s.c],
    )
    expect(listed.rows.map((r) => (r as { id: string }).id)).not.toContain(s.arin)
    // Still readable by the owner.
    expect((await pub.row(s.arin)).current_hp).toBe(24)
    await expect(pub.vitals(s.c, s.arin, { hp: 20 })).rejects.toThrow(/Character absent/)
    await expect(pub.save(s.c, s.arin, 1)).rejects.toThrow(/Character absent/)
    await expect(
      db.query('select public.rename_character($1,$2,$3)', [s.c, s.arin, 'Arinna']),
    ).rejects.toThrow(/Character absent/)
    // Benched: a new character joins in reserve and cannot be activated by the Player.
    const second = (
      await db.query<{ id: string }>('select public.create_own_character($1,$2,$3) id', [
        s.c,
        'Second',
        randomUUID(),
      ])
    ).rows[0]!.id
    expect(await pub.character(second)).toMatchObject({ is_active: false, absent: false })
    await expect(pub.activate(s.c, second)).rejects.toThrow(/Character absent/)
    await expect(pub.activate(s.c, s.arin)).rejects.toThrow(/Character absent/)
    // The DM keeps full control of the absent sheet.
    await asUser(dm)
    await pub.vitals(s.c, s.arin, { hp: 18 })
    // The DM chooses the Player's active character.
    await pub.activate(s.c, second)
    expect(await pub.character(second)).toMatchObject({ is_active: true })
    // Present again: Arin returns in reserve because Second is now active.
    expect(await pub.absent(s.c, s.arin, false)).toMatchObject({ absent: false, is_active: false })
    await pub.activate(s.c, s.arin)
    expect(await pub.character(s.arin)).toMatchObject({ is_active: true })
    expect(await pub.character(second)).toMatchObject({ is_active: false })
    // Absent and present again with no other active character: active again.
    await pub.absent(s.c, s.npc, true)
    expect(await pub.character(s.npc)).toMatchObject({ is_active: false, absent: true })
    expect(await pub.absent(s.c, s.npc, false)).toMatchObject({ absent: false, is_active: true })
  })

  it('refuses an absent character in combat and archive, and absence during a live encounter', async () => {
    const s = await setup()
    await asUser(dm)
    const e = await pub.encounter(s.c, [s.bea])
    await pub.status(s.c, e, 'initiative')
    await expect(pub.absent(s.c, s.bea, true)).rejects.toThrow(/Character in combat/)
    await pub.status(s.c, e, 'ended')
    await pub.absent(s.c, s.arin, true)
    await expect(pub.encounter(s.c, [s.arin])).rejects.toThrow(/Character absent/)
    await expect(db.query('select public.archive_character($1,$2)', [s.c, s.arin])).rejects.toThrow(
      /Character absent/,
    )
    // History names the change.
    await asUser(player)
    const history = await result<{ changes: { field: string }[] }[]>(
      'select public.get_character_history($1,$2,null,null) result',
      [s.c, s.arin],
    )
    expect(history.some((h) => h.changes.some((x) => x.field === 'absent'))).toBe(true)
  })

  it('lets only the campaign DM mark absence or pick a Player character', async () => {
    const s = await setup()
    await asAnon()
    await expect(pub.absent(s.c, s.arin, true)).rejects.toThrow(/permission denied/)
    await asUser(outsider)
    await expect(pub.absent(s.c, s.arin, true)).rejects.toThrow(/Forbidden/)
    await expect(pub.activate(s.c, s.arin)).rejects.toThrow(/Forbidden/)
    await db.query("select public.create_campaign('Elsewhere')")
    await expect(pub.absent(s.c, s.arin, true)).rejects.toThrow(/Forbidden/)
    await asUser(player)
    await expect(pub.absent(s.c, s.arin, true)).rejects.toThrow(/Forbidden/)
    await expect(pub.absent(s.c, s.bea, true)).rejects.toThrow(/Forbidden/)
    // A Player cannot choose another Player's character.
    await expect(pub.activate(s.c, s.bea)).rejects.toThrow(/Character unavailable/)
    expect(await pub.character(s.arin)).toMatchObject({ absent: false, is_active: true })
  })
})

describe('RYT-080 group rest', () => {
  it('rests the whole group on a unanimous long rest', async () => {
    const s = await setup()
    await asUser(player)
    await pub.vitals(s.c, s.arin, { hp: 10, temp: 4, dice: 2, uses: { ki: 3, luck: 2 } })
    await asUser(peer)
    await pub.vitals(s.c, s.bea, { hp: 5, uses: { ki: 1 } })
    await asUser(player)
    const id = randomUUID()
    const opened = await pub.request(s.c, 'long', id)
    expect(opened).toMatchObject({ status: 'open', kind: 'long', mine: true, can_cancel: true })
    expect(opened.requester_name).toBe('Arin')
    // Replaying the request returns the same request; a different kind is a mismatch.
    expect((await pub.request(s.c, 'long', id)).id).toBe(id)
    await expect(pub.request(s.c, 'short', id)).rejects.toThrow(/Request mismatch/)
    await expect(pub.request(s.c, 'long')).rejects.toThrow(/Rest open/)
    const mine = opened.participants.find((p) => p.id === s.arin)!
    expect(mine).toMatchObject({ own: true, controlled: true, vote: 'yes' })
    expect(mine.effect).toMatchObject({
      hp_before: 10,
      hp_after: 24,
      dice_left_before: 1,
      dice_left_after: 3,
    })
    expect(mine.effect!.trackers.map((t) => [t.id, t.before, t.after])).toEqual([
      ['ki', 0, 3],
      ['luck', 0, 2],
    ])
    // The DM's own character waits for the DM.
    expect(opened.participants.find((p) => p.id === s.npc)).toMatchObject({
      dm_controlled: true,
      controlled: false,
    })
    await asUser(peer)
    await expect(pub.vote(s.c, id, s.arin, 'yes')).rejects.toThrow(/Forbidden/)
    expect((await pub.vote(s.c, id, s.bea, 'yes')).status).toBe('open')
    await asUser(dm)
    const done = await pub.vote(s.c, id, s.npc, 'yes')
    expect(done.status).toBe('done')
    expect(done.participants.every((p) => p.rested)).toBe(true)
    expect(await pub.row(s.arin)).toMatchObject({
      current_hp: 24,
      temp_hp: 0,
      hit_dice_spent: 0,
      tracker_uses: {},
    })
    expect((await pub.row(s.bea)).current_hp).toBe(24)
    await expect(pub.vote(s.c, id, s.npc, 'no')).rejects.toThrow(/Rest closed/)
    // The closed request stays visible for a while as the outcome.
    await asUser(player)
    expect((await pub.state(s.c))!.status).toBe('done')
  })

  it('rejects on one no, heals short rests with dice and skips characters at 0 HP', async () => {
    const s = await setup()
    await asUser(player)
    await pub.vitals(s.c, s.arin, { hp: 6, dice: 1, uses: { ki: 2, luck: 1 } })
    await asUser(peer)
    await pub.vitals(s.c, s.bea, { hp: 0 })
    await asUser(player)
    const short = await pub.request(s.c, 'short')
    // Short rests wait for the requester's dice.
    expect(short.participants.find((p) => p.id === s.arin)!.vote).toBeNull()
    expect(short.participants.find((p) => p.id === s.bea)!.can_rest).toBe(false)
    for (const [spent, roll] of [
      [3, 10],
      [2, 1],
      [2, 17],
      [-1, 0],
    ])
      await expect(pub.vote(s.c, short.id, s.arin, 'yes', spent, roll)).rejects.toThrow(
        /Invalid dice/,
      )
    const voted = await pub.vote(s.c, short.id, s.arin, 'yes', 2, 9)
    // 9 + 2 × CON 2 = 13 → 6 + 13 = 19.
    expect(voted.participants.find((p) => p.id === s.arin)!.effect).toMatchObject({
      hp_after: 19,
      dice_left_after: 0,
    })
    await asUser(peer)
    await expect(pub.vote(s.c, short.id, s.bea, 'yes')).rejects.toThrow(/Cannot rest/)
    await asUser(dm)
    const done = await pub.vote(s.c, short.id, s.npc, 'yes')
    expect(done.status).toBe('done')
    expect(await pub.row(s.arin)).toMatchObject({
      current_hp: 19,
      hit_dice_spent: 3,
      tracker_uses: { luck: 1 },
    })
    expect((await pub.row(s.bea)).current_hp).toBe(0)
    expect(done.participants.find((p) => p.id === s.bea)!.rested).toBe(false)
    // One no: nobody rests.
    await asUser(player)
    await pub.vitals(s.c, s.arin, { hp: 8, dice: 3 })
    const long = await pub.request(s.c, 'long')
    await asUser(dm)
    const rejected = await pub.vote(s.c, long.id, s.npc, 'no')
    expect(rejected.status).toBe('rejected')
    expect((await pub.row(s.arin)).current_hp).toBe(8)
  })

  it('lets the DM rest the group at once or cancel, the requester cancel, and requests expire', async () => {
    const s = await setup()
    await asUser(player)
    await pub.vitals(s.c, s.arin, { hp: 3 })
    const first = await pub.request(s.c, 'long')
    await asUser(peer)
    await expect(pub.cancel(s.c, first.id)).rejects.toThrow(/Forbidden/)
    await expect(pub.now(s.c, first.id)).rejects.toThrow(/Forbidden/)
    await asUser(player)
    expect((await pub.cancel(s.c, first.id)).status).toBe('cancelled')
    await asUser(dm)
    const second = await pub.request(s.c, 'long')
    expect(second.mine).toBe(true)
    expect((await pub.now(s.c, second.id)).status).toBe('done')
    expect((await pub.row(s.arin)).current_hp).toBe(24)
    const third = await pub.request(s.c, 'short')
    expect((await pub.cancel(s.c, third.id)).status).toBe('cancelled')
    const fourth = await pub.request(s.c, 'long')
    await asSystem()
    await db.query(
      "update public.rest_requests set expires_at = now() - interval '1 second' where id=$1",
      [fourth.id],
    )
    await asUser(player)
    expect((await pub.state(s.c))!.status).toBe('expired')
    await expect(pub.vote(s.c, fourth.id, s.arin, 'yes')).rejects.toThrow(/Rest closed/)
  })

  it('keeps fighters and absent characters out and hides what a private teammate recovers', async () => {
    const s = await setup()
    await asUser(dm)
    const e = await pub.encounter(s.c, [s.arin])
    await pub.status(s.c, e, 'active')
    await asUser(player)
    await expect(pub.request(s.c, 'long')).rejects.toThrow(/Character in combat/)
    await asUser(dm)
    await pub.status(s.c, e, 'ended')
    await pub.absent(s.c, s.arin, true)
    await asUser(player)
    await expect(pub.request(s.c, 'long')).rejects.toThrow(/Character unavailable/)
    await asUser(dm)
    await db.query('select public.set_character_live_sharing($1,$2,false)', [s.c, s.bea])
    await asUser(peer)
    const open = await pub.request(s.c, 'long')
    expect(open.participants.map((p) => p.id)).not.toContain(s.arin)
    await asUser(player)
    const seen = (await pub.state(s.c))!
    expect(seen.participants.find((p) => p.id === s.bea)).toMatchObject({
      shares: false,
      effect: null,
    })
    await expect(pub.vote(s.c, open.id, s.arin, 'yes')).rejects.toThrow(/Character unavailable/)
    await asUser(dm)
    expect((await pub.state(s.c))!.participants.find((p) => p.id === s.bea)!.effect).not.toBeNull()
  })

  it('denies every rest RPC to anon, outsiders and a cross-campaign DM', async () => {
    const s = await setup()
    await asUser(player)
    const open = await pub.request(s.c, 'long')
    await asAnon()
    for (const call of [
      () => pub.state(s.c),
      () => pub.request(s.c, 'long'),
      () => pub.vote(s.c, open.id, s.arin, 'yes'),
      () => pub.now(s.c, open.id),
      () => pub.cancel(s.c, open.id),
    ])
      await expect(call()).rejects.toThrow(/permission denied/)
    await asUser(outsider)
    await db.query("select public.create_campaign('Elsewhere')")
    for (const call of [
      () => pub.state(s.c),
      () => pub.request(s.c, 'long'),
      () => pub.vote(s.c, open.id, s.arin, 'yes'),
      () => pub.now(s.c, open.id),
      () => pub.cancel(s.c, open.id),
    ])
      await expect(call()).rejects.toThrow(/Forbidden/)
    // The rest_requests row is readable by members only; votes are never exposed.
    const rows = await db.query('select id from public.rest_requests where campaign_id=$1', [s.c])
    expect(rows.rows).toEqual([])
    await expect(db.query('select * from private.rest_votes')).rejects.toThrow(/permission denied/)
    await asUser(peer)
    expect(
      (await db.query('select id from public.rest_requests where campaign_id=$1', [s.c])).rows,
    ).toHaveLength(1)
    await expect(
      db.query("update public.rest_requests set status='done' where campaign_id=$1", [s.c]),
    ).rejects.toThrow(/permission denied/)
  })

  it('mirrors the RPCs into PRE without production references', async () => {
    const s = await setup('pre')
    const pre = api('pre')
    await asUser(player)
    await pre.vitals(s.c, s.arin, { hp: 4 })
    const open = await pre.request(s.c, 'long')
    await asUser(peer)
    await pre.vote(s.c, open.id, s.bea, 'yes')
    await asUser(dm)
    expect((await pre.vote(s.c, open.id, s.npc, 'yes')).status).toBe('done')
    expect((await pre.row(s.arin)).current_hp).toBe(24)
    await pre.absent(s.c, s.bea, true)
    expect(await pre.character(s.bea)).toMatchObject({ absent: true, is_active: false })
    await asSystem()
    const leaks = await db.query<{ name: string }>(
      `select p.proname name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname in ('pre', 'pre_private') and p.proname in ('get_rest_state', 'request_rest',
          'vote_rest', 'resolve_rest_now', 'cancel_rest', 'set_character_absent', 'set_active_character',
          'rest_effect', 'rest_apply', 'rest_state', 'rest_settle', 'rest_finish', 'player_benched',
          'characters_absence_rules', 'guard_absent_character')
          and pg_get_functiondef(p.oid) ~ '(^|[^a-z_])(public|private)\\.'`,
    )
    expect(leaks.rows).toEqual([])
  })
})
