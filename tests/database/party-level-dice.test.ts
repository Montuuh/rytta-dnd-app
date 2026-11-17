import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-130 / RYT-133: party level, level-up, dice settings and the roll log.
const migration = '20261130120000_party_level_dice_settings.sql'
const db = new PGlite()
type Json = Record<string, unknown>
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
    complete: (c: string, ch: string, level = 1, maxHp = 12) =>
      db.query(`select ${schema}.save_character_sheet($1,$2,0,$3,$4,14,$5,true,$6)`, [
        c,
        ch,
        level,
        maxHp,
        JSON.stringify(build),
        randomUUID(),
      ]),
    party: (c: string, level: number | null, id = randomUUID()) =>
      scalar<number | null>(`select ${schema}.set_party_level($1,$2,$3) result`, [c, level, id]),
    dice: (c: string, mode: string, visibility: string, id = randomUUID()) =>
      scalar<Json>(`select ${schema}.set_dice_settings($1,$2,$3,$4) result`, [
        c,
        mode,
        visibility,
        id,
      ]),
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
    roll: (
      c: string,
      ch: string | null,
      o: {
        expr?: string
        source?: string
        dice?: number[] | null
        total?: number | null
        label?: string
        kind?: string
        id?: string
      } = {},
    ) =>
      scalar<Json>(`select ${schema}.log_roll($1,$2,$3,$4,$5,$6,$7,$8,$9) result`, [
        c,
        ch,
        o.label ?? 'Attack',
        o.expr ?? 'd20+5',
        o.kind ?? 'attack',
        o.source ?? 'recorded',
        o.dice === undefined ? [12] : o.dice,
        o.total === undefined ? 17 : o.total,
        o.id ?? randomUUID(),
      ]),
    rolls: async (c: string) =>
      (
        await rows<{ id: string }>(`select id from ${schema}.campaign_rolls where campaign_id=$1`, [
          c,
        ])
      ).map((r) => r.id),
    sheet: async (ch: string) => {
      await asSystem()
      return (
        await rows<{ level: number; max_hp: number; revision: number; current_hp: number }>(
          `select s.level, s.max_hp, s.revision::int, v.current_hp from ${schema}.character_sheets s
            join ${schema}.character_vitals v on v.character_id = s.character_id where s.character_id=$1`,
          [ch],
        )
      )[0]!
    },
    overview: async (c: string) =>
      rows<{ id: string; level: number | null; below_party_level: boolean }>(
        `select id, level, below_party_level from ${schema}.get_party_overview($1)`,
        [c],
      ),
  }
}

// A campaign with a DM, two Players with complete level-1 sheets, and a second campaign's DM.
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

