import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
const db = new PGlite()
const dm = randomUUID(),
  player = randomUUID(),
  outsider = randomUUID(),
  future = randomUUID()
const asUser = async (id: string) => {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
}
const scalar = async (sql: string, args: unknown[] = []) =>
  (await db.query<{ result: string }>(sql, args)).rows[0]!.result
async function setup() {
  await asUser(dm)
  const c = await scalar("select public.create_campaign('Homebrew table') result")
  const ch = await scalar("select public.create_character($1, 'Arin') result", [c])
  return { c, ch }
}
const invite = (c: string, ch: string, email = 'player@example.com') =>
  scalar('select public.invite_character_player($1, $2, $3) result', [c, ch, email])
const edit = (c: string, ch: string, rev = 0, gold = 20, key = randomUUID()) =>
  db.query('select public.set_character_resources($1,$2,$3,$4,3,4,12,$5)', [c, ch, rev, gold, key])
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`)
  for (const [id, email] of [
    [dm, 'dm@example.com'],
    [player, 'player@example.com'],
    [outsider, 'other@example.com'],
  ])
    await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [
      id,
      email,
    ])
  for (const file of readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort())
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
}, 30000)
afterAll(() => db.close())
describe('RYT-003 complete migration chain', () => {
  it('creates before account existence and atomically assigns on verified acceptance', async () => {
    const { c, ch } = await setup()
    const id = await invite(c, ch, 'future@example.com')
    expect(
      (await db.query('select user_id from public.characters where id=$1', [ch])).rows,
    ).toEqual([{ user_id: null }])
    await db.exec('reset role')
    await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [
      future,
      'future@example.com',
    ])
    await asUser(future)
    expect(
      (await db.query('select character_name from public.list_my_invitations()')).rows,
    ).toEqual([{ character_name: 'Arin' }])
    await db.query('select public.respond_campaign_invitation($1,true)', [id])
    expect(
      (await db.query('select user_id from public.characters where id=$1', [ch])).rows,
    ).toEqual([{ user_id: future }])
    expect(
      (
        await db.query(
          'select gold,exhaustion from public.character_resources where character_id=$1',
          [ch],
        )
      ).rows,
    ).toEqual([{ gold: 0, exhaustion: 0 }])
    await expect(
      db.query('select public.respond_campaign_invitation($1,true)', [id]),
    ).rejects.toThrow(/unavailable/)
    await asUser(dm)
    expect(
      (await db.query('select * from public.character_events where character_id=$1', [ch])).rows,
    ).toHaveLength(3)
  })
  it('denies anonymous, outsider, cross-campaign DM and Player writes and private reads', async () => {
    const { c, ch } = await setup()
    const id = await invite(c, ch)
    await asUser(player)
    await db.query('select public.respond_campaign_invitation($1,true)', [id])
    for (const actor of [player, outsider]) {
      await asUser(actor)
      if (actor === outsider) await scalar("select public.create_campaign('Other') result")
      await expect(edit(c, ch)).rejects.toThrow(/Forbidden/)
      await expect(db.query("select public.create_character($1,'Bad')", [c])).rejects.toThrow(
        /Forbidden/,
      )
      await expect(invite(c, ch)).rejects.toThrow(/Forbidden/)
      await expect(
        db.query('select public.unassign_character($1,$2,$3)', [c, ch, player]),
      ).rejects.toThrow(/Forbidden/)
      for (const table of ['characters', 'character_resources', 'character_events']) {
        await expect(db.query(`delete from public.${table}`)).rejects.toThrow(/permission denied/)
        if (actor === outsider || table === 'character_events')
          expect(
            (await db.query(`select * from public.${table} where campaign_id=$1`, [c])).rows,
          ).toHaveLength(0)
      }
    }
    await asUser(dm)
    await expect(db.query('update public.character_resources set gold=999')).rejects.toThrow(
      /permission denied/,
    )
    await expect(db.query("update public.characters set name='Bad'")).rejects.toThrow(
      /permission denied/,
    )
    await asUser(outsider)
    await expect(
      db.query('select public.invite_campaign_member($1,$2)', [c, 'x@example.com']),
    ).rejects.toThrow(/Forbidden|42501/)
    await asUser(dm)
    await db.exec('reset role; set role anon')
    await expect(edit(c, ch)).rejects.toThrow(/permission denied/)
    await expect(invite(c, ch)).rejects.toThrow(/permission denied/)
    await expect(db.query("select public.create_character($1,'Bad')", [c])).rejects.toThrow(
      /permission denied/,
    )
    for (const table of ['characters', 'character_resources', 'character_events'])
      await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/)
  })
  it('enforces one-to-one, campaign scope, verified email and all invitation terminal states', async () => {
    const { c, ch } = await setup()
    const other = await setup()
    await expect(invite(c, other.ch)).rejects.toThrow(/unavailable/)
    let id = await invite(c, ch)
    await asUser(outsider)
    await expect(
      db.query('select public.respond_campaign_invitation($1,true)', [id]),
    ).rejects.toThrow(/unavailable/)
    await asUser(dm)
    const current = await invite(c, ch)
    await asUser(player)
    await expect(
      db.query('select public.respond_campaign_invitation($1,true)', [id]),
    ).rejects.toThrow(/unavailable/)
    await db.query('select public.respond_campaign_invitation($1,false)', [current])
    await expect(
      db.query('select public.respond_campaign_invitation($1,true)', [current]),
    ).rejects.toThrow(/unavailable/)
    await asUser(dm)
    id = await invite(c, ch)
    await db.query('select public.revoke_campaign_invitation($1)', [id])
    await asUser(player)
    await expect(
      db.query('select public.respond_campaign_invitation($1,true)', [id]),
    ).rejects.toThrow(/unavailable/)
    await asUser(dm)
    id = await invite(c, ch)
    await db.exec('reset role')
    await db.query(
      "update public.campaign_invitations set created_at=now()-interval '8 days', expires_at=now()-interval '1 day' where id=$1",
      [id],
    )
    await asUser(player)
    await expect(
      db.query('select public.respond_campaign_invitation($1,true)', [id]),
    ).rejects.toThrow(/unavailable/)
    await asUser(dm)
    id = await invite(c, ch)
    await asUser(player)
    await db.query('select public.respond_campaign_invitation($1,true)', [id])
    await asUser(dm)
    const second = await scalar("select public.create_character($1,'Second') result", [c])
    await expect(invite(c, second)).rejects.toThrow(/Already assigned/)
    await expect(invite(c, ch, 'other@example.com')).rejects.toThrow(/unavailable/)
    await db.exec('reset role')
    await expect(
      db.query('update public.characters set user_id=$1 where id=$2', [player, second]),
    ).rejects.toThrow(/unique/)
    await expect(
      db.query('update public.characters set user_id=$1 where id=$2', [player, other.ch]),
    ).rejects.toThrow(/foreign key/)
  })
  it('unlinks characters on revoke while preserving resources; membership invite joins without a character', async () => {
    const { c, ch } = await setup()
    await edit(c, ch)
    const id = await invite(c, ch)
    await asUser(player)
    await db.query('select public.respond_campaign_invitation($1,true)', [id])
    await asUser(dm)
    await db.query('select public.change_campaign_member($1,$2,null)', [c, player])
    await asUser(player)
    expect((await db.query('select * from public.characters where id=$1', [ch])).rows).toHaveLength(
      0,
    )
    await asUser(dm)
    expect(
      (
        await db.query(
          'select ch.user_id, r.gold from public.characters ch join public.character_resources r on r.character_id=ch.id where ch.id=$1',
          [ch],
        )
      ).rows,
    ).toEqual([{ user_id: null, gold: 20 }])
    const membership = await scalar('select public.invite_campaign_member($1,$2) result', [
      c,
      'player@example.com',
    ])
    await asUser(player)
    await db.query('select public.respond_campaign_invitation($1,true)', [membership])
    await asUser(dm)
    expect(
      (await db.query('select user_id from public.characters where id=$1', [ch])).rows,
    ).toEqual([{ user_id: null }])
    await db.query('select public.assign_character($1,$2,$3)', [c, ch, player])
    await db.query('select public.change_campaign_member($1,$2,null)', [c, player])
    const next = await invite(c, ch, 'other@example.com')
    await asUser(outsider)
    await db.query('select public.respond_campaign_invitation($1,true)', [next])
    await asUser(dm)
    expect(
      (
        await db.query(
          'select gold,revision from public.character_resources where character_id=$1',
          [ch],
        )
      ).rows,
    ).toEqual([{ gold: 20, revision: 1 }])
  })
  it('audits edits, rejects stale/unsafe/negative writes and deduplicates exact retries', async () => {
    const { c, ch } = await setup()
    const key = randomUUID()
    await edit(c, ch, 0, 20, key)
    await edit(c, ch, 0, 20, key)
    await expect(edit(c, ch, 0, 21, key)).rejects.toThrow(/Request mismatch/)
    await expect(edit(c, ch, 0)).rejects.toThrow(/Stale revision/)
    for (const value of [-1, 9007199254740992])
      await expect(edit(c, ch, 1, value)).rejects.toThrow(/check constraint/)
    for (const column of ['new_water', 'new_rations', 'new_exhaustion']) {
      const args = { new_water: 3, new_rations: 4, new_exhaustion: 12, [column]: -1 }
      await expect(
        db.query('select public.set_character_resources($1,$2,1,20,$3,$4,$5,$6)', [
          c,
          ch,
          args.new_water,
          args.new_rations,
          args.new_exhaustion,
          randomUUID(),
        ]),
      ).rejects.toThrow(/check constraint/)
    }
    expect(
      (await db.query('select * from public.character_events where character_id=$1', [ch])).rows,
    ).toHaveLength(3)
    expect(
      (
        await db.query('select revision from public.character_resources where character_id=$1', [
          ch,
        ])
      ).rows,
    ).toEqual([{ revision: 1 }])
  })
  it('DM links only unassigned characters to active Players in the same campaign, with audit', async () => {
    const { c, ch } = await setup()
    await db.exec('reset role')
    await db.query(
      "insert into public.campaign_members(campaign_id,user_id,role) values ($1,$2,'player')",
      [c, player],
    )
    for (const actor of [player, outsider]) {
      await asUser(actor)
      await expect(
        db.query('select public.assign_character($1,$2,$3)', [c, ch, player]),
      ).rejects.toThrow(/Forbidden/)
    }
    await db.exec('reset role; set role anon')
    await expect(
      db.query('select public.assign_character($1,$2,$3)', [c, ch, player]),
    ).rejects.toThrow(/permission denied/)
    await asUser(dm)
    await expect(
      db.query('select public.assign_character($1,$2,$3)', [c, ch, outsider]),
    ).rejects.toThrow(/Player unavailable/)
    await expect(db.query('select public.assign_character($1,$2,$3)', [c, ch, dm])).rejects.toThrow(
      /Player unavailable/,
    )
    await db.query('select public.assign_character($1,$2,$3)', [c, ch, player])
    await expect(
      db.query('select public.assign_character($1,$2,$3)', [c, ch, player]),
    ).rejects.toThrow(/Already assigned/)
    expect(
      (await db.query('select user_id from public.characters where id=$1', [ch])).rows,
    ).toEqual([{ user_id: player }])
    expect(
      (await db.query('select * from public.character_events where character_id=$1', [ch])).rows,
    ).toHaveLength(3)
    await db.query('select public.unassign_character($1,$2,$3)', [c, ch, player])
    const other = await setup()
    await expect(
      db.query('select public.assign_character($1,$2,$3)', [c, other.ch, player]),
    ).rejects.toThrow(/Character unavailable/)
  })
  it('enforces DM authority for module toggles and revelations queue across all actors', async () => {
    const { c } = await setup()
    await db.exec('reset role')
    await db.query(
      "insert into public.campaign_members(campaign_id,user_id,role) values ($1,$2,'player')",
      [c, player],
    )
    await asUser(dm)
    const revId = await scalar(
      "select public.create_campaign_revelation($1, 'El Yunque Roto', 'shop', 'Herrería enana', 'dm_only') result",
      [c],
    )
    await db.query("select public.set_campaign_modules($1, array['party', 'shops'])", [c])
    expect(
      (
        await db.query(
          'select player_modules from public.list_my_campaigns_with_modules() where id=$1',
          [c],
        )
      ).rows,
    ).toEqual([{ player_modules: ['party', 'shops'] }])
    await asUser(player)
    expect(
      (await db.query('select * from public.campaign_revelations where campaign_id=$1', [c])).rows,
    ).toHaveLength(0)
    for (const actor of [player, outsider]) {
      await asUser(actor)
      if (actor === outsider) await scalar("select public.create_campaign('Other') result")
      await expect(
        db.query("select public.set_campaign_modules($1, array['party'])", [c]),
      ).rejects.toThrow(/Forbidden/)
      await expect(
        db.query(
          "select public.create_campaign_revelation($1, 'Secret', 'quest', 'Note', 'dm_only')",
          [c],
        ),
      ).rejects.toThrow(/Forbidden/)
      await expect(
        db.query("select public.set_revelation_visibility($1, $2, 'party')", [c, revId]),
      ).rejects.toThrow(/Forbidden/)
    }
    await db.exec('reset role; set role anon')
    await expect(
      db.query("select public.set_campaign_modules($1, array['party'])", [c]),
    ).rejects.toThrow(/permission denied/)
    await expect(db.query('select * from public.campaign_revelations')).rejects.toThrow(
      /permission denied/,
    )
    await asUser(dm)
    await db.query("select public.set_revelation_visibility($1, $2, 'party')", [c, revId])
    await asUser(player)
    expect(
      (
        await db.query('select title, visibility from public.campaign_revelations where id=$1', [
          revId,
        ])
      ).rows,
    ).toEqual([{ title: 'El Yunque Roto', visibility: 'party' }])
    await asUser(outsider)
    expect(
      (await db.query('select * from public.campaign_revelations where id=$1', [revId])).rows,
    ).toHaveLength(0)
  })
})
