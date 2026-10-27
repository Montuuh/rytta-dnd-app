import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
const db = new PGlite()
const dm = '10000000-0000-4000-8000-000000000001'
const player = '10000000-0000-4000-8000-000000000002'
const outsider = '10000000-0000-4000-8000-000000000003'
const unverified = '10000000-0000-4000-8000-000000000004'
async function asUser(id: string) {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
}
async function create() {
  await asUser(dm)
  return (await db.query<{ id: string }>("select public.create_campaign('A table') id")).rows[0]!.id
}
async function invite(campaign: string, email = 'player@example.com') {
  return (
    await db.query<{ id: string }>('select public.invite_campaign_member($1, $2) id', [
      campaign,
      email,
    ])
  ).rows[0]!.id
}
async function accept(id: string, user = player) {
  await asUser(user)
  await db.query('select public.respond_campaign_invitation($1, true)', [id])
}
beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
    insert into auth.users values ('${dm}', 'dm@example.com', now(), '{"full_name":"First DM"}'),
    ('${player}', 'player@example.com', now(), '{}'), ('${outsider}', 'other@example.com', now(), '{}'),
    ('${unverified}', 'notverified@example.com', null, '{"email":"player@example.com"}');`)
  for (const file of ['20261027225922_foundation.sql', '20261027225926_membership.sql'])
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
}, 30000)
afterAll(async () => {
  await db.close()
})
describe('campaign membership authority', () => {
  it('rejects invalid role/email input, outsider revocation and direct invitation/member writes', async () => {
    const c = await create()
    const id = await invite(c)
    await expect(
      db.query("select public.invite_campaign_member($1, 'not-an-email')", [c]),
    ).rejects.toThrow(/check constraint/)
    await expect(
      db.query("select public.change_campaign_member($1, $2, 'admin')", [c, dm]),
    ).rejects.toThrow(/Invalid role/)
    await expect(
      db.query('update public.campaigns set owner_id = $1 where id = $2', [player, c]),
    ).rejects.toThrow(/permission denied/)
    for (const actor of [player, outsider]) {
      await asUser(actor)
      await expect(db.query('select public.revoke_campaign_invitation($1)', [id])).rejects.toThrow(
        /Forbidden/,
      )
      await expect(
        db.query('select public.change_campaign_member($1, $2, null)', [c, dm]),
      ).rejects.toThrow(/Forbidden/)
      await expect(
        db.query("update public.campaign_invitations set status = 'accepted' where id = $1", [id]),
      ).rejects.toThrow(/permission denied/)
      await expect(db.query('update public.campaign_members set active = true')).rejects.toThrow(
        /permission denied/,
      )
    }
    await accept(id)
    await db.query('select public.change_campaign_member($1, $2, null)', [c, player])
    expect(
      (await db.query('select * from public.list_my_campaigns() where id = $1', [c])).rows,
    ).toHaveLength(0)
  })
  it('denies anonymous access to every new table and RPC', async () => {
    await db.exec('reset role; set role anon')
    for (const sql of [
      'select * from public.campaign_invitations',
      'select public.list_my_campaigns()',
      'select public.list_my_invitations()',
      `select public.list_campaign_members('${dm}')`,
      `select public.invite_campaign_member('${dm}', 'a@example.com')`,
      `select public.respond_campaign_invitation('${dm}', true)`,
      `select public.revoke_campaign_invitation('${dm}')`,
      `select public.change_campaign_member('${dm}', '${player}', 'dm')`,
    ])
      await expect(db.query(sql)).rejects.toThrow(/permission denied/)
  })
  it('invites an address before account creation; only the verified recipient can see and accept', async () => {
    const c = await create()
    const id = await invite(c, ' FUTURE@example.com ')
    await asUser(outsider)
    expect((await db.query('select * from public.list_my_invitations()')).rows).toHaveLength(0)
    await expect(
      db.query('select public.respond_campaign_invitation($1, true)', [id]),
    ).rejects.toThrow(/Invitation unavailable/)
    await db.exec('reset role')
    const future = '10000000-0000-4000-8000-000000000005'
    await db.query('insert into auth.users values ($1, $2, now(), $3)', [
      future,
      'future@example.com',
      '{}',
    ])
    await asUser(future)
    expect((await db.query('select campaign_name from public.list_my_invitations()')).rows).toEqual(
      [{ campaign_name: 'A table' }],
    )
    expect((await db.query('select * from public.campaigns where id = $1', [c])).rows).toHaveLength(
      0,
    )
    await accept(id, future)
    expect(
      (await db.query('select role from public.list_my_campaigns() where id = $1', [c])).rows,
    ).toEqual([{ role: 'player' }])
    await expect(
      db.query('select public.respond_campaign_invitation($1, true)', [id]),
    ).rejects.toThrow(/Invitation unavailable/)
  })
  it('rejects unverified emails and user metadata impersonation', async () => {
    const c = await create()
    const id = await invite(c, 'notverified@example.com')
    await asUser(unverified)
    expect((await db.query('select * from public.list_my_invitations()')).rows).toHaveLength(0)
    await expect(
      db.query('select public.respond_campaign_invitation($1, true)', [id]),
    ).rejects.toThrow(/Invitation unavailable/)
  })
  it('denies player and cross-campaign DM management and direct table mutation', async () => {
    const c = await create()
    await accept(await invite(c))
    for (const actor of [player, outsider]) {
      await asUser(actor)
      if (actor === outsider) await db.query("select public.create_campaign('Other')")
      for (const sql of [
        `select public.invite_campaign_member('${c}', 'someone@example.com')`,
        `select public.list_campaign_members('${c}')`,
        `select public.change_campaign_member('${c}', '${player}', 'dm')`,
      ])
        await expect(db.query(sql)).rejects.toThrow(/Forbidden/)
      await expect(db.query("update public.campaign_members set role = 'dm'")).rejects.toThrow(
        /permission denied/,
      )
      await expect(db.query('delete from public.campaign_invitations')).rejects.toThrow(
        /permission denied/,
      )
      await expect(
        db.query(
          "insert into public.campaign_invitations(campaign_id, email, created_by) values ($1, 'x@example.com', $2)",
          [c, actor],
        ),
      ).rejects.toThrow(/permission denied/)
    }
  })
  it('reissue, decline, expiry and cancellation cannot be replayed', async () => {
    const c = await create()
    const old = await invite(c)
    const current = await invite(c)
    await asUser(player)
    await expect(
      db.query('select public.respond_campaign_invitation($1, true)', [old]),
    ).rejects.toThrow(/Invitation unavailable/)
    await db.query('select public.respond_campaign_invitation($1, false)', [current])
    await expect(
      db.query('select public.respond_campaign_invitation($1, true)', [current]),
    ).rejects.toThrow(/Invitation unavailable/)
    await asUser(dm)
    const expired = await invite(c)
    await db.exec('reset role')
    await db.query(
      "update public.campaign_invitations set created_at = now() - interval '8 days', expires_at = now() - interval '1 day' where id = $1",
      [expired],
    )
    await asUser(player)
    await expect(
      db.query('select public.respond_campaign_invitation($1, true)', [expired]),
    ).rejects.toThrow(/Invitation unavailable/)
    await asUser(dm)
    const revoked = await invite(c)
    await db.query('select public.revoke_campaign_invitation($1)', [revoked])
    await asUser(player)
    await expect(
      db.query('select public.respond_campaign_invitation($1, true)', [revoked]),
    ).rejects.toThrow(/Invitation unavailable/)
  })
  it('protects the last DM and permits handover without permanent creator privileges', async () => {
    const c = await create()
    await accept(await invite(c))
    await asUser(dm)
    for (const role of [null, 'player'])
      await expect(
        db.query('select public.change_campaign_member($1, $2, $3)', [c, dm, role]),
      ).rejects.toThrow(/Keep at least one DM/)
    await db.query("select public.change_campaign_member($1, $2, 'dm')", [c, player])
    await db.query("select public.change_campaign_member($1, $2, 'player')", [c, dm])
    await expect(
      db.query("select public.change_campaign_member($1, $2, 'dm')", [c, dm]),
    ).rejects.toThrow(/Forbidden/)
    await db.query('select public.change_campaign_member($1, $2, null)', [c, dm])
    expect(
      (await db.query('select * from public.list_my_campaigns() where id = $1', [c])).rows,
    ).toHaveLength(0)
    await asUser(player)
    expect(
      (await db.query('select owner_id from public.campaigns where id = $1', [c])).rows[0],
    ).toEqual({ owner_id: dm })
    await expect(
      db.query('select public.change_campaign_member($1, $2, null)', [c, player]),
    ).rejects.toThrow(/Keep at least one DM/)
  })
  it('revokes access without deleting characters, then reactivates as Player', async () => {
    const c = await create()
    await accept(await invite(c))
    await asUser(dm)
    const character = (
      await db.query<{ id: string }>(
        "insert into public.characters(campaign_id, user_id, name) values ($1, $2, 'Arin') returning id",
        [c, player],
      )
    ).rows[0]!.id
    await db.query(
      'insert into public.character_resources(character_id, campaign_id, copper) values ($1, $2, 50)',
      [character, c],
    )
    await db.query('select public.change_campaign_member($1, $2, null)', [c, player])
    await asUser(player)
    for (const table of [
      'campaigns',
      'campaign_members',
      'characters',
      'character_resources',
      'campaign_invitations',
    ])
      expect(
        (
          await db.query(
            `select * from public.${table} where campaign_id = $1`.replace(
              'public.campaigns where campaign_id',
              'public.campaigns where id',
            ),
            [c],
          )
        ).rows,
      ).toHaveLength(0)
    await asUser(dm)
    expect(
      (
        await db.query('select copper from public.character_resources where character_id = $1', [
          character,
        ])
      ).rows,
    ).toEqual([{ copper: 50 }])
    await accept(await invite(c))
    expect(
      (await db.query('select role from public.list_my_campaigns() where id = $1', [c])).rows,
    ).toEqual([{ role: 'player' }])
  })
  it('does not mix role or membership across two campaigns', async () => {
    const c = await create()
    await accept(await invite(c))
    await asUser(player)
    const own = (await db.query<{ id: string }>("select public.create_campaign('Own table') id"))
      .rows[0]!.id
    const rows = (
      await db.query<{ id: string; role: string }>(
        'select id, role from public.list_my_campaigns() where id in ($1, $2)',
        [c, own],
      )
    ).rows
    expect(rows).toEqual(
      expect.arrayContaining([
        { id: c, role: 'player' },
        { id: own, role: 'dm' },
      ]),
    )
    await expect(
      db.query("select public.change_campaign_member($1, $2, 'dm')", [c, player]),
    ).rejects.toThrow(/Forbidden/)
  })
})