describe('party level', () => {
  it.each(schemas)('%s: only the campaign DM sets it, idempotently and audited', async (schema) => {
    const { s, c, dm, player, outsider, otherDm, arin } = await table(schema)
    await asAnon()
    await expect(s.party(c, 3)).rejects.toThrow(/permission denied/)
    for (const actor of [outsider, player, otherDm]) {
      await asUser(actor)
      await expect(s.party(c, 3)).rejects.toThrow(/Forbidden/)
    }
    await asUser(dm)
    const id = randomUUID()
    expect(await s.party(c, 3, id)).toBe(3)
    expect(await s.party(c, 3, id)).toBe(3)
    await expect(s.party(c, 4, id)).rejects.toThrow(/Request mismatch/)
    await expect(s.party(c, 21)).rejects.toThrow(/Invalid level/)
    await expect(s.party(c, 0)).rejects.toThrow(/Invalid level/)
    // Lowering and clearing are allowed; sheets are untouched.
    expect(await s.party(c, 2)).toBe(2)
    expect(await s.party(c, null)).toBeNull()
    expect(await s.party(c, 3)).toBe(3)
    expect(await s.sheet(arin)).toMatchObject({ level: 1, max_hp: 12 })
    await asUser(dm)
    const audit = await rows<{ actor_id: string; after_value: Json }>(
      `select actor_id, after_value from ${schema}.campaign_events where campaign_id=$1 and kind='party_level' order by created_at`,
      [c],
    )
    expect(audit.map((a) => a.after_value.party_level)).toEqual([3, 2, null, 3])
    expect(audit.every((a) => a.actor_id === dm)).toBe(true)
    // A Player reads the level in the campaign read, never the audit, and cannot write the column.
    await asUser(player)
    expect(
      await rows(
        `select party_level, dice_mode, roll_visibility from ${schema}.list_my_campaigns_with_modules() where id=$1`,
        [c],
      ),
    ).toEqual([{ party_level: 3, dice_mode: 'physical', roll_visibility: 'roller_dm' }])
    expect(
      await rows(`select id from ${schema}.campaign_events where campaign_id=$1`, [c]),
    ).toEqual([])
    await asUser(otherDm)
    expect(
      await rows(`select id from ${schema}.campaign_events where campaign_id=$1`, [c]),
    ).toEqual([])
    for (const actor of [player, dm]) {
      await asUser(actor)
      await expect(
        db.query(`update ${schema}.campaigns set party_level = 20 where id=$1`, [c]),
      ).rejects.toThrow(/permission denied/)
      await expect(
        db.query(`update ${schema}.campaigns set roll_visibility = 'table' where id=$1`, [c]),
      ).rejects.toThrow(/permission denied/)
    }
  })

  it.each(schemas)(
    '%s: the overview flags characters below the level without leaking hidden ones',
    async (schema) => {
      const { s, c, dm, player, peer, outsider, otherDm, arin, bea } = await table(schema)
      // Pool, reserve, archived and absent characters.
      await asUser(dm)
      const pool = await scalar(`select ${schema}.create_character($1,'Pool') result`, [c])
      await s.complete(c, pool)
      const reserve = await s.own(c, player, 'Reserve')
      await s.complete(c, reserve)
      const gone = await s.own(c, peer, 'Gone')
      await s.complete(c, gone)
      await db.query(`select ${schema}.archive_character($1,$2)`, [c, gone])
      const third = await user('third')
      await s.join(c, dm, third)
      const away = await s.own(c, third, 'Away')
      await s.complete(c, away)
      await asUser(dm)
      await db.query(`select ${schema}.set_character_absent($1,$2,true)`, [c, away])
      await s.party(c, 2)

      await asUser(player)
      const mine = await s.overview(c)
      expect(mine.map((r) => r.id).sort()).toEqual([arin, bea].sort())
      expect(mine.every((r) => r.below_party_level && r.level === 1)).toBe(true)
      await asUser(dm)
      const all = await s.overview(c)
      expect(all.map((r) => r.id)).toContain(pool)
      expect(all.map((r) => r.id)).not.toContain(gone)
      expect(all.map((r) => r.id)).not.toContain(away)
      expect(all.find((r) => r.id === pool)).toMatchObject({ level: 1, below_party_level: true })
      // Caught up: no prompt. Draft sheets are never prompted.
      await s.party(c, 1)
      expect((await s.overview(c)).some((r) => r.below_party_level)).toBe(false)
      const draft = await scalar(`select ${schema}.create_character($1,'Draft') result`, [c])
      await s.party(c, 5)
      expect((await s.overview(c)).find((r) => r.id === draft)).toMatchObject({
        below_party_level: false,
      })
      await asAnon()
      await expect(s.overview(c)).rejects.toThrow(/permission denied/)
      for (const actor of [outsider, otherDm]) {
        await asUser(actor)
        await expect(s.overview(c)).rejects.toThrow(/Forbidden/)
      }
    },
  )
})

