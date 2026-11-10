import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-044: Player character roster, server-enforced limit of 4 and exactly one active character.
const migration = '20261105120000_character_roster.sql'
const db = new PGlite()
const dm = randomUUID(),
  player = randomUUID(),
  peer = randomUUID(),
  newcomer = randomUUID(),
  outsider = randomUUID()
const asUser = async (id: string) => {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
}
const asAnon = () => db.exec('reset role; set role anon')
const scalar = async (sql: string, args: unknown[] = []) =>
  (await db.query<{ result: string }>(sql, args)).rows[0]!.result

function api(schema = 'public') {
  return {
    campaign: (name: string) => scalar(`select ${schema}.create_campaign($1) result`, [name]),
    dmCreate: (c: string, name: string) =>
      scalar(`select ${schema}.create_character($1,$2) result`, [c, name]),
    create: (c: string, name: string, key = randomUUID()) =>
      scalar(`select ${schema}.create_own_character($1,$2,$3) result`, [c, name, key]),
    activate: (c: string, ch: string) =>
      scalar(`select ${schema}.set_active_character($1,$2) result`, [c, ch]),
    invite: (c: string, ch: string, email: string) =>
      scalar(`select ${schema}.invite_character_player($1,$2,$3) result`, [c, ch, email]),
    inviteMember: (c: string, email: string) =>
      scalar(`select ${schema}.invite_campaign_member($1,$2) result`, [c, email]),
    accept: (id: string) => db.query(`select ${schema}.respond_campaign_invitation($1,true)`, [id]),
    assign: (c: string, ch: string, user: string) =>
      db.query(`select ${schema}.assign_character($1,$2,$3)`, [c, ch, user]),
    unassign: (c: string, ch: string, user: string) =>
      db.query(`select ${schema}.unassign_character($1,$2,$3)`, [c, ch, user]),
    remove: (c: string, user: string) =>
      db.query(`select ${schema}.change_campaign_member($1,$2,null)`, [c, user]),
    roster: async (c: string, user: string) =>
      (
        await db.query<{ id: string; name: string; is_active: boolean }>(
          `select id, name, is_active from ${schema}.characters where campaign_id=$1 and user_id=$2 order by created_at, id`,
          [c, user],
        )
      ).rows,
    overview: async (c: string) =>
      (await db.query<{ id: string }>(`select id from ${schema}.get_party_overview($1)`, [c])).rows,
    archive: async (c: string, ch: string) =>
      (
        await db.query<{ result: { archived: boolean } }>(
          `select ${schema}.archive_character($1,$2) result`,
          [c, ch],
        )
      ).rows[0]!.result,
    restore: async (c: string, ch: string) =>
      (
        await db.query<{ result: { archived: boolean } }>(
          `select ${schema}.restore_character($1,$2) result`,
          [c, ch],
        )
      ).rows[0]!.result,
    state: async (c: string, user: string | null) =>
      (
        await db.query<{ name: string; is_active: boolean; archived: boolean }>(
          `select name, is_active, archived_at is not null archived from ${schema}.characters
            where campaign_id=$1 and user_id is not distinct from $2 order by created_at, id`,
          [c, user],
        )
      ).rows.map((row) => [row.name, row.is_active, row.archived]),
  }
}
const pub = api()

/** DM campaign with the Player and a peer joined as plain members (no character yet). */
async function table(schema = 'public') {
  const x = api(schema)
  await asUser(dm)
  const c = await x.campaign('Roster table')
  for (const [user, email] of [
    [player, 'player@example.com'],
    [peer, 'peer@example.com'],
  ] as const) {
    await asUser(dm)
    const id = await x.inviteMember(c, email)
    await asUser(user)
    await x.accept(id)
  }
  return c
}

