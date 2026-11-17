import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-113 follow-up: stored-byte quotas, cleanup of replaced images, non-archived character
// counts, campaign-wide seat lock, per-recipient invitation cap and masked combat results.
const migration = '20261124120000_quota_bytes_invitation_caps_combat_mask.sql'
const db = new PGlite()
const dm = randomUUID(),
  player = randomUUID(),
  peer = randomUUID(),
  outsider = randomUUID(),
  otherDm = randomUUID(),
  coDm = randomUUID(),
  invitee = randomUUID()
const emails: Record<string, string> = {
  [dm]: 'dm@example.com',
  [player]: 'player@example.com',
  [peer]: 'peer@example.com',
  [outsider]: 'outsider@example.com',
  [otherDm]: 'otherdm@example.com',
  [coDm]: 'codm@example.com',
  [invitee]: 'invitee@example.com',
}
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
type Json = Record<string, unknown>
const scalar = async <T = string>(sql: string, args: unknown[] = []) =>
  (await db.query<{ result: T }>(sql, args)).rows[0]!.result
const rows = async (sql: string, args: unknown[] = []) => (await db.query<Json>(sql, args)).rows
const quota = async (name: string, value: number, helper = 'private') => {
  await asSystem()
  await db.query(`update ${helper}.quota_limits set max_count = $2 where quota = $1`, [name, value])
}
const json = (value: unknown) => JSON.stringify(value)
const MB = 1048576

/** A campaign of `owner` with `player` holding character Arin. */
async function campaign(owner = dm, schema = 'public', name = 'Keep') {
  await asUser(owner)
  const c = await scalar(`select ${schema}.create_campaign($1) result`, [name])
  const arin = await scalar(`select ${schema}.create_character($1,'Arin') result`, [c])
  const invite = await scalar(`select ${schema}.invite_character_player($1,$2,$3) result`, [
    c,
    arin,
    emails[player],
  ])
  await asUser(player)
  await db.query(`select ${schema}.respond_campaign_invitation($1,true)`, [invite])
  return { c, arin }
}
const upload = (bucket: string, name: string, size?: unknown) =>
  db.query('insert into storage.objects(bucket_id, name, metadata) values ($1, $2, $3)', [
    bucket,
    name,
    size === undefined ? null : json({ size }),
  ])
/** Storage writes metadata after the policy check; the test sets it as the service would. */
const stored = async (bucket: string, name: string, size: unknown) => {
  await upload(bucket, name)
  const sub = await scalar("select current_setting('request.jwt.claim.sub', true) result")
  await asSystem()
  await db.query('update storage.objects set metadata = $3 where bucket_id = $1 and name = $2', [
    bucket,
    name,
    json({ size }),
  ])
  if (sub) await asUser(sub)
}
const objectCount = async (bucket: string, name: string) => {
  await asSystem()
  return Number(
    await scalar('select count(*) result from storage.objects where bucket_id=$1 and name=$2', [
      bucket,
      name,
    ]),
  )
}

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;
    create publication supabase_realtime;`)
  for (const [id, email] of Object.entries(emails))
    await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,now())', [
      id,
      email,
    ])
  await db.exec(`create schema storage;
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
  // A bucket that lost its size limit gets the default back; a PRE copied before this file
  // receives the remapped DDL.
  await db.exec("update storage.buckets set file_size_limit = null where id = 'shop-images'")
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

