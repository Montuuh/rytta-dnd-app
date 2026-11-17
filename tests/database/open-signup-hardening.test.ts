import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-113: security hardening for open sign-up. Encounter secrets stay DM-side, shop modifiers stay
// inside their campaign, tenant quotas and invitation throttles hold, portrait paths are anchored.
const migration = '20261122120000_open_signup_hardening.sql'
const db = new PGlite()
const dm = randomUUID(),
  player = randomUUID(),
  peer = randomUUID(),
  outsider = randomUUID(),
  otherDm = randomUUID(),
  hoarder = randomUUID(),
  spammer = randomUUID()
const emails: Record<string, string> = {
  [dm]: 'dm@example.com',
  [player]: 'player@example.com',
  [peer]: 'peer@example.com',
  [outsider]: 'outsider@example.com',
  [otherDm]: 'otherdm@example.com',
  [hoarder]: 'hoarder@example.com',
  [spammer]: 'spammer@example.com',
}
const asUser = async (id: string) => {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
}
const asAnon = async () => {
  await db.exec('reset role; set role anon')
  await db.query("select set_config('request.jwt.claim.sub', '', false)")
}
const asSystem = () => db.exec('reset role')
type Json = Record<string, unknown>
const scalar = async <T = string>(sql: string, args: unknown[] = []) =>
  (await db.query<{ result: T }>(sql, args)).rows[0]!.result
const rows = async (sql: string, args: unknown[] = []) => (await db.query<Json>(sql, args)).rows
const quota = async (name: string, value: number, helper = 'private') => {
  await asSystem()
  await db.query(`update ${helper}.quota_limits set max_count = $2 where quota = $1`, [name, value])
}