// Characters linked before the migration (one per Player), used for the data migration check.
let legacy: { c: string; arin: string; spare: string }
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
  await asUser(dm)
  const c = await pub.campaign('Legacy table')
  const arin = await pub.dmCreate(c, 'Arin')
  const spare = await pub.dmCreate(c, 'Spare')
  const invitation = await pub.invite(c, arin, 'player@example.com')
  await asUser(player)
  await pub.accept(invitation)
  legacy = { c, arin, spare }
  await db.exec('reset role')
  // A PRE copied before RYT-044 (with the legacy rows) exercises the guarded PRE mirror.
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

describe('RYT-044 character roster', () => {
  it('migrates existing data: assigned characters become active, unassigned stay in play', async () => {
    await db.exec('reset role')
    for (const schema of ['public', 'pre'])
      expect(
        (
          await db.query<{ name: string; user_id: string | null; is_active: boolean }>(
            `select name, user_id, is_active from ${schema}.characters where campaign_id=$1 order by name`,
            [legacy.c],
          )
        ).rows,
      ).toEqual([
        { name: 'Arin', user_id: player, is_active: true },
        { name: 'Spare', user_id: null, is_active: true },
      ])
  })

  it('lets a Player create up to four characters; the first is active, the limit holds', async () => {
    const c = await table()
    await asUser(player)
    expect(await pub.roster(c, player)).toEqual([])
    const key = randomUUID()
    const first = await pub.create(c, '  Vex  ', key)
    // A retried request returns the same character instead of a second one.
    expect(await pub.create(c, '  Vex  ', key)).toBe(first)
    await expect(pub.create(c, 'Other', key)).rejects.toThrow(/Request mismatch/)
    for (const name of ['Bram', 'Cora', 'Dax']) await pub.create(c, name)
    const roster = await pub.roster(c, player)
    expect(roster.map((row) => [row.name, row.is_active])).toEqual([
      ['Vex', true],
      ['Bram', false],
      ['Cora', false],
      ['Dax', false],
    ])
    await expect(pub.create(c, 'Eli')).rejects.toThrow(/Character limit/)
    await expect(pub.create(c, '   ')).rejects.toThrow(/Invalid name/)
    // Every character gets resources, a draft sheet and play state the owner can read.
    for (const table of ['character_resources', 'character_sheets', 'character_vitals'])
      expect(
        (await db.query(`select 1 from public.${table} where campaign_id=$1`, [c])).rows,
      ).toHaveLength(4)
    // The DM's tools still see the whole roster.
    await asUser(dm)
    expect(
      (await db.query('select 1 from public.characters where campaign_id=$1', [c])).rows,
    ).toHaveLength(4)
  })

  it('switches the active character atomically and shows only active ones in campaign lists', async () => {
    const c = await table()
    await asUser(player)
    const vex = await pub.create(c, 'Vex')
    const bram = await pub.create(c, 'Bram')
    await asUser(peer)
    const pip = await pub.create(c, 'Pip')
    await pub.create(c, 'Quill')
    await asUser(player)
    expect(await pub.activate(c, bram)).toBe(bram)
    expect(await pub.activate(c, bram)).toBe(bram)
    expect((await pub.roster(c, player)).map((row) => [row.name, row.is_active])).toEqual([
      ['Vex', false],
      ['Bram', true],
    ])
    // Party overview: own active + shared active teammates; never the benched ones.
    expect((await pub.overview(c)).map((row) => row.id).sort()).toEqual([bram, pip].sort())
    await asUser(dm)
    expect((await pub.overview(c)).map((row) => row.id).sort()).toEqual([bram, pip].sort())
    // Shop pickers list characters in play only.
    const admin = (
      await db.query<{ result: { characters: { id: string }[] } }>(
        'select public.get_shop_admin($1) result',
        [c],
      )
    ).rows[0]!.result
    expect(admin.characters.map((row) => row.id).sort()).toEqual([bram, pip].sort())
    // Trades: the state follows the active character and partners exclude benched ones.
    await asUser(player)
    const state = (
      await db.query<{ result: { character: { id: string }; partners: { id: string }[] } }>(
        'select public.get_trade_state($1,null) result',
        [c],
      )
    ).rows[0]!.result
    expect(state.character.id).toBe(bram)
    expect(state.partners.map((row) => row.id)).toEqual([pip])
    await expect(
      db.query('select public.invite_trade($1,$2,$3,$4)', [c, vex, pip, randomUUID()]),
    ).rejects.toThrow(/Character unavailable/)
    // The owner still reads and edits a benched character's sheet.
    await db.query('select public.save_character_sheet($1,$2,0,2,14,12,$3,false,$4)', [
      c,
      vex,
      JSON.stringify({ classLabel: 'Bard' }),
      randomUUID(),
    ])
    expect(
      (await db.query('select level from public.character_sheets where character_id=$1', [vex]))
        .rows,
    ).toEqual([{ level: 2 }])
    // Open trade on the active character blocks switching until it closes.
    await db.query('select public.invite_trade($1,$2,$3,$4)', [c, bram, pip, randomUUID()])
    await expect(pub.activate(c, vex)).rejects.toThrow(/Trade busy/)
    await db.exec('reset role')
    await db.query("update public.trades set status='cancelled' where campaign_id=$1", [c])
    await asUser(player)
    expect(await pub.activate(c, vex)).toBe(vex)
  })

  it('blocks switching while the active character fights in a running encounter', async () => {
    const c = await table()
    await asUser(player)
    const vex = await pub.create(c, 'Vex')
    const bram = await pub.create(c, 'Bram')
    await asUser(dm)
    const encounter = (
      await db.query<{ result: { encounter_id: string } }>(
        'select public.create_encounter($1,$2,$3) result',
        [c, 'Ambush', randomUUID()],
      )
    ).rows[0]!.result.encounter_id
    await db.query('select public.add_combatants($1,$2,$3,$4)', [
      c,
      encounter,
      JSON.stringify([{ kind: 'character', character_id: vex }]),
      randomUUID(),
    ])
    // A draft does not lock the roster; initiative and active combat do.
    await asUser(player)
    await pub.activate(c, bram)
    await pub.activate(c, vex)
    await asUser(dm)
    await db.query('select public.set_encounter_status($1,$2,$3,$4)', [
      c,
      encounter,
      'initiative',
      randomUUID(),
    ])
    await asUser(player)
    await expect(pub.activate(c, bram)).rejects.toThrow(/Character in combat/)
  })

  it('keeps DM tools working under the roster rules', async () => {
    const c = await table()
    await asUser(player)
    const vex = await pub.create(c, 'Vex')
    await asUser(dm)
    const npc = await pub.dmCreate(c, 'Hireling')
    // Linking below the limit adds a benched character; the active one does not change.
    await pub.assign(c, npc, player)
    expect((await pub.roster(c, player)).map((row) => [row.name, row.is_active])).toEqual([
      ['Vex', true],
      ['Hireling', false],
    ])
    // Unlinking the active one returns it to the DM (in play) and promotes the oldest left.
    await pub.unassign(c, vex, player)
    expect((await pub.roster(c, player)).map((row) => [row.name, row.is_active])).toEqual([
      ['Hireling', true],
    ])
    await db.exec('reset role')
    expect(
      (await db.query('select user_id, is_active from public.characters where id=$1', [vex])).rows,
    ).toEqual([{ user_id: null, is_active: true }])
    // A Player with a full roster cannot be linked or invited to another character.
    await asUser(player)
    for (const name of ['Bram', 'Cora', 'Dax']) await pub.create(c, name)
    await asUser(dm)
    await expect(pub.assign(c, vex, player)).rejects.toThrow(/Character limit/)
    await expect(pub.invite(c, vex, 'player@example.com')).rejects.toThrow(/Character limit/)
    // A newcomer's first linked character becomes active.
    const invitation = await pub.invite(c, vex, 'newcomer@example.com')
    await asUser(newcomer)
    await pub.accept(invitation)
    expect((await pub.roster(c, newcomer)).map((row) => row.is_active)).toEqual([true])
    // Removing a member unlinks every character and keeps them all in play.
    await asUser(dm)
    await pub.remove(c, player)
    await db.exec('reset role')
    expect(
      (
        await db.query(
          'select count(*)::int n from public.characters where campaign_id=$1 and user_id is null and is_active',
          [c],
        )
      ).rows,
    ).toEqual([{ n: 4 }])
  })

  it('enforces the invariants in the database itself', async () => {
    const c = await table()
    await asUser(player)
    const vex = await pub.create(c, 'Vex')
    const bram = await pub.create(c, 'Bram')
    for (const name of ['Cora', 'Dax']) await pub.create(c, name)
    await db.exec('reset role')
    // Two active characters: the partial unique index rejects it immediately.
    await expect(
      db.query('update public.characters set is_active=true where id=$1', [bram]),
    ).rejects.toThrow(/characters_one_active/)
    // No active character: the deferred roster trigger rejects the transaction at commit.
    await expect(
      db.query('update public.characters set is_active=false where id=$1', [vex]),
    ).rejects.toThrow(/Active character required/)
    // A fifth character: the same trigger enforces the limit outside the RPCs too.
    await expect(
      db.query(
        "insert into public.characters(campaign_id, user_id, name, is_active) values ($1,$2,'Eli',false)",
        [c, player],
      ),
    ).rejects.toThrow(/Character limit/)
    // An unassigned character is always in play.
    await expect(
      db.query(
        "insert into public.characters(campaign_id, name, is_active) values ($1,'Ghost',false)",
        [c],
      ),
    ).rejects.toThrow(/characters_unassigned_active/)
    // A swap inside one transaction is valid.
    await db.exec(`begin;
      update public.characters set is_active=false where id='${vex}';
      update public.characters set is_active=true where id='${bram}';
      commit;`)
    expect(
      (await pub.roster(c, player)).filter((row) => row.is_active).map((row) => row.id),
    ).toEqual([bram])
  })

  it('denies anon, outsiders, other Players, DMs and cross-campaign DMs', async () => {
    const c = await table()
    await asUser(player)
    const vex = await pub.create(c, 'Vex')
    const bram = await pub.create(c, 'Bram')
    await asUser(outsider)
    const other = await pub.campaign('Other table')
    const foreign = await pub.dmCreate(other, 'Foreign')
    // Outsider (a DM elsewhere): cannot create or switch here, nor swap the campaign id.
    await expect(pub.create(c, 'Intruder')).rejects.toThrow(/Forbidden/)
    await expect(pub.activate(c, bram)).rejects.toThrow(/Forbidden/)
    await expect(pub.activate(other, bram)).rejects.toThrow(/Character unavailable/)
    await expect(pub.create(other, 'Own')).rejects.toThrow(/Forbidden/)
    expect((await db.query('select 1 from public.characters where id=$1', [vex])).rows).toEqual([])
    // Another Player of the same campaign: no switching, no reading the benched character.
    await asUser(peer)
    await expect(pub.activate(c, bram)).rejects.toThrow(/Character unavailable/)
    expect((await db.query('select 1 from public.characters where id=$1', [bram])).rows).toEqual([])
    expect(
      (await db.query('select 1 from public.character_sheets where character_id=$1', [bram])).rows,
    ).toEqual([])
    // The campaign DM sees benched characters but cannot create own ones. Choosing a Player's
    // active character is allowed since RYT-079 (tests/database/group-rest.test.ts).
    await asUser(dm)
    expect(
      (await db.query('select is_active from public.characters where id=$1', [bram])).rows,
    ).toEqual([{ is_active: false }])
    await expect(pub.create(c, 'Dm hero')).rejects.toThrow(/Forbidden/)
    await expect(pub.activate(c, foreign)).rejects.toThrow(/Character unavailable/)
    // Direct writes stay closed for every client role.
    for (const actor of [player, dm]) {
      await asUser(actor)
      await expect(
        db.query('update public.characters set is_active = true where id=$1', [bram]),
      ).rejects.toThrow(/permission denied/)
      await expect(
        db.query("insert into public.characters(campaign_id, user_id, name) values ($1,$2,'X')", [
          c,
          player,
        ]),
      ).rejects.toThrow(/permission denied/)
    }
    // A removed member loses access to the RPCs.
    await asUser(dm)
    await pub.remove(c, player)
    await asUser(player)
    await expect(pub.create(c, 'Back')).rejects.toThrow(/Forbidden/)
    await expect(pub.activate(c, vex)).rejects.toThrow(/Forbidden/)
    await asAnon()
    await expect(pub.create(c, 'Anon')).rejects.toThrow(/permission denied/)
    await expect(pub.activate(c, vex)).rejects.toThrow(/permission denied/)
    await db.exec('reset role')
    expect(
      (
        await db.query(
          "select 1 from pg_class where relname='character_requests' and relnamespace='private'::regnamespace",
        )
      ).rows,
    ).toHaveLength(1)
  })

  it('mirrors the roster rules into a PRE copied before the migration', async () => {
    const pre = api('pre')
    const c = await table('pre')
    await asUser(player)
    const vex = await pre.create(c, 'Vex')
    const bram = await pre.create(c, 'Bram')
    for (const name of ['Cora', 'Dax']) await pre.create(c, name)
    await expect(pre.create(c, 'Eli')).rejects.toThrow(/Character limit/)
    await pre.activate(c, bram)
    expect(
      (await pre.roster(c, player)).filter((row) => row.is_active).map((row) => row.id),
    ).toEqual([bram])
    expect((await pre.overview(c)).map((row) => row.id)).toEqual([bram])
    // PRE helpers authorize only against PRE membership.
    await expect(pub.activate(c, vex)).rejects.toThrow(/Forbidden/)
    await asAnon()
    await expect(pre.activate(c, vex)).rejects.toThrow(/permission denied/)
    await db.exec('reset role')
    await expect(
      db.query('update pre.characters set is_active=true where id=$1', [vex]),
    ).rejects.toThrow(/one_active|unique/)
    for (const fn of [
      'pre.create_own_character(uuid,text,uuid)',
      'pre.set_active_character(uuid,uuid)',
      'pre.get_party_overview(uuid)',
      'pre.get_trade_state(uuid,uuid)',
      'pre_private.check_character_roster()',
    ])
      expect(
        (
          await db.query<{ src: string }>(
            'select prosrc src from pg_proc where oid=$1::regprocedure',
            [fn],
          )
        ).rows[0]!.src,
      ).not.toMatch(/\bpublic\.|\bprivate\./)
  })
})

