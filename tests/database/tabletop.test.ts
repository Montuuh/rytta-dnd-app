import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-055–062 (ADR 032): tabletop scenes, items, fog, live state, cards, tracks and media.
const migration = '20261111120000_tabletop.sql'
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
type Item = Json & { id: string; kind: string; label: string | null; data: Json }
type View = {
  role: string
  live: Json & { scene_id: string | null; revision: number }
  scene: (Json & { id: string; fog: { base: string; ops: Json[] }; rooms?: unknown }) | null
  items: Item[]
  card: Json | null
  track: Json | null
}
const one = async <T = Json>(sql: string, args: unknown[] = []) =>
  (await db.query<T>(sql, args)).rows[0]!
const res = async <T = Json>(sql: string, args: unknown[] = []) =>
  (await one<{ result: T }>(sql, args)).result

function api(schema = 'public') {
  const call = <T = Json>(fn: string, args: unknown[]) =>
    res<T>(`select ${schema}.${fn}(${args.map((_, i) => `$${i + 1}`).join(',')}) result`, args)
  return {
    view: (c: string, scene: string | null, table = false) =>
      call<View>('get_tabletop', [c, scene, table]),
    scenes: (c: string) => call<{ scenes: Json[]; live: Json }>('list_tabletop_scenes', [c]),
    library: (c: string) => call<{ cards: Json[]; tracks: Json[] }>('get_tabletop_library', [c]),
    save: (c: string, scene: string | null, fields: Json, rev: number | null, key = randomUUID()) =>
      call<Json & { id: string; revision: number }>('save_tabletop_scene', [
        c,
        scene,
        JSON.stringify(fields),
        rev,
        key,
      ]),
    remove: (c: string, scene: string) => call('delete_tabletop_scene', [c, scene, randomUUID()]),
    put: (c: string, scene: string, items: Json[], key = randomUUID()) =>
      call<Item[]>('put_tabletop_items', [c, scene, JSON.stringify(items), key]),
    drop: (c: string, scene: string, ids: string[]) =>
      call('delete_tabletop_items', [c, scene, ids, randomUUID()]),
    fog: (c: string, scene: string, op: Json) =>
      call<{ fog: { base: string; ops: Json[] } }>('change_tabletop_fog', [
        c,
        scene,
        JSON.stringify(op),
        randomUUID(),
      ]),
    live: (c: string, patch: Json, key = randomUUID()) =>
      call<Json & { revision: number }>('set_tabletop_live', [c, JSON.stringify(patch), key]),
    card: (c: string, id: string | null, fields: Json) =>
      call<Json & { id: string }>('save_tabletop_card', [
        c,
        id,
        JSON.stringify(fields),
        randomUUID(),
      ]),
    dropCard: (c: string, id: string) => call('delete_tabletop_card', [c, id, randomUUID()]),
    track: (c: string, title: string, path: string) =>
      call<Json & { id: string }>('add_tabletop_track', [
        c,
        title,
        path,
        'audio/mpeg',
        1024,
        randomUUID(),
      ]),
    dropTrack: (c: string, id: string) => call('delete_tabletop_track', [c, id, randomUUID()]),
    fire: (c: string, id: string, reset = false) =>
      call<Json>('fire_tabletop_event', [c, id, reset, randomUUID()]),
    encounter: async (c: string, name: string) =>
      (
        (await call('create_encounter', [c, name, randomUUID()])) as unknown as {
          encounter_id: string
        }
      ).encounter_id,
    add: (c: string, e: string, entries: Json[]) =>
      call('add_combatants', [c, e, JSON.stringify(entries), randomUUID()]),
    status: (c: string, e: string, s: string) =>
      call('set_encounter_status', [c, e, s, randomUUID()]),
    update: (c: string, id: string, patch: Json) =>
      call('update_combatant', [c, id, JSON.stringify(patch), randomUUID()]),
  }
}
const pub = api()

const upload = (path: string) =>
  db.query("insert into storage.objects(bucket_id, name) values ('tabletop-media', $1)", [path])
const readable = async (path: string) =>
  (
    await db.query(
      "select name from storage.objects where bucket_id = 'tabletop-media' and name = $1",
      [path],
    )
  ).rows.length === 1