describe('stored-byte quotas', () => {
  const media = (c: string, kind = 'map', env = 'public') =>
    `${env}/${c}/${kind}/${randomUUID()}.webp`

  it('keeps a size limit on all five app buckets', async () => {
    await asSystem()
    expect(await rows('select id, file_size_limit from storage.buckets order by id')).toEqual([
      { id: 'character-portraits', file_size_limit: 1048576 },
      { id: 'creature-images', file_size_limit: 1048576 },
      { id: 'item-images', file_size_limit: 1048576 },
      { id: 'shop-images', file_size_limit: 1048576 },
      { id: 'tabletop-media', file_size_limit: 20971520 },
    ])
    expect(
      await rows(
        "select quota, max_count from private.quota_limits where quota in ('media_mb_per_campaign','media_mb_per_owner','pending_invitations_per_recipient') order by 1",
      ),
    ).toEqual([
      { quota: 'media_mb_per_campaign', max_count: 500 },
      { quota: 'media_mb_per_owner', max_count: 2048 },
      { quota: 'pending_invitations_per_recipient', max_count: 20 },
    ])
  })

  it('caps the bytes a campaign already stores; deleting frees room; the object cap still holds', async () => {
    const { c } = await campaign(dm, 'public', 'Bytes')
    await quota('media_mb_per_campaign', 1)
    await asUser(dm)
    await stored('tabletop-media', media(c), Math.round(0.6 * MB))
    const big = media(c)
    await stored('tabletop-media', big, Math.round(0.6 * MB))
    // 1.2 MB stored: the next upload is refused before its own size is known.
    await expect(upload('tabletop-media', media(c))).rejects.toThrow(/row-level security/)
    await db.query("delete from storage.objects where bucket_id='tabletop-media' and name=$1", [
      big,
    ])
    await upload('tabletop-media', media(c))
    // Missing or malformed sizes count as zero.
    await stored('tabletop-media', media(c), 'lots')
    await upload('tabletop-media', media(c))
    await quota('media_per_campaign', 4)
    await asUser(dm)
    await expect(upload('tabletop-media', media(c))).rejects.toThrow(/row-level security/)
    await quota('media_per_campaign', 200)
    await quota('media_mb_per_campaign', 500)
  })

  it('caps the bytes of every campaign of one owner together, per environment', async () => {
    await quota('media_mb_per_owner', 1)
    await asUser(otherDm)
    const a = await scalar("select public.create_campaign('Owner A') result")
    const b = await scalar("select public.create_campaign('Owner B') result")
    await stored('tabletop-media', media(a), Math.round(1.1 * MB))
    await expect(upload('tabletop-media', media(b))).rejects.toThrow(/row-level security/)
    await expect(upload('tabletop-media', media(a))).rejects.toThrow(/row-level security/)
    // Another owner is unaffected.
    const { c } = await campaign(dm, 'public', 'Other owner')
    await asUser(dm)
    await upload('tabletop-media', media(c))
    // PRE reads its own limits.
    const p = await campaign(otherDm, 'pre', 'Pre owner')
    await asUser(otherDm)
    await stored('tabletop-media', media(p.c, 'map', 'pre'), Math.round(1.1 * MB))
    await upload('tabletop-media', media(p.c, 'map', 'pre'))
    await quota('media_mb_per_owner', 1, 'pre_private')
    await asUser(otherDm)
    await expect(upload('tabletop-media', media(p.c, 'map', 'pre'))).rejects.toThrow(
      /row-level security/,
    )
    await quota('media_mb_per_owner', 2048, 'pre_private')
    await quota('media_mb_per_owner', 2048)
  })

  it('still refuses anon, outsiders, Players and other DMs', async () => {
    const { c } = await campaign(dm, 'public', 'Denials')
    for (const user of [outsider, player, otherDm]) {
      await asUser(user)
      await expect(upload('tabletop-media', media(c))).rejects.toThrow(/row-level security/)
    }
    await asAnon()
    await expect(upload('tabletop-media', media(c))).rejects.toThrow(/permission denied/)
    await expect(
      db.query("select private.storage_quota_ok('tabletop-media', $1)", [media(c)]),
    ).rejects.toThrow(/permission denied/)
  })
})

