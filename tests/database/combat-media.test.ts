import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-043: combat images (portraits and bestiary creature images) and the five health bands.
const migration = '20261107120000_combat_media.sql'
const db = new PGlite()
const dm = randomUUID(),
  player = randomUUID(),
  peer = randomUUID(),
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
const one = async <T = Json>(sql: string, args: unknown[] = []) =>
  (await db.query<T>(sql, args)).rows[0]!
const res = async (sql: string, args: unknown[] = []) =>
  (await one<{ result: Json }>(sql, args)).result

type Combatant = {
  id: string
  kind: string
  name: string
  hp_status?: string
  hp_band?: string
  hp?: { current: number }
  image_path?: string
}
type State = { combatants: Combatant[] }

function api(schema = 'public') {
  const call = (fn: string, args: unknown[]) =>
    res(`select ${schema}.${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) result`, args)
  return {
    create: async (c: string, name: string) =>
      ((await call('create_encounter', [c, name, randomUUID()])) as { encounter_id: string })
        .encounter_id,
    status: (c: string, e: string, s: string) =>
      call('set_encounter_status', [c, e, s, randomUUID()]),
    add: (c: string, e: string, entries: Json[]) =>
      call('add_combatants', [c, e, JSON.stringify(entries), randomUUID()]),
    update: (c: string, id: string, patch: Json) =>
      call('update_combatant', [c, id, JSON.stringify(patch), randomUUID()]),
    hp: (c: string, e: string, hits: Json[]) =>
      call('apply_combat_hp', [c, e, 'damage', JSON.stringify(hits), randomUUID()]),
    template: async (c: string, data: Json) =>
      (await call('save_combatant_template', [
        c,
        null,
        null,
        JSON.stringify(data),
        randomUUID(),
      ])) as {
        id: string
        revision: number
      },
    image: (c: string, t: string, rev: number, path: string | null, key = randomUUID()) =>
      call('set_combatant_template_image', [c, t, rev, path, key]),
    templates: async (c: string) =>
      (await res(`select ${schema}.list_combatant_templates($1) result`, [c])) as unknown as Json[],
    state: async (c: string, e: string, table = false) =>
      (await res(`select ${schema}.get_combat_state($1,$2,$3) result`, [c, e, table])) as State,
  }
}
const pub = api()

const visible = async (bucket: string, path: string) =>
  (
    await db.query('select name from storage.objects where bucket_id = $1 and name = $2', [
      bucket,
      path,
    ])
  ).rows.length === 1
const upload = (bucket: string, path: string) =>
  db.query('insert into storage.objects(bucket_id, name) values ($1, $2)', [bucket, path])

async function setup(schema = 'public') {
  await asUser(dm)
  const c = (await one<{ id: string }>(`select ${schema}.create_campaign('Media table') id`)).id
  const ids: Record<string, string> = {}
  for (const name of ['Arin', 'Bea'])
    ids[name] = (
      await one<{ id: string }>(`select ${schema}.create_character($1,$2) id`, [c, name])
    ).id
  for (const [user, email, character] of [
    [player, 'player@example.com', ids.Arin],
    [peer, 'peer@example.com', ids.Bea],
  ] as const) {
    await asUser(dm)
    const id = (
      await one<{ id: string }>(`select ${schema}.invite_character_player($1,$2,$3) id`, [
        c,
        character,
        email,
      ])
    ).id
    await asUser(user)
    await db.query(`select ${schema}.respond_campaign_invitation($1,true)`, [id])
  }
  await asUser(dm)
  for (const character of [ids.Arin!, ids.Bea!])
    await db.query(`select ${schema}.save_character_sheet($1,$2,0,3,20,14,'{}'::jsonb,true,$3)`, [
      c,
      character,
      randomUUID(),
    ])
  return { c, arin: ids.Arin!, bea: ids.Bea! }
}

