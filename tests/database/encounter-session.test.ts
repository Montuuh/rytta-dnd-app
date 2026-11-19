import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

const migration = '20261206120000_encounter_session_preparation.sql'
const db = new PGlite()
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

describe.each(schemas)('%s encounter plans and continuity', (schema) => {
  it('keeps a resumable, versioned draft and exposes only the chosen recap', async () => {
    const dm = await user('dm'),
      player = await user('player'),
      outsider = await user('outsider'),
      otherDm = await user('other-dm')
    await asUser(otherDm)
    const foreignCampaign = await scalar(`select ${schema}.create_campaign('Other') result`)
    const foreignEncounter = (
      await scalar<{ encounter_id: string }>(
        `select ${schema}.create_encounter($1,'Foreign',$2) result`,
        [foreignCampaign, randomUUID()],
      )
    ).encounter_id
    const foreignCharacter = await scalar(
      `select ${schema}.create_character($1,'Foreign') result`,
      [foreignCampaign],
    )
    await asUser(dm)
    const campaign = await scalar(`select ${schema}.create_campaign('Library') result`)
    const invite = await scalar(`select ${schema}.invite_campaign_member($1,$2) result`, [
      campaign,
      emails.get(player),
    ])
    await asUser(player)
    await db.query(`select ${schema}.respond_campaign_invitation($1,true)`, [invite])
    await asUser(dm)
    const continuity = () =>
      scalar<import('../../src/features/combat/domain/session.ts').SessionContinuity>(
        `select ${schema}.get_session_continuity($1) result`,
        [campaign],
      )
    const published = () =>
      scalar(`select ${schema}.get_shared_session_recap($1) result`, [campaign])
    const close = (revision: number, id: string | null, text: string, request = randomUUID()) =>
      scalar(`select ${schema}.save_session_continuity($1,$2,$3,false,$4,$5,$6,$7,$8) result`, [
        campaign,
        revision,
        id,
        'DM secret',
        'Under the bridge',
        'Emerald',
        text,
        request,
      ])
    expect(await continuity()).toEqual({
      lastEncounter: null,
      privateNote: '',
      nextScene: '',
      pendingReward: '',
      sharedRecap: '',
      revision: 0,
    })
    const a = await scalar(`select ${schema}.create_character($1,'Arin') result`, [campaign])
    const b = await scalar(`select ${schema}.create_character($1,'Bea') result`, [campaign])
    const encounter = (
      await scalar<{ encounter_id: string }>(
        `select ${schema}.create_encounter($1,'Bridge',$2) result`,
        [campaign, randomUUID()],
      )
    ).encounter_id
    const readPlan = (id = encounter) =>
      scalar<import('../../src/features/combat/domain/session.ts').EncounterPlan>(
        `select ${schema}.get_encounter_plan($1,$2) result`,
        [campaign, id],
      )
    await asSystem()
    const scene = await scalar(
      `insert into ${schema}.tabletop_scenes(campaign_id,name) values($1,'Tower') returning id result`,
      [campaign],
    )
    const foreignScene = await scalar(
      `insert into ${schema}.tabletop_scenes(campaign_id,name) values($1,'Other') returning id result`,
      [foreignCampaign],
    )
    await asUser(dm)
    const plan = (
      revision: number,
      attendees: string[] | null,
      sceneId = scene,
      request = randomUUID(),
    ) =>
      scalar<{ revision: number }>(
        `select ${schema}.save_encounter_plan($1,$2,$3,$4,'Gem cache',$5,$6) result`,
        [campaign, encounter, revision, sceneId, attendees, request],
      )
    const duplicate = (request = randomUUID()) =>
      scalar<{ encounter_id: string }>(
        `select ${schema}.duplicate_encounter_plan($1,$2,'Copy',$3) result`,
        [campaign, encounter, request],
      )
    await expect(readPlan(foreignEncounter)).rejects.toThrow('Encounter unavailable')
    await expect(
      db.query(`select ${schema}.save_encounter_plan($1,$2,0,null,'',null,$3)`, [
        campaign,
        foreignEncounter,
        randomUUID(),
      ]),
    ).rejects.toThrow('Encounter unavailable')
    await expect(
      db.query(`select ${schema}.duplicate_encounter_plan($1,$2,'Other',$3)`, [
        campaign,
        foreignEncounter,
        randomUUID(),
      ]),
    ).rejects.toThrow('Encounter unavailable')
    await expect(close(0, foreignEncounter, '')).rejects.toThrow('Encounter unavailable')
    await expect(plan(0, [a, foreignCharacter])).rejects.toThrow('Invalid request')
    await expect(plan(0, [a], foreignScene)).rejects.toThrow('Scene unavailable')
    const key = randomUUID()
    const saved = await plan(0, [a, b], scene, key)
    expect(await plan(0, [a, b], scene, key)).toEqual(saved)
    await expect(plan(0, [a])).rejects.toThrow('Stale revision')
    await plan(saved.revision, [a])
    expect(await readPlan()).toMatchObject({
      sceneId: scene,
      reward: 'Gem cache',
      attendanceSet: true,
      scenes: [{ id: scene, name: 'Tower' }],
    })
    await db.query(`select ${schema}.add_combatants($1,$2,$3,$4)`, [
      campaign,
      encounter,
      JSON.stringify([
        {
          kind: 'npc',
          name: 'Guardian',
          srd_id: 'wolf',
          max_hp: 15,
          public_name: 'Shadow',
          dm_notes: 'Secret',
        },
      ]),
      randomUUID(),
    ])
    const unavailable = await scalar(`select ${schema}.create_character($1,'Away') result`, [
      campaign,
    ])
    await db.query(`select ${schema}.add_combatants($1,$2,$3,$4)`, [
      campaign,
      encounter,
      JSON.stringify([
        { kind: 'character', character_id: b },
        { kind: 'character', character_id: unavailable },
      ]),
      randomUUID(),
    ])
    await db.query(`select ${schema}.set_character_absent($1,$2,true)`, [campaign, b])
    await db.query(`select ${schema}.archive_character($1,$2)`, [campaign, unavailable])
    const hidden = schema === 'pre' ? 'pre_private' : 'private'
    await asSystem()
    await db.exec(
      `update ${hidden}.quota_limits set max_count=1 where quota='combatants_per_draft_copy'`,
    )
    await asUser(dm)
    await expect(duplicate()).rejects.toThrow('Draft copy limit')
    await asSystem()
    await db.exec(
      `update ${hidden}.quota_limits set max_count=600 where quota='combatants_per_draft_copy'`,
    )
    await asUser(dm)
    const copyKey = randomUUID()
    const copied = await duplicate(copyKey)
    expect(await duplicate(copyKey)).toEqual(copied)
    expect(await readPlan(copied.encounter_id)).toEqual(await readPlan())
    const state = (id: string) =>
      scalar<{
        encounter: { revision: number }
        combatants: { id: string; name: string; dm_notes?: string; srd_id?: string }[]
      }>(`select ${schema}.get_combat_state($1,$2,false) result`, [campaign, id])
    const source = await state(encounter),
      copy = await state(copied.encounter_id)
    expect(copy.combatants.map((c) => c.name).sort()).toEqual(['Arin', 'Guardian'])
    expect(copy.combatants.find((c) => c.name === 'Guardian')).toMatchObject({
      srd_id: 'wolf',
      dm_notes: 'Secret',
    })
    expect(copy.combatants.map((c) => c.id)).not.toContain(source.combatants[0]!.id)
    await plan(source.encounter.revision, [])
    expect((await state(encounter)).combatants).toHaveLength(1)
    expect((await state(copied.encounter_id)).combatants).toHaveLength(2)
    expect((await continuity()).nextScene).toBe('Tower')
    await db.query(`select ${schema}.set_encounter_status($1,$2,'initiative',$3)`, [
      campaign,
      encounter,
      randomUUID(),
    ])
    await expect(duplicate()).rejects.toThrow('Encounter closed')
    await db.query(`select ${schema}.set_encounter_status($1,$2,'ended',$3)`, [
      campaign,
      encounter,
      randomUUID(),
    ])
    expect(await continuity()).toMatchObject({
      lastEncounter: { id: encounter, name: 'Bridge' },
      nextScene: 'Tower',
      pendingReward: 'Gem cache',
    })
    const closureKey = randomUUID()
    const receipt = await close(0, null, '', closureKey)
    expect(await close(0, null, '', closureKey)).toEqual(receipt)
    expect(await continuity()).toMatchObject({
      lastEncounter: null,
      revision: 1,
      privateNote: 'DM secret',
      pendingReward: 'Emerald',
    })
    expect(await published()).toBe('')
    await expect(close(0, null, 'Stale')).rejects.toThrow('Stale revision')
    await expect(close(1, randomUUID(), 'Unknown')).rejects.toThrow('Encounter unavailable')
    await close(1, encounter, 'Only this text')
    for (const actor of [player, otherDm, outsider, null]) {
      if (actor) await asUser(actor)
      else await asAnon()
      const denial = actor ? 'Forbidden' : 'permission denied'
      await expect(readPlan()).rejects.toThrow(denial)
      await expect(plan(0, [a])).rejects.toThrow(denial)
      await expect(duplicate(copyKey)).rejects.toThrow(denial)
      await expect(continuity()).rejects.toThrow(denial)
      await expect(close(0, null, '', closureKey)).rejects.toThrow(denial)
      if (actor === player) {
        expect(await published()).toBe('Only this text')
        await expect(state(copied.encounter_id)).rejects.toThrow('Encounter unavailable')
      } else await expect(published()).rejects.toThrow(denial)
      const hidden = schema === 'pre' ? 'pre_private' : 'private'
      for (const table of ['encounter_plans', 'session_handoffs', 'session_publications']) {
        await expect(db.exec(`select * from ${hidden}.${table}`)).rejects.toThrow(
          'permission denied',
        )
        await expect(db.exec(`delete from ${hidden}.${table}`)).rejects.toThrow('permission denied')
      }
    }
    await asUser(dm)
    await close(2, copied.encounter_id, '')
    expect(await continuity()).toMatchObject({
      lastEncounter: { id: copied.encounter_id },
      sharedRecap: '',
    })
    await asUser(player)
    expect(await published()).toBe('')
    await asUser(dm)
    await db.query(`select ${schema}.save_session_continuity($1,3,null,true,'','','','',$2)`, [
      campaign,
      randomUUID(),
    ])
    expect((await continuity()).lastEncounter?.id).toBe(encounter)
    await db.query(`select ${schema}.change_campaign_member($1,$2,null)`, [campaign, player])
    await asUser(player)
    for (const call of [
      published,
      continuity,
      () => readPlan(),
      () => plan(0, [a]),
      () => duplicate(copyKey),
      () => close(0, null, '', closureKey),
    ]) {
      await expect(call()).rejects.toThrow('Forbidden')
    }
    await asSystem()
    const stored = await scalar(
      `select payload::text result from ${hidden}.combat_requests where request_id=$1`,
      [closureKey],
    )
    expect(stored).not.toMatch(/DM secret|Emerald|Under the bridge/)
  })
})