describe('replaced images can be removed by whoever may replace them', () => {
  it('portraits: the playing Player and the DM delete an old object; others cannot', async () => {
    const { c, arin } = await campaign(dm, 'public', 'Portraits')
    const path = () => `public/${c}/${arin}/${randomUUID()}.webp`
    await asUser(player)
    const old = path()
    const next = path()
    await upload('character-portraits', old)
    await upload('character-portraits', next)
    await db.query('select public.set_character_portrait($1,$2,$3)', [c, arin, old])
    await db.query('select public.set_character_portrait($1,$2,$3)', [c, arin, next])
    for (const user of [peer, outsider, otherDm]) {
      await asUser(user)
      await db.query(
        "delete from storage.objects where bucket_id='character-portraits' and name=$1",
        [old],
      )
      expect(await objectCount('character-portraits', old)).toBe(1)
    }
    await asUser(player)
    await db.query(
      "delete from storage.objects where bucket_id='character-portraits' and name=$1",
      [old],
    )
    expect(await objectCount('character-portraits', old)).toBe(0)
    await asUser(dm)
    await db.query('select public.set_character_portrait($1,$2,null)', [c, arin])
    await db.query(
      "delete from storage.objects where bucket_id='character-portraits' and name=$1",
      [next],
    )
    expect(await objectCount('character-portraits', next)).toBe(0)
  })

  it('item and shop images: only the campaign DM deletes', async () => {
    const { c } = await campaign(dm, 'public', 'Pictures')
    await asUser(dm)
    const def = (
      await scalar<Json>('select public.save_item_definition($1,null,null,$2,$3) result', [
        c,
        json({ name: 'Axe', category: 'weapon', value_gp: 5 }),
        randomUUID(),
      ])
    ).id as string
    const shop = await scalar('select public.save_shop($1,null,null,$2,$3) result', [
      c,
      json({ name: 'Market', visibility: 'party', mode: 'auto' }),
      randomUUID(),
    ])
    const item = `public/${c}/${def}/${randomUUID()}.webp`
    const banner = `public/${c}/${shop}/${randomUUID()}.webp`
    await upload('item-images', item)
    await upload('shop-images', banner)
    for (const user of [player, outsider, otherDm]) {
      await asUser(user)
      await db.query("delete from storage.objects where bucket_id='item-images' and name=$1", [
        item,
      ])
      await db.query("delete from storage.objects where bucket_id='shop-images' and name=$1", [
        banner,
      ])
    }
    expect(await objectCount('item-images', item)).toBe(1)
    expect(await objectCount('shop-images', banner)).toBe(1)
    await asUser(dm)
    await db.query("delete from storage.objects where bucket_id='item-images' and name=$1", [item])
    await db.query("delete from storage.objects where bucket_id='shop-images' and name=$1", [
      banner,
    ])
    expect(await objectCount('item-images', item)).toBe(0)
    expect(await objectCount('shop-images', banner)).toBe(0)
  })
})

describe('characters_per_user counts non-archived characters of one user in one campaign', () => {
  it('archiving frees a slot; other campaigns and roles are unaffected', async () => {
    const { c, arin } = await campaign(dm, 'public', 'Archive frees')
    await quota('characters_per_user', 2)
    await asUser(player)
    const bryn = await scalar('select public.create_own_character($1,$2,$3) result', [
      c,
      'Bryn',
      randomUUID(),
    ])
    await expect(
      db.query('select public.create_own_character($1,$2,$3)', [c, 'Cora', randomUUID()]),
    ).rejects.toThrow(/Character limit/)
    await asSystem()
    const active = await scalar<boolean>(
      'select is_active result from public.characters where id=$1',
      [bryn],
    )
    await asUser(dm)
    await db.query('select public.archive_character($1,$2)', [c, active ? arin : bryn])
    await asUser(player)
    await scalar('select public.create_own_character($1,$2,$3) result', [c, 'Cora', randomUUID()])
    await expect(
      db.query('select public.create_own_character($1,$2,$3)', [c, 'Dara', randomUUID()]),
    ).rejects.toThrow(/Character limit/)
    for (const user of [outsider, otherDm]) {
      await asUser(user)
      await expect(
        db.query('select public.create_own_character($1,$2,$3)', [c, 'X', randomUUID()]),
      ).rejects.toThrow(/Forbidden/)
    }
    await asAnon()
    await expect(
      db.query('select public.create_own_character($1,$2,$3)', [c, 'X', randomUUID()]),
    ).rejects.toThrow(/permission denied/)
    await quota('characters_per_user', 10)
  })
})