describe('apply_level_up', () => {
  it.each(schemas)('%s: a Player levels once, up to the party level', async (schema) => {
    const { s, c, dm, player, arin } = await table(schema)
    await asUser(player)
    // No party level yet: nothing to level to.
    await expect(s.levelUp(c, arin, 1, 2, 20)).rejects.toThrow(/Above party level/)
    await asUser(dm)
    await s.party(c, 2)
    await asUser(player)
    await expect(s.levelUp(c, arin, 1, 3, 30)).rejects.toThrow(/Invalid level/)
    await expect(s.levelUp(c, arin, 1, 2, 10)).rejects.toThrow(/Invalid level/)
    await expect(s.levelUp(c, arin, 0, 2, 20)).rejects.toThrow(/Stale revision/)
    const id = randomUUID()
    expect(await s.levelUp(c, arin, 1, 2, 20, id)).toBe(2)
    expect(await s.levelUp(c, arin, 1, 2, 20, id)).toBe(2)
    await expect(s.levelUp(c, arin, 1, 2, 21, id)).rejects.toThrow(/Request mismatch/)
    expect(await s.sheet(arin)).toEqual({ level: 2, max_hp: 20, revision: 2, current_hp: 20 })
    await asUser(player)
    await expect(s.levelUp(c, arin, 2, 3, 28)).rejects.toThrow(/Above party level/)
    // Audit: before and after.
    await asUser(dm)
    expect(
      await rows(
        `select actor_id, before_value, after_value from ${schema}.character_events where character_id=$1 and kind='level_up'`,
        [arin],
      ),
    ).toEqual([
      {
        actor_id: player,
        before_value: { level: 1, max_hp: 12 },
        after_value: { level: 2, max_hp: 20, party_level: 2 },
      },
    ])
    // The DM may skip levels and go above the party level, never above 20.
    await expect(s.levelUp(c, arin, 2, 21, 99)).rejects.toThrow(/Invalid level/)
    expect(await s.levelUp(c, arin, 2, 5, 44)).toBe(3)
    expect(await s.sheet(arin)).toMatchObject({ level: 5, max_hp: 44, current_hp: 44 })
  })

  it.each(schemas)(
    '%s: refused during the play lock, for drafts and for anyone else',
    async (schema) => {
      const { s, c, other, dm, player, peer, outsider, otherDm, arin, bea } = await table(schema)
      await asUser(dm)
      await s.party(c, 4)
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
      await db.query(`select ${schema}.set_encounter_status($1,$2,'initiative',$3)`, [
        c,
        e,
        randomUUID(),
      ])
      await asUser(player)
      await expect(s.levelUp(c, arin, 1, 2, 20)).rejects.toThrow(/Encounter locked/)
      // Bea is not fighting; her Player levels.
      await asUser(peer)
      expect(await s.levelUp(c, bea, 1, 2, 20)).toBe(2)
      await asUser(dm)
      await db.query(`select ${schema}.set_encounter_status($1,$2,'ended',$3)`, [
        c,
        e,
        randomUUID(),
      ])
      await asUser(player)
      expect(await s.levelUp(c, arin, 1, 2, 20)).toBe(2)

      await asAnon()
      await expect(s.levelUp(c, arin, 2, 3, 28)).rejects.toThrow(/permission denied/)
      for (const actor of [outsider, peer, otherDm]) {
        await asUser(actor)
        await expect(s.levelUp(c, arin, 2, 3, 28)).rejects.toThrow(/Forbidden/)
      }
      // A cross-campaign DM cannot reach the character through their own campaign either.
      await asUser(otherDm)
      await expect(s.levelUp(other, arin, 2, 3, 28)).rejects.toThrow(/Character unavailable/)
      const draft = await s.own(c, player, 'Draft')
      await expect(s.levelUp(c, draft, 0, 2, 10)).rejects.toThrow(/Sheet incomplete/)
      expect(await s.sheet(arin)).toMatchObject({ level: 2 })
    },
  )
})

describe('dice settings', () => {
  it.each(schemas)('%s: DM-only, validated, idempotent and audited', async (schema) => {
    const { s, c, dm, player, outsider, otherDm } = await table(schema)
    await asAnon()
    await expect(s.dice(c, 'app', 'table')).rejects.toThrow(/permission denied/)
    for (const actor of [outsider, player, otherDm]) {
      await asUser(actor)
      await expect(s.dice(c, 'app', 'table')).rejects.toThrow(/Forbidden/)
    }
    await asUser(dm)
    await expect(s.dice(c, 'dice', 'table')).rejects.toThrow(/Invalid settings/)
    await expect(s.dice(c, 'app', 'everyone')).rejects.toThrow(/Invalid settings/)
    const id = randomUUID()
    expect(await s.dice(c, 'player', 'table', id)).toEqual({
      dice_mode: 'player',
      roll_visibility: 'table',
    })
    expect(await s.dice(c, 'player', 'table', id)).toEqual({
      dice_mode: 'player',
      roll_visibility: 'table',
    })
    await expect(s.dice(c, 'app', 'table', id)).rejects.toThrow(/Request mismatch/)
    expect(
      await rows(
        `select before_value, after_value from ${schema}.campaign_events where campaign_id=$1 and kind='dice_settings'`,
        [c],
      ),
    ).toEqual([
      {
        before_value: { dice_mode: 'physical', roll_visibility: 'roller_dm' },
        after_value: { dice_mode: 'player', roll_visibility: 'table' },
      },
    ])
    await asUser(player)
    expect(
      await rows(
        `select dice_mode, roll_visibility from ${schema}.list_my_campaigns_with_modules() where id=$1`,
        [c],
      ),
    ).toEqual([{ dice_mode: 'player', roll_visibility: 'table' }])
  })
})

