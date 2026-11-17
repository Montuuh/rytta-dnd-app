import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-120: a Player whose character is absent can leave the campaign; the character returns to
// the DM pool, still absent, with its history. The sibling release paths keep working.
const migration = '20261129120000_absent_character_leave.sql'
const db = new PGlite()
type Json = Record<string, unknown>
const schemas = ['public', 'pre'] as const

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

function api(schema: string) {
  return {
    campaign: async (by: string, name: string) => {
      await asUser(by)
      return scalar(`select ${schema}.create_campaign($1) result`, [name])
    },
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
    absent: async (c: string, dm: string, ch: string, on = true) => {
      await asUser(dm)
      await db.query(`select ${schema}.set_character_absent($1,$2,$3)`, [c, ch, on])
    },
    change: (c: string, target: string, role: string | null) =>
      db.query(`select ${schema}.change_campaign_member($1,$2,$3)`, [c, target, role]),
    character: async (ch: string) => {
      await asSystem()
      return (
        await db.query<{
          user_id: string | null
          is_active: boolean
          absent: boolean
          archived_at: string | null
          ever_assigned: boolean
        }>(
          `select user_id, is_active, absent, archived_at, ever_assigned from ${schema}.characters where id=$1`,
          [ch],
        )
      ).rows[0]!
    },
    member: async (c: string, who: string) => {
      await asSystem()
      return (
        await db.query<{ active: boolean }>(
          `select active from ${schema}.campaign_members where campaign_id=$1 and user_id=$2`,
          [c, who],
        )
      ).rows[0]
    },
    releaseEvent: async (ch: string) => {
      await asSystem()
      return (
        await db.query<{ actor_id: string | null; before_user: string | null }>(
          `select actor_id, before_value->>'user_id' before_user from ${schema}.character_events
            where character_id=$1 and kind='characters:UPDATE' and after_value->'user_id' = 'null'::jsonb
            order by created_at desc limit 1`,
          [ch],
        )
      ).rows[0]
    },
    sheets: async (ch: string) => {
      await asSystem()
      return Number(
        await scalar(
          `select count(*) result from ${schema}.character_sheets where character_id=$1`,
          [ch],
        ),
      )
    },
  }
}

