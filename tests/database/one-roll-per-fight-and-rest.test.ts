import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-137: with dice in the app, one initiative roll per fight and one hit-dice roll per rest,
// enforced by the server.
const migration = '20261204120000_one_roll_per_fight_and_rest.sql'
const db = new PGlite()
type Json = Record<string, unknown>
type Roll = {
  id: string
  roller_id: string
  character_id: string | null
  kind: string
  source: string
  total: number
  dice: number[]
  encounter_id: string | null
  rest_id: string | null
  superseded_at: string | null
}
type Context = {
  encounter_id: string | null
  rest_id: string | null
  spent: { character_id: string; kind: string }[]
  rolls: Roll[]
}
const schemas = ['public', 'pre'] as const
type Schema = (typeof schemas)[number]
const priv = (schema: Schema) => (schema === 'public' ? 'private' : 'pre_private')

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
const codeOf = async (work: Promise<unknown>) => {
  try {
    await work
  } catch (error) {
    return {
      code: (error as { code?: string }).code,
      message: (error as Error).message,
    }
  }
  throw new Error('expected a refusal')
}

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
const build = { classKey: 'fighter', classLabel: 'Fighter', hitDie: 10 }

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
      const id = await scalar(`select ${schema}.create_own_character($1,$2,$3) result`, [
        c,
        name,
        randomUUID(),
      ])
      await db.query(`select ${schema}.save_character_sheet($1,$2,0,3,30,14,$3,true,$4)`, [
        c,
        id,
        JSON.stringify(build),
        randomUUID(),
      ])
      return id
    },
    dice: (c: string, mode: string, visibility: string) =>
      db.query(`select ${schema}.set_dice_settings($1,$2,$3,$4)`, [
        c,
        mode,
        visibility,
        randomUUID(),
      ]),
    // Positional, nine arguments: the call shape of the frontend in production.
    app: (c: string, ch: string | null, kind: string, expr: string, id = randomUUID()) =>
      scalar<Roll>(`select ${schema}.log_roll($1,$2,$3,$4,$5,'app',null,null,$6) result`, [
        c,
        ch,
        kind,
        expr,
        kind,
        id,
      ]),
    recorded: (c: string, ch: string, kind: string, die: number, id = randomUUID()) =>
      scalar<Roll>(`select ${schema}.log_roll($1,$2,$3,'d20',$4,'recorded',$5,$6,$7) result`, [
        c,
        ch,
        kind,
        kind,
        [die],
        die,
        id,
      ]),
    fight: async (c: string, dm: string, characters: string[]) => {
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
        JSON.stringify(characters.map((id) => ({ kind: 'character', character_id: id }))),
        randomUUID(),
      ])
      await db.query(`select ${schema}.set_encounter_status($1,$2,'initiative',$3)`, [
        c,
        e,
        randomUUID(),
      ])
      return e
    },
    end: async (c: string, dm: string, e: string) => {
      await asUser(dm)
      await db.query(`select ${schema}.set_encounter_status($1,$2,'ended',$3)`, [
        c,
        e,
        randomUUID(),
      ])
    },
    rest: async (c: string, dm: string) => {
      await asUser(dm)
      return (
        await scalar<{ id: string }>(`select ${schema}.request_rest($1,'short',$2) result`, [
          c,
          randomUUID(),
        ])
      ).id
    },
    cancelRest: async (c: string, dm: string, r: string) => {
      await asUser(dm)
      await db.query(`select ${schema}.cancel_rest($1,$2)`, [c, r])
    },
    context: (c: string) => scalar<Context>(`select ${schema}.get_roll_context($1) result`, [c]),
    reset: (c: string, ch: string, expr: string | null, id = randomUUID()) =>
      scalar<Json & { superseded_roll: string | null; roll: Roll | null; revision: number }>(
        `select ${schema}.reset_initiative_roll($1,$2,$3,$4) result`,
        [c, ch, expr, id],
      ),
    combatant: async (e: string, ch: string) => {
      await asSystem()
      return (
        await rows<{ id: string; initiative: number | null }>(
          `select id, initiative from ${schema}.encounter_combatants where encounter_id=$1 and character_id=$2`,
          [e, ch],
        )
      )[0]!
    },
    stored: async (c: string) => {
      await asSystem()
      return rows<Roll>(
        `select id, roller_id, character_id, kind, source, total, dice, encounter_id, rest_id,
           superseded_at from ${schema}.campaign_rolls where campaign_id=$1 order by created_at, id`,
        [c],
      )
    },
    signal: async (c: string) => {
      await asSystem()
      return scalar<number>(
        `select coalesce((select revision::int from ${schema}.campaign_roll_signals where campaign_id=$1), 0) result`,
        [c],
      )
    },
  }
}