describe('roll log', () => {
  it.each(schemas)('%s: each visibility mode, read at read time', async (schema) => {
    const { s, c, other, dm, player, peer, outsider, otherDm, arin } = await table(schema)
    await asUser(player)
    const mine = (await s.roll(c, arin)).id as string
    await asUser(dm)
    const dms = (await s.roll(c, null, { label: 'Goblin' })).id as string
    await asUser(otherDm)
    await s.roll(other, null)
    const seen = async (actor: string) => {
      await asUser(actor)
      return (await s.rolls(c)).sort()
    }
    // roller_dm (default)
    expect(await seen(player)).toEqual([mine])
    expect(await seen(peer)).toEqual([])
    expect(await seen(dm)).toEqual([mine, dms].sort())
    expect(await seen(otherDm)).toEqual([])
    expect(await seen(outsider)).toEqual([])
    // roller
    await asUser(dm)
    await s.dice(c, 'physical', 'roller')
    expect(await seen(player)).toEqual([mine])
    expect(await seen(peer)).toEqual([])
    expect(await seen(dm)).toEqual([dms])
    expect(await seen(otherDm)).toEqual([])
    // table: rolls made under roller_dm keep roller_dm; new rolls are public.
    await asUser(dm)
    await s.dice(c, 'physical', 'table')
    expect(await seen(player)).toEqual([mine])
    expect(await seen(peer)).toEqual([])
    expect(await seen(dm)).toEqual([mine, dms].sort())
    await asUser(dm)
    const open = (await s.roll(c, null, { label: 'Open' })).id as string
    expect(await seen(player)).toEqual([mine, open].sort())
    expect(await seen(peer)).toEqual([open])
    expect(await seen(dm)).toEqual([mine, dms, open].sort())
    expect(await seen(otherDm)).toEqual([])
    expect(await seen(outsider)).toEqual([])
    await asAnon()
    await expect(s.rolls(c)).rejects.toThrow(/permission denied/)
    // A former member reads nothing, even their own roll.
    await asUser(player)
    await db.query(`select ${schema}.change_campaign_member($1,$2,null)`, [c, player])
    expect(await seen(player)).toEqual([])
    // The signal is readable by members only and carries no roll.
    await asUser(peer)
    expect(
      await rows(
        `select campaign_id, revision::int from ${schema}.campaign_roll_signals where campaign_id=$1`,
        [c],
      ),
    ).toEqual([{ campaign_id: c, revision: 5 }])
    await asUser(otherDm)
    expect(
      await rows(`select 1 from ${schema}.campaign_roll_signals where campaign_id=$1`, [c]),
    ).toEqual([])
    // No direct writes.
    await asUser(dm)
    await expect(
      db.query(`delete from ${schema}.campaign_rolls where campaign_id=$1`, [c]),
    ).rejects.toThrow(/permission denied/)
    await expect(
      db.query(`update ${schema}.campaign_roll_signals set revision = 0 where campaign_id=$1`, [c]),
    ).rejects.toThrow(/permission denied/)
  })

  it.each(schemas)('%s: who may log, input validation and server rolls', async (schema) => {
    const { s, c, other, dm, player, peer, outsider, otherDm, arin, bea } = await table(schema)
    await asAnon()
    await expect(s.roll(c, arin)).rejects.toThrow(/permission denied/)
    for (const actor of [outsider, otherDm]) {
      await asUser(actor)
      await expect(s.roll(c, arin)).rejects.toThrow(/Forbidden/)
    }
    await asUser(otherDm)
    await expect(s.roll(other, arin)).rejects.toThrow(/Character unavailable/)
    await asUser(peer)
    await expect(s.roll(c, arin)).rejects.toThrow(/Character unavailable/)
    await expect(s.roll(c, null)).rejects.toThrow(/Character unavailable/)
    await asUser(player)
    for (const bad of [
      { expr: 'd7+1' },
      { expr: 'd20+5; drop' },
      { expr: '2d6', dice: [3, 9], total: 12 },
      { expr: '2d6', dice: [3], total: 3 },
      { expr: 'd20+5', dice: [12], total: 18 },
      { expr: 'd20kh1', dice: [12], total: 12 },
      { label: 'x'.repeat(81) },
      { label: 'bad\nline' },
      { kind: 'cheat' },
      { source: 'magic' },
      { dice: [12], total: null },
    ])
      await expect(s.roll(c, arin, bad), JSON.stringify(bad)).rejects.toThrow(/Invalid roll/)
    // Keep-highest, subtraction and a total alone.
    expect(
      await s.roll(c, arin, { expr: '2d20kh1-1+1d4', dice: [3, 17, 2], total: 18 }),
    ).toMatchObject({ dice: [3, 17, 2], total: 18, source: 'recorded' })
    expect(await s.roll(c, arin, { expr: 'd20+2', dice: [], total: 9 })).toMatchObject({
      dice: [],
      total: 9,
    })
    // App rolls: refused for Players while the table rolls physical dice; dice come from the server.
    await expect(s.roll(c, arin, { source: 'app', dice: null, total: null })).rejects.toThrow(
      /Dice mode/,
    )
    await asUser(dm)
    await s.dice(c, 'app', 'roller_dm')
    await asUser(player)
    await expect(s.roll(c, arin, { source: 'app', dice: [20], total: 25 })).rejects.toThrow(
      /Invalid roll/,
    )
    const id = randomUUID()
    const app = await s.roll(c, arin, { source: 'app', expr: '3d6+2', dice: null, total: null, id })
    const dice = app.dice as number[]
    expect(dice).toHaveLength(3)
    expect(dice.every((d) => d >= 1 && d <= 6)).toBe(true)
    expect(app.total).toBe(dice.reduce((a, b) => a + b, 0) + 2)
    // A retry returns the same roll; it never re-rolls.
    expect(
      await s.roll(c, arin, { source: 'app', expr: '3d6+2', dice: null, total: null, id }),
    ).toEqual(app)
    await expect(
      s.roll(c, arin, { source: 'app', expr: '3d6+3', dice: null, total: null, id }),
    ).rejects.toThrow(/Request mismatch/)
    await asUser(peer)
    await expect(
      s.roll(c, bea, { source: 'app', expr: '3d6+2', dice: null, total: null, id }),
    ).rejects.toThrow(/Request mismatch/)
    // The DM rolls for any character of the campaign, or none.
    await asUser(dm)
    expect(await s.roll(c, bea)).toMatchObject({ character_id: bea, roller_id: dm })
  })

  it.each(schemas)('%s: 30 rolls per minute per user', async (schema) => {
    const { s, c, player, peer, arin, bea } = await table(schema)
    await asUser(player)
    for (let i = 0; i < 30; i++) await s.roll(c, arin)
    await expect(s.roll(c, arin)).rejects.toThrow(/Roll limit/)
    // Another user is not affected; a minute later the Player rolls again.
    await asUser(peer)
    await s.roll(c, bea)
    await asSystem()
    await db.query(
      `update ${schema}.campaign_rolls set created_at = created_at - interval '2 minutes' where roller_id=$1`,
      [player],
    )
    await asUser(player)
    await s.roll(c, arin)
  })
})