// One campaign: a DM, a Player with an absent character and a second Player.
async function table(schema: string) {
  const s = api(schema)
  const dm = await user('dm'),
    player = await user('player'),
    peer = await user('peer')
  const c = await s.campaign(dm, 'Absent table')
  await s.join(c, dm, player)
  await s.join(c, dm, peer)
  const arin = await s.own(c, player, 'Arin')
  await s.own(c, peer, 'Bea')
  await s.absent(c, dm, arin)
  return { s, c, dm, player, peer, arin }
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

describe('leaving with an absent character', () => {
  it.each(schemas)(
    '%s: the Player leaves and the character returns to the pool, still absent',
    async (schema) => {
      const { s, c, dm, player, arin } = await table(schema)
      await asUser(player)
      await s.change(c, player, null)
      expect(await s.member(c, player)).toEqual({ active: false })
      expect(await s.character(arin)).toEqual({
        user_id: null,
        is_active: false,
        absent: true,
        archived_at: null,
        ever_assigned: true,
      })
      // History: the release is audited with the Player as actor and the sheet stays.
      expect(await s.releaseEvent(arin)).toEqual({ actor_id: player, before_user: player })
      expect(await s.sheets(arin)).toBe(1)
      // The DM marks it present later: it becomes an active pool character.
      await s.absent(c, dm, arin, false)
      expect(await s.character(arin)).toMatchObject({
        user_id: null,
        is_active: true,
        absent: false,
      })
    },
  )

  it.each(schemas)(
    '%s: a benched Player with absent and reserve characters leaves; present behaviour unchanged',
    async (schema) => {
      const s = api(schema)
      const dm = await user('dm'),
        player = await user('player')
      const c = await s.campaign(dm, 'Bench')
      await s.join(c, dm, player)
      const gone = await s.own(c, player, 'Gone')
      const spare = await s.own(c, player, 'Spare')
      await s.absent(c, dm, gone)
      expect(await s.character(spare)).toMatchObject({ is_active: false, absent: false })
      await asUser(player)
      await s.change(c, player, null)
      expect(await s.character(gone)).toMatchObject({
        user_id: null,
        is_active: false,
        absent: true,
      })
      expect(await s.character(spare)).toMatchObject({
        user_id: null,
        is_active: true,
        absent: false,
      })

      // A Player without absent characters leaves exactly as before.
      const other = await user('other')
      await s.join(c, dm, other)
      const present = await s.own(c, other, 'Present')
      await asUser(other)
      await s.change(c, other, null)
      expect(await s.character(present)).toMatchObject({
        user_id: null,
        is_active: true,
        absent: false,
      })
    },
  )

  it.each(schemas)('%s: the DM removes a member whose character is absent', async (schema) => {
    const { s, c, dm, player, arin } = await table(schema)
    await asUser(dm)
    await s.change(c, player, null)
    expect(await s.character(arin)).toMatchObject({ user_id: null, is_active: false, absent: true })
    expect(await s.releaseEvent(arin)).toEqual({ actor_id: dm, before_user: player })
  })

  it.each(schemas)(
    '%s: account deletion releases an absent character in a shared campaign',
    async (schema) => {
      const { s, c, player, arin } = await table(schema)
      const key = randomUUID()
      await asUser(player)
      await db.query(`select ${schema}.prepare_account_deletion($1)`, [key])
      const outcome = await scalar<Json>(`select ${schema}.delete_my_account('DELETE',$1) result`, [
        key,
      ])
      expect(outcome).toMatchObject({ data_deleted: true })
      expect(await s.member(c, player)).toBeUndefined()
      expect(await s.character(arin)).toMatchObject({
        user_id: null,
        is_active: false,
        absent: true,
      })
    },
  )
})

describe('denials and absence rules are unchanged', () => {
  it.each(schemas)(
    '%s: anon, outsider, another Player and a cross-campaign DM cannot remove the member',
    async (schema) => {
      const { s, c, player, peer, arin } = await table(schema)
      const outsider = await user('outsider')
      const otherDm = await user('otherdm')
      await s.campaign(otherDm, 'Elsewhere')
      await asAnon()
      await expect(s.change(c, player, null)).rejects.toThrow(/permission denied/)
      for (const actor of [outsider, peer, otherDm]) {
        await asUser(actor)
        await expect(s.change(c, player, null)).rejects.toThrow(/Forbidden/)
        await expect(s.change(c, player, 'dm')).rejects.toThrow(/Forbidden/)
      }
      // A Player cannot promote themselves either.
      await asUser(player)
      await expect(s.change(c, player, 'dm')).rejects.toThrow(/Forbidden/)
      expect(await s.member(c, player)).toEqual({ active: true })
      expect(await s.character(arin)).toMatchObject({ user_id: player, absent: true })
    },
  )

  it.each(schemas)(
    '%s: the Player still cannot activate or archive an absent character; the DM cannot archive it',
    async (schema) => {
      const { s, c, dm, player, arin } = await table(schema)
      await asUser(player)
      await expect(
        db.query(`select ${schema}.set_active_character($1,$2)`, [c, arin]),
      ).rejects.toThrow(/Character absent/)
      await expect(
        db.query(`select ${schema}.archive_character($1,$2)`, [c, arin]),
      ).rejects.toThrow(/Character absent/)
      await asUser(dm)
      await expect(
        db.query(`select ${schema}.archive_character($1,$2)`, [c, arin]),
      ).rejects.toThrow(/Character absent/)
      expect(await s.character(arin)).toMatchObject({
        user_id: player,
        absent: true,
        archived_at: null,
      })
    },
  )

  it.each(schemas)(
    '%s: a released absent character is not claimable; the DM can still assign it',
    async (schema) => {
      const { s, c, dm, player, peer, arin } = await table(schema)
      await asUser(player)
      await s.change(c, player, null)
      await asUser(peer)
      await expect(db.query(`select ${schema}.claim_character($1,$2)`, [c, arin])).rejects.toThrow(
        /Character unavailable/,
      )
      await asUser(dm)
      await db.query(`select ${schema}.assign_character($1,$2,$3)`, [c, arin, peer])
      expect(await s.character(arin)).toMatchObject({
        user_id: peer,
        is_active: false,
        absent: true,
      })
    },
  )
})