/** A goblin template with an attached image, used by a visible goblin and a hidden one. */
async function bestiary(c: string, env = 'public', schema = 'public') {
  const a = api(schema)
  await asUser(dm)
  const goblin = await a.template(c, { name: 'Goblin', max_hp: 8, armor_class: 15 })
  const ogre = await a.template(c, { name: 'Ogre', max_hp: 59 })
  const goblinPath = `${env}/${c}/${goblin.id}/${randomUUID()}.webp`
  const ogrePath = `${env}/${c}/${ogre.id}/${randomUUID()}.webp`
  await upload('creature-images', goblinPath)
  await upload('creature-images', ogrePath)
  await a.image(c, goblin.id, 0, goblinPath)
  await a.image(c, ogre.id, 0, ogrePath)
  return { goblin: goblin.id, ogre: ogre.id, goblinPath, ogrePath }
}

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`)
  for (const [id, email] of [
    [dm, 'dm@example.com'],
    [player, 'player@example.com'],
    [peer, 'peer@example.com'],
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

describe('RYT-043 combat images and health bands', () => {
  it('projects portraits, template images and five bands, never a hidden combatant image', async () => {
    const s = await setup()
    const b = await bestiary(s.c)
    const portrait = `public/${s.c}/${s.arin}/${randomUUID()}.webp`
    await asUser(player)
    await db.query('select public.set_character_portrait($1,$2,$3)', [s.c, s.arin, portrait])
    await asUser(dm)
    const e = await pub.create(s.c, 'Gate')
    await pub.add(s.c, e, [
      { kind: 'character', character_id: s.arin },
      { kind: 'character', character_id: s.bea },
      { kind: 'npc', template_id: b.goblin, count: 4 },
      { kind: 'npc', template_id: b.ogre, hidden: true },
      { kind: 'npc', name: 'Bandit', max_hp: 4 },
      { kind: 'lair', name: 'Lair' },
    ])
    await pub.status(s.c, e, 'active')
    const dmView = await pub.state(s.c, e)
    const id = (name: string) => dmView.combatants.find((c) => c.name === name)!.id
    // 8 HP goblins: 5 wounded (over half), 3 bloodied (over a quarter), 2 critical, 0 down.
    await pub.hp(s.c, e, [
      { combatant_id: id('Goblin 1'), amount: 3 },
      { combatant_id: id('Goblin 2'), amount: 5 },
      { combatant_id: id('Goblin 3'), amount: 6 },
      { combatant_id: id('Goblin 4'), amount: 8 },
    ])
    const full = await pub.state(s.c, e)
    const by = (st: State, name: string) => st.combatants.find((c) => c.name === name)
    expect(by(full, 'Arin')).toMatchObject({ image_path: portrait, hp_band: 'unhurt' })
    expect(by(full, 'Ogre')).toMatchObject({ image_path: b.ogrePath })
    expect(by(full, 'Bandit')?.image_path).toBeUndefined()
    expect(by(full, 'Lair')?.hp_band).toBeUndefined()
    expect(
      ['Goblin 1', 'Goblin 2', 'Goblin 3', 'Goblin 4'].map((n) => [
        by(full, n)?.hp_band,
        by(full, n)?.hp_status,
      ]),
    ).toEqual([
      ['wounded', 'wounded'],
      ['bloodied', 'bloodied'],
      ['critical', 'bloodied'],
      ['down', 'down'],
    ])
    for (const [viewer, table] of [
      [player, false],
      [peer, false],
      [dm, true],
    ] as const) {
      await asUser(viewer)
      const view = await pub.state(s.c, e, table)
      const text = JSON.stringify(view)
      expect(text).not.toContain(b.ogrePath)
      expect(text).not.toContain('Ogre')
      expect(by(view, 'Goblin 3')).toMatchObject({ hp_band: 'critical', image_path: b.goblinPath })
      expect(by(view, 'Goblin 3')?.hp).toBeUndefined()
      expect(by(view, 'Arin')?.image_path).toBe(portrait)
    }
    // The DM sees the template list with its image; a deleted template only clears the link.
    expect((await pub.templates(s.c)).find((t) => t.id === b.goblin)).toMatchObject({
      image_path: b.goblinPath,
    })
    await db.query('select public.delete_combatant_template($1,$2)', [s.c, b.goblin])
    expect(by(await pub.state(s.c, e), 'Goblin 1')?.image_path).toBeUndefined()
    expect((await pub.state(s.c, e)).combatants).toHaveLength(full.combatants.length)
  })

  it('attaches, replays, replaces and removes a template image under DM-only rules', async () => {
    const s = await setup()
    await asUser(dm)
    const t = await pub.template(s.c, { name: 'Wolf', max_hp: 11 })
    const path = `public/${s.c}/${t.id}/${randomUUID()}.webp`
    await upload('creature-images', path)
    const key = randomUUID()
    expect(await pub.image(s.c, t.id, 0, path, key)).toEqual({
      id: t.id,
      revision: 1,
      image_path: path,
    })
    expect(await pub.image(s.c, t.id, 0, path, key)).toEqual({
      id: t.id,
      revision: 1,
      image_path: path,
    })
    await expect(pub.image(s.c, t.id, 0, null)).rejects.toThrow(/Stale revision/)
    await expect(pub.image(s.c, t.id, 1, path.replace('public/', 'pre/'))).rejects.toThrow(
      /Invalid request/,
    )
    await expect(
      pub.image(s.c, t.id, 1, `public/${s.c}/${t.id}/${randomUUID()}.webp`),
    ).rejects.toThrow(/Image unavailable/)
    // A path under another template is refused.
    const other = await pub.template(s.c, { name: 'Bat', max_hp: 1 })
    await expect(
      pub.image(s.c, t.id, 1, `public/${s.c}/${other.id}/${randomUUID()}.webp`),
    ).rejects.toThrow(/Invalid request/)
    expect(await pub.image(s.c, t.id, 1, null)).toMatchObject({ revision: 2 })
    // Players, outsiders and a DM of another campaign cannot attach or read the bestiary.
    for (const user of [player, outsider, otherDm]) {
      await asUser(user)
      await expect(pub.image(s.c, t.id, 2, null)).rejects.toThrow(/Forbidden/)
      await expect(pub.templates(s.c)).rejects.toThrow(/Forbidden/)
    }
    await asUser(otherDm)
    const elsewhere = (await one<{ id: string }>("select public.create_campaign('Elsewhere') id"))
      .id
    await expect(pub.image(elsewhere, t.id, 2, null)).rejects.toThrow(/Template unavailable/)
    for (const sql of [
      'update public.combatant_templates set image_path = null',
      "update public.encounter_combatants set template_id = null where kind = 'npc'",
    ]) {
      for (const user of [dm, player]) {
        await asUser(user)
        await expect(db.query(sql)).rejects.toThrow(/permission denied/)
      }
    }
    await asAnon()
    await expect(pub.image(s.c, t.id, 2, null)).rejects.toThrow(/permission denied/)
    await expect(
      db.query('select private.creature_image_access($1, false)', [path]),
    ).rejects.toThrow(/permission denied/)
    await db.exec('reset role')
  })

  it('lets Players read a creature image only through a visible combatant of a non-draft fight', async () => {
    const s = await setup()
    const b = await bestiary(s.c)
    const pending = `public/${s.c}/${b.goblin}/${randomUUID()}.webp`
    await upload('creature-images', pending)
    const e = await pub.create(s.c, 'Ambush')
    await pub.add(s.c, e, [
      { kind: 'npc', template_id: b.goblin },
      { kind: 'npc', template_id: b.ogre, hidden: true },
    ])
    // The DM reads every object under the campaign, attached or not.
    for (const path of [b.goblinPath, b.ogrePath, pending])
      expect(await visible('creature-images', path)).toBe(true)
    // Draft: nothing yet for Players.
    await asUser(player)
    expect(await visible('creature-images', b.goblinPath)).toBe(false)
    await asUser(dm)
    await pub.status(s.c, e, 'initiative')
    await asUser(player)
    expect(await visible('creature-images', b.goblinPath)).toBe(true)
    // Hidden ogre and unattached uploads stay private.
    expect(await visible('creature-images', b.ogrePath)).toBe(false)
    expect(await visible('creature-images', pending)).toBe(false)
    // Revealing the ogre reveals its image.
    await asUser(dm)
    const ogre = (await pub.state(s.c, e)).combatants.find((c) => c.name === 'Ogre')!.id
    await pub.update(s.c, ogre, { hidden: false })
    await asUser(player)
    expect(await visible('creature-images', b.ogrePath)).toBe(true)
    // Players never upload or delete; outsiders, other DMs and anon see nothing.
    const forged = `public/${s.c}/${b.goblin}/${randomUUID()}.webp`
    await expect(upload('creature-images', forged)).rejects.toThrow(/row-level security/)
    await db.query(
      "delete from storage.objects where bucket_id = 'creature-images' and name = $1",
      [b.goblinPath],
    )
    await asUser(otherDm)
    await one("select public.create_campaign('Other media DM') id")
    for (const user of [outsider, otherDm]) {
      await asUser(user)
      expect(await visible('creature-images', b.goblinPath)).toBe(false)
      await expect(upload('creature-images', forged)).rejects.toThrow(/row-level security/)
    }
    await asAnon()
    await expect(
      db.query("select name from storage.objects where bucket_id = 'creature-images'"),
    ).rejects.toThrow(/permission denied/)
    await asUser(dm)
    // The Player's delete matched no row: the object is still there.
    expect(await visible('creature-images', b.goblinPath)).toBe(true)
    await upload('creature-images', forged)
    expect(await visible('creature-images', forged)).toBe(true)
  })

  it('lets teammates read the current portrait of a visible combatant only', async () => {
    const s = await setup()
    const portrait = `public/${s.c}/${s.arin}/${randomUUID()}.webp`
    const old = `public/${s.c}/${s.arin}/${randomUUID()}.webp`
    await asUser(player)
    await upload('character-portraits', old)
    await upload('character-portraits', portrait)
    await db.query('select public.set_character_portrait($1,$2,$3)', [s.c, s.arin, portrait])
    // Before any fight only the owner and the DM read it (RYT-004 rule).
    await asUser(peer)
    expect(await visible('character-portraits', portrait)).toBe(false)
    await asUser(dm)
    expect(await visible('character-portraits', portrait)).toBe(true)
    const e = await pub.create(s.c, 'Duel')
    await pub.add(s.c, e, [{ kind: 'character', character_id: s.arin }])
    await asUser(peer)
    expect(await visible('character-portraits', portrait)).toBe(false)
    await asUser(dm)
    await pub.status(s.c, e, 'active')
    await asUser(peer)
    expect(await visible('character-portraits', portrait)).toBe(true)
    // Only the current portrait, and never a write.
    expect(await visible('character-portraits', old)).toBe(false)
    await expect(
      upload('character-portraits', `public/${s.c}/${s.arin}/${randomUUID()}.webp`),
    ).rejects.toThrow(/row-level security/)
    // A hidden character is not shown to teammates.
    await asUser(dm)
    const arin = (await pub.state(s.c, e)).combatants.find((c) => c.name === 'Arin')!.id
    await pub.update(s.c, arin, { hidden: true })
    await asUser(peer)
    expect(await visible('character-portraits', portrait)).toBe(false)
    await asUser(dm)
    await pub.update(s.c, arin, { hidden: false })
    await asUser(otherDm)
    await one("select public.create_campaign('Portrait DM') id")
    for (const user of [outsider, otherDm]) {
      await asUser(user)
      expect(await visible('character-portraits', portrait)).toBe(false)
    }
    await asAnon()
    await expect(
      db.query("select name from storage.objects where bucket_id = 'character-portraits'"),
    ).rejects.toThrow(/permission denied/)
    await db.exec('reset role')
  })

  it('mirrors the change into a PRE copied before the migration and routes pre/ objects there', async () => {
    const pre = api('pre')
    const s = await setup('pre')
    const b = await bestiary(s.c, 'pre', 'pre')
    await asUser(dm)
    const e = await pre.create(s.c, 'PRE gate')
    await pre.add(s.c, e, [{ kind: 'npc', template_id: b.goblin }])
    await pre.status(s.c, e, 'active')
    await asUser(player)
    const view = await pre.state(s.c, e)
    expect(view.combatants[0]).toMatchObject({ image_path: b.goblinPath, hp_band: 'unhurt' })
    expect(await visible('creature-images', b.goblinPath)).toBe(true)
    // PRE helpers authorize only against PRE membership; a public/ path for a PRE campaign fails.
    expect(await visible('creature-images', b.goblinPath.replace('pre/', 'public/'))).toBe(false)
    await expect(pub.state(s.c, e)).rejects.toThrow(/Forbidden/)
    await asUser(dm)
    await expect(
      pre.image(s.c, b.goblin, 1, `public/${s.c}/${b.goblin}/${randomUUID()}.webp`),
    ).rejects.toThrow(/Invalid request/)
    await db.exec('reset role')
    const sources = (
      await db.query<{ src: string }>(
        "select prosrc src from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('pre','pre_private') and p.proname in ('set_combatant_template_image','can_view_creature_image','can_view_portrait','get_combat_state','add_combatants','list_combatant_templates')",
      )
    ).rows
    expect(sources).toHaveLength(6)
    for (const { src } of sources) expect(src).not.toMatch(/\bpublic\.|\bprivate\./)
  })
})