async function setup(schema = 'public') {
  await asUser(dm)
  const c = (await one<{ id: string }>(`select ${schema}.create_campaign('Map table') id`)).id
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
  return { c, arin }
}
const modules = (c: string, list: string[], schema = 'public') =>
  db.query(`select ${schema}.set_campaign_modules($1, $2::text[])`, [c, list])

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
}, 90000)
afterAll(() => db.close())

describe('RYT-055 tabletop', () => {
  it('builds a scene and projects only what the table may see', async () => {
    const { c, arin } = await setup()
    const scene = await pub.save(
      c,
      null,
      {
        name: 'Crypt',
        cols: 30,
        rows: 20,
        ground: 'stone',
        fog_enabled: true,
        rooms: [{ id: 'r1', rects: [[2, 2, 6, 4]] }],
        recipe: { kind: 'crypt', seed: 4242, look: 'ink', version: 2 },
      },
      null,
    )
    expect(scene).toMatchObject({ name: 'Crypt', cols: 30, rows: 20, revision: 0 })
    const e = await pub.encounter(c, 'Ambush')
    await pub.add(c, e, [
      { kind: 'npc', name: 'Ghoul', max_hp: 22, armor_class: 12 },
      { kind: 'npc', name: 'Wight', max_hp: 45, armor_class: 14, hidden: true },
      { kind: 'character', character_id: arin },
      { kind: 'lair', name: 'Heart of the crypt' },
    ])
    const rows = (
      await db.query<{ id: string; name: string }>(
        'select id, name from public.encounter_combatants where encounter_id = $1',
        [e],
      )
    ).rows
    const ghoul = rows.find((r) => r.name === 'Ghoul')!.id
    const wight = rows.find((r) => r.name === 'Wight')!.id
    const lair = rows.find((r) => r.name === 'Heart of the crypt')!.id
    await pub.update(c, ghoul, { public_name: 'Shadow' })
    await pub.update(c, lair, { public_name: 'Cold stones' })
    const saved = await pub.put(c, scene.id, [
      { kind: 'token', x: 3, y: 3, combatant_id: ghoul, data: { size: 'medium', srd_id: 'ghoul' } },
      { kind: 'token', x: 4, y: 3, combatant_id: wight, data: { size: 'medium' } },
      { kind: 'token', x: 5, y: 5, character_id: arin, data: { color: 'azure' } },
      { kind: 'token', x: 9, y: 9, label: 'Cart horse', data: { color: 'ochre', size: 'large' } },
      { kind: 'token', x: 12, y: 2, combatant_id: lair, data: { size: 'large' } },
      { kind: 'prop', x: 2, y: 2, data: { prop: 'barrel' } },
      { kind: 'prop', x: 6, y: 4, hidden: true, data: { prop: 'chest' } },
      { kind: 'door', x: 8, y: 3.5, rotation: 90, data: { state: 'closed', rooms: ['r1'] } },
      { kind: 'door', x: 2, y: 6, data: { state: 'closed', secret: true } },
      { kind: 'note', x: 1, y: 1, label: 'Trap', secret: { text: 'DC 15 pit' } },
      {
        kind: 'event',
        x: 4,
        y: 4,
        label: 'Ambush',
        secret: { text: 'They rise', actions: { reveal_room: 'r1', show_hidden: true } },
      },
      {
        kind: 'area',
        x: 10,
        y: 10,
        label: 'Fireball',
        data: { shape: 'sphere', size_ft: 20, damage: 'fire' },
      },
    ])
    expect(saved).toHaveLength(12)
    // The DM sees everything; nothing is on the table yet.
    const full = await pub.view(c, scene.id)
    expect(full.items).toHaveLength(12)
    expect(full.scene!.rooms).toEqual([{ id: 'r1', rects: [[2, 2, 6, 4]] }])
    expect((await pub.view(c, scene.id, true)).scene).toBeNull()
    // Players read nothing while the module is off, even with the scene on the table.
    await pub.live(c, { scene_id: scene.id, view_x: 15, view_y: 10 })
    await asUser(player)
    await expect(pub.view(c, null)).rejects.toThrow(/Forbidden/)
    await asUser(dm)
    await modules(c, ['party', 'tabletop'])
    const expectTable = (view: View) => {
      expect(view.scene).toMatchObject({ id: scene.id, name: 'Crypt' })
      expect(view.scene).not.toHaveProperty('rooms')
      expect(view.scene).not.toHaveProperty('recipe')
      // RYT-064: the look (ink or painted) reaches the table; the seed does not.
      expect(view.scene).toHaveProperty('look', 'ink')
      expect(JSON.stringify(view.scene)).not.toContain('4242')
      const kinds = view.items.map((i) => `${i.kind}:${i.label ?? (i.data.prop as string) ?? ''}`)
      // Draft combatants, hidden items, the secret door, notes and events stay off the table.
      expect(kinds.sort()).toEqual(
        ['area:Fireball', 'door:', 'prop:barrel', 'token:Arin', 'token:Cart horse'].sort(),
      )
      for (const i of view.items) {
        expect(i).not.toHaveProperty('secret')
        expect(i).not.toHaveProperty('hidden')
        expect(i.data).not.toHaveProperty('rooms')
      }
      expect(JSON.stringify(view)).not.toMatch(/DC 15|They rise|chest|Wight/)
    }
    expectTable(await pub.view(c, null, true))
    await asUser(player)
    const seen = await pub.view(c, scene.id)
    expect(seen.role).toBe('player')
    expectTable(seen)
    // Starting the fight shows its visible creatures, under their alias and without SRD art.
    await asUser(dm)
    await pub.status(c, e, 'active')
    await asUser(player)
    const fight = await pub.view(c, null)
    const ghoulToken = fight.items.find((i) => i.combatant_id === ghoul)!
    expect(ghoulToken.label).toBe('Shadow')
    expect(ghoulToken.data).not.toHaveProperty('srd_id')
    expect(fight.items.some((i) => i.combatant_id === wight)).toBe(false)
    // A lair with a public name never reaches the table under its real name.
    expect(fight.items.find((i) => i.combatant_id === lair)!.label).toBe('Cold stones')
    expect(JSON.stringify(fight)).not.toMatch(/Heart of the crypt/)
    // Tables stay read-only, and Players read no rows except the secret-free live row.
    for (const table of ['tabletop_scenes', 'tabletop_items', 'tabletop_cards', 'tabletop_tracks'])
      expect((await db.query(`select * from public.${table}`)).rows).toHaveLength(0)
    expect((await db.query('select * from public.tabletop_live')).rows).toHaveLength(1)
    await asUser(dm)
    for (const sql of [
      `insert into public.tabletop_items (campaign_id, scene_id, kind, x, y) values ('${c}', '${scene.id}', 'prop', 1, 1)`,
      'update public.tabletop_scenes set name = $$x$$',
      'delete from public.tabletop_items',
      'update public.tabletop_live set revision = 0',
    ])
      await expect(db.query(sql)).rejects.toThrow(/permission denied/)
  })

  it('denies every actor that is not the campaign DM', async () => {
    const { c } = await setup()
    const scene = await pub.save(c, null, { name: 'Road' }, null)
    await modules(c, ['party', 'tabletop'])
    const writes = () => [
      pub.save(c, null, { name: 'X' }, null),
      pub.save(c, scene.id, { name: 'X' }, 0),
      pub.put(c, scene.id, [{ kind: 'prop', x: 1, y: 1, data: { prop: 'crate' } }]),
      pub.drop(c, scene.id, [randomUUID()]),
      pub.fog(c, scene.id, { reset: 'revealed' }),
      pub.live(c, { scene_id: scene.id }),
      pub.card(c, null, { title: 'X' }),
      pub.remove(c, scene.id),
      pub.scenes(c),
      pub.library(c),
    ]
    for (const actor of [player, outsider, otherDm]) {
      await asUser(actor)
      for (const call of writes()) await expect(call).rejects.toThrow(/Forbidden/)
    }
    await asUser(outsider)
    await expect(pub.view(c, null)).rejects.toThrow(/Forbidden/)
    await asAnon()
    await expect(pub.view(c, null)).rejects.toThrow(/permission denied/)
    await expect(pub.save(c, null, { name: 'X' }, null)).rejects.toThrow(/permission denied/)
    await expect(db.query('select * from public.tabletop_live')).rejects.toThrow(
      /permission denied/,
    )
    // A DM cannot reach another campaign's scene through their own campaign.
    await asUser(otherDm)
    const own = (await one<{ id: string }>("select public.create_campaign('Other') id")).id
    await expect(pub.view(own, scene.id)).rejects.toThrow(/Scene unavailable/)
    await expect(
      pub.put(own, scene.id, [{ kind: 'prop', x: 1, y: 1, data: { prop: 'crate' } }]),
    ).rejects.toThrow(/Scene unavailable/)
    await expect(pub.live(own, { scene_id: scene.id })).rejects.toThrow(/Scene unavailable/)
    await db.exec('reset role')
  })

  it('validates items, revisions, idempotency and fog', async () => {
    const { c } = await setup()
    const scene = await pub.save(
      c,
      null,
      { name: 'Hall', fog_enabled: true, rooms: [{ id: 'hall', rects: [[0, 0, 5, 5]] }] },
      null,
    )
    for (const bad of [
      { kind: 'prop', x: 1, y: 1, data: { prop: 'Barrel!' } },
      { kind: 'door', x: 1, y: 1, data: { state: 'ajar' } },
      { kind: 'token', x: 1, y: 1, data: { color: 'pink' } },
      { kind: 'token', x: 1, y: 1, secret: { text: 'no' } },
      { kind: 'area', x: 1, y: 1, data: { shape: 'blob', size_ft: 20 } },
      { kind: 'event', x: 1, y: 1, secret: { actions: { sound: 'scream' } } },
      { kind: 'note', x: 1, y: 1, secret: { text: 'x'.repeat(4001) } },
      { kind: 'prop', x: 500, y: 1, data: { prop: 'crate' } },
      { kind: 'prop', x: 1, y: 1, data: { prop: 'crate' }, combatant_id: randomUUID() },
      { kind: 'spell', x: 1, y: 1 },
      { kind: 'prop', x: 1, y: 1, data: { prop: 'crate' }, colour: 'red' },
    ])
      await expect(pub.put(c, scene.id, [bad])).rejects.toThrow(/Invalid request/)
    // Patches change only the keys sent; the kind cannot change.
    const [crate] = await pub.put(c, scene.id, [
      { kind: 'prop', x: 1, y: 1, data: { prop: 'crate' } },
    ])
    const [moved] = await pub.put(c, scene.id, [{ id: crate!.id, x: 4, rotation: 90 }])
    expect(moved).toMatchObject({ x: 4, y: 1, rotation: 90, data: { prop: 'crate' }, revision: 1 })
    await expect(pub.put(c, scene.id, [{ id: crate!.id, kind: 'token' }])).rejects.toThrow(
      /Invalid request/,
    )
    // Replays return the first result; a different payload under the same key is refused.
    const key = randomUUID()
    const first = await pub.put(
      c,
      scene.id,
      [{ kind: 'prop', x: 2, y: 2, data: { prop: 'table' } }],
      key,
    )
    expect(
      await pub.put(c, scene.id, [{ kind: 'prop', x: 2, y: 2, data: { prop: 'table' } }], key),
    ).toEqual(first)
    await expect(
      pub.put(c, scene.id, [{ kind: 'prop', x: 3, y: 2, data: { prop: 'table' } }], key),
    ).rejects.toThrow(/Request mismatch/)
    // Scene edits need the current revision.
    const renamed = await pub.save(c, scene.id, { name: 'Great hall' }, 0)
    expect(renamed.revision).toBe(1)
    await expect(pub.save(c, scene.id, { name: 'Late' }, 0)).rejects.toThrow(/Stale scene/)
    await expect(pub.save(c, scene.id, { map_kind: 'upload' }, 1)).rejects.toThrow(
      /Invalid request/,
    )
    await expect(pub.save(c, null, { cols: 10 }, null)).rejects.toThrow(/Invalid request/)
    // Fog: rooms resolve to rectangles; reset starts over.
    const room = await pub.fog(c, scene.id, { mode: 'reveal', shape: 'room', room: 'hall' })
    expect(room.fog).toEqual({
      base: 'hidden',
      ops: [{ mode: 'reveal', shape: 'rects', rects: [[0, 0, 5, 5]] }],
    })
    await pub.fog(c, scene.id, { mode: 'hide', shape: 'circle', x: 2, y: 2, r: 1.5 })
    await pub.fog(c, scene.id, {
      mode: 'reveal',
      shape: 'brush',
      r: 1,
      points: [
        [1, 1],
        [2, 3],
      ],
    })
    for (const bad of [
      { mode: 'reveal', shape: 'room', room: 'cellar' },
      { mode: 'peek', shape: 'rect', x: 0, y: 0, w: 1, h: 1 },
      { mode: 'reveal', shape: 'rect', x: 0, y: 0, w: 0, h: 1 },
      { reset: 'grey' },
    ])
      await expect(pub.fog(c, scene.id, bad)).rejects.toThrow(/Invalid request/)
    expect((await pub.fog(c, scene.id, { reset: 'revealed' })).fog).toEqual({
      base: 'revealed',
      ops: [],
    })
  })

  it('runs live state, cards, tracks, events and media access', async () => {
    const { c } = await setup()
    await modules(c, ['party', 'tabletop'])
    const map = `public/${c}/map/${randomUUID()}.webp`
    await upload(map)
    const scene = await pub.save(
      c,
      null,
      {
        name: 'Ruins',
        map_kind: 'upload',
        map_path: map,
        map_width: 2048,
        map_height: 1536,
        cell_px: 64,
        cols: 32,
        rows: 24,
        fog_enabled: true,
        rooms: [{ id: 'tomb', rects: [[10, 10, 4, 4]] }],
      },
      null,
    )
    await expect(
      pub.save(
        c,
        null,
        {
          name: 'Ghost',
          map_kind: 'upload',
          map_path: `public/${c}/map/${randomUUID()}.webp`,
          map_width: 1,
          map_height: 1,
        },
        null,
      ),
    ).rejects.toThrow(/Image unavailable/)
    // The Player reads the map only while its scene is on the table.
    await asUser(player)
    expect(await readable(map)).toBe(false)
    await asUser(dm)
    const before = (await pub.view(c, null, true)).live.revision
    await pub.live(c, { scene_id: scene.id })
    await asUser(player)
    expect(await readable(map)).toBe(true)
    await expect(upload(`public/${c}/map/${randomUUID()}.webp`)).rejects.toThrow(
      /row-level security/,
    )
    // Cards: hidden until shown; the image follows the card.
    await asUser(dm)
    const image = `public/${c}/card/${randomUUID()}.webp`
    await upload(image)
    const card = await pub.card(c, null, {
      title: 'The tomb',
      body: 'Dust and silence.',
      image_path: image,
    })
    await asUser(player)
    expect((await pub.view(c, null)).card).toBeNull()
    expect(await readable(image)).toBe(false)
    // Tracks: the live one is readable.
    await asUser(dm)
    const song = `public/${c}/audio/${randomUUID()}.mp3`
    await upload(song)
    const track = await pub.track(c, 'Crypt drone', song)
    await expect(pub.track(c, 'Again', song)).rejects.toThrow(/Invalid request/)
    await pub.live(c, {
      track_id: track.id,
      playing: true,
      volume: 40,
      sound: 'gong',
      ping: { x: 3, y: 4 },
    })
    await expect(pub.live(c, { sound: 'scream' })).rejects.toThrow(/Invalid request/)
    await expect(pub.live(c, { volume: 101 })).rejects.toThrow(/Invalid request/)
    await expect(
      pub.live(c, { screen: { diagonal_in: 55, px_w: 3840, px_h: 2160, base_mm: 25.4, fine: 2 } }),
    ).rejects.toThrow(/Invalid request/)
    await pub.live(c, {
      screen: { diagonal_in: 55, px_w: 3840, px_h: 2160, base_mm: 25.4, fine: 1, flip: false },
    })
    await asUser(player)
    expect(await readable(song)).toBe(true)
    // Events: reveal the room, show hidden creatures nearby and the card, start an ambience.
    await asUser(dm)
    const [ghost, , event] = await pub.put(c, scene.id, [
      { kind: 'token', x: 11, y: 11, label: 'Ghost', hidden: true, data: { color: 'slate' } },
      { kind: 'token', x: 30, y: 22, label: 'Far', hidden: true, data: { color: 'slate' } },
      {
        kind: 'event',
        x: 12,
        y: 12,
        label: 'Open the tomb',
        secret: {
          actions: {
            reveal_room: 'tomb',
            show_hidden: true,
            card_id: card.id,
            ambience: 'cave',
            sound: 'thunder',
          },
        },
      },
    ])
    expect(await pub.fire(c, event!.id)).toEqual({ id: event!.id, fired: true, shown: 1 })
    await asUser(player)
    const after = await pub.view(c, null)
    expect(after.live.revision).toBeGreaterThan(before)
    expect(after.card).toEqual({
      id: card.id,
      title: 'The tomb',
      body: 'Dust and silence.',
      image_path: image,
    })
    expect(after.track).toMatchObject({ id: track.id, title: 'Crypt drone', path: song })
    expect(after.live).toMatchObject({
      ambience: 'cave',
      playing: true,
      volume: 40,
      sound: { key: 'thunder' },
    })
    expect(after.items.map((i) => i.label)).toEqual(['Ghost'])
    expect(after.scene!.fog.ops).toEqual([
      { mode: 'reveal', shape: 'rects', rects: [[10, 10, 4, 4]] },
    ])
    expect(await readable(image)).toBe(true)
    expect(JSON.stringify(after)).not.toMatch(/Open the tomb|Far/)
    await asUser(dm)
    expect(await pub.fire(c, event!.id, true)).toEqual({ id: event!.id, fired: false })
    await expect(pub.fire(c, ghost!.id)).rejects.toThrow(/Item unavailable/)
    // Library and deletions; deleting the scene on the table clears it.
    const library = await pub.library(c)
    expect(library.cards).toHaveLength(1)
    expect(library.tracks).toHaveLength(1)
    await pub.dropTrack(c, track.id)
    await pub.dropCard(c, card.id)
    expect((await pub.scenes(c)).scenes).toHaveLength(1)
    await pub.remove(c, scene.id)
    await asUser(player)
    const empty = await pub.view(c, null)
    expect(empty).toMatchObject({ scene: null, card: null, track: null, items: [] })
    expect(empty.live.scene_id).toBeNull()
    expect(await readable(map)).toBe(false)
    await db.exec('reset role')
  })

  it('mirrors the change into a PRE copied before the migration', async () => {
    const pre = api('pre')
    const { c } = await setup('pre')
    const map = `pre/${c}/map/${randomUUID()}.webp`
    await upload(map)
    const scene = await pre.save(
      c,
      null,
      { name: 'Pre map', map_kind: 'upload', map_path: map, map_width: 640, map_height: 640 },
      null,
    )
    await expect(
      pre.save(
        c,
        null,
        {
          name: 'Prod map',
          map_kind: 'upload',
          map_path: `public/${c}/map/${randomUUID()}.webp`,
          map_width: 1,
          map_height: 1,
        },
        null,
      ),
    ).rejects.toThrow(/Image unavailable/)
    await pre.live(c, { scene_id: scene.id })
    await modules(c, ['party', 'tabletop'], 'pre')
    await asUser(player)
    expect((await pre.view(c, null)).scene).toMatchObject({ name: 'Pre map' })
    expect(await readable(map)).toBe(true)
    await expect(pub.view(c, null)).rejects.toThrow(/Forbidden/)
    await db.exec('reset role')
    const sources = (
      await db.query<{ src: string }>(
        "select prosrc src from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('pre','pre_private') and p.proname like '%tabletop%'",
      )
    ).rows
    expect(sources.length).toBeGreaterThanOrEqual(30)
    for (const { src } of sources) expect(src).not.toMatch(/\bpublic\.|\bprivate\./)
    const constraint = await one<{ def: string }>(
      "select pg_get_constraintdef(oid) def from pg_constraint where conname = 'campaigns_player_modules_valid' and conrelid = 'pre.campaigns'::regclass",
    )
    expect(constraint.def).toMatch(/tabletop/)
  })
})