describe('invitation seats and recipient inbox', () => {
  it('takes the campaign seat lock as well as the inviter lock', async () => {
    const { c } = await campaign(dm, 'public', 'Locks')
    await asUser(dm)
    await db.exec('begin')
    await db.query('select public.invite_campaign_member($1,$2)', [c, 'locked@example.com'])
    await db.exec('reset role')
    const held = await rows(
      `select k.quota from (values ('members_per_campaign:' || $1::text), ('invitations_per_inviter:' || $2::text),
          ('pending_invitations_per_recipient:locked@example.com')) k(quota)
        where exists (select 1 from pg_locks l where l.locktype = 'advisory'
          and ((l.classid::bigint << 32) | l.objid::bigint) = hashtextextended(k.quota, 113))
        order by 1`,
      [c, dm],
    )
    await db.exec('rollback')
    expect(held.map((r) => r.quota)).toEqual([
      'invitations_per_inviter:' + dm,
      'members_per_campaign:' + c,
      'pending_invitations_per_recipient:locked@example.com',
    ])
  })

  it('a co-DM shares the seat count of the campaign', async () => {
    const { c } = await campaign(dm, 'public', 'Co-DMs')
    await asUser(dm)
    const invite = await scalar('select public.invite_campaign_member($1,$2) result', [
      c,
      emails[coDm],
    ])
    await asUser(coDm)
    await db.query('select public.respond_campaign_invitation($1,true)', [invite])
    await asUser(dm)
    await db.query('select public.change_campaign_member($1,$2,$3)', [c, coDm, 'dm'])
    await quota('members_per_campaign', 4)
    await asUser(dm)
    await scalar('select public.invite_campaign_member($1,$2) result', [c, 'seat@example.com'])
    await asUser(coDm)
    await expect(
      db.query('select public.invite_campaign_member($1,$2)', [c, 'extra@example.com']),
    ).rejects.toThrow(/Member limit/)
    await quota('members_per_campaign', 30)
  })

  it('refuses a recipient with too many pending invitations; declining or expiry frees room', async () => {
    await quota('pending_invitations_per_recipient', 2)
    const made: string[] = []
    for (const [owner, name] of [
      [dm, 'Inbox 1'],
      [otherDm, 'Inbox 2'],
    ] as const) {
      await asUser(owner)
      const c = await scalar('select public.create_campaign($1) result', [name])
      made.push(
        await scalar('select public.invite_campaign_member($1,$2) result', [c, emails[invitee]]),
      )
    }
    await asUser(dm)
    const third = await scalar("select public.create_campaign('Inbox 3') result")
    await expect(
      db.query('select public.invite_campaign_member($1,$2)', [third, emails[invitee]]),
    ).rejects.toThrow(/Recipient invitation limit/)
    // Another recipient is unaffected.
    await scalar('select public.invite_campaign_member($1,$2) result', [third, 'free@example.com'])
    await asUser(invitee)
    expect((await rows('select id from public.list_my_invitations()')).length).toBe(2)
    await db.query('select public.respond_campaign_invitation($1,false)', [made[0]])
    await asUser(dm)
    await scalar('select public.invite_campaign_member($1,$2) result', [third, emails[invitee]])
    await expect(
      db.query('select public.invite_campaign_member($1,$2)', [
        await scalar("select public.create_campaign('Inbox 4') result"),
        emails[invitee],
      ]),
    ).rejects.toThrow(/Recipient invitation limit/)
    await asSystem()
    await db.query(
      "update public.campaign_invitations set created_at = now() - interval '8 days', expires_at = now() - interval '1 minute' where id=$1",
      [made[1]],
    )
    await asUser(dm)
    const fifth = await scalar("select public.create_campaign('Inbox 5') result")
    await scalar('select public.invite_campaign_member($1,$2) result', [fifth, emails[invitee]])
    // Denials are unchanged.
    for (const user of [player, outsider, otherDm]) {
      await asUser(user)
      await expect(
        db.query('select public.invite_campaign_member($1,$2)', [fifth, 'x@example.com']),
      ).rejects.toThrow(/Forbidden/)
    }
    await asAnon()
    await expect(
      db.query('select public.invite_campaign_member($1,$2)', [fifth, 'x@example.com']),
    ).rejects.toThrow(/permission denied/)
    await quota('pending_invitations_per_recipient', 20)
  })

  it('applies the recipient cap in PRE with its own limit', async () => {
    await quota('pending_invitations_per_recipient', 1, 'pre_private')
    await asUser(dm)
    const a = await scalar("select pre.create_campaign('Pre inbox 1') result")
    const b = await scalar("select pre.create_campaign('Pre inbox 2') result")
    await scalar('select pre.invite_campaign_member($1,$2) result', [a, 'pre-invitee@example.com'])
    await expect(
      db.query('select pre.invite_campaign_member($1,$2)', [b, 'pre-invitee@example.com']),
    ).rejects.toThrow(/Recipient invitation limit/)
    await quota('pending_invitations_per_recipient', 20, 'pre_private')
  })
})