describe('retention', () => {
  it('keeps the newest rolls per campaign, nothing older than 30 days, in both environments', async () => {
    for (const schema of schemas) {
      const helper = schema === 'public' ? 'private' : 'pre_private'
      const { s, c, dm, arin } = await table(schema)
      await asUser(dm)
      for (let i = 0; i < 5; i++) await s.roll(c, arin)
      await asSystem()
      // 210 more rows, older than the live ones, and three older than 30 days.
      await db.query(
        `insert into ${schema}.campaign_rolls(id, campaign_id, character_id, roller_id, expression, total, kind, source, visibility, created_at)
           select gen_random_uuid(), $1, $2, $3, 'd20', 10, 'custom', 'recorded', 'table',
             now() - (g || ' minutes')::interval from generate_series(10, 219) g`,
        [c, arin, dm],
      )
      await db.query(
        `update ${schema}.campaign_rolls set created_at = now() - interval '40 days'
          where id in (select id from ${schema}.campaign_rolls where campaign_id=$1 order by created_at limit 3)`,
        [c],
      )
      const result = await scalar<Json>(`select ${helper}.prune_stale_rows() result`)
      expect(result).toMatchObject({
        campaign_rolls_expired: 3,
        campaign_rolls_trimmed: 12,
        account_deletion_requests: 0,
        encounter_events_deleted: 0,
      })
      expect(
        Number(
          await scalar(
            `select count(*) result from ${schema}.campaign_rolls where campaign_id=$1`,
            [c],
          ),
        ),
      ).toBe(200)
    }
  })

  it('each insert keeps the campaign at the cap; prune stays owner-only', async () => {
    const { s, c, dm, arin } = await table('public')
    await asSystem()
    await db.query(
      `insert into public.campaign_rolls(id, campaign_id, character_id, roller_id, expression, total, kind, source, visibility, created_at)
         select gen_random_uuid(), $1, $2, $3, 'd20', 10, 'custom', 'recorded', 'table', now() - (g || ' minutes')::interval
         from generate_series(1, 200) g`,
      [c, arin, dm],
    )
    await asUser(dm)
    const newest = (await s.roll(c, arin)).id
    await asSystem()
    expect(
      await rows(
        `select count(*)::int n, bool_or(id = $2) newest from public.campaign_rolls where campaign_id=$1`,
        [c, newest],
      ),
    ).toEqual([{ n: 200, newest: true }])
    for (const fn of ['private.prune_stale_rows()', 'pre_private.prune_stale_rows()'])
      for (const role of ['anon', 'authenticated', 'service_role'])
        expect(
          await scalar(`select has_function_privilege($1, $2, 'execute') result`, [role, fn]),
        ).toBe(false)
  })
})

