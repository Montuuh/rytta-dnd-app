import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-089: each campaign downloads the official bestiary and keeps its own versions of creatures.
const migration = '20261115120000_campaign_bestiary.sql'
const db = new PGlite()
const dm = randomUUID(),
  player = randomUUID(),
  outsider = randomUUID(),
  otherDm = randomUUID()
const asUser = async (id: string) => {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
}
const asAnon = async () => {
  await db.exec('reset role; set role anon')
  await db.query("select set_config('request.jwt.claim.sub', '', false)")
}
type Json = Record<string, unknown>
type State = { downloaded: boolean; removed: string[]; versions_removed?: number }
const one = async <T = Json>(sql: string, args: unknown[] = []) =>
  (await db.query<T>(sql, args)).rows[0]!
const res = async (sql: string, args: unknown[] = []) =>
  (await one<{ result: Json }>(sql, args)).result

function api(schema = 'public') {
  return {
    get: async (c: string) =>
      (await res(`select ${schema}.get_srd_bestiary($1) result`, [c])) as unknown as State,
    set: async (c: string, action: string, srd: string | null = null, key = randomUUID()) =>
      (await res(`select ${schema}.set_srd_bestiary($1,$2,$3,$4) result`, [
        c,
        action,
        srd,
        key,
      ])) as unknown as State,
    save: async (
      c: string,
      data: Json,
      template: string | null = null,
      revision: number | null = null,
    ) =>
      (await res(`select ${schema}.save_combatant_template($1,$2,$3,$4,$5) result`, [
        c,
        template,
        revision,
        JSON.stringify(data),
        randomUUID(),
      ])) as { id: string; revision: number },
    list: async (c: string) =>
      (await res(`select ${schema}.list_combatant_templates($1) result`, [c])) as unknown as {
        id: string
        name: string
        srd_id?: string
        srd_override?: boolean
      }[],
  }
}
const pub = api()
const wolfVersion = { name: 'Lobo', max_hp: 15, srd_id: 'wolf', srd_override: true }