describe('combat RPC results mask a hidden active combatant for Players', () => {
  async function fight(schema = 'public') {
    const { c, arin } = await campaign(dm, schema, 'Masked turn')
    await asUser(dm)
    const call = (fn: string, args: unknown[]) =>
      scalar<Json>(
        `select ${schema}.${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) result`,
        args,
      )
    const e = (await call('create_encounter', [c, 'Ambush', randomUUID()])).encounter_id as string
    await call('add_combatants', [
      c,
      e,
      json([
        { kind: 'npc', name: 'Lich', max_hp: 40, initiative: 30 },
        { kind: 'character', character_id: arin },
      ]),
      randomUUID(),
    ])
    await call('set_encounter_status', [c, e, 'active', randomUUID()])
    await asSystem()
    const lich = await scalar(
      `select id result from ${schema}.encounter_combatants where encounter_id=$1 and name='Lich'`,
      [e],
    )
    const hero = await scalar(
      `select id result from ${schema}.encounter_combatants where encounter_id=$1 and character_id=$2`,
      [e, arin],
    )
    // The DM hides the creature whose turn it is (it keeps the turn).
    await db.query(`update ${schema}.encounter_combatants set hidden = true where id=$1`, [lich])
    await db.query(`update ${schema}.encounters set active_combatant = $2 where id=$1`, [e, lich])
    return { c, e, lich, hero, call }
  }

  it('PoC: set_initiative returned the hidden active combatant to a Player', async () => {
    const { c, lich, hero, call } = await fight()
    await asUser(player)
    const mine = await call('set_initiative', [c, hero, 12, null, randomUUID()])
    expect(mine).toMatchObject({ active_combatant: null })
    expect(json(mine)).not.toContain(lich)
    await asUser(dm)
    const full = await call('set_initiative', [c, hero, 13, null, randomUUID()])
    expect(full).toMatchObject({ active_combatant: lich })
  })

  it('keeps a visible active combatant visible to the Player', async () => {
    const { c, e, lich, hero, call } = await fight()
    await asSystem()
    await db.query('update public.encounter_combatants set hidden = false where id=$1', [lich])
    await db.query('update public.encounters set active_combatant = $2 where id=$1', [e, lich])
    await asUser(player)
    expect(await call('set_initiative', [c, hero, 12, null, randomUUID()])).toMatchObject({
      active_combatant: lich,
    })
  })

  it('denies anon, outsiders and other DMs', async () => {
    const { c, hero } = await fight()
    for (const user of [outsider, otherDm, peer]) {
      await asUser(user)
      await expect(
        db.query('select public.set_initiative($1,$2,10,null,$3)', [c, hero, randomUUID()]),
      ).rejects.toThrow(/Forbidden|Combatant unavailable/)
    }
    await asAnon()
    await expect(
      db.query('select public.set_initiative($1,$2,10,null,$3)', [c, hero, randomUUID()]),
    ).rejects.toThrow(/permission denied/)
  })

  it('masks in PRE too', async () => {
    const { c, hero, call } = await fight('pre')
    await asUser(player)
    expect(await call('set_initiative', [c, hero, 12, null, randomUUID()])).toMatchObject({
      active_combatant: null,
    })
  })
})

describe('changed functions stay definer-safe and closed', () => {
  it('fixes search_path, refuses anon and keeps PRE copies remapped', async () => {
    await asSystem()
    const fns = await rows(
      `select n.nspname || '.' || p.proname as name, p.prosecdef, p.proconfig, p.prosrc,
        has_function_privilege('anon', p.oid, 'execute') anon,
        has_function_privilege('authenticated', p.oid, 'execute') authed
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('private', 'pre_private')
         and p.proname in ('quota_characters', 'quota_invitations', 'combat_result', 'storage_quota_ok')
         and n.nspname || '.' || p.proname <> 'pre_private.storage_quota_ok'
       order by 1`,
    )
    expect(fns.map((f) => f.name)).toEqual([
      'pre_private.combat_result',
      'pre_private.quota_characters',
      'pre_private.quota_invitations',
      'private.combat_result',
      'private.quota_characters',
      'private.quota_invitations',
      'private.storage_quota_ok',
    ])
    for (const fn of fns) {
      expect(fn).toMatchObject({ prosecdef: true, proconfig: ['search_path=""'], anon: false })
      expect(fn.authed).toBe(fn.name === 'private.storage_quota_ok')
      if (String(fn.name).startsWith('pre_private.')) {
        expect(fn.prosrc).not.toMatch(/\bpublic\.|\bprivate\./)
        expect(fn.prosrc).toMatch(/archived_at|Recipient invitation limit|is_campaign_dm/)
      }
    }
    await asUser(player)
    for (const sql of [
      "select private.combat_result('00000000-0000-0000-0000-000000000000')",
      'select * from private.quota_limits',
    ])
      await expect(db.query(sql)).rejects.toThrow(/permission denied/)
  })
})