describe('grants and the PRE mirror', () => {
  it('exposes nothing to anon and remaps every PRE function', async () => {
    const fns = await rows<{
      fn: string
      prosecdef: boolean
      proconfig: string[]
      prosrc: string
      anon: boolean
      auth: boolean
    }>(
      `select n.nspname || '.' || p.proname fn, p.prosecdef, p.proconfig, p.prosrc,
         has_function_privilege('anon', p.oid, 'execute') anon,
         has_function_privilege('authenticated', p.oid, 'execute') auth
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('public', 'private', 'pre', 'pre_private')
         and p.proname in ('set_party_level', 'set_dice_settings', 'apply_level_up', 'log_roll',
           'list_my_campaigns_with_modules', 'get_party_overview', 'my_roll_scopes', 'roll_eval',
           'save_character_sheet', 'export_my_data')
       order by 1`,
    )
    expect(fns).toHaveLength(20)
    for (const f of fns) {
      expect(f.proconfig).toEqual(['search_path=""'])
      expect(f.anon, f.fn).toBe(false)
      expect(f.prosecdef, f.fn).toBe(!f.fn.endsWith('roll_eval'))
      expect(f.auth, f.fn).toBe(!f.fn.endsWith('roll_eval'))
      if (f.fn.startsWith('pre')) expect(f.prosrc).not.toMatch(/\bpublic\.|\bprivate\./)
    }
    const tables = await rows<{ t: string; rls: boolean; anon: boolean; write: boolean }>(
      `select n.nspname || '.' || c.relname t, c.relrowsecurity rls,
         has_table_privilege('anon', c.oid, 'select') anon,
         has_table_privilege('authenticated', c.oid, 'insert,update,delete') write
       from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname in ('public', 'private', 'pre', 'pre_private')
         and c.relname in ('campaign_rolls', 'campaign_roll_signals', 'campaign_events', 'campaign_requests')
       order by 1`,
    )
    expect(tables).toHaveLength(8)
    for (const t of tables) expect(t).toMatchObject({ rls: true, anon: false, write: false })
    expect(
      (
        await rows<{ t: string }>(
          `select schemaname || '.' || tablename t from pg_publication_tables
            where pubname = 'supabase_realtime' and tablename like 'campaign_roll%' order by 1`,
        )
      ).map((r) => r.t),
    ).toEqual(['pre.campaign_roll_signals', 'public.campaign_roll_signals'])
  })

  it('keeps PRE writes in PRE', async () => {
    const { s, c, dm } = await table('pre')
    await asUser(dm)
    await s.party(c, 7)
    await asSystem()
    expect(await rows('select 1 from public.campaigns where id=$1', [c])).toEqual([])
    expect(await scalar('select party_level result from pre.campaigns where id=$1', [c])).toBe(7)
  })
})