async function setup(schema = 'public') {
  await asUser(dm)
  const c = (await one<{ id: string }>(`select ${schema}.create_campaign('Bestiary table') id`)).id
  const arin = (await one<{ id: string }>(`select ${schema}.create_character($1,'Arin') id`, [c]))
    .id
  const invite = (
    await one<{ id: string }>(`select ${schema}.invite_character_player($1,$2,$3) id`, [
      c,
      arin,
      'player@example.com',
    ])
  ).id
  await asUser(player)
  await db.query(`select ${schema}.respond_campaign_invitation($1,true)`, [invite])
  await asUser(dm)
  return c
}

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`)
  for (const [id, email] of [
    [dm, 'dm@example.com'],
    [player, 'player@example.com'],
    [outsider, 'other@example.com'],
    [otherDm, 'otherdm@example.com'],
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
  // A PRE copied (ETL) before this migration exercises its guarded PRE mirror.
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

describe('RYT-089 campaign bestiary', () => {
  it('starts without the official bestiary; downloads, removes, replays and downloads again', async () => {
    const c = await setup()
    expect(await pub.get(c)).toMatchObject({ downloaded: false, removed: [] })
    // Nothing to remove before the download.
    await expect(pub.set(c, 'remove', 'wolf')).rejects.toThrow(/Invalid request/)
    const key = randomUUID()
    expect(await pub.set(c, 'download', null, key)).toMatchObject({
      downloaded: true,
      removed: [],
      versions_removed: 0,
    })
    await pub.set(c, 'download', null, key) // replay
    await expect(pub.set(c, 'remove', 'wolf', key)).rejects.toThrow(/Request mismatch/)
    await pub.set(c, 'download') // a second download is harmless
    await pub.set(c, 'remove', 'wolf')
    await pub.set(c, 'remove', 'wolf')
    await pub.set(c, 'remove', 'adult-red-dragon')
    expect((await pub.get(c)).removed).toEqual(['adult-red-dragon', 'wolf'])
    // Downloading again brings every official creature back.
    expect(await pub.set(c, 'download')).toMatchObject({ downloaded: true, removed: [] })
    await pub.set(c, 'remove', 'ghoul')
    expect(await pub.set(c, 'remove_all')).toMatchObject({ downloaded: false, removed: [] })
    expect(
      (await db.query('select 1 from public.campaign_srd_removed where campaign_id = $1', [c]))
        .rows,
    ).toHaveLength(0)
    for (const [action, srd] of [
      ['download', 'wolf'],
      ['remove_all', 'wolf'],
      ['remove', null],
      ['remove', 'Wolf'],
      ['remove', '-wolf'],
      ['remove', 'a'.repeat(81)],
      ['import', null],
      [null, null],
    ] as const)
      await expect(pub.set(c, action as string, srd)).rejects.toThrow(/Invalid request/)
    await db.exec('reset role')
  })

  it('keeps one campaign version per official creature, and removing the creature drops it', async () => {
    const c = await setup()
    // A version needs the official creature in the campaign's bestiary.
    await expect(pub.save(c, wolfVersion)).rejects.toThrow(/Invalid request/)
    await pub.set(c, 'download')
    await expect(pub.save(c, { ...wolfVersion, srd_id: undefined })).rejects.toThrow(
      /Invalid request/,
    )
    const version = await pub.save(c, wolfVersion)
    await expect(pub.save(c, wolfVersion)).rejects.toThrow(/Already modified/)
    // A creature based on the wolf (the older copy) is not a version and may coexist.
    const based = await pub.save(c, { name: 'Lobo alfa', max_hp: 20, srd_id: 'wolf' })
    expect((await pub.list(c)).map((t) => [t.name, t.srd_id, t.srd_override])).toEqual([
      ['Lobo', 'wolf', true],
      ['Lobo alfa', 'wolf', false],
    ])
    // Editing a version keeps it the version of the same creature.
    const edited = await pub.save(c, { ...wolfVersion, max_hp: 18 }, version.id, version.revision)
    await expect(
      pub.save(c, { ...wolfVersion, srd_id: 'dire-wolf' }, version.id, edited.revision),
    ).rejects.toThrow(/Invalid request/)
    await expect(
      pub.save(c, { ...wolfVersion, srd_override: false }, version.id, edited.revision),
    ).rejects.toThrow(/Invalid request/)
    await expect(
      pub.save(
        c,
        { name: 'Lobo alfa', max_hp: 20, srd_id: 'wolf', srd_override: true },
        based.id,
        0,
      ),
    ).rejects.toThrow(/Invalid request/)
    // Removing the official creature removes its version, not the creature based on it.
    expect(await pub.set(c, 'remove', 'wolf')).toMatchObject({ versions_removed: 1 })
    expect((await pub.list(c)).map((t) => t.name)).toEqual(['Lobo alfa'])
    // A removed creature takes no version until it is downloaded again.
    await expect(pub.save(c, wolfVersion)).rejects.toThrow(/Invalid request/)
    await pub.set(c, 'download')
    await pub.save(c, wolfVersion)
    await pub.save(c, { name: 'Necrófago', max_hp: 22, srd_id: 'ghoul', srd_override: true })
    expect(await pub.set(c, 'remove_all')).toMatchObject({ downloaded: false, versions_removed: 2 })
    expect((await pub.list(c)).map((t) => t.name)).toEqual(['Lobo alfa'])
    await db.exec('reset role')
  })

  it('keeps the campaign bestiary to its DM: RPCs, tables and direct writes', async () => {
    const c = await setup()
    await pub.set(c, 'download')
    await pub.set(c, 'remove', 'wolf')
    for (const user of [player, outsider, otherDm]) {
      await asUser(user)
      await expect(pub.get(c)).rejects.toThrow(/Forbidden/)
      await expect(pub.set(c, 'remove_all')).rejects.toThrow(/Forbidden/)
      await expect(pub.save(c, { ...wolfVersion, srd_id: 'ghoul' })).rejects.toThrow(/Forbidden/)
      for (const table of ['campaign_srd_bestiary', 'campaign_srd_removed'])
        expect(
          (await db.query(`select * from public.${table} where campaign_id = $1`, [c])).rows,
        ).toHaveLength(0)
    }
    // A DM of another campaign is refused through the target campaign id; theirs is separate, and
    // removing the official bestiary there leaves this campaign's versions alone.
    await asUser(dm)
    await pub.save(c, { ...wolfVersion, srd_id: 'ghoul' })
    await asUser(otherDm)
    const elsewhere = (await one<{ id: string }>("select public.create_campaign('Elsewhere') id"))
      .id
    expect(await pub.get(elsewhere)).toMatchObject({ downloaded: false })
    await pub.set(elsewhere, 'download')
    await pub.save(elsewhere, { ...wolfVersion, srd_id: 'ghoul' })
    expect(await pub.set(elsewhere, 'remove_all')).toMatchObject({ versions_removed: 1 })
    // The state helper is not callable directly, not even by a DM.
    await expect(db.query('select private.srd_bestiary_state($1)', [c])).rejects.toThrow(
      /permission denied/,
    )
    // A former member (membership removed) is refused like an outsider.
    await db.exec('reset role')
    await db.query(
      'update public.characters set user_id = null where campaign_id = $1 and user_id = $2',
      [c, player],
    )
    await db.query('delete from public.campaign_members where campaign_id = $1 and user_id = $2', [
      c,
      player,
    ])
    await asUser(player)
    await expect(pub.get(c)).rejects.toThrow(/Forbidden/)
    await expect(pub.set(c, 'download')).rejects.toThrow(/Forbidden/)
    await asAnon()
    await expect(pub.get(c)).rejects.toThrow(/permission denied/)
    await expect(pub.set(c, 'download')).rejects.toThrow(/permission denied/)
    await expect(pub.save(c, wolfVersion)).rejects.toThrow(/permission denied/)
    await expect(pub.list(c)).rejects.toThrow(/permission denied/)
    for (const table of ['campaign_srd_bestiary', 'campaign_srd_removed'])
      await expect(db.query(`select * from public.${table}`)).rejects.toThrow(/permission denied/)
    // Writes go through the RPCs only, for the DM too.
    await asUser(dm)
    for (const sql of [
      `insert into public.campaign_srd_bestiary values ('${elsewhere}')`,
      'delete from public.campaign_srd_bestiary',
      `insert into public.campaign_srd_removed values ('${c}', 'ghoul')`,
      'delete from public.campaign_srd_removed',
      'update public.combatant_templates set srd_override = true',
    ])
      await expect(db.query(sql)).rejects.toThrow(/permission denied/)
    expect(await pub.get(c)).toMatchObject({ downloaded: true, removed: ['wolf'] })
    expect((await pub.list(c)).filter((t) => t.srd_override).map((t) => t.srd_id)).toEqual([
      'ghoul',
    ])
    await db.exec('reset role')
  })

  it('caps the removed creatures and refreshes running fights that used a removed version', async () => {
    const c = await setup()
    await pub.set(c, 'download')
    const version = await pub.save(c, { ...wolfVersion, srd_id: 'ghoul' })
    const fight = (
      await res('select public.create_encounter($1,$2,$3) result', [c, 'Crypt', randomUUID()])
    ).encounter_id as string
    await res('select public.add_combatants($1,$2,$3,$4) result', [
      c,
      fight,
      JSON.stringify([
        { kind: 'npc', name: 'Necrófago', count: 1, max_hp: 22, template_id: version.id },
      ]),
      randomUUID(),
    ])
    await db.exec('reset role')
    await db.query("update public.encounters set status = 'active' where id = $1", [fight])
    const before = (
      await one<{ revision: number }>('select revision from public.encounters where id = $1', [
        fight,
      ])
    ).revision
    await asUser(dm)
    expect(await pub.set(c, 'remove', 'ghoul')).toMatchObject({ versions_removed: 1 })
    await db.exec('reset role')
    const after = (
      await one<{ revision: number }>('select revision from public.encounters where id = $1', [
        fight,
      ])
    ).revision
    expect(Number(after)).toBeGreaterThan(Number(before))
    // The fight keeps its creature; only the link to the deleted version goes.
    expect(
      (
        await db.query(
          'select template_id from public.encounter_combatants where encounter_id = $1',
          [fight],
        )
      ).rows,
    ).toEqual([{ template_id: null }])
    // At most 1000 removed creatures per campaign.
    await db.query(
      "insert into public.campaign_srd_removed (campaign_id, srd_id) select $1, 'made-up-' || g from generate_series(1, 999) g",
      [c],
    )
    await asUser(dm)
    await expect(pub.set(c, 'remove', 'wolf')).rejects.toThrow(/Invalid request/)
    await db.exec('reset role')
  })

  it('mirrors the change into a PRE copied before the migration', async () => {
    const pre = api('pre')
    const c = await setup('pre')
    expect(await pre.get(c)).toMatchObject({ downloaded: false })
    await pre.set(c, 'download')
    await pre.save(c, wolfVersion)
    expect((await pre.list(c)).map((t) => t.srd_override)).toEqual([true])
    // The environments stay apart, and the PRE copy has no production references.
    await expect(pub.get(c)).rejects.toThrow(/Forbidden/)
    await db.exec('reset role')
    const sources = (
      await db.query<{ src: string }>(
        `select prosrc src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname in ('pre', 'pre_private') and p.proname in ('get_srd_bestiary',
            'set_srd_bestiary', 'srd_bestiary_state', 'save_combatant_template', 'list_combatant_templates')`,
      )
    ).rows
    expect(sources).toHaveLength(5)
    for (const { src } of sources) expect(src).not.toMatch(/\bpublic\.|\bprivate\./)
  })
})
