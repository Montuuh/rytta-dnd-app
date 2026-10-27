import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const db = new PGlite()
const dm = '10000000-0000-4000-8000-000000000001'
const player = '10000000-0000-4000-8000-000000000002'
const outsider = '10000000-0000-4000-8000-000000000003'
const character = '20000000-0000-4000-8000-000000000001'
let campaign: string

async function asUser(id: string) {
  await db.exec('reset role; set role authenticated;')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
}

beforeAll(async () => {
  // Auth shim only. Real PostgreSQL runs the migration, policies and grants.
  await db.exec(`create role anon; create role authenticated;
    create schema auth; create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users values ('${dm}'), ('${player}'), ('${outsider}');`)
  await db.exec(readFileSync('supabase/migrations/20261027225922_foundation.sql', 'utf8'))
  await db.exec(readFileSync('supabase/migrations/20261027225926_membership.sql', 'utf8'))
  await asUser(dm)
  campaign = (
    await db.query<{ id: string }>("select public.create_campaign('Test campaign') as id")
  ).rows[0]!.id
  await db.exec('reset role')
  await db.query(
    "insert into public.campaign_members(campaign_id, user_id, role) values ($1, $2, 'player')",
    [campaign, player],
  )
  await asUser(dm)
  await db.query(
    'insert into public.characters(id, campaign_id, user_id, name) values ($1, $2, $3, $4)',
    [character, campaign, player, 'Arin'],
  )
  await db.query(
    'insert into public.character_resources(character_id, campaign_id, copper) values ($1, $2, 100)',
    [character, campaign],
  )
}, 30_000)
afterAll(async () => {
  await db.close()
})

describe('campaign isolation and resource authority', () => {
  it('atomically creates a campaign with its DM membership', async () => {
    await asUser(dm)
    expect((await db.query('select * from public.campaigns')).rows).toHaveLength(1)
    expect(
      (await db.query("select * from public.campaign_members where role = 'dm'")).rows,
    ).toHaveLength(1)
  })
  it('rejects anonymous reads and campaign creation', async () => {
    await db.exec('reset role; set role anon')
    await expect(db.query('select * from public.campaigns')).rejects.toThrow(/permission denied/)
    await expect(db.query("select public.create_campaign('Forbidden')")).rejects.toThrow(
      /permission denied/,
    )
  })
  it('hides campaign, membership, character and resources from an outsider', async () => {
    await asUser(outsider)
    for (const table of ['campaigns', 'campaign_members', 'characters', 'character_resources']) {
      expect((await db.query(`select * from public.${table}`)).rows).toHaveLength(0)
    }
  })
  it('lets the player read their resources but not change them', async () => {
    await asUser(player)
    expect((await db.query('select copper from public.character_resources')).rows).toEqual([
      { copper: 100 },
    ])
    expect(
      (await db.query('update public.character_resources set copper = 999 returning *')).rows,
    ).toHaveLength(0)
    expect((await db.query('select copper from public.character_resources')).rows).toEqual([
      { copper: 100 },
    ])
    await expect(
      db.query(
        'insert into public.character_resources(character_id, campaign_id) values ($1, $2)',
        [character, campaign],
      ),
    ).rejects.toThrow(/row-level security/)
  })
  it('prevents player role escalation and campaign ownership changes', async () => {
    await asUser(player)
    await expect(db.query("update public.campaign_members set role = 'dm'")).rejects.toThrow(
      /permission denied/,
    )
    await expect(db.query('update public.campaigns set owner_id = $1', [player])).rejects.toThrow(
      /permission denied/,
    )
    await expect(
      db.query("insert into public.campaign_members values ($1, $2, 'dm', now())", [
        campaign,
        outsider,
      ]),
    ).rejects.toThrow(/permission denied/)
  })
  it('allows DM edits while enforcing nonnegative resources', async () => {
    await asUser(dm)
    expect(
      (await db.query('update public.character_resources set copper = 50 returning copper')).rows,
    ).toEqual([{ copper: 50 }])
    await expect(db.query('update public.character_resources set copper = -1')).rejects.toThrow(
      /check constraint/,
    )
  })
  it('prevents assigning a character to a non-member', async () => {
    await asUser(dm)
    await expect(db.query('update public.characters set user_id = $1', [outsider])).rejects.toThrow(
      /foreign key/,
    )
  })
  it('prevents a DM from moving resources into another campaign', async () => {
    await asUser(outsider)
    const other = (
      await db.query<{ id: string }>("select public.create_campaign('Other table') as id")
    ).rows[0]!.id
    await asUser(dm)
    await expect(
      db.query('update public.character_resources set campaign_id = $1', [other]),
    ).rejects.toThrow(/row-level security/)
  })
  it('rolls back invalid bootstrap input without orphan campaigns', async () => {
    await asUser(dm)
    await expect(db.query("select public.create_campaign('   ')")).rejects.toThrow(
      /check constraint/,
    )
    expect((await db.query('select * from public.campaigns')).rows).toHaveLength(1)
  })
  it('hides another member character and resources within the same campaign', async () => {
    await asUser(dm)
    const second = (
      await db.query<{ id: string }>(
        'insert into public.characters(campaign_id, user_id, name) values ($1, $2, $3) returning id',
        [campaign, dm, 'Hidden companion'],
      )
    ).rows[0]!.id
    await db.query(
      'insert into public.character_resources(character_id, campaign_id, copper) values ($1, $2, 900)',
      [second, campaign],
    )
    await asUser(player)
    expect((await db.query('select name from public.characters')).rows).toEqual([{ name: 'Arin' }])
    expect((await db.query('select copper from public.character_resources')).rows).toEqual([
      { copper: 50 },
    ])
    expect(
      (await db.query('delete from public.character_resources returning *')).rows,
    ).toHaveLength(0)
    expect(
      (await db.query("update public.characters set name = 'Spoofed' returning *")).rows,
    ).toHaveLength(0)
    expect(
      (await db.query("update public.campaigns set name = 'Spoofed' returning *")).rows,
    ).toHaveLength(0)
  })
})