const modes = ['roller', 'roller_dm', 'table'] as const
const rank = { roller: 0, roller_dm: 1, table: 2 } as const

describe('roll visibility switches', () => {
  // Every switch in both directions: a roll keeps the stricter of the setting it was made under
  // and the current one, for its roller, another Player, the DM and a DM of another campaign.
  const pairs = modes.flatMap((from) => modes.filter((to) => to !== from).map((to) => [from, to]))
  it.each(schemas.flatMap((schema) => pairs.map(([from, to]) => [schema, from, to])))(
    '%s: %s -> %s',
    async (schema, from, to) => {
      const { s, c, dm, player, peer, otherDm, arin } = await table(schema as Schema)
      await asUser(dm)
      await s.dice(c, 'physical', from!)
      await asUser(player)
      const mine = (await s.roll(c, arin)).id as string
      await asUser(dm)
      const dms = (await s.roll(c, null, { label: 'Ambush stealth', dice: [4], total: 9 }))
        .id as string
      await s.dice(c, 'physical', to!)
      const effective = Math.min(rank[from as keyof typeof rank], rank[to as keyof typeof rank])
      const seen = async (actor: string) => {
        await asUser(actor)
        return (await s.rolls(c)).sort()
      }
      const expected = (ids: (string | false)[]) => ids.filter((x): x is string => !!x).sort()
      expect(await seen(player)).toEqual(expected([mine, effective === 2 && dms]))
      expect(await seen(peer)).toEqual(expected([effective === 2 && mine, effective === 2 && dms]))
      expect(await seen(dm)).toEqual(expected([effective >= 1 && mine, dms]))
      expect(await seen(otherDm)).toEqual([])
    },
  )
})

describe('save_character_sheet level rule', () => {
  it.each(schemas)(
    '%s: a complete sheet changes level only through level-up or the DM',
    async (schema) => {
      const { s, c, dm, player, arin } = await table(schema)
      const save = (ch: string, rev: number, level: number, maxHp: number, complete = true) =>
        db.query(`select ${schema}.save_character_sheet($1,$2,$3,$4,$5,14,$6,$7,$8)`, [
          c,
          ch,
          rev,
          level,
          maxHp,
          JSON.stringify(build),
          complete,
          randomUUID(),
        ])
      await asUser(player)
      await expect(save(arin, 1, 2, 20)).rejects.toThrow(/Use level up/)
      // Other fields still save at the same level.
      await save(arin, 1, 1, 15)
      expect(await s.sheet(arin)).toMatchObject({ level: 1, max_hp: 15, revision: 2 })
      // A draft is finished at any level.
      const fresh = await s.own(c, player, 'Fresh')
      await save(fresh, 0, 5, 40)
      expect(await s.sheet(fresh)).toMatchObject({ level: 5, max_hp: 40 })
      // The DM may still edit the level of any sheet.
      await asUser(dm)
      await save(arin, 2, 4, 30)
      expect(await s.sheet(arin)).toMatchObject({ level: 4, max_hp: 30 })
    },
  )
})