/** A campaign of `owner` with `player` holding character Arin; returns ids. */
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
    create table storage.objects(id uuid default gen_random_uuid(), bucket_id text, name text);
    alter table storage.objects enable row level security;
    grant usage on schema storage to authenticated, anon;
    grant select, insert, delete on storage.objects to authenticated;`)
  const files = readdirSync('supabase/migrations')
    .filter((f) => f.endsWith('.sql'))
    .sort()
  for (const file of files.filter((f) => f < migration))
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
  // A PRE copied before this migration exercises its guarded PRE mirror.
  await db.exec(
    withExposureSql(
      etlCommand(['--apply']).query,
      readFileSync('supabase/maintenance/expose-pre.sql', 'utf8'),
    ),
  )
  await db.exec(`alter publication supabase_realtime add table pre.encounters`)
  for (const file of files.filter((f) => f >= migration))
    await db.exec(readFileSync(`supabase/migrations/${file}`, 'utf8'))
}, 90000)
afterAll(() => db.close())

describe('RYT-113 H-1 encounters keep combat secrets on the DM side', () => {
  async function fight(schema = 'public') {
    const { c } = await campaign(dm, schema, 'Ambush keep')
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
      JSON.stringify([
        { kind: 'npc', name: 'Hidden Lich (true name)', max_hp: 40, hidden: true },
        { kind: 'npc', name: 'Vampire lord', public_name: 'Hooded figure', max_hp: 30 },
        { kind: 'npc', name: 'Bandit', max_hp: 4 },
      ]),
      randomUUID(),
    ])
    return { c, e, call }
  }

  it('PoC: a Player reads no encounters row, by REST or by realtime payload', async () => {
    const { c, e, call } = await fight()
    await asUser(player)
    // Draft: nothing at all for the Player.
    expect(await rows('select * from public.encounter_signals where campaign_id=$1', [c])).toEqual(
      [],
    )
    await asUser(dm)
    await call('set_encounter_status', [c, e, 'active', randomUUID()])
    const state = await call('get_combat_state', [c, e, false])
    const alias = (state.combatants as { id: string; name: string }[]).find(
      (x) => x.name === 'Vampire lord',
    )!
    await call('apply_combat_hp', [
      c,
      e,
      'damage',
      JSON.stringify([{ combatant_id: alias.id, amount: 7 }]),
      randomUUID(),
    ])
    await call('set_encounter_status', [c, e, 'ended', randomUUID()])
    // The DM still reads the full row, including the hidden combatant in the summary.
    const dmRow = await rows('select summary from public.encounters where id=$1', [e])
    expect(JSON.stringify(dmRow)).toContain('Hidden Lich (true name)')
    // The audit request: select name, active_combatant, summary as the Player.
    await asUser(player)
    expect(
      await rows(
        'select name, active_combatant, summary from public.encounters where campaign_id=$1',
        [c],
      ),
    ).toEqual([])
    // The signal row is all a Player (and realtime) gets: no name, turn or summary.
    const signal = await rows('select * from public.encounter_signals where campaign_id=$1', [c])
    expect(signal).toHaveLength(1)
    expect(Object.keys(signal[0]!).sort()).toEqual(
      ['campaign_id', 'encounter_id', 'revision', 'status', 'updated_at'].sort(),
    )
    expect(signal[0]).toMatchObject({ encounter_id: e, status: 'ended' })
    expect(JSON.stringify(signal)).not.toMatch(/Lich|Vampire|Hooded/)
    await asSystem()
    const revision = await scalar<number>(
      'select revision result from public.encounters where id=$1',
      [e],
    )
    expect(Number(signal[0]!.revision)).toBe(Number(revision))
  })

  it('denies both tables to anon, outsiders and other DMs; only the DM reads encounters', async () => {
    const { c, e, call } = await fight()
    await asUser(dm)
    await call('set_encounter_status', [c, e, 'active', randomUUID()])
    expect(await rows('select id from public.encounters where id=$1', [e])).toHaveLength(1)
    expect(
      await rows('select encounter_id from public.encounter_signals where encounter_id=$1', [e]),
    ).toHaveLength(1)
    await asUser(otherDm)
    await scalar("select public.create_campaign('Elsewhere') result")
    for (const user of [outsider, otherDm, peer]) {
      await asUser(user)
      expect(await rows('select * from public.encounters where campaign_id=$1', [c])).toEqual([])
      expect(
        await rows('select * from public.encounter_signals where campaign_id=$1', [c]),
      ).toEqual([])
    }
    await asUser(player)
    expect(await rows('select * from public.encounters where campaign_id=$1', [c])).toEqual([])
    // Nobody writes the signal directly; the trigger keeps it.
    for (const user of [player, dm]) {
      await asUser(user)
      for (const sql of [
        "update public.encounter_signals set status='draft'",
        'delete from public.encounter_signals',
        `insert into public.encounter_signals(encounter_id,campaign_id,status,revision) values ('${randomUUID()}','${c}','active',0)`,
      ])
        await expect(db.query(sql)).rejects.toThrow(/permission denied/)
      await expect(db.query('select private.encounter_signal()')).rejects.toThrow(
        /permission denied/,
      )
    }
    await asAnon()
    await expect(db.query('select * from public.encounters')).rejects.toThrow(/permission denied/)
    await expect(db.query('select * from public.encounter_signals')).rejects.toThrow(
      /permission denied/,
    )
    // Deleting the encounter removes its signal.
    await asUser(dm)
    await call('set_encounter_status', [c, e, 'ended', randomUUID()])
    await asSystem()
    await db.query('delete from public.encounters where id=$1', [e])
    expect(await rows('select * from public.encounter_signals where encounter_id=$1', [e])).toEqual(
      [],
    )
  })

  it('publishes the signal instead of the encounters row, in both environments', async () => {
    await asSystem()
    const published = await rows(
      "select schemaname, tablename from pg_publication_tables where pubname='supabase_realtime' and tablename like 'encounter%' order by 1, 2",
    )
    expect(published).toEqual([
      { schemaname: 'pre', tablename: 'encounter_signals' },
      { schemaname: 'public', tablename: 'encounter_signals' },
    ])
  })

  it('mirrors the DM-only encounters and the signal into PRE', async () => {
    const { c, e, call } = await fight('pre')
    await asUser(dm)
    await call('set_encounter_status', [c, e, 'active', randomUUID()])
    await asUser(player)
    expect(await rows('select * from pre.encounters where campaign_id=$1', [c])).toEqual([])
    expect(
      await rows('select status from pre.encounter_signals where campaign_id=$1', [c]),
    ).toEqual([{ status: 'active' }])
    expect(await rows('select * from public.encounter_signals where campaign_id=$1', [c])).toEqual(
      [],
    )
  })
})

describe('RYT-113 M-1 shop modifiers stay inside their campaign', () => {
  async function market() {
    const { c, arin } = await campaign(dm, 'public', 'Market town')
    await asUser(dm)
    const shop = (await scalar<string>('select public.save_shop($1,null,null,$2,$3) result', [
      c,
      JSON.stringify({ name: 'Market', visibility: 'party', mode: 'auto' }),
      randomUUID(),
    ])) as string
    await db.query('select public.set_shop_modifier($1,$2,$3,50)', [c, shop, arin])
    return { c, arin, shop }
  }
  const modifiers = async (shop: string) => {
    await asSystem()
    return rows('select campaign_id, percent from public.shop_modifiers where shop_id=$1', [shop])
  }

  it('PoC: a Player who is DM of their own campaign cannot delete or change a modifier of the other campaign', async () => {
    const b = await market()
    await asUser(player)
    await expect(
      db.query('select public.set_shop_modifier($1,$2,$3,0)', [b.c, b.shop, b.arin]),
    ).rejects.toThrow(/Forbidden/)
    const a = await scalar("select public.create_campaign('Attacker base') result")
    await expect(
      db.query('select public.set_shop_modifier($1,$2,$3,0)', [a, b.shop, b.arin]),
    ).rejects.toThrow(/Shop unavailable/)
    await expect(
      db.query('select public.set_shop_modifier($1,$2,$3,-100)', [a, b.shop, b.arin]),
    ).rejects.toThrow(/Shop unavailable/)
    expect(await modifiers(b.shop)).toEqual([{ campaign_id: b.c, percent: 50 }])
  })

  it('denies anon, outsiders, Players and other DMs; refuses a foreign character; the DM edits and clears', async () => {
    const b = await market()
    await asUser(otherDm)
    const other = await scalar("select public.create_campaign('Rival') result")
    const rivalChar = await scalar("select public.create_character($1,'Rival') result", [other])
    const rivalShop = await scalar<string>('select public.save_shop($1,null,null,$2,$3) result', [
      other,
      JSON.stringify({ name: 'Rival shop', visibility: 'party', mode: 'auto' }),
      randomUUID(),
    ])
    for (const pct of [0, 10]) {
      await expect(
        db.query('select public.set_shop_modifier($1,$2,$3,$4)', [other, b.shop, b.arin, pct]),
      ).rejects.toThrow(/Shop unavailable/)
      await expect(
        db.query('select public.set_shop_modifier($1,$2,$3,$4)', [other, rivalShop, b.arin, pct]),
      ).rejects.toThrow(/Character unavailable/)
      await expect(
        db.query('select public.set_shop_modifier($1,$2,$3,$4)', [b.c, b.shop, b.arin, pct]),
      ).rejects.toThrow(/Forbidden/)
    }
    for (const user of [outsider, player]) {
      await asUser(user)
      await expect(
        db.query('select public.set_shop_modifier($1,$2,$3,0)', [b.c, b.shop, b.arin]),
      ).rejects.toThrow(/Forbidden/)
    }
    await asAnon()
    await expect(
      db.query('select public.set_shop_modifier($1,$2,$3,0)', [b.c, b.shop, b.arin]),
    ).rejects.toThrow(/permission denied/)
    await asUser(dm)
    await expect(
      db.query('select public.set_shop_modifier($1,$2,$3,10)', [b.c, b.shop, rivalChar]),
    ).rejects.toThrow(/Character unavailable/)
    await db.query('select public.set_shop_modifier($1,$2,$3,-20)', [b.c, b.shop, b.arin])
    expect(await modifiers(b.shop)).toEqual([{ campaign_id: b.c, percent: -20 }])
    await asUser(dm)
    await db.query('select public.set_shop_modifier($1,$2,$3,0)', [b.c, b.shop, b.arin])
    expect(await modifiers(b.shop)).toEqual([])
  })

  it('applies the same fix in PRE', async () => {
    const b = await campaign(dm, 'pre', 'Pre market')
    await asUser(dm)
    const shop = await scalar<string>('select pre.save_shop($1,null,null,$2,$3) result', [
      b.c,
      JSON.stringify({ name: 'Market', visibility: 'party', mode: 'auto' }),
      randomUUID(),
    ])
    await db.query('select pre.set_shop_modifier($1,$2,$3,50)', [b.c, shop, b.arin])
    await asUser(player)
    const a = await scalar("select pre.create_campaign('Attacker base') result")
    await expect(
      db.query('select pre.set_shop_modifier($1,$2,$3,0)', [a, shop, b.arin]),
    ).rejects.toThrow(/Shop unavailable/)
    await asSystem()
    expect(await rows('select percent from pre.shop_modifiers where shop_id=$1', [shop])).toEqual([
      { percent: 50 },
    ])
  })
})

describe('RYT-113 H-3 quotas', () => {
  it('caps campaigns per owner at 20, keeps existing excess usable and needs a session', async () => {
    await asUser(hoarder)
    for (let i = 0; i < 20; i++) await scalar('select public.create_campaign($1) result', [`C${i}`])
    await expect(db.query("select public.create_campaign('One more')")).rejects.toThrow(
      /Campaign limit/,
    )
    // Rows already over a lowered limit stay usable; only new creations are refused.
    await quota('campaigns_per_owner', 5)
    await asUser(hoarder)
    await db.query("update public.campaigns set name = 'Renamed' where name = 'C3'")
    expect(await rows("select id from public.campaigns where name = 'Renamed'")).toHaveLength(1)
    await expect(db.query("select public.create_campaign('Again')")).rejects.toThrow(
      /Campaign limit/,
    )
    // Another account is unaffected.
    await asUser(otherDm)
    await scalar("select public.create_campaign('Mine') result")
    await asAnon()
    await expect(db.query("select public.create_campaign('Anon')")).rejects.toThrow(
      /permission denied/,
    )
    await quota('campaigns_per_owner', 20)
  })

  it('caps tabletop scenes per campaign; Players, outsiders and other DMs still get Forbidden', async () => {
    const { c } = await campaign(dm, 'public', 'Scenes')
    await quota('scenes_per_campaign', 2)
    const save = (name: string) =>
      db.query('select public.save_tabletop_scene($1,null,$2,null,$3)', [
        c,
        JSON.stringify({ name }),
        randomUUID(),
      ])
    await asUser(dm)
    await save('One')
    await save('Two')
    await expect(save('Three')).rejects.toThrow(/Scene limit/)
    for (const user of [player, outsider, otherDm]) {
      await asUser(user)
      await expect(save('Mine')).rejects.toThrow(/Forbidden/)
    }
    await quota('scenes_per_campaign', 60)
  })

  it('caps characters per user and per campaign', async () => {
    const { c } = await campaign(dm, 'public', 'Roster')
    await quota('characters_per_user', 2)
    await asUser(player)
    // Arin is the first; one more fits, the third is refused although the roster allows four.
    await scalar('select public.create_own_character($1,$2,$3) result', [c, 'Bryn', randomUUID()])
    await expect(
      db.query('select public.create_own_character($1,$2,$3)', [c, 'Cora', randomUUID()]),
    ).rejects.toThrow(/Character limit/)
    await quota('characters_per_campaign', 4)
    await asUser(dm)
    await scalar("select public.create_character($1,'Pool one') result", [c])
    await scalar("select public.create_character($1,'Pool two') result", [c])
    await expect(db.query("select public.create_character($1,'Pool three')", [c])).rejects.toThrow(
      /Character limit/,
    )
    for (const user of [outsider, otherDm]) {
      await asUser(user)
      await expect(db.query("select public.create_character($1,'X')", [c])).rejects.toThrow(
        /Forbidden|row-level security|Character limit/,
      )
    }
    await quota('characters_per_user', 10)
    await quota('characters_per_campaign', 300)
  })

  it('caps stored media per campaign, audio separately, only on upload, per environment', async () => {
    const { c } = await campaign(dm, 'public', 'Media')
    await quota('media_per_campaign', 3)
    await quota('audio_per_campaign', 1)
    const path = (kind: string, ext: string, env = 'public', campaignId = c) =>
      `${env}/${campaignId}/${kind}/${randomUUID()}.${ext}`
    const upload = (name: string) =>
      db.query("insert into storage.objects(bucket_id, name) values ('tabletop-media', $1)", [name])
    await asUser(dm)
    await upload(path('audio', 'mp3'))
    await expect(upload(path('audio', 'ogg'))).rejects.toThrow(/row-level security/)
    const map = path('map', 'webp')
    await upload(map)
    await upload(path('card', 'png'))
    await expect(upload(path('map', 'webp'))).rejects.toThrow(/row-level security/)
    // Deleting stays possible at the limit and frees a slot.
    await db.query("delete from storage.objects where bucket_id='tabletop-media' and name=$1", [
      map,
    ])
    await upload(path('map', 'jpg'))
    // Another campaign keeps its own count; outsiders, Players and anon are refused anyway.
    await asUser(otherDm)
    const other = await scalar("select public.create_campaign('Media two') result")
    await upload(path('map', 'webp', 'public', other))
    for (const user of [outsider, player]) {
      await asUser(user)
      await expect(upload(path('map', 'webp', 'public', other))).rejects.toThrow(
        /row-level security/,
      )
    }
    await asAnon()
    await expect(upload(path('map', 'webp'))).rejects.toThrow(/permission denied/)
    // PRE objects use the PRE quota table.
    const p = await campaign(dm, 'pre', 'Pre media')
    await quota('media_per_campaign', 1, 'pre_private')
    await asUser(dm)
    await upload(path('map', 'webp', 'pre', p.c))
    await expect(upload(path('map', 'webp', 'pre', p.c))).rejects.toThrow(/row-level security/)
    await quota('media_per_campaign', 200)
    await quota('audio_per_campaign', 30)
    await quota('media_per_campaign', 200, 'pre_private')
  })

  it('anchors portrait uploads to {env}/{campaign}/{character}/{uuid}.{webp|png|jpg}', async () => {
    const { c, arin } = await campaign(dm, 'public', 'Portraits')
    const upload = (name: string) =>
      db.query("insert into storage.objects(bucket_id, name) values ('character-portraits', $1)", [
        name,
      ])
    await asUser(player)
    for (const name of [
      `public/${c}/${arin}/payload.html`,
      `public/${c}/${arin}/deep/${randomUUID()}.webp`,
      `public/${c}/${arin}/${randomUUID()}.svg`,
    ])
      await expect(upload(name)).rejects.toThrow(/row-level security/)
    await upload(`public/${c}/${arin}/${randomUUID()}.webp`)
    for (const user of [outsider, otherDm, peer]) {
      await asUser(user)
      await expect(upload(`public/${c}/${arin}/${randomUUID()}.webp`)).rejects.toThrow(
        /row-level security/,
      )
    }
  })

  it('keeps every new function definer-safe and closed to anon', async () => {
    await asSystem()
    const fns = await rows(
      `select n.nspname || '.' || p.proname as name, p.prosecdef, p.proconfig,
        has_function_privilege('anon', p.oid, 'execute') anon,
        has_function_privilege('authenticated', p.oid, 'execute') authed
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname in ('private', 'pre_private') and p.proname in ('quota_limit', 'quota_lock',
         'quota_campaigns', 'quota_scenes', 'quota_characters', 'invitation_responded',
         'quota_invitations', 'encounter_signal', 'storage_quota_ok') order by 1`,
    )
    expect(fns).toHaveLength(17)
    for (const fn of fns) {
      expect(fn).toMatchObject({ prosecdef: true, proconfig: ['search_path=""'], anon: false })
      expect(fn.authed).toBe(fn.name === 'private.storage_quota_ok')
    }
    const src = await rows(
      "select prosrc from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='pre_private' and p.proname like 'quota%'",
    )
    for (const r of src) expect(r.prosrc).not.toMatch(/\bpublic\.|\bprivate\./)
    await asUser(dm)
    await expect(db.query('select * from private.quota_limits')).rejects.toThrow(
      /permission denied/,
    )
    await expect(db.query("select private.quota_limit('media_per_campaign')")).rejects.toThrow(
      /permission denied/,
    )
  })
})

describe('RYT-113 M-2 invitations', () => {
  it('throttles an inviter to 20 per hour and 100 pending', async () => {
    await asUser(spammer)
    const c = await scalar(
      "select public.create_campaign('Verify your account at evil.example') result",
    )
    for (let i = 0; i < 20; i++)
      await scalar('select public.invite_campaign_member($1,$2) result', [
        c,
        `victim${i}@example.com`,
      ])
    await expect(
      db.query('select public.invite_campaign_member($1,$2)', [c, 'victim20@example.com']),
    ).rejects.toThrow(/Too many invitations/)
    // A new campaign does not reset the per-inviter window.
    const c2 = await scalar("select public.create_campaign('Second front') result")
    await expect(
      db.query('select public.invite_campaign_member($1,$2)', [c2, 'victim0@example.com']),
    ).rejects.toThrow(/Too many invitations/)
    // Outside the hour, the pending total still applies.
    await asSystem()
    await db.query(
      "update public.campaign_invitations set created_at = now() - interval '2 hours', expires_at = now() + interval '5 days' where created_by = $1",
      [spammer],
    )
    await quota('pending_invitations_per_inviter', 20)
    await asUser(spammer)
    await expect(
      db.query('select public.invite_campaign_member($1,$2)', [c2, 'victim21@example.com']),
    ).rejects.toThrow(/Too many invitations/)
    await quota('pending_invitations_per_inviter', 100)
    await asUser(spammer)
    await scalar('select public.invite_campaign_member($1,$2) result', [c2, 'victim21@example.com'])
  })

  it('caps seats (members plus pending invitations) per campaign; a member claim takes no seat', async () => {
    const { c } = await campaign(dm, 'public', 'Seats')
    await asUser(dm)
    const bea = await scalar("select public.create_character($1,'Bea') result", [c])
    await quota('members_per_campaign', 3)
    await asUser(dm)
    // DM + player are members; one pending invitation fills the third seat.
    await scalar('select public.invite_campaign_member($1,$2) result', [c, 'seat@example.com'])
    await expect(
      db.query('select public.invite_campaign_member($1,$2)', [c, 'extra@example.com']),
    ).rejects.toThrow(/Member limit/)
    // Reissuing the same pending invitation and inviting an existing member to a character are fine.
    await scalar('select public.invite_campaign_member($1,$2) result', [c, 'seat@example.com'])
    await scalar('select public.invite_character_player($1,$2,$3) result', [c, bea, emails[player]])
    await expect(
      db.query('select public.invite_character_player($1,$2,$3)', [c, bea, 'extra@example.com']),
    ).rejects.toThrow(/Member limit/)
    for (const user of [player, outsider, otherDm]) {
      await asUser(user)
      await expect(
        db.query('select public.invite_campaign_member($1,$2)', [c, 'x@example.com']),
      ).rejects.toThrow(/Forbidden/)
    }
    await asAnon()
    await expect(
      db.query('select public.invite_campaign_member($1,$2)', [c, 'x@example.com']),
    ).rejects.toThrow(/permission denied/)
    await quota('members_per_campaign', 30)
  })

  it('refuses a new invitation from the same campaign for 7 days after a decline', async () => {
    await asUser(otherDm)
    const c = await scalar("select public.create_campaign('Persistent') result")
    const first = await scalar('select public.invite_campaign_member($1,$2) result', [
      c,
      emails[outsider],
    ])
    await asUser(outsider)
    await db.query('select public.respond_campaign_invitation($1,false)', [first])
    await asSystem()
    expect(
      await rows(
        'select status, responded_at is not null responded from public.campaign_invitations where id=$1',
        [first],
      ),
    ).toEqual([{ status: 'declined', responded: true }])
    await asUser(otherDm)
    await expect(
      db.query('select public.invite_campaign_member($1,$2)', [c, emails[outsider]]),
    ).rejects.toThrow(/Invitation declined/)
    // Another campaign may still invite; the block ends after the cooldown.
    await asUser(dm)
    const elsewhere = await scalar("select public.create_campaign('Elsewhere keep') result")
    await scalar('select public.invite_campaign_member($1,$2) result', [
      elsewhere,
      emails[outsider],
    ])
    await asSystem()
    await db.query(
      "update public.campaign_invitations set responded_at = now() - interval '8 days' where id=$1",
      [first],
    )
    await asUser(otherDm)
    await scalar('select public.invite_campaign_member($1,$2) result', [c, emails[outsider]])
  })

  it('lists at most the configured number of invitations, newest first, for the invitee only', async () => {
    await quota('invitations_listed', 2)
    await asUser(dm)
    const made: string[] = []
    for (const name of ['L1', 'L2', 'L3']) {
      const c = await scalar('select public.create_campaign($1) result', [name])
      made.push(
        await scalar('select public.invite_campaign_member($1,$2) result', [c, emails[peer]]),
      )
      await asSystem()
      await db.query(
        'update public.campaign_invitations set created_at = clock_timestamp() where id=$1',
        [made.at(-1)],
      )
      await asUser(dm)
    }
    await asUser(peer)
    const listed = await rows('select id from public.list_my_invitations()')
    expect(listed.map((r) => r.id)).toEqual([made[2], made[1]])
    await asUser(outsider)
    expect(
      (await rows('select id from public.list_my_invitations()')).map((r) => r.id),
    ).not.toContain(made[2])
    await asAnon()
    await expect(db.query('select * from public.list_my_invitations()')).rejects.toThrow(
      /permission denied/,
    )
    await quota('invitations_listed', 50)
  })
})
