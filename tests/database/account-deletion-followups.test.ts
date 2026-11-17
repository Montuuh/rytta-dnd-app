import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-115 / RYT-118 follow-up: prepared account deletion, retention of deletion requests, storage
// quota without owner, combat log of combatants removed while hidden and the owner's class key.
const migration = '20261128120000_account_deletion_prepare_combat_leave_mask.sql'
const db = new PGlite()
type Json = Record<string, unknown>
const json = (value: unknown) => JSON.stringify(value)
const MB = 1048576

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
const rows = async (sql: string, args: unknown[] = []) => (await db.query<Json>(sql, args)).rows
const count = async (sql: string, args: unknown[] = []) => {
  await asSystem()
  return Number(await scalar(sql, args))
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
const invite = async (schema: string, c: string, by: string, to: string) => {
  await asUser(by)
  return scalar(`select ${schema}.invite_campaign_member($1,$2) result`, [c, emails.get(to)])
}
const accept = async (schema: string, id: string, by: string) => {
  await asUser(by)
  await db.query(`select ${schema}.respond_campaign_invitation($1,true)`, [id])
}
const prepare = async (id: string, key: string, schema = 'public') => {
  await asUser(id)
  return scalar<Json>(`select ${schema}.prepare_account_deletion($1) result`, [key])
}
const remove = async (id: string, key: string, schema = 'public') => {
  await asUser(id)
  return scalar<Json>(`select ${schema}.delete_my_account('DELETE',$1) result`, [key])
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

describe('prepare_account_deletion', () => {
  it('denies anon and requires a session and a request id in both environments', async () => {
    for (const schema of ['public', 'pre']) {
      await asAnon()
      await expect(
        db.query(`select ${schema}.prepare_account_deletion($1)`, [randomUUID()]),
      ).rejects.toThrow(/permission denied/)
      await asSystem()
      await db.exec('set role authenticated')
      await expect(
        db.query(`select ${schema}.prepare_account_deletion($1)`, [randomUUID()]),
      ).rejects.toThrow(/Forbidden/)
    }
    const someone = await user('someone')
    await asUser(someone)
    await expect(db.query('select public.prepare_account_deletion(null)')).rejects.toThrow(
      /Invalid request/,
    )
    await asSystem()
    expect(
      await rows(
        "select count(*)::int n from information_schema.role_routine_grants where grantee in ('anon','PUBLIC') and routine_name = 'prepare_account_deletion'",
      ),
    ).toEqual([{ n: 0 }])
  })

  it('revokes pending invitations of solo campaigns, so the invitee cannot join before the deletion', async () => {
    const solo = await user('solo'),
      invitee = await user('invitee'),
      otherDm = await user('otherdm')
    await asUser(solo)
    const c = await scalar("select public.create_campaign('Alone') result")
    const pending = await invite('public', c, solo, invitee)
    // Another DM's campaign and its invitation are never touched.
    await asUser(otherDm)
    const other = await scalar("select public.create_campaign('Elsewhere') result")
    const foreign = await invite('public', other, otherDm, invitee)
    await asSystem()
    const portrait = `public/${c}/${randomUUID()}/${randomUUID()}.webp`
    await db.query('insert into storage.objects(bucket_id, name) values ($1,$2)', [
      'character-portraits',
      portrait,
    ])

    const key = randomUUID()
    const snapshot = await prepare(solo, key)
    expect(snapshot).toEqual({
      blockers: [],
      campaigns: [c],
      storage_paths: [{ bucket_id: 'character-portraits', object_path: portrait, campaign_id: c }],
      revoked_invitations: 1,
    })
    await asSystem()
    expect(
      await rows(
        'select id, status from public.campaign_invitations where id = any($1) order by status',
        [[pending, foreign]],
      ),
    ).toEqual([
      { id: foreign, status: 'pending' },
      { id: pending, status: 'revoked' },
    ])
    await expect(accept('public', pending, invitee)).rejects.toThrow(/Invitation unavailable/)
    // The digest, never the id, is stored; a request id of another caller is refused.
    await asSystem()
    expect(
      await rows(
        'select actor_digest = md5($2) digest, prepared_campaigns, result from private.account_deletion_requests where request_id = $1',
        [key, solo],
      ),
    ).toEqual([{ digest: true, prepared_campaigns: [c], result: null }])
    await expect(prepare(otherDm, key)).rejects.toThrow(/Request mismatch/)
    await expect(remove(otherDm, key)).rejects.toThrow(/Request mismatch/)

    expect(await remove(solo, key)).toMatchObject({
      deleted: true,
      data_deleted: true,
      auth_user: 'deleted',
      campaigns_deleted: [c],
    })
    // Replays keep working: prepare reports nothing left, delete returns the stored result.
    expect(await prepare(solo, key)).toMatchObject({ campaigns: [], storage_paths: [] })
    expect(await remove(solo, key)).toMatchObject({ campaigns_deleted: [c] })
    expect(await count('select count(*) result from public.campaigns where id = $1', [other])).toBe(
      1,
    )
  })

  it('changes nothing while blocked and lets a Player or an outsider prepare only their own account', async () => {
    const dm = await user('dm'),
      player = await user('player'),
      invitee = await user('invitee'),
      outsider = await user('outsider')
    await asUser(dm)
    const shared = await scalar("select public.create_campaign('Shared') result")
    const lonely = await scalar("select public.create_campaign('Lonely') result")
    await accept('public', await invite('public', shared, dm, player), player)
    const pending = await invite('public', lonely, dm, invitee)
    expect(await prepare(dm, randomUUID())).toEqual({
      blockers: [{ campaign_id: shared, campaign_name: 'Shared', other_members: 1 }],
      campaigns: [],
      storage_paths: [],
      revoked_invitations: 0,
    })
    expect(
      await count(
        'select count(*) result from public.campaign_invitations where id = $1 and status = $2',
        [pending, 'pending'],
      ),
    ).toBe(1)
    for (const id of [player, outsider]) {
      expect(await prepare(id, randomUUID())).toEqual({
        blockers: [],
        campaigns: [],
        storage_paths: [],
        revoked_invitations: 0,
      })
    }
    expect(
      await count(
        'select count(*) result from public.campaign_invitations where status = $1 and campaign_id = any($2)',
        ['pending', [shared, lonely]],
      ),
    ).toBe(1)
  })

  it('refuses an unprepared deletion and one whose solo campaigns changed, before any write', async () => {
    const dm = await user('dm'),
      late = await user('late'),
      leaver = await user('leaver')
    await asUser(dm)
    await db.query("select public.set_my_username('Racing_Dm')")
    const a = await scalar("select public.create_campaign('Joined late') result")
    const b = await scalar("select public.create_campaign('Emptied') result")
    await accept('public', await invite('public', b, dm, leaver), leaver)
    await asUser(dm)
    await db.query("select public.change_campaign_member($1,$2,'dm')", [b, leaver])

    await expect(remove(dm, randomUUID())).rejects.toThrow(/Account deletion not prepared/)

    // A member arrives in a prepared solo campaign (as a forced write would): blocked.
    const key = randomUUID()
    expect(await prepare(dm, key)).toMatchObject({ campaigns: [a] })
    await asSystem()
    await db.query(
      "insert into public.campaign_members(campaign_id,user_id,role,active) values ($1,$2,'dm',true)",
      [a, late],
    )
    await expect(remove(dm, key)).rejects.toThrow(/Account deletion blocked/)
    await asSystem()
    await db.query('delete from public.campaign_members where campaign_id = $1 and user_id = $2', [
      a,
      late,
    ])

    // A campaign that became solo after prepare had its Storage left in place: blocked too.
    const second = randomUUID()
    expect(await prepare(dm, second)).toMatchObject({ campaigns: [a] })
    await asUser(leaver)
    await db.query('select public.change_campaign_member($1,$2,null)', [b, leaver])
    await expect(remove(dm, second)).rejects.toThrow(/Account deletion blocked/)

    expect(
      await count('select count(*) result from public.campaigns where id = any($1)', [[a, b]]),
    ).toBe(2)
    expect(
      await count('select count(*) result from public.profiles where user_id = $1', [dm]),
    ).toBe(1)
    expect(await count('select count(*) result from auth.users where id = $1', [dm])).toBe(1)
    // Preparing again picks up the new set and the deletion goes through.
    expect(await prepare(dm, second)).toMatchObject({ campaigns: [a, b].sort() })
    expect(await remove(dm, second)).toMatchObject({ campaigns_deleted: [a, b].sort() })
  })

  it('applies in PRE with remapped references and never touches the shared Auth user', async () => {
    const dm = await user('predm'),
      invitee = await user('preinvitee')
    await asUser(dm)
    const c = await scalar("select pre.create_campaign('Pre alone') result")
    const pending = await invite('pre', c, dm, invitee)
    const key = randomUUID()
    expect(await prepare(dm, key, 'pre')).toMatchObject({ campaigns: [c], revoked_invitations: 1 })
    await asSystem()
    expect(
      await rows('select status from pre.campaign_invitations where id = $1', [pending]),
    ).toEqual([{ status: 'revoked' }])
    expect(await remove(dm, key, 'pre')).toMatchObject({
      deleted: true,
      data_deleted: true,
      auth_user: 'shared',
      campaigns_deleted: [c],
    })
    expect(await count('select count(*) result from auth.users where id = $1', [dm])).toBe(1)
    expect(
      await count(
        'select count(*) result from pre_private.account_deletion_requests where request_id = $1',
        [key],
      ),
    ).toBe(1)
    expect(
      await count(
        'select count(*) result from private.account_deletion_requests where request_id = $1',
        [key],
      ),
    ).toBe(0)
    const fns = await rows(
      `select n.nspname || '.' || p.proname fn, p.prosecdef, p.proconfig, p.prosrc,
         has_function_privilege('anon', p.oid, 'execute') anon
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('pre', 'pre_private')
         and p.proname in ('prepare_account_deletion', 'delete_my_account', 'prune_stale_rows', 'combat_log', 'get_combat_state')
       order by 1`,
    )
    expect(fns.map((f) => f.fn)).toEqual([
      'pre.delete_my_account',
      'pre.get_combat_state',
      'pre.prepare_account_deletion',
      'pre_private.combat_log',
      'pre_private.prune_stale_rows',
    ])
    for (const f of fns) {
      expect(f).toMatchObject({ prosecdef: true, proconfig: ['search_path=""'], anon: false })
      expect(f.prosrc).not.toMatch(/\bpublic\.|\bprivate\./)
    }
  })
})

describe('private.prune_stale_rows', () => {
  it('deletes account deletion requests after 7 days and keeps its other work', async () => {
    const fresh = randomUUID(),
      old = randomUUID()
    await asSystem()
    await db.query(
      `insert into private.account_deletion_requests(request_id, actor_digest, result, created_at)
         values ($1, 'x', null, now() - interval '6 days'), ($2, 'y', '{}'::jsonb, now() - interval '8 days')`,
      [fresh, old],
    )
    const result = await scalar<Json>('select private.prune_stale_rows() result')
    expect(result).toMatchObject({ account_deletion_requests: 1 })
    for (const key of [
      'resource_requests',
      'sheet_requests',
      'inventory_requests',
      'combat_requests',
      'tabletop_requests',
      'character_requests',
      'content_requests',
      'encounter_events_deleted',
      'encounter_events_snapshots_cleared',
    ])
      expect(result).toHaveProperty(key)
    expect(
      (
        await rows(
          'select request_id from private.account_deletion_requests where request_id = any($1)',
          [[fresh, old]],
        )
      ).map((r) => r.request_id),
    ).toEqual([fresh])
  })

  it('stays out of reach of API roles', async () => {
    await asAnon()
    await expect(db.query('select private.prune_stale_rows()')).rejects.toThrow(/permission denied/)
    await asUser(randomUUID())
    await expect(db.query('select private.prune_stale_rows()')).rejects.toThrow(/permission denied/)
    await expect(db.query('select pre_private.prune_stale_rows()')).rejects.toThrow(
      /permission denied/,
    )
    await asSystem()
    for (const role of ['anon', 'authenticated', 'service_role'])
      expect(
        await rows(
          `select has_function_privilege($1, 'private.prune_stale_rows()', 'execute') a,
             has_function_privilege($1, 'pre_private.prune_stale_rows()', 'execute') b`,
          [role],
        ),
      ).toEqual([{ a: false, b: false }])
  })
})

describe('storage_quota_ok without owner', () => {
  const quota = async (name: string, value: number) => {
    await asSystem()
    await db.query('update private.quota_limits set max_count = $2 where quota = $1', [name, value])
  }
  const store = async (c: string, size: number) => {
    await asSystem()
    await db.query('insert into storage.objects(bucket_id, name, metadata) values ($1,$2,$3)', [
      'tabletop-media',
      `public/${c}/map/${randomUUID()}.webp`,
      json({ size }),
    ])
  }
  const ok = async (who: string, c: string) => {
    await asUser(who)
    return scalar<boolean>("select private.storage_quota_ok('tabletop-media', $1) result", [
      `public/${c}/map/${randomUUID()}.webp`,
    ])
  }

  it('applies the per-campaign limit only, and the owner total to owned campaigns', async () => {
    const owner = await user('quotaowner')
    await asUser(owner)
    const owned = await scalar("select public.create_campaign('Owned') result")
    const orphan = await scalar("select public.create_campaign('Orphan') result")
    await asSystem()
    await db.query('update public.campaigns set owner_id = null where id = $1', [orphan])
    await store(owned, Math.round(1.1 * MB))
    await store(orphan, Math.round(1.1 * MB))
    await quota('media_mb_per_owner', 1)
    expect(await ok(owner, owned)).toBe(false)
    expect(await ok(owner, orphan)).toBe(true)
    await quota('media_mb_per_campaign', 1)
    expect(await ok(owner, orphan)).toBe(false)
    await quota('media_mb_per_campaign', 500)
    await quota('media_mb_per_owner', 2048)
    expect(await ok(owner, owned)).toBe(true)
    await asAnon()
    await expect(
      db.query("select private.storage_quota_ok('tabletop-media', $1)", [
        `public/${orphan}/map/x.webp`,
      ]),
    ).rejects.toThrow(/permission denied/)
  })
})

describe('get_combat_state follow-up', () => {
  type Row = { id: string; name: string; class_key?: string } & Json
  type Event = { kind: string; target_combatant?: string; target_name?: string } & Json

  /** Active fight: Arin (the Player's wizard), Bea (unassigned rogue), Dax (unassigned fighter). */
  async function fight(schema = 'public') {
    const dm = await user('cdm'),
      player = await user('cplayer'),
      peer = await user('cpeer'),
      outsider = await user('coutsider'),
      otherDm = await user('cotherdm')
    await asUser(dm)
    const c = await scalar(`select ${schema}.create_campaign('Masks') result`)
    const make = (name: string) =>
      scalar(`select ${schema}.create_character($1,$2) result`, [c, name])
    const ids = { arin: await make('Arin'), bea: await make('Bea'), dax: await make('Dax') }
    const claim = await scalar(`select ${schema}.invite_character_player($1,$2,$3) result`, [
      c,
      ids.arin,
      emails.get(player),
    ])
    await accept(schema, claim, player)
    await accept(schema, await invite(schema, c, dm, peer), peer)
    await asSystem()
    for (const [key, cls] of [
      ['arin', 'wizard'],
      ['bea', 'rogue'],
      ['dax', 'fighter'],
    ] as const)
      await db.query(
        `update ${schema}.character_sheets set build = coalesce(build, '{}'::jsonb) || $2 where character_id = $1`,
        [ids[key], json({ classKey: cls })],
      )
    await asUser(dm)
    const e = (
      await scalar<Json>(`select ${schema}.create_encounter($1,'Crypt',$2) result`, [
        c,
        randomUUID(),
      ])
    ).encounter_id as string
    await scalar(`select ${schema}.add_combatants($1,$2,$3,$4) result`, [
      c,
      e,
      json(Object.values(ids).map((id) => ({ kind: 'character', character_id: id }))),
      randomUUID(),
    ])
    await scalar(`select ${schema}.set_encounter_status($1,$2,'active',$3) result`, [
      c,
      e,
      randomUUID(),
    ])
    await asSystem()
    const combatant = (character: string) =>
      scalar(
        `select id result from ${schema}.encounter_combatants where encounter_id=$1 and character_id=$2`,
        [e, character],
      )
    const state = async (who: string, asTable: boolean) => {
      await asUser(who)
      const out = await scalar<{ combatants: Row[]; events: Event[] }>(
        `select ${schema}.get_combat_state($1,null,$2) result`,
        [c, asTable],
      )
      return {
        all: json(out),
        events: out.events,
        byId: new Map(out.combatants.map((r) => [r.id, r])),
      }
    }
    const removeCombatant = async (id: string) => {
      await asUser(dm)
      await scalar(`select ${schema}.remove_combatant($1,$2,$3) result`, [c, id, randomUUID()])
    }
    return { dm, player, peer, outsider, otherDm, c, e, ids, combatant, state, removeCombatant }
  }

  it('PoC: a combatant hidden after joining and then removed no longer reappears in the log', async () => {
    const f = await fight()
    const dax = await f.combatant(f.ids.dax)
    await asSystem()
    await db.query('update public.encounter_combatants set hidden = true where id = $1', [dax])
    await f.removeCombatant(dax)
    for (const [who, asTable] of [
      [f.player, false],
      [f.peer, false],
      [f.dm, true],
    ] as const) {
      const { all, events } = await f.state(who, asTable)
      expect(events.some((x) => x.target_combatant === dax)).toBe(false)
      expect(all).not.toContain('Dax')
    }
    const full = await f.state(f.dm, false)
    expect(full.events.find((x) => x.kind === 'leave' && x.target_combatant === dax)).toMatchObject(
      {
        target_name: 'Dax',
        visible: false,
        detail: { hidden_at_leave: true },
      },
    )
    expect(full.events.some((x) => x.kind === 'join' && x.target_combatant === dax)).toBe(true)

    // Retention keeps that invisible leave event, so the mask outlives the prune of an old fight.
    await asSystem()
    await db.query(
      `insert into public.encounter_events(campaign_id, encounter_id, kind, target_name, visible, created_at)
         select $1, $2, 'round', null, true, now() - interval '35 days' + g * interval '1 second' from generate_series(1, 70) g`,
      [f.c, f.e],
    )
    await db.query(
      "update public.encounter_events set created_at = now() - interval '40 days' where encounter_id = $1 and target_combatant = $2",
      [f.e, dax],
    )
    await db.query(
      "update public.encounters set status = 'ended', ended_at = now() - interval '31 days' where id = $1",
      [f.e],
    )
    await db.query('select private.prune_stale_rows()')
    expect(
      await count(
        "select count(*) result from public.encounter_events where target_combatant = $1 and kind = 'leave'",
        [dax],
      ),
    ).toBe(1)
  })

  it('covers removals logged before the migration through the invisible leave event', async () => {
    const f = await fight()
    const bea = await f.combatant(f.ids.bea)
    await f.removeCombatant(bea)
    // A leave written as before (no hidden_at_leave) by a combatant hidden at that time.
    await asSystem()
    await db.query(
      "update public.encounter_events set visible = false, detail = '{}'::jsonb where target_combatant = $1 and kind = 'leave'",
      [bea],
    )
    const { events, all } = await f.state(f.player, false)
    expect(events.some((x) => x.target_combatant === bea)).toBe(false)
    expect(all).not.toContain('Bea')
  })

  it('PoC: an alias set while hidden is not read back for a removed combatant', async () => {
    const f = await fight()
    const bea = await f.combatant(f.ids.bea)
    await asSystem()
    // While hidden the DM prepared an alias; an invisible event recorded it. Then the alias was
    // dropped, the combatant shown again and removed.
    await db.query(
      `insert into public.encounter_events(campaign_id, encounter_id, kind, target_combatant, target_name, detail, visible)
         values ($1, $2, 'damage', $3, 'Bea', '{"target_alias": "Ghost"}', false)`,
      [f.c, f.e, bea],
    )
    await f.removeCombatant(bea)
    for (const [who, asTable] of [
      [f.player, false],
      [f.dm, true],
    ] as const) {
      const { events, all } = await f.state(who, asTable)
      const about = events.filter((x) => x.target_combatant === bea)
      expect(about.map((x) => x.kind).sort()).toEqual(['join', 'leave'])
      expect(about.every((x) => x.target_name === 'Bea')).toBe(true)
      expect(all).not.toContain('Ghost')
    }
  })

  it('gives the owning Player the class of their own aliased character, never on the table screen', async () => {
    const f = await fight()
    const arin = await f.combatant(f.ids.arin)
    await asSystem()
    await db.query("update public.encounter_combatants set public_name = 'Masked' where id = $1", [
      arin,
    ])
    expect((await f.state(f.player, false)).byId.get(arin)).toMatchObject({
      name: 'Masked',
      is_own: true,
      class_key: 'wizard',
    })
    for (const [who, asTable] of [
      [f.player, true],
      [f.peer, false],
      [f.dm, true],
    ] as const) {
      const { byId, all } = await f.state(who, asTable)
      expect(byId.get(arin)).not.toHaveProperty('class_key')
      expect(all).not.toContain('wizard')
    }
    expect((await f.state(f.dm, false)).byId.get(arin)).toMatchObject({ class_key: 'wizard' })
  })

  it('denies anon, outsiders and DMs of other campaigns', async () => {
    const f = await fight()
    await asUser(f.otherDm)
    await scalar("select public.create_campaign('Elsewhere') result")
    for (const who of [f.outsider, f.otherDm]) {
      await asUser(who)
      for (const asTable of [false, true])
        await expect(
          db.query('select public.get_combat_state($1,null,$2)', [f.c, asTable]),
        ).rejects.toThrow(/Forbidden/)
    }
    await asAnon()
    await expect(db.query('select public.get_combat_state($1,null,false)', [f.c])).rejects.toThrow(
      /permission denied/,
    )
    await asSystem()
    for (const schema of ['private', 'pre_private'])
      expect(
        await rows(
          `select has_function_privilege('authenticated', p.oid, 'execute') authed
             from pg_proc p join pg_namespace n on n.oid = p.pronamespace
            where p.proname = 'combat_log' and n.nspname = $1`,
          [schema],
        ),
      ).toEqual([{ authed: false }])
  })

  it('masks removed hidden combatants in PRE too', async () => {
    const f = await fight('pre')
    const dax = await f.combatant(f.ids.dax)
    await asSystem()
    await db.query('update pre.encounter_combatants set hidden = true where id = $1', [dax])
    await f.removeCombatant(dax)
    const { events, all } = await f.state(f.player, false)
    expect(events.some((x) => x.target_combatant === dax)).toBe(false)
    expect(all).not.toContain('Dax')
  })
})
