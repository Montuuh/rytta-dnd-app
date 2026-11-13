import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-096: a Player claims a free character the DM prepared. RYT-097: the party overview returns
// teammates the DM does not share live without their live fields.
const migration = '20261117120000_party_claim_characters.sql'
const db = new PGlite()
const dm = randomUUID(),
  player = randomUUID(),
  peer = randomUUID(),
  newcomer = randomUUID(),
  former = randomUUID(),
  outsider = randomUUID(),
  otherDm = randomUUID(),
  otherPlayer = randomUUID()
const asUser = async (id: string) => {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
}
const asAnon = async () => {
  await db.exec('reset role; set role anon')
  await db.query("select set_config('request.jwt.claim.sub', '', false)")
}
const asSystem = () => db.exec('reset role')

type Schema = 'public' | 'pre'
type Overview = {
  id: string
  name: string
  is_own: boolean
  is_assigned: boolean
  shares_live: boolean
  sheet_status: string | null
  class_key: string | null
  class_label: string | null
  level: number | null
  current_hp: number | null
  max_hp: number | null
  temp_hp: number | null
  armor_class: number | null
  exhaustion: number | null
  conditions: string[] | null
}
type Claimable = {
  id: string
  name: string
  sheet_status: string | null
  class_key: string | null
  class_label: string | null
  level: number | null
  portrait_path: string | null
}
const overviewColumns = [
  'id',
  'name',
  'is_own',
  'is_assigned',
  'shares_live',
  'sheet_status',
  'class_key',
  'class_label',
  'level',
  'current_hp',
  'max_hp',
  'temp_hp',
  'armor_class',
  'exhaustion',
  'conditions',
].sort()
const claimableColumns = [
  'id',
  'name',
  'sheet_status',
  'class_key',
  'class_label',
  'level',
  'portrait_path',
].sort()

function api(schema: Schema = 'public') {
  const scalar = async <T = string>(sql: string, args: unknown[] = []) =>
    (await db.query<{ result: T }>(sql, args)).rows[0]!.result
  return {
    scalar,
    campaign: (name: string) => scalar(`select ${schema}.create_campaign($1) result`, [name]),
    dmCreate: (c: string, name: string) =>
      scalar(`select ${schema}.create_character($1,$2) result`, [c, name]),
    create: (c: string, name: string) =>
      scalar(`select ${schema}.create_own_character($1,$2,$3) result`, [c, name, randomUUID()]),
    inviteCharacter: (c: string, ch: string, email: string) =>
      scalar(`select ${schema}.invite_character_player($1,$2,$3) result`, [c, ch, email]),
    inviteMember: (c: string, email: string) =>
      scalar(`select ${schema}.invite_campaign_member($1,$2) result`, [c, email]),
    accept: (id: string) => db.query(`select ${schema}.respond_campaign_invitation($1,true)`, [id]),
    remove: (c: string, user: string) =>
      db.query(`select ${schema}.change_campaign_member($1,$2,null)`, [c, user]),
    assign: (c: string, ch: string, user: string) =>
      db.query(`select ${schema}.assign_character($1,$2,$3)`, [c, ch, user]),
    unassign: (c: string, ch: string, user: string) =>
      db.query(`select ${schema}.unassign_character($1,$2,$3)`, [c, ch, user]),
    archive: (c: string, ch: string) =>
      db.query(`select ${schema}.archive_character($1,$2)`, [c, ch]),
    absent: (c: string, ch: string, on: boolean) =>
      db.query(`select ${schema}.set_character_absent($1,$2,$3)`, [c, ch, on]),
    share: (c: string, ch: string, on: boolean) =>
      db.query(`select ${schema}.set_character_live_sharing($1,$2,$3)`, [c, ch, on]),
    sheet: (c: string, ch: string, level: number, maxHp: number, ac: number, build: object) =>
      db.query(`select ${schema}.save_character_sheet($1,$2,0,$3,$4,$5,$6,true,$7)`, [
        c,
        ch,
        level,
        maxHp,
        ac,
        JSON.stringify(build),
        randomUUID(),
      ]),
    portrait: (c: string, ch: string, path: string) =>
      db.query(`select ${schema}.set_character_portrait($1,$2,$3)`, [c, ch, path]),
    overview: async (c: string) =>
      (await db.query<Overview>(`select * from ${schema}.get_party_overview($1)`, [c])).rows,
    claimable: async (c: string) =>
      (await db.query<Claimable>(`select * from ${schema}.list_claimable_characters($1)`, [c]))
        .rows,
    claim: (c: string, ch: string) =>
      scalar(`select ${schema}.claim_character($1,$2) result`, [c, ch]),
    portraits: (c: string) =>
      scalar<{ character_id: string; portrait_path: string }[]>(
        `select ${schema}.list_character_portraits($1) result`,
        [c],
      ),
    encounter: async (c: string, name: string) =>
      (
        await scalar<{ encounter_id: string }>(
          `select ${schema}.create_encounter($1,$2,$3) result`,
          [c, name, randomUUID()],
        )
      ).encounter_id,
    fight: (c: string, e: string, characters: string[]) =>
      db.query(`select ${schema}.add_combatants($1,$2,$3,$4)`, [
        c,
        e,
        JSON.stringify(characters.map((id) => ({ kind: 'character', character_id: id }))),
        randomUUID(),
      ]),
    status: (c: string, e: string, status: string) =>
      db.query(`select ${schema}.set_encounter_status($1,$2,$3,$4)`, [c, e, status, randomUUID()]),
    /** The DM hides or shows a character's combatant. */
    hide: async (c: string, e: string, ch: string, hidden: boolean) => {
      await asSystem()
      const id = (
        await db.query<{ id: string }>(
          `select id from ${schema}.encounter_combatants where encounter_id=$1 and character_id=$2`,
          [e, ch],
        )
      ).rows[0]!.id
      await asUser(dm)
      await db.query(`select ${schema}.update_combatant($1,$2,$3,$4)`, [
        c,
        id,
        JSON.stringify({ hidden }),
        randomUUID(),
      ])
    },
    /** Owner and active flag, read without RLS. */
    character: async (ch: string) => {
      await asSystem()
      return (
        await db.query<{ user_id: string | null; is_active: boolean }>(
          `select user_id, is_active from ${schema}.characters where id=$1`,
          [ch],
        )
      ).rows[0]!
    },
  }
}
const pub = api()