describe('RYT-044 character archive', () => {
  it('frees a slot by archiving; restoring needs a free slot; the active one stays', async () => {
    const c = await table()
    await asUser(player)
    const vex = await pub.create(c, 'Vex')
    const bram = await pub.create(c, 'Bram')
    const cora = await pub.create(c, 'Cora')
    await pub.create(c, 'Dax')
    await expect(pub.create(c, 'Eli')).rejects.toThrow(/Character limit/)
    await expect(pub.archive(c, vex)).rejects.toThrow(/Active character/)
    expect(await pub.archive(c, bram)).toEqual({ id: bram, archived: true })
    // Idempotent: a second archive returns the same state without writing.
    expect(await pub.archive(c, bram)).toEqual({ id: bram, archived: true })
    await expect(pub.activate(c, bram)).rejects.toThrow(/Character unavailable/)
    await pub.create(c, 'Eli')
    await expect(pub.restore(c, bram)).rejects.toThrow(/Character limit/)
    await pub.archive(c, cora)
    expect(await pub.restore(c, bram)).toEqual({ id: bram, archived: false })
    expect(await pub.restore(c, bram)).toEqual({ id: bram, archived: false })
    expect(await pub.state(c, player)).toEqual([
      ['Vex', true, false],
      ['Bram', false, false],
      ['Cora', false, true],
      ['Dax', false, false],
      ['Eli', false, false],
    ])
    // Archived characters stay out of every campaign list; the owner still reads them.
    await asUser(dm)
    expect((await pub.overview(c)).map((row) => row.id)).not.toContain(cora)
    const admin = (
      await db.query<{ result: { characters: { id: string }[] } }>(
        'select public.get_shop_admin($1) result',
        [c],
      )
    ).rows[0]!.result
    expect(admin.characters.map((row) => row.id)).not.toContain(cora)
    await asUser(player)
    expect(
      (await db.query('select 1 from public.characters where id=$1', [cora])).rows,
    ).toHaveLength(1)
    expect(
      (await db.query('select 1 from public.character_sheets where character_id=$1', [cora])).rows,
    ).toHaveLength(1)
  })

  it('refuses archiving during an open trade or a running encounter', async () => {
    const c = await table()
    await asUser(player)
    await pub.create(c, 'Vex')
    await asUser(peer)
    const pip = await pub.create(c, 'Pip')
    const quill = await pub.create(c, 'Quill')
    // A trade starts with Pip active; once Quill is active, Pip may not be archived mid-trade.
    await asUser(player)
    const vex = (await pub.roster(c, player))[0]!.id
    await db.query('select public.invite_trade($1,$2,$3,$4)', [c, vex, pip, randomUUID()])
    const swap = (off: string, on: string) =>
      db.exec(`reset role; begin;
        update public.characters set is_active = false where id = '${off}';
        update public.characters set is_active = true where id = '${on}';
        commit;`)
    await swap(pip, quill)
    await asUser(peer)
    await expect(pub.archive(c, pip)).rejects.toThrow(/Trade busy/)
    await db.exec('reset role')
    await db.query("update public.trades set status='cancelled' where campaign_id=$1", [c])
    await swap(quill, pip)
    // The DM may put a reserve character in combat; archiving waits until the combat ends.
    await asUser(dm)
    const encounter = (
      await db.query<{ result: { encounter_id: string } }>(
        'select public.create_encounter($1,$2,$3) result',
        [c, 'Ambush', randomUUID()],
      )
    ).rows[0]!.result.encounter_id
    await db.query('select public.add_combatants($1,$2,$3,$4)', [
      c,
      encounter,
      JSON.stringify([{ kind: 'character', character_id: quill }]),
      randomUUID(),
    ])
    await db.query('select public.set_encounter_status($1,$2,$3,$4)', [
      c,
      encounter,
      'initiative',
      randomUUID(),
    ])
    await asUser(peer)
    await expect(pub.archive(c, quill)).rejects.toThrow(/Character in combat/)
    await asUser(dm)
    await db.query('select public.set_encounter_status($1,$2,$3,$4)', [
      c,
      encounter,
      'ended',
      randomUUID(),
    ])
    await asUser(peer)
    expect(await pub.archive(c, quill)).toMatchObject({ archived: true })
  })

  it('lets the DM archive and restore any character, including unassigned ones', async () => {
    const c = await table()
    await asUser(player)
    await pub.create(c, 'Vex')
    const bram = await pub.create(c, 'Bram')
    await asUser(dm)
    const npc = await pub.dmCreate(c, 'Hireling')
    const invitation = await pub.invite(c, npc, 'newcomer@example.com')
    expect(await pub.archive(c, npc)).toMatchObject({ archived: true })
    expect(await pub.archive(c, bram)).toMatchObject({ archived: true })
    await db.exec('reset role')
    expect(await pub.state(c, null)).toEqual([['Hireling', false, true]])
    // Archiving revokes a pending invitation to that character.
    expect(
      (await db.query('select status from public.campaign_invitations where id=$1', [invitation]))
        .rows,
    ).toEqual([{ status: 'revoked' }])
    // An archived character cannot be linked until it is restored.
    await asUser(dm)
    await expect(pub.assign(c, npc, player)).rejects.toThrow(/Character unavailable/)
    await pub.restore(c, npc)
    await db.exec('reset role')
    expect(await pub.state(c, null)).toEqual([['Hireling', true, false]])
    // Unlinking or removing a member keeps archived characters archived.
    await asUser(dm)
    await pub.unassign(c, bram, player)
    await db.exec('reset role')
    expect(await pub.state(c, null)).toEqual([
      ['Bram', false, true],
      ['Hireling', true, false],
    ])
    await asUser(dm)
    await pub.restore(c, bram)
    await pub.assign(c, bram, player)
    await pub.archive(c, bram)
    await pub.remove(c, player)
    await db.exec('reset role')
    expect(await pub.state(c, null)).toEqual([
      ['Vex', true, false],
      ['Bram', false, true],
      ['Hireling', true, false],
    ])
  })

  it('enforces the archive invariants in the database itself', async () => {
    const c = await table()
    await asUser(player)
    const vex = await pub.create(c, 'Vex')
    const bram = await pub.create(c, 'Bram')
    await db.exec('reset role')
    await expect(
      db.query('update public.characters set archived_at=now() where id=$1', [vex]),
    ).rejects.toThrow(/characters_archived_inactive/)
    // Four in the roster plus archived ones is valid; a fifth in the roster is not.
    await db.query('update public.characters set archived_at=now() where id=$1', [bram])
    for (const name of ['Cora', 'Dax', 'Eli'])
      await db.query(
        'insert into public.characters(campaign_id, user_id, name, is_active) values ($1,$2,$3,false)',
        [c, player, name],
      )
    await expect(
      db.query('update public.characters set archived_at=null where id=$1', [bram]),
    ).rejects.toThrow(/Character limit/)
  })

  it('denies anon, outsiders, other Players and cross-campaign DMs', async () => {
    const c = await table()
    await asUser(player)
    await pub.create(c, 'Vex')
    const bram = await pub.create(c, 'Bram')
    await asUser(outsider)
    const other = await pub.campaign('Other table')
    const foreign = await pub.dmCreate(other, 'Foreign')
    await expect(pub.archive(c, bram)).rejects.toThrow(/Forbidden/)
    await expect(pub.restore(c, bram)).rejects.toThrow(/Forbidden/)
    // A DM of another campaign cannot reach this character through their own campaign id.
    await expect(pub.archive(other, bram)).rejects.toThrow(/Character unavailable/)
    await asUser(peer)
    await expect(pub.archive(c, bram)).rejects.toThrow(/Character unavailable/)
    await asUser(dm)
    await expect(pub.archive(c, foreign)).rejects.toThrow(/Character unavailable/)
    for (const actor of [player, dm]) {
      await asUser(actor)
      await expect(
        db.query('update public.characters set archived_at=now() where id=$1', [bram]),
      ).rejects.toThrow(/permission denied/)
    }
    await asUser(player)
    await pub.archive(c, bram)
    await asUser(peer)
    await expect(pub.restore(c, bram)).rejects.toThrow(/Character unavailable/)
    await asAnon()
    await expect(pub.archive(c, bram)).rejects.toThrow(/permission denied/)
    await expect(pub.restore(c, bram)).rejects.toThrow(/permission denied/)
    await db.exec('reset role')
  })

  it('mirrors archiving into a PRE copied before RYT-044', async () => {
    const pre = api('pre')
    const c = await table('pre')
    await asUser(player)
    await pre.create(c, 'Vex')
    const bram = await pre.create(c, 'Bram')
    expect(await pre.archive(c, bram)).toMatchObject({ archived: true })
    expect(await pre.restore(c, bram)).toMatchObject({ archived: false })
    await expect(pub.archive(c, bram)).rejects.toThrow(/Forbidden/)
    await db.exec('reset role')
    for (const fn of [
      'pre.archive_character(uuid,uuid)',
      'pre.restore_character(uuid,uuid)',
      'pre_private.character_busy(uuid,uuid)',
      'pre_private.check_character_roster()',
    ])
      expect(
        (
          await db.query<{ src: string }>(
            'select prosrc src from pg_proc where oid=$1::regprocedure',
            [fn],
          )
        ).rows[0]!.src,
      ).not.toMatch(/\bpublic\.|\bprivate\./)
  })
})