describe('level-up bounds and benched characters', () => {
  it.each(schemas)('%s: bounded HP gain, no class change for Players', async (schema) => {
    const { s, c, dm, player, arin } = await table(schema)
    await asUser(dm)
    await s.party(c, 5)
    await asUser(player)
    await expect(s.levelUp(c, arin, 1, 2, 12)).rejects.toThrow(/Invalid level/)
    await expect(s.levelUp(c, arin, 1, 2, 77)).rejects.toThrow(/Invalid level/)
    await expect(
      scalar(`select ${schema}.apply_level_up($1,$2,1,2,20,$3,$4) result`, [
        c,
        arin,
        JSON.stringify({ classKey: 'wizard' }),
        randomUUID(),
      ]),
    ).rejects.toThrow(/Class change/)
    expect(await s.levelUp(c, arin, 1, 2, 76)).toBe(2)
    // The DM may change the class and grant more HP.
    await asUser(dm)
    expect(
      await scalar(`select ${schema}.apply_level_up($1,$2,2,3,200,$3,$4) result`, [
        c,
        arin,
        JSON.stringify({ classKey: 'wizard' }),
        randomUUID(),
      ]),
    ).toBe(3)
  })

  it.each(schemas)(
    '%s: a benched character still levels up and rolls, like its sheet',
    async (schema) => {
      const { s, c, dm, player } = await table(schema)
      const bench = await s.own(c, player, 'Bench')
      await s.complete(c, bench)
      await asSystem()
      expect(
        await scalar(`select is_active result from ${schema}.characters where id=$1`, [bench]),
      ).toBe(false)
      await asUser(dm)
      await s.party(c, 2)
      await asUser(player)
      expect(await s.levelUp(c, bench, 1, 2, 20)).toBe(2)
      expect(await s.roll(c, bench)).toMatchObject({ character_id: bench, source: 'recorded' })
    },
  )
})

describe('inactive and removed members', () => {
  it.each(schemas)('%s: refused on every new RPC and read nothing', async (schema) => {
    const { s, c, dm, player, peer, arin, bea } = await table(schema)
    await asUser(dm)
    await s.party(c, 3)
    await s.dice(c, 'app', 'table')
    await asUser(player)
    await s.roll(c, arin)
    await asUser(peer)
    await s.roll(c, bea)
    // The Player leaves; the DM removes the peer.
    await asUser(player)
    await db.query(`select ${schema}.change_campaign_member($1,$2,null)`, [c, player])
    await asUser(dm)
    await db.query(`select ${schema}.change_campaign_member($1,$2,null)`, [c, peer])
    for (const [actor, ch] of [
      [player, arin],
      [peer, bea],
    ] as const) {
      await asUser(actor)
      await expect(s.party(c, 4)).rejects.toThrow(/Forbidden/)
      await expect(s.dice(c, 'physical', 'roller')).rejects.toThrow(/Forbidden/)
      await expect(s.levelUp(c, ch, 1, 2, 20)).rejects.toThrow(/Forbidden/)
      await expect(s.roll(c, ch)).rejects.toThrow(/Forbidden/)
      await expect(s.overview(c)).rejects.toThrow(/Forbidden/)
      expect(
        await rows(`select id from ${schema}.list_my_campaigns_with_modules() where id=$1`, [c]),
      ).toEqual([])
      for (const t of ['campaign_rolls', 'campaign_roll_signals', 'campaign_events'])
        expect(await rows(`select 1 from ${schema}.${t} where campaign_id=$1`, [c]), t).toEqual([])
    }
  })
})

describe('export_my_data', () => {
  it.each(schemas)('%s: includes own rolls and authored campaign events', async (schema) => {
    const { s, c, dm, player, arin } = await table(schema)
    await asUser(dm)
    await s.party(c, 2)
    await s.roll(c, null)
    await asUser(player)
    const own = await s.roll(c, arin)
    const mine = await scalar<{ rolls: Json[]; campaign_events: Json[] }>(
      `select ${schema}.export_my_data() result`,
    )
    expect(mine.rolls).toEqual([
      expect.objectContaining({ id: own.id, source: 'recorded', visibility: 'roller_dm' }),
    ])
    expect(mine.campaign_events).toEqual([])
    await asUser(dm)
    const dms = await scalar<{ rolls: Json[]; campaign_events: Json[] }>(
      `select ${schema}.export_my_data() result`,
    )
    expect(dms.rolls).toHaveLength(1)
    expect(dms.campaign_events).toEqual([
      expect.objectContaining({ kind: 'party_level', after_value: { party_level: 2 } }),
    ])
  })
})