const visible = async (path: string) =>
  (
    await db.query(
      "select name from storage.objects where bucket_id = 'character-portraits' and name = $1",
      [path],
    )
  ).rows.length === 1
/** Audit rows of a campaign, read without RLS. */
const auditCount = async (schema: Schema, c: string) => {
  await asSystem()
  return (
    await db.query<{ n: number }>(
      `select count(*)::int n from ${schema}.character_events where campaign_id=$1`,
      [c],
    )
  ).rows[0]!.n
}
// Characters linked and unlinked before the migration: Returned (unassigned by the DM), Left (its
// Player left), Kept (still assigned) and Fresh (never assigned).
let legacy: {
  c: string
  returned: string
  left: string
  kept: string
  fresh: string
  events: number
}

/** [function, role] pairs anon or authenticated may execute among this migration's functions. */
const executable = async (app: string, helpers: string) => {
  await asSystem()
  return (
    await db.query<{ fn: string; role: string }>(
      `select f.fn, r.role
         from (values ('anon'), ('authenticated')) r(role),
              (values ($1 || '.claim_character(uuid,uuid)'), ($1 || '.list_claimable_characters(uuid)'),
                      ($1 || '.get_party_overview(uuid)'), ($2 || '.is_campaign_player(uuid)'),
                      ($2 || '.is_free_character(uuid,uuid)'), ($2 || '.characters_mark_assigned()'),
                      ($2 || '.can_view_portrait(uuid,uuid,text)')) f(fn)
        where has_function_privilege(r.role, f.fn, 'execute')
        order by 1, 2`,
      [app, helpers],
    )
  ).rows.map((row) => [row.fn, row.role])
}
const upload = async (path: string) => {
  await asSystem()
  await db.query(
    "insert into storage.objects(bucket_id, name) values ('character-portraits', $1)",
    [path],
  )
}

/**
 * The DM's campaign: Arin (player) and Bea (peer) assigned, Ilsa and Juno free, Old free but
 * archived. The newcomer is a Player without characters; the former member was removed. Another
 * campaign has its own DM, Player and free character.
 */