// A campaign with dice in the app, a DM, two Players with complete sheets and a second campaign.
async function table(schema: Schema) {
  const s = api(schema)
  const dm = await user('dm'),
    player = await user('player'),
    peer = await user('peer'),
    outsider = await user('outsider'),
    otherDm = await user('otherdm')
  await asUser(dm)
  const c = await scalar(`select ${schema}.create_campaign('Rolls') result`)
  await s.dice(c, 'app', 'roller_dm')
  await asUser(otherDm)
  const other = await scalar(`select ${schema}.create_campaign('Elsewhere') result`)
  await s.join(c, dm, player)
  await s.join(c, dm, peer)
  const arin = await s.own(c, player, 'Arin')
  const bea = await s.own(c, peer, 'Bea')
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

describe('linking a server roll to its fight or rest', () => {
  it.each(schemas)(
    '%s: initiative links to the live encounter, hit dice to the open rest',
    async (schema) => {
      const { s, c, dm, player, arin } = await table(schema)
      const e = await s.fight(c, dm, [arin])
      await asUser(player)
      const first = await s.app(c, arin, 'initiative', 'd20+2')
      expect(first).toMatchObject({ encounter_id: e, rest_id: null, superseded_at: null })
      await s.end(c, dm, e)
      const r = await s.rest(c, dm)
      await asUser(player)
      const dice = await s.app(c, arin, 'hit_die', '2d10')
      expect(dice).toMatchObject({ rest_id: r, encounter_id: null, superseded_at: null })
      expect(await s.stored(c)).toMatchObject([
        { id: first.id, encounter_id: e },
        { id: dice.id, rest_id: r },
      ])
    },
  )

  it.each(schemas)('%s: a second roll is refused and writes nothing', async (schema) => {
    const { s, c, dm, player, arin } = await table(schema)
    const e = await s.fight(c, dm, [arin])
    await asUser(player)
    await s.app(c, arin, 'initiative', 'd20+2')
    const before = await s.stored(c)
    const signal = await s.signal(c)
    await asUser(player)
    expect(await codeOf(s.app(c, arin, 'initiative', 'd20+2'))).toEqual({
      code: 'P0001',
      message: 'Already rolled',
    })
    // Another expression does not open a second slot either.
    await asUser(player)
    await expect(s.app(c, arin, 'initiative', 'd20+9')).rejects.toThrow(/Already rolled/)
    // The DM rolling the same character's initiative through log_roll is bound by the same rule.
    await asUser(dm)
    await expect(s.app(c, arin, 'initiative', 'd20+2')).rejects.toThrow(/Already rolled/)
    expect(await s.stored(c)).toEqual(before)
    expect(await s.signal(c)).toBe(signal)
    await s.end(c, dm, e)

    const r = await s.rest(c, dm)
    await asUser(player)
    await s.app(c, arin, 'hit_die', '1d10')
    const afterRest = await s.stored(c)
    await asUser(player)
    expect(await codeOf(s.app(c, arin, 'hit_die', '2d10'))).toEqual({
      code: 'P0001',
      message: 'Already rolled',
    })
    expect(await s.stored(c)).toEqual(afterRest)
    expect(afterRest.at(-1)).toMatchObject({ rest_id: r })
  })

  it.each(schemas)(
    '%s: the unique index refuses a second linked row however it arrives',
    async (schema) => {
      const { s, c, dm, player, arin } = await table(schema)
      const e = await s.fight(c, dm, [arin])
      await asSystem()
      const insert = (id: string) =>
        db.query(
          `insert into ${schema}.campaign_rolls(id, campaign_id, character_id, roller_id, expression, dice, total,
           kind, source, visibility, encounter_id) values ($1,$2,$3,$4,'d20','{10}',10,'initiative','app','roller_dm',$5)`,
          [id, c, arin, player, e],
        )
      // Two writers that both passed any check: the second insert fails on the index.
      await insert(randomUUID())
      await expect(insert(randomUUID())).rejects.toThrow(/campaign_rolls|duplicate key/)
      // And both in one statement cannot both land either.
      await asSystem()
      await expect(
        db.query(
          `insert into ${schema}.campaign_rolls(id, campaign_id, character_id, roller_id, expression, dice, total,
           kind, source, visibility, encounter_id)
         select gen_random_uuid(),$1,$2,$3,'d20','{10}',10,'initiative','app','roller_dm',$4 from generate_series(1,2)`,
          [c, arin, dm, e],
        ),
      ).rejects.toThrow(/duplicate key/)
      expect((await s.stored(c)).length).toBe(1)
      // The same rule through log_roll from a second user.
      await asUser(dm)
      await expect(s.app(c, arin, 'initiative', 'd20')).rejects.toThrow(/Already rolled/)
    },
  )

  it.each(schemas)('%s: a replay returns the first roll', async (schema) => {
    const { s, c, dm, player, arin } = await table(schema)
    await s.fight(c, dm, [arin])
    const id = randomUUID()
    await asUser(player)
    const first = await s.app(c, arin, 'initiative', 'd20+2', id)
    await asUser(player)
    await expect(s.app(c, arin, 'initiative', 'd20+2')).rejects.toThrow(/Already rolled/)
    await asUser(player)
    const again = await s.app(c, arin, 'initiative', 'd20+2', id)
    expect(again).toEqual(first)
    // Reusing the id for another roll is still a mismatch, never a second roll.
    await asUser(player)
    await expect(s.app(c, arin, 'initiative', 'd20+3', id)).rejects.toThrow(/Request mismatch/)
    // Another user's request id: reported as a mismatch, not as a spent roll.
    await asUser(dm)
    await expect(s.app(c, null, 'custom', 'd6', id)).rejects.toThrow(/Request mismatch/)
    expect((await s.stored(c)).map((r) => r.id)).toEqual([first.id])
  })

  it.each(schemas)('%s: a new encounter or a new rest allows one new roll', async (schema) => {
    const { s, c, dm, player, arin } = await table(schema)
    const first = await s.fight(c, dm, [arin])
    await asUser(player)
    await s.app(c, arin, 'initiative', 'd20+2')
    await s.end(c, dm, first)
    const second = await s.fight(c, dm, [arin])
    await asUser(player)
    expect(await s.app(c, arin, 'initiative', 'd20+2')).toMatchObject({ encounter_id: second })
    await asUser(player)
    await expect(s.app(c, arin, 'initiative', 'd20+2')).rejects.toThrow(/Already rolled/)
    await s.end(c, dm, second)

    const r1 = await s.rest(c, dm)
    await asUser(player)
    await s.app(c, arin, 'hit_die', '1d10')
    await s.cancelRest(c, dm, r1)
    const r2 = await s.rest(c, dm)
    await asUser(player)
    expect(await s.app(c, arin, 'hit_die', '1d10')).toMatchObject({ rest_id: r2 })
    await asUser(player)
    await expect(s.app(c, arin, 'hit_die', '1d10')).rejects.toThrow(/Already rolled/)
  })

  it.each(schemas)(
    '%s: recorded rolls, other kinds and rolls outside a fight or rest stay unrestricted',
    async (schema) => {
      const { s, c, dm, player, peer, arin, bea } = await table(schema)
      // No fight and no rest: unlinked, as often as wanted.
      await asUser(player)
      for (let i = 0; i < 2; i++) {
        expect(await s.app(c, arin, 'initiative', 'd20+2')).toMatchObject({
          encounter_id: null,
          rest_id: null,
        })
        expect(await s.app(c, arin, 'hit_die', '1d10')).toMatchObject({ rest_id: null })
      }
      const e = await s.fight(c, dm, [arin])
      await asUser(player)
      await s.app(c, arin, 'initiative', 'd20+2')
      // Physical dice recorded during the fight: unlinked and unrestricted.
      for (let i = 0; i < 2; i++) {
        await asUser(player)
        expect(await s.recorded(c, arin, 'initiative', 11 + i)).toMatchObject({
          encounter_id: null,
          source: 'recorded',
        })
      }
      // Other kinds in the fight: unlinked.
      await asUser(player)
      expect(await s.app(c, arin, 'attack', 'd20+5')).toMatchObject({ encounter_id: null })
      expect(await s.app(c, arin, 'hit_die', '1d10')).toMatchObject({ rest_id: null })
      // Bea is not in the fight: her initiative is unlinked.
      await asUser(peer)
      expect(await s.app(c, bea, 'initiative', 'd20')).toMatchObject({ encounter_id: null })
      expect(await s.app(c, bea, 'initiative', 'd20')).toMatchObject({ encounter_id: null })
      // A DM roll without a character: unlinked.
      await asUser(dm)
      expect(await s.app(c, null, 'initiative', 'd20')).toMatchObject({ encounter_id: null })
      await s.end(c, dm, e)
      // A rest past its ten minutes is not open: unlinked.
      const r = await s.rest(c, dm)
      await asSystem()
      await db.query(
        `update ${schema}.rest_requests set expires_at = now() - interval '1 second' where id=$1`,
        [r],
      )
      await asUser(player)
      expect(await s.app(c, arin, 'hit_die', '1d10')).toMatchObject({ rest_id: null })
      expect(await s.app(c, arin, 'hit_die', '1d10')).toMatchObject({ rest_id: null })
      // The check keeps context on server rolls of the matching kind only.
      await asSystem()
      await expect(
        db.query(
          `insert into ${schema}.campaign_rolls(id, campaign_id, character_id, roller_id, expression, dice, total,
             kind, source, visibility, encounter_id) values ($1,$2,$3,$4,'d20','{10}',10,'initiative','recorded','roller_dm',$5)`,
          [randomUUID(), c, arin, player, e],
        ),
      ).rejects.toThrow(/campaign_rolls_context_check/)
      await expect(
        db.query(
          `insert into ${schema}.campaign_rolls(id, campaign_id, character_id, roller_id, expression, dice, total,
             kind, source, visibility, rest_id) values ($1,$2,$3,$4,'d20','{10}',10,'attack','app','roller_dm',$5)`,
          [randomUUID(), c, arin, player, r],
        ),
      ).rejects.toThrow(/campaign_rolls_context_check/)
    },
  )

  it.each(schemas)('%s: a busy fight cannot push the roll in force out', async (schema) => {
    const { s, c, dm, player, arin } = await table(schema)
    const q = priv(schema)
    await asSystem()
    const cap = await scalar<number>(
      `select max_count result from ${q}.quota_limits where quota = 'rolls_per_campaign'`,
    )
    await db.query(`update ${q}.quota_limits set max_count = 3 where quota = 'rolls_per_campaign'`)
    try {
      const e = await s.fight(c, dm, [arin])
      await asUser(player)
      const first = await s.app(c, arin, 'initiative', 'd20+2')
      for (let i = 0; i < 5; i++) await s.app(c, arin, 'attack', 'd20+5')
      const kept = await s.stored(c)
      expect(kept.map((r) => r.id)).toContain(first.id)
      expect(kept.length).toBe(4)
      await asUser(player)
      await expect(s.app(c, arin, 'initiative', 'd20+2')).rejects.toThrow(/Already rolled/)
      // The nightly prune keeps it too while the fight is live.
      await asSystem()
      await db.query(`select ${q}.prune_stale_rows()`)
      expect((await s.stored(c)).map((r) => r.id)).toContain(first.id)
      // Once the fight is over it is an ordinary roll again.
      await s.end(c, dm, e)
      await asUser(player)
      await s.app(c, arin, 'attack', 'd20+5')
      expect((await s.stored(c)).map((r) => r.id)).not.toContain(first.id)
    } finally {
      await asSystem()
      await db.query(
        `update ${q}.quota_limits set max_count = $1 where quota = 'rolls_per_campaign'`,
        [cap],
      )
    }
  })

  it.each(schemas)('%s: links never cross campaigns', async (schema) => {
    const { s, c, other, dm, player, otherDm, arin } = await table(schema)
    const e = await s.fight(c, dm, [arin])
    const r = await s.rest(c, dm)
    await asUser(otherDm)
    const otherChar = await scalar(`select ${schema}.create_character($1,'Stray') result`, [other])
    await asSystem()
    for (const [column, target] of [
      ['encounter_id', e],
      ['rest_id', r],
    ] as const) {
      await expect(
        db.query(
          `insert into ${schema}.campaign_rolls(id, campaign_id, character_id, roller_id, expression, dice, total,
             kind, source, visibility, ${column})
           values ($1,$2,$3,$4,'d20','{10}',10,$5,'app','roller_dm',$6)`,
          [
            randomUUID(),
            other,
            otherChar,
            player,
            column === 'encounter_id' ? 'initiative' : 'hit_die',
            target,
          ],
        ),
      ).rejects.toThrow(/foreign key|violates/)
    }
  })
})

describe('reading the one-roll state', () => {
  it.each(schemas)('%s: the owner reads the roll; others per the visibility', async (schema) => {
    const { s, c, dm, player, peer, outsider, otherDm, arin, bea } = await table(schema)
    const e = await s.fight(c, dm, [arin, bea])
    await asUser(player)
    const mine = await s.app(c, arin, 'initiative', 'd20+2')
    await asUser(player)
    let context = await s.context(c)
    expect(context).toMatchObject({ encounter_id: e, rest_id: null })
    expect(context.spent).toEqual([{ character_id: arin, kind: 'initiative' }])
    expect(context.rolls.map((r) => r.id)).toEqual([mine.id])
    expect(context.rolls[0]).toMatchObject({ total: mine.total, encounter_id: e })
    // roller_dm: the teammate reads neither the roll nor the spent slot of another's character.
    await asUser(peer)
    context = await s.context(c)
    expect(context).toMatchObject({ encounter_id: e, spent: [], rolls: [] })
    await asUser(dm)
    context = await s.context(c)
    expect(context.spent).toEqual([{ character_id: arin, kind: 'initiative' }])
    expect(context.rolls.map((r) => r.id)).toEqual([mine.id])
    // The read matches the roll log under RLS for every member.
    for (const who of [player, peer, dm]) {
      await asUser(who)
      const viaLog = await rows<{ id: string }>(
        `select id from ${schema}.campaign_rolls where campaign_id=$1 and encounter_id=$2 and superseded_at is null`,
        [c, e],
      )
      await asUser(who)
      expect((await s.context(c)).rolls.map((r) => r.id)).toEqual(viaLog.map((r) => r.id))
    }
    // Narrowed to roller: the DM no longer reads the roll, still sees that the slot is used.
    await asUser(dm)
    await s.dice(c, 'app', 'roller')
    await asUser(dm)
    context = await s.context(c)
    expect(context.rolls).toEqual([])
    expect(context.spent).toEqual([{ character_id: arin, kind: 'initiative' }])
    await asUser(player)
    expect((await s.context(c)).rolls.map((r) => r.id)).toEqual([mine.id])
    // Table visibility from the start: the teammate reads the roll, not a spent slot (not theirs).
    await asUser(dm)
    await s.dice(c, 'app', 'table')
    await asUser(peer)
    const hers = await s.app(c, bea, 'initiative', 'd20')
    await asUser(player)
    context = await s.context(c)
    expect(context.rolls.map((r) => r.id)).toEqual([mine.id, hers.id])
    expect(context.spent).toEqual([{ character_id: arin, kind: 'initiative' }])
    // The open rest appears with its hit-dice rolls.
    await s.end(c, dm, e)
    const r = await s.rest(c, dm)
    await asUser(player)
    const dice = await s.app(c, arin, 'hit_die', '1d10')
    await asUser(player)
    expect(await s.context(c)).toMatchObject({
      encounter_id: null,
      rest_id: r,
      spent: [{ character_id: arin, kind: 'hit_die' }],
      rolls: [{ id: dice.id }],
    })
    // Denials.
    await asAnon()
    await expect(s.context(c)).rejects.toThrow(/permission denied/)
    for (const who of [outsider, otherDm]) {
      await asUser(who)
      await expect(s.context(c)).rejects.toThrow(/Forbidden/)
    }
  })

  it.each(schemas)('%s: nothing in force without a fight or a rest', async (schema) => {
    const { s, c, player, arin } = await table(schema)
    await asUser(player)
    await s.app(c, arin, 'initiative', 'd20+2')
    await asUser(player)
    expect(await s.context(c)).toEqual({ encounter_id: null, rest_id: null, spent: [], rolls: [] })
  })
})

describe('the DM clears or re-rolls an initiative', () => {
  it.each(schemas)(
    '%s: clear keeps the roll in the log, superseded, and the Player rolls once again',
    async (schema) => {
      const { s, c, dm, player, arin } = await table(schema)
      const e = await s.fight(c, dm, [arin])
      await asUser(player)
      const first = await s.app(c, arin, 'initiative', 'd20+2')
      const combatant = await s.combatant(e, arin)
      await asUser(player)
      await db.query(`select ${schema}.set_initiative($1,$2,$3,2,$4)`, [
        c,
        combatant.id,
        first.total,
        randomUUID(),
      ])
      const signal = await s.signal(c)
      await asUser(dm)
      const result = await s.reset(c, arin, null)
      expect(result).toMatchObject({ encounter_id: e, superseded_roll: first.id, roll: null })
      expect((await s.combatant(e, arin)).initiative).toBeNull()
      expect(await s.signal(c)).toBe(signal + 1)
      const log = await s.stored(c)
      expect(log).toHaveLength(1)
      expect(log[0]).toMatchObject({ id: first.id, encounter_id: e, total: first.total })
      expect(log[0]!.superseded_at).not.toBeNull()
      await asUser(player)
      expect(await s.context(c)).toMatchObject({ spent: [], rolls: [] })
      // The superseded roll stays readable in the log by its owner.
      await asUser(player)
      expect(
        await rows(
          `select id from ${schema}.campaign_rolls where id=$1 and superseded_at is not null`,
          [first.id],
        ),
      ).toEqual([{ id: first.id }])
      // One new roll, then the rule applies again.
      await asUser(player)
      const second = await s.app(c, arin, 'initiative', 'd20+2')
      expect(second).toMatchObject({ encounter_id: e, superseded_at: null })
      await asUser(player)
      await expect(s.app(c, arin, 'initiative', 'd20+2')).rejects.toThrow(/Already rolled/)
      await asUser(player)
      await db.query(`select ${schema}.set_initiative($1,$2,$3,2,$4)`, [
        c,
        combatant.id,
        second.total,
        randomUUID(),
      ])
      // Audited like the other DM combat actions.
      await asUser(dm)
      const events = await rows<{
        actor_id: string
        amount: number | null
        detail: Json
        visible: boolean
      }>(
        `select actor_id, amount, detail, visible from ${schema}.encounter_events
          where encounter_id=$1 and kind='initiative' and detail ? 'reset'`,
        [e],
      )
      expect(events).toEqual([
        {
          actor_id: dm,
          amount: null,
          detail: { reset: 'clear', superseded_roll: first.id },
          visible: true,
        },
      ])
    },
  )

  it.each(schemas)('%s: re-roll: the server rolls as the DM and sets the total', async (schema) => {
    const { s, c, dm, player, arin } = await table(schema)
    const e = await s.fight(c, dm, [arin])
    await asUser(player)
    const first = await s.app(c, arin, 'initiative', 'd20+2')
    await asUser(dm)
    await expect(s.reset(c, arin, '2d6')).rejects.toThrow(/Invalid roll/)
    await expect(s.reset(c, arin, 'd20+999')).rejects.toThrow(/Invalid roll/)
    expect((await s.stored(c))[0]!.superseded_at).toBeNull()
    await asUser(dm)
    const result = await s.reset(c, arin, 'd20+2')
    expect(result.superseded_roll).toBe(first.id)
    expect(result.roll).toMatchObject({
      roller_id: dm,
      character_id: arin,
      kind: 'initiative',
      source: 'app',
      encounter_id: e,
      superseded_at: null,
    })
    const total = result.roll!.total
    expect(total).toBeGreaterThanOrEqual(3)
    expect(total).toBeLessThanOrEqual(22)
    expect(total).toBe(result.roll!.dice[0]! + 2)
    expect((await s.combatant(e, arin)).initiative).toBe(total)
    // The DM's roll holds the slot: the Player cannot roll over it.
    await asUser(player)
    await expect(s.app(c, arin, 'initiative', 'd20+2')).rejects.toThrow(/Already rolled/)
    await asUser(dm)
    expect(
      await rows(
        `select amount, detail from ${schema}.encounter_events where encounter_id=$1 and detail ? 'reset'`,
        [e],
      ),
    ).toEqual([{ amount: total, detail: { reset: 'reroll', superseded_roll: first.id } }])
    // With nothing to supersede the re-roll still works (the Player had not rolled).
    await asUser(dm)
    const again = await s.reset(c, arin, 'd20')
    expect(again.superseded_roll).toBe(result.roll!.id)
  })

  it.each(schemas)('%s: idempotent by request id', async (schema) => {
    const { s, c, dm, player, arin } = await table(schema)
    const e = await s.fight(c, dm, [arin])
    await asUser(player)
    const first = await s.app(c, arin, 'initiative', 'd20+2')
    const id = randomUUID()
    await asUser(dm)
    const once = await s.reset(c, arin, 'd20+1', id)
    await asUser(dm)
    const twice = await s.reset(c, arin, 'd20+1', id)
    expect(twice).toEqual(once)
    expect(once.superseded_roll).toBe(first.id)
    // No second supersede, roll or event.
    const log = await s.stored(c)
    expect(log).toHaveLength(2)
    expect(log.filter((r) => r.superseded_at === null).map((r) => r.id)).toEqual([once.roll!.id])
    await asUser(dm)
    expect(
      await scalar<number>(
        `select count(*)::int result from ${schema}.encounter_events where encounter_id=$1 and detail ? 'reset'`,
        [e],
      ),
    ).toBe(1)
    await asUser(dm)
    await expect(s.reset(c, arin, null, id)).rejects.toThrow(/Request mismatch/)
  })

  it.each(schemas)('%s: only the campaign DM, only in the live encounter', async (schema) => {
    const { s, c, other, dm, player, peer, outsider, otherDm, arin, bea } = await table(schema)
    await asUser(dm)
    await expect(s.reset(c, arin, null)).rejects.toThrow(/Encounter closed/)
    const e = await s.fight(c, dm, [arin])
    await asUser(player)
    const first = await s.app(c, arin, 'initiative', 'd20+2')
    await asAnon()
    await expect(s.reset(c, arin, null)).rejects.toThrow(/permission denied/)
    for (const who of [outsider, otherDm, player, peer]) {
      await asUser(who)
      await expect(s.reset(c, arin, 'd20')).rejects.toThrow(/Forbidden/)
    }
    // A DM of another campaign through their own campaign id reaches nothing here.
    await asUser(otherDm)
    await expect(s.reset(other, arin, null)).rejects.toThrow(
      /Encounter closed|Combatant unavailable/,
    )
    // Bea is not in the fight.
    await asUser(dm)
    await expect(s.reset(c, bea, null)).rejects.toThrow(/Combatant unavailable/)
    const log = await s.stored(c)
    expect(log).toHaveLength(1)
    expect(log[0]).toMatchObject({ id: first.id, superseded_at: null })
    expect((await s.combatant(e, arin)).initiative).toBeNull()
  })
})

describe('who may roll', () => {
  it.each(schemas)('%s: denials on log_roll are unchanged', async (schema) => {
    const { s, c, dm, player, peer, outsider, otherDm, arin } = await table(schema)
    await s.fight(c, dm, [arin])
    await asAnon()
    await expect(s.app(c, arin, 'initiative', 'd20')).rejects.toThrow(/permission denied/)
    for (const who of [outsider, otherDm]) {
      await asUser(who)
      await expect(s.app(c, arin, 'initiative', 'd20')).rejects.toThrow(/Forbidden/)
    }
    await asUser(peer)
    await expect(s.app(c, arin, 'initiative', 'd20')).rejects.toThrow(/Character unavailable/)
    expect(await s.stored(c)).toEqual([])
    // The refused attempts did not spend the slot.
    await asUser(player)
    expect(await s.app(c, arin, 'initiative', 'd20')).toMatchObject({ roller_id: player })
  })

  it.each(schemas)('%s: the call of the frontend in production keeps working', async (schema) => {
    const { s, c, dm, player, arin } = await table(schema)
    await s.fight(c, dm, [arin])
    await asUser(player)
    // Named arguments, as PostgREST sends the current frontend's call.
    const roll = await scalar<Json>(
      `select ${schema}.log_roll(target_campaign => $1, target_character => $2, roll_label => 'initiative',
         roll_expression => 'd20+2', roll_kind => 'initiative', roll_source => 'app', recorded_dice => null,
         recorded_total => null, request_id => $3) result`,
      [c, arin, randomUUID()],
    )
    for (const key of [
      'id',
      'campaign_id',
      'character_id',
      'roller_id',
      'label',
      'expression',
      'dice',
      'total',
      'kind',
      'source',
      'visibility',
      'created_at',
    ])
      expect(roll, key).toHaveProperty(key)
    // Its roll-log read selects the old columns explicitly.
    await asUser(player)
    expect(
      await rows(
        `select id, campaign_id, character_id, roller_id, label, expression, dice, total, kind, source, visibility, created_at
           from ${schema}.campaign_rolls where campaign_id=$1 order by created_at desc, id desc limit 50`,
        [c],
      ),
    ).toHaveLength(1)
    // A second attempt is refused with a message its error map does not know: the generic failure.
    await asUser(player)
    await expect(
      scalar(
        `select ${schema}.log_roll(target_campaign => $1, target_character => $2, roll_label => 'initiative',
           roll_expression => 'd20+2', roll_kind => 'initiative', roll_source => 'app', recorded_dice => null,
           recorded_total => null, request_id => $3) result`,
        [c, arin, randomUUID()],
      ),
    ).rejects.toThrow(/^Already rolled$/)
    // One function of each name: nothing for PostgREST to choose between.
    await asSystem()
    for (const name of ['log_roll', 'get_roll_context', 'reset_initiative_roll'])
      expect(
        await scalar<number>(
          `select count(*)::int result from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where n.nspname = $1 and p.proname = $2`,
          [schema, name],
        ),
      ).toBe(1)
  })
})

describe('saved totals come from the server roll', () => {
  const setInitiative = (schema: Schema, c: string, combatant: string, total: number) =>
    // Named arguments, as the combat repository of the frontend in production calls it.
    scalar<Json>(
      `select ${schema}.set_initiative(target_campaign => $1, target_combatant => $2,
         initiative_total => $3, tiebreak_bonus => 2, request_id => $4) result`,
      [c, combatant, total, randomUUID()],
    )
  const vote = (
    schema: Schema,
    c: string,
    r: string,
    ch: string,
    value: string,
    spent: number | null,
    roll: number | null,
  ) =>
    // Named arguments, as the rest repository of the frontend in production calls it.
    scalar<Json>(
      `select ${schema}.vote_rest(target_campaign => $1, target_request => $2, target_character => $3,
         vote_value => $4, spent => $5, roll => $6) result`,
      [c, r, ch, value, spent, roll],
    )
  const votes = async (schema: Schema, r: string) => {
    await asSystem()
    return rows<{
      character_id: string
      vote: string
      dice_spent: number
      dice_roll: number | null
    }>(
      `select character_id, vote, dice_spent, dice_roll from ${priv(schema)}.rest_votes where request_id=$1`,
      [r],
    )
  }
  const initiativeEvents = async (schema: Schema, e: string) => {
    await asSystem()
    return scalar<number>(
      `select count(*)::int result from ${schema}.encounter_events where encounter_id=$1 and kind='initiative'`,
      [e],
    )
  }
  const other = (total: number) => (total < 99 ? total + 1 : total - 1)

  it.each(schemas)(
    '%s: initiative: only the total of the roll in force, and nothing written otherwise',
    async (schema) => {
      const { s, c, dm, player, arin } = await table(schema)
      const e = await s.fight(c, dm, [arin])
      const { id: combatant } = await s.combatant(e, arin)
      // No roll yet.
      await asUser(player)
      expect(await codeOf(setInitiative(schema, c, combatant, 14))).toEqual({
        code: 'P0001',
        message: 'Roll required',
      })
      expect((await s.combatant(e, arin)).initiative).toBeNull()
      expect(await initiativeEvents(schema, e)).toBe(0)
      // The roll as the frontend makes it: d20 plus the bonus; its total includes the bonus.
      await asUser(player)
      const roll = await s.app(c, arin, 'initiative', 'd20+2')
      expect(roll.total).toBe(roll.dice[0]! + 2)
      await asUser(player)
      await expect(setInitiative(schema, c, combatant, other(roll.total))).rejects.toThrow(
        /Roll required/,
      )
      expect((await s.combatant(e, arin)).initiative).toBeNull()
      expect(await initiativeEvents(schema, e)).toBe(0)
      await asUser(player)
      expect(await setInitiative(schema, c, combatant, roll.total)).toMatchObject({
        encounter_id: e,
      })
      expect((await s.combatant(e, arin)).initiative).toBe(roll.total)
      // A reopened entry saving the same total again is accepted.
      await asUser(player)
      await setInitiative(schema, c, combatant, roll.total)
      // A superseded roll no longer counts.
      await asUser(dm)
      await s.reset(c, arin, null)
      await asUser(player)
      await expect(setInitiative(schema, c, combatant, roll.total)).rejects.toThrow(/Roll required/)
      expect((await s.combatant(e, arin)).initiative).toBeNull()
      // The DM is never restricted, and a Player may keep the total the DM set.
      await asUser(dm)
      await setInitiative(schema, c, combatant, 7)
      expect((await s.combatant(e, arin)).initiative).toBe(7)
      await asUser(player)
      await setInitiative(schema, c, combatant, 7)
      await asUser(player)
      await expect(setInitiative(schema, c, combatant, 8)).rejects.toThrow(/Roll required/)
      expect((await s.combatant(e, arin)).initiative).toBe(7)
    },
  )

  it.each(schemas)('%s: initiative: an unlinked roll does not count', async (schema) => {
    const { s, c, dm, player, arin } = await table(schema)
    // Rolled before the character was in the fight: unlinked.
    await asUser(player)
    const early = await s.app(c, arin, 'initiative', 'd20+2')
    expect(early.encounter_id).toBeNull()
    const e = await s.fight(c, dm, [arin])
    const { id: combatant } = await s.combatant(e, arin)
    await asUser(player)
    await expect(setInitiative(schema, c, combatant, early.total)).rejects.toThrow(/Roll required/)
    // A recorded roll does not count in app mode either.
    await asUser(player)
    const typed = await s.recorded(c, arin, 'initiative', 15)
    await asUser(player)
    await expect(setInitiative(schema, c, combatant, typed.total)).rejects.toThrow(/Roll required/)
  })

  it.each(['physical', 'player'])(
    'public and pre: initiative in %s mode is unchanged',
    async (mode) => {
      for (const schema of schemas) {
        const { s, c, dm, player, arin } = await table(schema)
        await asUser(dm)
        await s.dice(c, mode, 'roller_dm')
        const e = await s.fight(c, dm, [arin])
        const { id: combatant } = await s.combatant(e, arin)
        await asUser(player)
        await setInitiative(schema, c, combatant, 17)
        expect((await s.combatant(e, arin)).initiative).toBe(17)
      }
    },
  )

  it.each(schemas)(
    '%s: hit dice: the vote carries the count and sum of the roll of this rest',
    async (schema) => {
      const { s, c, dm, player, arin } = await table(schema)
      let r = await s.rest(c, dm)
      // No roll yet.
      await asUser(player)
      expect(await codeOf(vote(schema, c, r, arin, 'yes', 1, 5))).toEqual({
        code: 'P0001',
        message: 'Roll required',
      })
      expect(await votes(schema, r)).toEqual([])
      // The roll as the frontend makes it: N d die plus N times the Constitution modifier.
      await asUser(player)
      const roll = await s.app(c, arin, 'hit_die', '2d10+2')
      const sum = roll.dice.reduce((a, b) => a + b, 0)
      // Another sum, another count: refused, nothing stored.
      await asUser(player)
      await expect(vote(schema, c, r, arin, 'yes', 2, sum === 2 ? 3 : sum - 1)).rejects.toThrow(
        /Roll required/,
      )
      await asUser(player)
      await expect(vote(schema, c, r, arin, 'yes', 1, Math.min(sum, 10))).rejects.toThrow(
        /Roll required/,
      )
      expect(await votes(schema, r)).toEqual([])
      // The sum of the dice (without the Constitution bonus) and their number: accepted.
      await asUser(player)
      await vote(schema, c, r, arin, 'yes', 2, sum)
      expect(await votes(schema, r)).toEqual([
        { character_id: arin, vote: 'yes', dice_spent: 2, dice_roll: sum },
      ])
      // Zero dice and a "no" need no roll (the "no" rejects the rest: unanimity).
      await asUser(player)
      await vote(schema, c, r, arin, 'yes', 0, null)
      await asUser(player)
      await vote(schema, c, r, arin, 'no', null, null)
      expect(await votes(schema, r)).toMatchObject([{ vote: 'no', dice_spent: 0 }])
      // A roll of another rest does not count.
      r = await s.rest(c, dm)
      await asUser(player)
      await expect(vote(schema, c, r, arin, 'yes', 2, sum)).rejects.toThrow(/Roll required/)
      // Nor a roll of another die than the sheet's (a d10).
      await asUser(player)
      const d6 = await s.app(c, arin, 'hit_die', '2d6')
      await asUser(player)
      await expect(
        vote(
          schema,
          c,
          r,
          arin,
          'yes',
          2,
          d6.dice.reduce((a, b) => a + b, 0),
        ),
      ).rejects.toThrow(/Roll required/)
      expect(await votes(schema, r)).toEqual([])
      await s.cancelRest(c, dm, r)
      // One die: the frontend writes 1d10; d10 is accepted as well.
      r = await s.rest(c, dm)
      await asUser(player)
      const one = await s.app(c, arin, 'hit_die', '1d10')
      await asUser(player)
      await vote(schema, c, r, arin, 'yes', 1, one.dice[0]!)
      expect(await votes(schema, r)).toMatchObject([{ dice_spent: 1, dice_roll: one.dice[0] }])
      await s.cancelRest(c, dm, r)
      // A long rest needs no dice.
      await asUser(dm)
      const long = (
        await scalar<{ id: string }>(`select ${schema}.request_rest($1,'long',$2) result`, [
          c,
          randomUUID(),
        ])
      ).id
      await asUser(player)
      await vote(schema, c, long, arin, 'yes', null, null)
      expect((await votes(schema, long)).find((v) => v.character_id === arin)).toMatchObject({
        vote: 'yes',
        dice_spent: 0,
      })
    },
  )

  it.each(schemas)('%s: hit dice: the DM and the other modes are unrestricted', async (schema) => {
    const { s, c, dm, player, arin } = await table(schema)
    // The DM votes for an unassigned character with any valid dice.
    await asUser(dm)
    const npc = await scalar(`select ${schema}.create_character($1,'Guide') result`, [c])
    await db.query(`select ${schema}.save_character_sheet($1,$2,0,3,30,14,$3,true,$4)`, [
      c,
      npc,
      JSON.stringify(build),
      randomUUID(),
    ])
    let r = await s.rest(c, dm)
    await asUser(dm)
    await vote(schema, c, r, npc, 'yes', 2, 9)
    expect((await votes(schema, r)).find((v) => v.character_id === npc)).toMatchObject({
      dice_spent: 2,
      dice_roll: 9,
    })
    await s.cancelRest(c, dm, r)
    for (const mode of ['physical', 'player']) {
      await asUser(dm)
      await s.dice(c, mode, 'roller_dm')
      r = await s.rest(c, dm)
      await asUser(player)
      await vote(schema, c, r, arin, 'yes', 2, 11)
      expect((await votes(schema, r)).find((v) => v.character_id === arin)).toMatchObject({
        dice_spent: 2,
        dice_roll: 11,
      })
      await s.cancelRest(c, dm, r)
    }
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
         and p.proname in ('log_roll', 'get_roll_context', 'reset_initiative_roll', 'prune_stale_rows',
           'set_initiative', 'vote_rest')
       order by 1`,
    )
    expect(fns.map((f) => f.fn)).toEqual([
      'pre.get_roll_context',
      'pre.log_roll',
      'pre.reset_initiative_roll',
      'pre.set_initiative',
      'pre.vote_rest',
      'pre_private.prune_stale_rows',
      'private.prune_stale_rows',
      'public.get_roll_context',
      'public.log_roll',
      'public.reset_initiative_roll',
      'public.set_initiative',
      'public.vote_rest',
    ])
    for (const f of fns) {
      const helper = f.fn.endsWith('prune_stale_rows')
      expect(f.proconfig, f.fn).toEqual(['search_path=""'])
      expect(f.prosecdef, f.fn).toBe(true)
      expect(f.anon, f.fn).toBe(false)
      expect(f.pub, f.fn).toBe(false)
      expect(f.auth, f.fn).toBe(!helper)
      expect(f.provolatile, f.fn).toBe(f.fn.endsWith('get_roll_context') ? 's' : 'v')
      if (f.fn.startsWith('pre')) expect(f.prosrc, f.fn).not.toMatch(/\bpublic\.|\bprivate\./)
      expect(f.prosrc, f.fn).toMatch(/superseded_at/)
    }
    // Columns, keys, checks and indexes exist in both environments.
    expect(
      await rows(
        `select table_schema, count(*)::int n from information_schema.columns
          where table_name = 'campaign_rolls' and column_name in ('encounter_id', 'rest_id', 'superseded_at')
          group by 1 order by 1`,
      ),
    ).toEqual([
      { table_schema: 'pre', n: 3 },
      { table_schema: 'public', n: 3 },
    ])
    const constraints = await rows<{ nspname: string; conname: string; def: string }>(
      `select n.nspname, k.conname, pg_get_constraintdef(k.oid) def from pg_constraint k
         join pg_class t on t.oid = k.conrelid join pg_namespace n on n.oid = t.relnamespace
        where k.conname in ('campaign_rolls_encounter_fkey', 'campaign_rolls_rest_fkey', 'campaign_rolls_context_check')
        order by 1, 2`,
    )
    expect(constraints.map((k) => `${k.nspname}.${k.conname}`)).toEqual([
      'pre.campaign_rolls_context_check',
      'pre.campaign_rolls_encounter_fkey',
      'pre.campaign_rolls_rest_fkey',
      'public.campaign_rolls_context_check',
      'public.campaign_rolls_encounter_fkey',
      'public.campaign_rolls_rest_fkey',
    ])
    for (const k of constraints.filter((x) => x.nspname === 'pre'))
      expect(k.def).not.toMatch(/\bpublic\./)
    const indexes = await rows<{ schemaname: string; indexname: string; indexdef: string }>(
      `select schemaname, indexname, indexdef from pg_indexes
        where indexname in ('campaign_rolls_one_initiative', 'campaign_rolls_one_hit_die',
          'campaign_rolls_encounter_id_fk', 'campaign_rolls_rest_id_fk', 'rest_requests_campaign_id_id')
        order by 1, 2`,
    )
    expect(indexes).toHaveLength(10)
    for (const i of indexes.filter((x) => x.indexname.startsWith('campaign_rolls_one')))
      expect(i.indexdef).toMatch(/UNIQUE INDEX .* WHERE .*superseded_at IS NULL/)
  })

  it('names what is missing when it cannot update PRE', async () => {
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
      // PostgreSQL's own "does not exist, skipping" notices of the guarded drops aside, one notice.
      const own = notices.filter((n) => n.startsWith('20261204120000'))
      expect(own).toHaveLength(1)
      expect(
        notices.filter((n) => !n.startsWith('20261204120000')).every((n) => /skipping/.test(n)),
      ).toBe(true)
      notices.splice(0, notices.length, ...own)
      expect(notices[0]).toMatch(/^20261204120000: PRE not updated, missing /)
      expect(notices[0]).toContain('pre.campaign_rolls')
      expect(notices[0]).toContain('pre_private.combat_log(')
      expect(notices[0]).not.toContain('pre_admin.remap(text)')
      // Re-running it changes nothing and still applies.
      await bare.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'))
      const cols = await bare.query(
        `select table_schema from information_schema.columns
          where table_name = 'campaign_rolls' and column_name = 'encounter_id'`,
      )
      expect(cols.rows).toEqual([{ table_schema: 'public' }])
    } finally {
      await bare.close()
    }
  }, 120000)

  it('keeps the migration file printable ASCII with no escapes', () => {
    // The transport to the hosted database decodes backslash-u escapes, and invisible characters
    // cannot be reviewed. A Windows checkout may turn LF into CRLF; git stores and ships LF.
    const bs = String.fromCharCode(92)
    const text = readFileSync(`supabase/migrations/${migration}`, 'utf8').replaceAll('\r\n', '\n')
    const outside = [...text]
      .map((ch, index) => ({ index, cp: ch.codePointAt(0)! }))
      .filter(({ cp }) => cp !== 0x0a && (cp < 0x20 || cp > 0x7e))
      .map(({ index, cp }) => `U+${cp.toString(16).padStart(4, '0')} at ${index}`)
    expect(outside).toEqual([])
    expect(text.includes(bs + 'u')).toBe(false)
    expect(text.includes(bs)).toBe(false)
  })

  it('re-runs cleanly on a database that already has it', async () => {
    await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'))
    const { s, c, dm, player, arin } = await table('pre')
    await s.fight(c, dm, [arin])
    await asUser(player)
    await s.app(c, arin, 'initiative', 'd20')
    await asUser(player)
    await expect(s.app(c, arin, 'initiative', 'd20')).rejects.toThrow(/Already rolled/)
  })

  it('keeps PRE writes in PRE', async () => {
    const { s, c, dm, player, arin } = await table('pre')
    const e = await s.fight(c, dm, [arin])
    await asUser(player)
    const roll = await s.app(c, arin, 'initiative', 'd20')
    const id = randomUUID()
    await asUser(dm)
    await s.reset(c, arin, 'd20', id)
    await asSystem()
    expect(await rows(`select 1 from public.campaign_rolls where id=$1`, [roll.id])).toEqual([])
    expect(await rows(`select 1 from public.encounters where id=$1`, [e])).toEqual([])
    expect(await rows(`select 1 from private.combat_requests where request_id=$1`, [id])).toEqual(
      [],
    )
    expect(
      await rows(`select 1 from pre_private.combat_requests where request_id=$1`, [id]),
    ).toHaveLength(1)
    expect(
      await scalar<number>(
        `select count(*)::int result from pre.campaign_rolls where campaign_id=$1`,
        [c],
      ),
    ).toBe(2)
  })
})