async function table(schema: Schema = 'public') {
  const x = api(schema)
  await asUser(dm)
  const c = await x.campaign('Claim table')
  const arin = await x.dmCreate(c, 'Arin')
  const bea = await x.dmCreate(c, 'Bea')
  const ilsa = await x.dmCreate(c, 'Ilsa')
  const juno = await x.dmCreate(c, 'Juno')
  const old = await x.dmCreate(c, 'Old')
  for (const [user, email, character] of [
    [player, 'player@example.com', arin],
    [peer, 'peer@example.com', bea],
    [newcomer, 'newcomer@example.com', null],
    [former, 'former@example.com', null],
  ] as const) {
    await asUser(dm)
    const invitation = character
      ? await x.inviteCharacter(c, character, email)
      : await x.inviteMember(c, email)
    await asUser(user)
    await x.accept(invitation)
  }
  await asUser(dm)
  await x.remove(c, former)
  await x.archive(c, old)
  await asUser(otherDm)
  const other = await x.campaign('Other table')
  const foreign = await x.dmCreate(other, 'Foreign')
  const invitation = await x.inviteMember(other, 'otherplayer@example.com')
  await asUser(otherPlayer)
  await x.accept(invitation)
  return { c, arin, bea, ilsa, juno, old, other, foreign }
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
    [newcomer, 'newcomer@example.com'],
    [former, 'former@example.com'],
    [outsider, 'outsider@example.com'],
    [otherDm, 'otherdm@example.com'],
    [otherPlayer, 'otherplayer@example.com'],
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
  // Characters linked and unlinked before this migration exercise the backfill.
  await asUser(dm)
  const c = await pub.campaign('Legacy table')
  const returned = await pub.dmCreate(c, 'Returned')
  const left = await pub.dmCreate(c, 'Left')
  const kept = await pub.dmCreate(c, 'Kept')
  const fresh = await pub.dmCreate(c, 'Fresh')
  for (const [user, email, character] of [
    [player, 'player@example.com', returned],
    [peer, 'peer@example.com', left],
    [newcomer, 'newcomer@example.com', kept],
  ] as const) {
    await asUser(dm)
    const invitation = await pub.inviteCharacter(c, character, email)
    await asUser(user)
    await pub.accept(invitation)
  }
  await asUser(dm)
  await pub.unassign(c, returned, player)
  await asUser(peer)
  await pub.remove(c, peer)
  legacy = { c, returned, left, kept, fresh, events: await auditCount('public', c) }
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

describe('RYT-097 party overview without live state for non-shared teammates', () => {
  it('returns non-shared teammates to Players with null live fields; owner and DM keep the values', async () => {
    const s = await table()
    await asUser(dm)
    await pub.sheet(s.c, s.arin, 1, 10, 12, { classKey: 'fighter', classLabel: 'Fighter' })
    await pub.sheet(s.c, s.bea, 3, 24, 15, { classKey: 'bard', classLabel: 'Bard' })
    await db.query(`select public.set_character_vitals($1,$2,1,11,3,0,0,0,false,$3,$4,'{}',$5)`, [
      s.c,
      s.bea,
      ['poisoned'],
      [0, 0, 0, 0, 0, 0, 0, 0, 0],
      randomUUID(),
    ])
    await db.query('select public.set_character_resources($1,$2,0,500,7,9,2,$3)', [
      s.c,
      s.bea,
      randomUUID(),
    ])
    await pub.share(s.c, s.arin, false)
    await pub.share(s.c, s.bea, false)
    const hidden = {
      current_hp: null,
      max_hp: null,
      temp_hp: null,
      armor_class: null,
      exhaustion: null,
      conditions: null,
    }
    const beaLive = {
      current_hp: 11,
      max_hp: 24,
      temp_hp: 3,
      armor_class: 15,
      exhaustion: 2,
      conditions: ['poisoned'],
    }

    await asUser(player)
    const rows = await pub.overview(s.c)
    expect(rows.map((row) => row.id)).toEqual([s.arin, s.bea])
    for (const row of rows) expect(Object.keys(row).sort()).toEqual(overviewColumns)
    expect(rows[1]).toEqual({
      id: s.bea,
      name: 'Bea',
      is_own: false,
      is_assigned: true,
      shares_live: false,
      sheet_status: 'complete',
      class_key: 'bard',
      class_label: 'Bard',
      level: 3,
      ...hidden,
    })
    // The own character keeps its live values even when the DM does not share it.
    expect(rows[0]).toMatchObject({ is_own: true, shares_live: false, max_hp: 10, armor_class: 12 })

    // The owner of the non-shared teammate sees it in full, and the other Player without values.
    await asUser(peer)
    const peerRows = await pub.overview(s.c)
    expect(peerRows.find((row) => row.id === s.bea)).toMatchObject({ is_own: true, ...beaLive })
    expect(peerRows.find((row) => row.id === s.arin)).toMatchObject({ is_own: false, ...hidden })

    // The DM: every active character with values, the free ones included, never archived ones.
    await asUser(dm)
    const all = await pub.overview(s.c)
    expect(all.map((row) => row.id)).toEqual([s.arin, s.bea, s.ilsa, s.juno])
    expect(all.find((row) => row.id === s.bea)).toMatchObject(beaLive)
    expect(all.find((row) => row.id === s.ilsa)).toMatchObject({ is_assigned: false })

    // Sharing again gives Players the live values back.
    await pub.share(s.c, s.bea, true)
    await asUser(player)
    expect((await pub.overview(s.c)).find((row) => row.id === s.bea)).toMatchObject(beaLive)
  })

  it('keeps free and reserve characters out of a Player overview', async () => {
    const s = await table()
    await asUser(peer)
    const reserve = await pub.create(s.c, 'Reserve')
    for (const user of [player, newcomer]) {
      await asUser(user)
      const ids = (await pub.overview(s.c)).map((row) => row.id)
      expect(ids).toEqual([s.arin, s.bea])
      expect(ids).not.toContain(reserve)
    }
  })

  it('denies the overview to anon, outsiders, a former member and another campaign', async () => {
    const s = await table()
    await asAnon()
    await expect(pub.overview(s.c)).rejects.toThrow(/permission denied/)
    for (const user of [outsider, former, otherDm, otherPlayer]) {
      await asUser(user)
      await expect(pub.overview(s.c)).rejects.toThrow(/Forbidden/)
    }
    await asUser(player)
    await expect(pub.overview(s.other)).rejects.toThrow(/Forbidden/)
  })
})

describe('RYT-096 free character list and portraits', () => {
  it('lists free characters with sheet facts and portrait to active Players only', async () => {
    const s = await table()
    const path = `public/${s.c}/${s.ilsa}/${randomUUID()}.webp`
    await upload(path)
    await asUser(dm)
    await pub.sheet(s.c, s.ilsa, 2, 14, 12, { classKey: 'wizard', classLabel: 'Wizard' })
    await pub.portrait(s.c, s.ilsa, path)
    const expected = [
      {
        id: s.ilsa,
        name: 'Ilsa',
        sheet_status: 'complete',
        class_key: 'wizard',
        class_label: 'Wizard',
        level: 2,
        portrait_path: path,
      },
      {
        id: s.juno,
        name: 'Juno',
        sheet_status: 'draft',
        class_key: null,
        class_label: null,
        level: 1,
        portrait_path: null,
      },
    ]
    for (const user of [player, newcomer]) {
      await asUser(user)
      const rows = await pub.claimable(s.c)
      for (const row of rows) expect(Object.keys(row).sort()).toEqual(claimableColumns)
      // Assigned (Arin, Bea) and archived (Old) characters are not free.
      expect(rows).toEqual(expected)
    }
    // An absent free character is not claimable until the DM marks it present again.
    await asUser(dm)
    await pub.absent(s.c, s.juno, true)
    await asUser(player)
    expect((await pub.claimable(s.c)).map((row) => row.id)).toEqual([s.ilsa])
    await asUser(dm)
    await pub.absent(s.c, s.juno, false)
    await asUser(player)
    expect((await pub.claimable(s.c)).map((row) => row.id)).toEqual([s.ilsa, s.juno])
    // A Player of another campaign lists only that campaign's free characters.
    await asUser(otherPlayer)
    expect((await pub.claimable(s.other)).map((row) => row.id)).toEqual([s.foreign])
  })

  it('truncates the class key and label to the client limits', async () => {
    const s = await table()
    await asUser(dm)
    await pub.sheet(s.c, s.ilsa, 2, 14, 12, {
      classKey: 'k'.repeat(60),
      classLabel: 'L'.repeat(150),
    })
    await asUser(player)
    expect((await pub.claimable(s.c)).find((row) => row.id === s.ilsa)).toMatchObject({
      class_key: 'k'.repeat(40),
      class_label: 'L'.repeat(100),
    })
  })

  it('denies the list to anon, outsiders, a former member, DMs and another campaign', async () => {
    const s = await table()
    await asAnon()
    await expect(pub.claimable(s.c)).rejects.toThrow(/permission denied/)
    for (const user of [outsider, former, dm, otherDm, otherPlayer]) {
      await asUser(user)
      await expect(pub.claimable(s.c)).rejects.toMatchObject({
        message: 'Forbidden',
        code: '42501',
      })
    }
    // The DM of the other campaign assigns instead of claiming.
    await asUser(otherDm)
    await expect(pub.claimable(s.other)).rejects.toThrow(/Forbidden/)
    await asUser(player)
    await expect(pub.claimable(s.other)).rejects.toThrow(/Forbidden/)
  })

  it("shows a free character's current portrait to active Players of the campaign only", async () => {
    const s = await table()
    const current = `public/${s.c}/${s.ilsa}/${randomUUID()}.webp`
    const previous = `public/${s.c}/${s.ilsa}/${randomUUID()}.webp`
    const archived = `public/${s.c}/${s.old}/${randomUUID()}.webp`
    const absent = `public/${s.c}/${s.juno}/${randomUUID()}.webp`
    for (const path of [current, previous, archived, absent]) await upload(path)
    await asUser(dm)
    await pub.portrait(s.c, s.ilsa, previous)
    await pub.portrait(s.c, s.ilsa, current)
    await pub.portrait(s.c, s.old, archived)
    await pub.portrait(s.c, s.juno, absent)
    await pub.absent(s.c, s.juno, true)
    for (const user of [player, newcomer]) {
      await asUser(user)
      expect(await visible(current)).toBe(true)
      // Only the current portrait of a character that can be claimed.
      expect(await visible(previous)).toBe(false)
      expect(await visible(archived)).toBe(false)
      expect(await visible(absent)).toBe(false)
      expect(await pub.portraits(s.c)).toEqual([{ character_id: s.ilsa, portrait_path: current }])
      // Reading is not writing: a Player cannot upload under a free character.
      await expect(
        db.query(
          "insert into storage.objects(bucket_id, name) values ('character-portraits', $1)",
          [`public/${s.c}/${s.ilsa}/${randomUUID()}.webp`],
        ),
      ).rejects.toThrow(/row-level security/)
    }
    for (const user of [former, outsider, otherDm, otherPlayer]) {
      await asUser(user)
      for (const path of [current, previous, archived, absent])
        expect(await visible(path)).toBe(false)
      await expect(pub.portraits(s.c)).rejects.toThrow(/Forbidden/)
    }
    // The DM keeps reading every portrait object of the campaign's characters.
    await asUser(dm)
    for (const path of [current, previous, archived, absent]) expect(await visible(path)).toBe(true)
    await asAnon()
    await expect(
      db.query("select name from storage.objects where bucket_id = 'character-portraits'"),
    ).rejects.toThrow(/permission denied/)
    await asSystem()
  })
})

describe('RYT-096 claim a free character', () => {
  const events = async (ch: string) => {
    await asSystem()
    return (
      await db.query<{ actor_id: string; before_user: string | null; after_user: string | null }>(
        `select actor_id, before_value->>'user_id' before_user, after_value->>'user_id' after_user
           from public.character_events where character_id=$1 and kind='characters:UPDATE'
          order by created_at, id`,
        [ch],
      )
    ).rows
  }

  it('makes the claimed character active when the Player has none, reserve otherwise; idempotent and audited', async () => {
    const s = await table()
    await asUser(newcomer)
    expect(await pub.claim(s.c, s.ilsa)).toBe(s.ilsa)
    expect(await pub.character(s.ilsa)).toEqual({ user_id: newcomer, is_active: true })
    const audited = await events(s.ilsa)
    expect(audited).toEqual([{ actor_id: newcomer, before_user: null, after_user: newcomer }])
    // A retried claim returns the same character without another write.
    await asUser(newcomer)
    expect(await pub.claim(s.c, s.ilsa)).toBe(s.ilsa)
    expect(await events(s.ilsa)).toEqual(audited)
    // The claimed character is the newcomer's own: party, sheet and portraits follow.
    await asUser(newcomer)
    expect((await pub.overview(s.c)).find((row) => row.id === s.ilsa)).toMatchObject({
      is_own: true,
      is_assigned: true,
    })
    expect(
      (await db.query('select 1 from public.character_sheets where character_id=$1', [s.ilsa]))
        .rows,
    ).toHaveLength(1)

    // A Player who already plays a character gets the claimed one in reserve.
    await asUser(player)
    expect(await pub.claim(s.c, s.juno)).toBe(s.juno)
    expect(await pub.character(s.juno)).toEqual({ user_id: player, is_active: false })
    expect(await pub.character(s.arin)).toEqual({ user_id: player, is_active: true })
    expect(await events(s.juno)).toEqual([
      { actor_id: player, before_user: null, after_user: player },
    ])
    // The DM reads the audit row; Players read no audit history.
    await asUser(dm)
    expect(
      (
        await db.query(
          'select 1 from public.character_events where character_id=$1 and actor_id=$2',
          [s.juno, player],
        )
      ).rows,
    ).toHaveLength(1)
    await asUser(player)
    expect(
      (await db.query('select 1 from public.character_events where character_id=$1', [s.juno]))
        .rows,
    ).toHaveLength(0)
    // Nothing is free any more.
    expect(await pub.claimable(s.c)).toEqual([])
  })

  it('refuses assigned, archived, absent, unknown and cross-campaign characters; a lost race finds it taken', async () => {
    const s = await table()
    await asUser(newcomer)
    await pub.claim(s.c, s.ilsa)
    // Claims serialise on the campaign row: the second Player finds the character assigned.
    await asUser(player)
    await expect(pub.claim(s.c, s.ilsa)).rejects.toMatchObject({
      message: 'Character unavailable',
      code: 'P0001',
    })
    for (const ch of [s.bea, s.old, randomUUID(), s.foreign])
      await expect(pub.claim(s.c, ch)).rejects.toThrow(/Character unavailable/)
    // The other campaign's id does not help: the Player is not a member there.
    await expect(pub.claim(s.other, s.foreign)).rejects.toThrow(/Forbidden/)
    // An absent free character waits until the DM marks it present.
    await asUser(dm)
    await pub.absent(s.c, s.juno, true)
    await asUser(player)
    await expect(pub.claim(s.c, s.juno)).rejects.toThrow(/Character unavailable/)
    await asUser(dm)
    await pub.absent(s.c, s.juno, false)
    // An own archived character is restored, not claimed.
    await asUser(player)
    const kept = await pub.create(s.c, 'Kept')
    await pub.archive(s.c, kept)
    await expect(pub.claim(s.c, kept)).rejects.toThrow(/Character unavailable/)
    for (const [ch, owner] of [
      [s.ilsa, newcomer],
      [s.bea, peer],
      [s.old, null],
      [s.juno, null],
      [s.foreign, null],
    ] as const)
      expect((await pub.character(ch)).user_id).toBe(owner)
  })

  it('holds the four-character limit; archived characters do not count', async () => {
    const s = await table()
    await asUser(player)
    const extra = []
    for (const name of ['Kip', 'Lio', 'Max']) extra.push(await pub.create(s.c, name))
    await expect(pub.claim(s.c, s.ilsa)).rejects.toMatchObject({
      message: 'Character limit',
      code: 'P0001',
    })
    // A retried claim of an own character still answers at the limit.
    await asUser(player)
    expect(await pub.claim(s.c, s.arin)).toBe(s.arin)
    await pub.archive(s.c, extra[0]!)
    expect(await pub.claim(s.c, s.ilsa)).toBe(s.ilsa)
    expect(await pub.character(s.ilsa)).toEqual({ user_id: player, is_active: false })
    await asUser(player)
    await expect(pub.claim(s.c, s.juno)).rejects.toThrow(/Character limit/)
  })

  it("keeps a benched Player's claim in reserve until the DM marks the absent character present (RYT-079)", async () => {
    const s = await table()
    await asUser(dm)
    await pub.absent(s.c, s.arin, true)
    await asUser(player)
    expect(await pub.claim(s.c, s.ilsa)).toBe(s.ilsa)
    expect(await pub.character(s.ilsa)).toEqual({ user_id: player, is_active: false })
    await asUser(player)
    await expect(
      db.query('select public.set_active_character($1,$2)', [s.c, s.ilsa]),
    ).rejects.toThrow(/Character absent/)
    await asUser(dm)
    await pub.absent(s.c, s.arin, false)
    expect(await pub.character(s.arin)).toEqual({ user_id: player, is_active: true })
  })

  it('denies claiming to anon, outsiders, a former member, DMs and another campaign', async () => {
    const s = await table()
    await asAnon()
    await expect(pub.claim(s.c, s.ilsa)).rejects.toThrow(/permission denied/)
    for (const user of [outsider, former, dm, otherDm, otherPlayer]) {
      await asUser(user)
      await expect(pub.claim(s.c, s.ilsa)).rejects.toMatchObject({
        message: 'Forbidden',
        code: '42501',
      })
    }
    // The other campaign's Player cannot pull this campaign's character through their own campaign.
    await asUser(otherPlayer)
    await expect(pub.claim(s.other, s.ilsa)).rejects.toThrow(/Character unavailable/)
    await asUser(otherDm)
    await expect(pub.claim(s.other, s.foreign)).rejects.toThrow(/Forbidden/)
    // Players still have no direct writes.
    await asUser(player)
    await expect(
      db.query('update public.characters set user_id=$1 where id=$2', [player, s.ilsa]),
    ).rejects.toThrow(/permission denied/)
    expect((await pub.character(s.ilsa)).user_id).toBeNull()
    // In their own campaign the other Player claims normally.
    await asUser(otherPlayer)
    expect(await pub.claim(s.other, s.foreign)).toBe(s.foreign)
    expect(await executable('public', 'private')).toEqual([
      ['public.claim_character(uuid,uuid)', 'authenticated'],
      ['public.get_party_overview(uuid)', 'authenticated'],
      ['public.list_claimable_characters(uuid)', 'authenticated'],
    ])
  })
})

describe('RYT-096 characters in an encounter that has not ended are not free', () => {
  it('hides draft and live combatants from the list, the portraits and the claim; ended ones are free', async () => {
    const s = await table()
    await asUser(dm)
    const nox = await pub.dmCreate(s.c, 'Nox')
    const paths = new Map<string, string>()
    for (const ch of [s.ilsa, s.juno, nox]) {
      paths.set(ch, `public/${s.c}/${ch}/${randomUUID()}.webp`)
      await upload(paths.get(ch)!)
    }
    await asUser(dm)
    for (const ch of [s.ilsa, s.juno, nox]) await pub.portrait(s.c, ch, paths.get(ch)!)
    // Ilsa: hidden in the DM's draft preparation.
    const prep = await pub.encounter(s.c, 'Prep')
    await pub.fight(s.c, prep, [s.ilsa])
    await pub.hide(s.c, prep, s.ilsa, true)
    // Nox: hidden in an encounter that has ended.
    const past = await pub.encounter(s.c, 'Past')
    await pub.fight(s.c, past, [nox, s.arin])
    await pub.hide(s.c, past, nox, true)
    await pub.status(s.c, past, 'active')
    await pub.status(s.c, past, 'ended')
    // Juno: hidden in the running fight.
    const now = await pub.encounter(s.c, 'Now')
    await pub.fight(s.c, now, [s.juno, s.bea])
    await pub.hide(s.c, now, s.juno, true)
    await pub.status(s.c, now, 'active')

    await asUser(player)
    expect((await pub.claimable(s.c)).map((row) => row.id)).toEqual([nox])
    expect(await visible(paths.get(s.ilsa)!)).toBe(false)
    expect(await visible(paths.get(s.juno)!)).toBe(false)
    expect(await visible(paths.get(nox)!)).toBe(true)
    expect(await pub.portraits(s.c)).toEqual([{ character_id: nox, portrait_path: paths.get(nox) }])
    for (const ch of [s.ilsa, s.juno])
      await expect(pub.claim(s.c, ch)).rejects.toMatchObject({
        message: 'Character unavailable',
        code: 'P0001',
      })
    // RYT-043 still shows the portrait of a character fighting visibly; it stays unclaimable.
    await pub.hide(s.c, now, s.juno, false)
    await asUser(player)
    expect(await visible(paths.get(s.juno)!)).toBe(true)
    expect((await pub.claimable(s.c)).map((row) => row.id)).toEqual([nox])
    await expect(pub.claim(s.c, s.juno)).rejects.toThrow(/Character unavailable/)
    // Ending the fight frees Juno; the draft still holds Ilsa.
    await asUser(dm)
    await pub.status(s.c, now, 'ended')
    await asUser(player)
    expect((await pub.claimable(s.c)).map((row) => row.id)).toEqual([s.juno, nox])
    await asUser(newcomer)
    expect(await pub.claim(s.c, nox)).toBe(nox)
    expect(await pub.character(nox)).toEqual({ user_id: newcomer, is_active: true })
    await asUser(newcomer)
    expect(await pub.claim(s.c, s.juno)).toBe(s.juno)
    await expect(pub.claim(s.c, s.ilsa)).rejects.toThrow(/Character unavailable/)
    expect((await pub.character(s.ilsa)).user_id).toBeNull()
  })
})

describe('RYT-096 only characters that never had a Player are free', () => {
  it('backfills ever_assigned from assignments and the audit history without audit rows', async () => {
    const check = async () => {
      for (const schema of ['public', 'pre'] as const) {
        await asSystem()
        const rows = (
          await db.query<{ id: string; ever_assigned: boolean }>(
            `select id, ever_assigned from ${schema}.characters where campaign_id=$1`,
            [legacy.c],
          )
        ).rows
        expect(Object.fromEntries(rows.map((row) => [row.id, row.ever_assigned]))).toEqual({
          [legacy.returned]: true,
          [legacy.left]: true,
          [legacy.kept]: true,
          [legacy.fresh]: false,
        })
        expect(await auditCount(schema, legacy.c)).toBe(legacy.events)
        // Only the character that never had a Player is offered, in both environments.
        await asUser(player)
        expect((await api(schema).claimable(legacy.c)).map((row) => row.id)).toEqual([legacy.fresh])
      }
      // The audit trigger is enabled again after the backfill.
      await asSystem()
      expect(
        (
          await db.query<{ table: string; enabled: string }>(
            `select tgrelid::regclass::text "table", tgenabled enabled from pg_trigger
              where tgname = 'characters_audit' and tgrelid in ('public.characters'::regclass, 'pre.characters'::regclass)
              order by 1`,
          )
        ).rows,
      ).toEqual([
        { table: 'characters', enabled: 'O' },
        { table: 'pre.characters', enabled: 'O' },
      ])
    }
    await check()
    // Running the file again changes nothing.
    await asSystem()
    await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'))
    await check()
  })

  it('never offers a character freed by its Player leaving or by unassign_character', async () => {
    const s = await table()
    const paths = new Map<string, string>()
    for (const ch of [s.arin, s.bea]) {
      paths.set(ch, `public/${s.c}/${ch}/${randomUUID()}.webp`)
      await upload(paths.get(ch)!)
    }
    await asUser(dm)
    for (const ch of [s.arin, s.bea]) await pub.portrait(s.c, ch, paths.get(ch)!)
    await pub.unassign(s.c, s.bea, peer)
    await asUser(player)
    await pub.remove(s.c, player)
    for (const ch of [s.arin, s.bea])
      expect(await pub.character(ch)).toEqual({ user_id: null, is_active: true })
    await asUser(newcomer)
    expect((await pub.claimable(s.c)).map((row) => row.id)).toEqual([s.ilsa, s.juno])
    for (const ch of [s.arin, s.bea]) {
      expect(await visible(paths.get(ch)!)).toBe(false)
      await expect(pub.claim(s.c, ch)).rejects.toMatchObject({
        message: 'Character unavailable',
        code: 'P0001',
      })
    }
    // The DM still assigns them by hand.
    await asUser(dm)
    await pub.assign(s.c, s.arin, newcomer)
    expect((await pub.character(s.arin)).user_id).toBe(newcomer)
    // A claimed character keeps the mark: unassigned again, a retried claim finds it unavailable.
    await asUser(newcomer)
    expect(await pub.claim(s.c, s.ilsa)).toBe(s.ilsa)
    await asUser(dm)
    await pub.unassign(s.c, s.ilsa, newcomer)
    await asUser(newcomer)
    await expect(pub.claim(s.c, s.ilsa)).rejects.toThrow(/Character unavailable/)
    expect((await pub.claimable(s.c)).map((row) => row.id)).toEqual([s.juno])
    // Clients cannot write the mark, and even a privileged write does not clear it.
    await asUser(dm)
    await expect(
      db.query('update public.characters set ever_assigned = false where id=$1', [s.ilsa]),
    ).rejects.toThrow(/permission denied/)
    await asSystem()
    await db.query('update public.characters set ever_assigned = false where id=$1', [s.ilsa])
    expect(
      (
        await db.query<{ ever_assigned: boolean }>(
          'select ever_assigned from public.characters where id=$1',
          [s.ilsa],
        )
      ).rows[0]!.ever_assigned,
    ).toBe(true)
  })

  it('reserves a character with a pending invitation until it is revoked or declined', async () => {
    const s = await table()
    const path = `public/${s.c}/${s.juno}/${randomUUID()}.webp`
    await upload(path)
    await asUser(dm)
    await pub.portrait(s.c, s.juno, path)
    const invitation = await pub.inviteCharacter(s.c, s.juno, 'guest@example.com')
    await asUser(player)
    expect((await pub.claimable(s.c)).map((row) => row.id)).toEqual([s.ilsa])
    expect(await visible(path)).toBe(false)
    await expect(pub.claim(s.c, s.juno)).rejects.toThrow(/Character unavailable/)
    await asUser(dm)
    await db.query('select public.revoke_campaign_invitation($1)', [invitation])
    await asUser(player)
    expect((await pub.claimable(s.c)).map((row) => row.id)).toEqual([s.ilsa, s.juno])
    expect(await visible(path)).toBe(true)
    // The recipient declining frees it as well.
    await asUser(dm)
    const second = await pub.inviteCharacter(s.c, s.juno, 'peer@example.com')
    await asUser(player)
    expect((await pub.claimable(s.c)).map((row) => row.id)).toEqual([s.ilsa])
    await asUser(peer)
    await db.query('select public.respond_campaign_invitation($1,false)', [second])
    await asUser(player)
    expect((await pub.claimable(s.c)).map((row) => row.id)).toEqual([s.ilsa, s.juno])
    // An expired invitation can no longer be accepted, so it reserves nothing.
    await asUser(dm)
    const third = await pub.inviteCharacter(s.c, s.juno, 'late@example.com')
    await asUser(player)
    expect((await pub.claimable(s.c)).map((row) => row.id)).toEqual([s.ilsa])
    await asSystem()
    await db.query(
      `update public.campaign_invitations set created_at = now() - interval '8 days',
        expires_at = now() - interval '1 minute' where id = $1`,
      [third],
    )
    await asUser(player)
    expect((await pub.claimable(s.c)).map((row) => row.id)).toEqual([s.ilsa, s.juno])
    expect(await pub.claim(s.c, s.juno)).toBe(s.juno)
  })
})

describe('RYT-096 and RYT-097 PRE mirror', () => {
  it('mirrors the rules into a PRE copied before the migration', async () => {
    // Re-running the file re-applies the remapped DDL to an up-to-date PRE (create or replace only).
    await asSystem()
    await db.exec(readFileSync(`supabase/migrations/${migration}`, 'utf8'))
    const pre = api('pre')
    const s = await table('pre')
    await asUser(dm)
    await pre.share(s.c, s.bea, false)
    // A free character in the DM's draft encounter stays private in PRE too.
    const nox = await pre.dmCreate(s.c, 'Nox')
    await pre.fight(s.c, await pre.encounter(s.c, 'PRE prep'), [nox])
    const path = `pre/${s.c}/${s.juno}/${randomUUID()}.webp`
    await upload(path)
    await upload(path.replace('pre/', 'public/'))
    await asUser(dm)
    await pre.portrait(s.c, s.juno, path)
    await asUser(player)
    expect((await pre.overview(s.c)).find((row) => row.id === s.bea)).toMatchObject({
      shares_live: false,
      max_hp: null,
      armor_class: null,
    })
    expect((await pre.claimable(s.c)).map((row) => row.id)).toEqual([s.ilsa, s.juno])
    expect(await pre.claim(s.c, s.ilsa)).toBe(s.ilsa)
    expect(await pre.character(s.ilsa)).toEqual({ user_id: player, is_active: false })
    await asUser(player)
    await expect(pre.claim(s.c, nox)).rejects.toThrow(/Character unavailable/)
    // A character that had a Player is never offered again, in PRE too.
    await asUser(dm)
    await pre.unassign(s.c, s.ilsa, player)
    await asUser(newcomer)
    expect((await pre.claimable(s.c)).map((row) => row.id)).toEqual([s.juno])
    await expect(pre.claim(s.c, s.ilsa)).rejects.toThrow(/Character unavailable/)
    await asUser(newcomer)
    expect(await visible(path)).toBe(true)
    // A public/ object of a PRE campaign is authorized against production, where it does not exist.
    expect(await visible(path.replace('pre/', 'public/'))).toBe(false)
    await expect(pub.claim(s.c, s.juno)).rejects.toThrow(/Forbidden/)
    await expect(pub.claimable(s.c)).rejects.toThrow(/Forbidden/)
    await asUser(outsider)
    expect(await visible(path)).toBe(false)
    await expect(pre.claim(s.c, s.juno)).rejects.toThrow(/Forbidden/)
    await asAnon()
    await expect(pre.claim(s.c, s.juno)).rejects.toThrow(/permission denied/)
    await expect(pre.claimable(s.c)).rejects.toThrow(/permission denied/)
    await asSystem()
    const sources = (
      await db.query<{ src: string }>(
        "select prosrc src from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('pre','pre_private') and p.proname in ('is_campaign_player','is_free_character','characters_mark_assigned','get_party_overview','can_view_portrait','list_claimable_characters','claim_character')",
      )
    ).rows
    expect(sources).toHaveLength(7)
    for (const { src } of sources) expect(src).not.toMatch(/\bpublic\.|\bprivate\./)
    // The PRE helpers are as closed as the production ones.
    expect(await executable('pre', 'pre_private')).toEqual([
      ['pre.claim_character(uuid,uuid)', 'authenticated'],
      ['pre.get_party_overview(uuid)', 'authenticated'],
      ['pre.list_claimable_characters(uuid)', 'authenticated'],
    ])
  })
})
