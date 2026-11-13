import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { etlCommand, withExposureSql } from '../../scripts/lib/pre-etl.mts'

// RYT-092: the content library endpoint (ADR 040): packs, draft and published entries, editors.
const migration = '20261116120000_content_library.sql'
const db = new PGlite()
const editor = randomUUID(),
  reader = randomUUID(),
  secondEditor = randomUUID()
const asUser = async (id: string) => {
  await db.exec('reset role; set role authenticated')
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [id])
}
const asAnon = async () => {
  await db.exec('reset role; set role anon')
  await db.query("select set_config('request.jwt.claim.sub', '', false)")
}
type Json = Record<string, unknown>
type Pack = Json & {
  id: string
  slug: string
  version: number
  revision?: number
  pending?: number
}
type Library = { editor: boolean; packs: Pack[] }
type Draft = Json & { id: string; key: string; state: string; revision: number }
type Page = {
  version: number
  next?: string
  entries: { key: string; name_es: string; data: Json }[]
}
const one = async <T = Json>(sql: string, args: unknown[] = []) =>
  (await db.query<T>(sql, args)).rows[0]!
const res = async <T = Json>(sql: string, args: unknown[] = []) =>
  (await one<{ result: T }>(sql, args)).result

// An update sends every field; creating a pack may leave the optional ones out.
const fullPack = (fields: Json): Json => ({
  title_en: '',
  title_es: '',
  description_en: '',
  description_es: '',
  edition: null,
  license: '',
  attribution: '',
  visibility: 'private',
  ...fields,
})

function api(schema = 'public') {
  return {
    library: () => res<Library>(`select ${schema}.get_content_library() result`),
    entries: (pack: string, kind: string, after: string | null = null) =>
      res<Page>(`select ${schema}.get_content_entries($1,$2,$3) result`, [pack, kind, after]),
    drafts: (pack: string, kind: string) =>
      res<Draft[]>(`select ${schema}.list_content_drafts($1,$2) result`, [pack, kind]),
    changes: (pack: string) =>
      res<Draft[]>(`select ${schema}.list_content_changes($1) result`, [pack]),
    draft: (entry: string) => res<Draft>(`select ${schema}.get_content_draft($1) result`, [entry]),
    savePack: (
      data: Json,
      pack: string | null = null,
      revision: number | null = null,
      key = randomUUID(),
    ) =>
      res<{ id: string; revision: number }>(
        `select ${schema}.save_content_pack($1,$2,$3,$4) result`,
        [pack, revision, JSON.stringify(data), key],
      ),
    visibility: (pack: string, revision: number, visibility: string, key = randomUUID()) =>
      res<{ id: string; revision: number; visibility: string }>(
        `select ${schema}.set_content_pack_visibility($1,$2,$3,$4) result`,
        [pack, revision, visibility, key],
      ),
    deletePack: (pack: string, revision: number) =>
      res(`select ${schema}.delete_content_pack($1,$2,$3) result`, [pack, revision, randomUUID()]),
    save: (
      pack: string,
      data: Json,
      entry: string | null = null,
      revision: number | null = null,
      key = randomUUID(),
    ) =>
      res<{ id: string; revision: number; state: string }>(
        `select ${schema}.save_content_entry($1,$2,$3,$4,$5) result`,
        [pack, entry, revision, JSON.stringify(data), key],
      ),
    remove: (entry: string, revision: number) =>
      res<Json>(`select ${schema}.delete_content_entry($1,$2,$3) result`, [
        entry,
        revision,
        randomUUID(),
      ]),
    revert: (entry: string, revision: number) =>
      res<Json>(`select ${schema}.revert_content_entry($1,$2,$3) result`, [
        entry,
        revision,
        randomUUID(),
      ]),
    importEntries: (
      pack: string,
      kind: string,
      entries: unknown,
      dryRun: boolean,
      key = randomUUID(),
    ) =>
      res<Json>(`select ${schema}.import_content_entries($1,$2,$3,$4,$5) result`, [
        pack,
        kind,
        JSON.stringify(entries),
        dryRun,
        key,
      ]),
    publish: (pack: string, version: number, key = randomUUID()) =>
      res<Json & { version: number }>(`select ${schema}.publish_content_pack($1,$2,$3) result`, [
        pack,
        version,
        key,
      ]),
  }
}
const pub = api()
const srd = {
  slug: 'srd-5-2-1',
  title_en: 'SRD 5.2.1',
  title_es: 'SRD 5.2.1',
  license: 'CC-BY-4.0',
}
const wolf = (hp = 11) => ({
  kind: 'creature',
  key: 'wolf',
  name_en: 'Wolf',
  name_es: 'Lobo',
  data: { index: { cr: '1/4', hp }, en: { name: 'Wolf' }, es: { name: 'Lobo' } },
})
const grant = async (id: string, schema = 'private') => {
  await db.exec('reset role')
  await db.query(`insert into ${schema}.content_editors (user_id) values ($1)`, [id])
}
const findPack = async (slug: string) => (await pub.library()).packs.find((p) => p.slug === slug)!
// Every RPC with arguments that pass the type checks, to probe who may execute it.
const allCalls = (schema: string, pack: string, entry: string) => [
  `select ${schema}.get_content_library()`,
  `select ${schema}.get_content_entries('${pack}', 'creature', null)`,
  `select ${schema}.list_content_drafts('${pack}', 'creature')`,
  `select ${schema}.list_content_changes('${pack}')`,
  `select ${schema}.get_content_draft('${entry}')`,
  `select ${schema}.save_content_pack(null, null, '{"slug":"x","title_en":"X"}', '${randomUUID()}')`,
  `select ${schema}.set_content_pack_visibility('${pack}', 1, 'public', '${randomUUID()}')`,
  `select ${schema}.delete_content_pack('${pack}', 1, '${randomUUID()}')`,
  `select ${schema}.save_content_entry('${pack}', null, null, '{}', '${randomUUID()}')`,
  `select ${schema}.delete_content_entry('${entry}', 1, '${randomUUID()}')`,
  `select ${schema}.revert_content_entry('${entry}', 1, '${randomUUID()}')`,
  `select ${schema}.import_content_entries('${pack}', 'creature', '[{}]', false, '${randomUUID()}')`,
  `select ${schema}.publish_content_pack('${pack}', 1, '${randomUUID()}')`,
]

beforeAll(async () => {
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key, email text, email_confirmed_at timestamptz, raw_user_meta_data jsonb default '{}');
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, anon; grant execute on function auth.uid() to authenticated, anon;`)
  for (const [id, email] of [
    [editor, 'editor@example.com'],
    [reader, 'reader@example.com'],
    [secondEditor, 'second@example.com'],
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
  await grant(editor)
}, 60000)
afterAll(() => db.close())

describe('RYT-092 content library', () => {
  it('drafts stay with editors until a version is published', async () => {
    await asUser(editor)
    expect((await pub.library()).editor).toBe(true)
    const pack = await pub.savePack({ ...srd, visibility: 'public' })
    const saved = await pub.save(pack.id, wolf())
    expect(saved.state).toBe('new')
    // Nothing published yet: readers see neither the pack nor its entries.
    await asUser(reader)
    expect(await pub.library()).toEqual({ editor: false, packs: [] })
    await expect(pub.entries(pack.id, 'creature')).rejects.toThrow(/Forbidden/)
    await asUser(editor)
    expect((await pub.library()).packs[0]).toMatchObject({
      version: 0,
      pending: 1,
      drafts: { creature: 1 },
    })
    const first = await pub.publish(pack.id, 0)
    expect(first).toMatchObject({ version: 1, added: 1, changed: 0, removed: 0 })
    await expect(pub.publish(pack.id, 1)).rejects.toThrow(/Nothing to publish/)
    await expect(pub.publish(pack.id, 0)).rejects.toThrow(/Stale revision/)
    // A reader downloads the published version, without any editor field.
    await asUser(reader)
    const library = await pub.library()
    expect(library.packs).toHaveLength(1)
    expect(library.packs[0]).toMatchObject({
      slug: 'srd-5-2-1',
      version: 1,
      kinds: { creature: 1 },
    })
    for (const field of ['pending', 'revision', 'drafts', 'owner_id'])
      expect(library.packs[0]).not.toHaveProperty(field)
    expect((await pub.entries(pack.id, 'creature')).entries).toEqual([
      { key: 'wolf', name_en: 'Wolf', name_es: 'Lobo', data: wolf().data },
    ])
    // A change and a new draft stay with editors: readers keep version 1 until the next publish.
    await asUser(editor)
    const changed = await pub.save(pack.id, wolf(13), saved.id, saved.revision)
    expect(changed.state).toBe('changed')
    await pub.save(pack.id, { ...wolf(), key: 'dire-wolf', name_en: 'Dire Wolf' })
    await expect(pub.save(pack.id, wolf(15), saved.id, saved.revision)).rejects.toThrow(
      /Stale revision/,
    )
    await asUser(reader)
    const before = await pub.entries(pack.id, 'creature')
    expect(before.entries.map((e) => [e.key, e.data])).toEqual([['wolf', wolf(11).data]])
    expect((await pub.library()).packs[0]!.kinds).toEqual({ creature: 1 })
    await asUser(editor)
    expect((await pub.changes(pack.id)).map((c) => [c.key, c.state])).toEqual([
      ['dire-wolf', 'new'],
      ['wolf', 'changed'],
    ])
    expect(await pub.publish(pack.id, 1)).toMatchObject({ version: 2, added: 1, changed: 1 })
    await asUser(reader)
    expect(await pub.entries(pack.id, 'creature')).toMatchObject({ version: 2 })
    expect((await pub.entries(pack.id, 'creature')).entries.map((e) => e.key)).toEqual([
      'dire-wolf',
      'wolf',
    ])
  })

  it('reverts drafts, deletes on publish and keeps keys and kinds fixed', async () => {
    await asUser(editor)
    const pack = await pub.savePack({
      slug: 'homebrew',
      title_es: 'Homebrew',
      visibility: 'public',
    })
    const spell = await pub.save(pack.id, {
      kind: 'spell',
      key: 'frost-lance',
      name_es: 'Lanza de escarcha',
      data: { index: { level: 2 } },
    })
    await expect(
      pub.save(pack.id, { kind: 'spell', key: 'frost-lance', name_es: 'Otra', data: {} }),
    ).rejects.toThrow(/Key taken/)
    await expect(
      pub.save(
        pack.id,
        { kind: 'rule', key: 'frost-lance', name_es: 'X', data: {} },
        spell.id,
        spell.revision,
      ),
    ).rejects.toThrow(/Invalid request/)
    // Oversized data, oversized index, and an entry of another pack.
    await expect(
      pub.save(pack.id, {
        kind: 'spell',
        key: 'big',
        name_es: 'Big',
        data: { x: 'x'.repeat(132000) },
      }),
    ).rejects.toThrow(/Invalid request/)
    await expect(
      pub.save(pack.id, {
        kind: 'spell',
        key: 'wide',
        name_es: 'Wide',
        data: { index: { x: 'x'.repeat(5000) } },
      }),
    ).rejects.toThrow(/Invalid request/)
    const srdPack = await findPack('srd-5-2-1')
    await expect(
      pub.save(
        srdPack.id,
        { kind: 'spell', key: 'frost-lance', name_es: 'X', data: {} },
        spell.id,
        spell.revision,
      ),
    ).rejects.toThrow(/Entry unavailable/)
    // A never-published entry is deleted at once.
    const scratch = await pub.save(pack.id, {
      kind: 'spell',
      key: 'scratch',
      name_en: 'Scratch',
      data: {},
    })
    expect(await pub.remove(scratch.id, scratch.revision)).toMatchObject({ deleted: true })
    await pub.publish(pack.id, 0)
    // A published entry waits for the next publish; revert brings it back.
    let draft = await pub.draft(spell.id)
    expect(draft).toMatchObject({ state: 'published', published: { version: 1 } })
    const pending = await pub.remove(spell.id, draft.revision)
    expect(pending).toMatchObject({ state: 'deleted' })
    const reverted = await pub.revert(spell.id, pending.revision as number)
    expect(reverted).toMatchObject({ state: 'published' })
    const edited = await pub.save(
      pack.id,
      { kind: 'spell', key: 'frost-lance', name_es: 'Lanza helada', data: { index: { level: 3 } } },
      spell.id,
      reverted.revision as number,
    )
    expect(edited.state).toBe('changed')
    draft = await pub.draft(spell.id)
    expect(draft).toMatchObject({
      name_es: 'Lanza helada',
      published: { name_es: 'Lanza de escarcha' },
    })
    const removed = await pub.remove(spell.id, edited.revision)
    expect(await pub.publish(pack.id, 1)).toMatchObject({ version: 2, removed: 1 })
    expect(await pub.drafts(pack.id, 'spell')).toEqual([])
    await expect(pub.revert(spell.id, removed.revision as number)).rejects.toThrow(
      /Entry unavailable/,
    )
  })

  it('imports in batches with a dry-run report and replays retried requests', async () => {
    await asUser(editor)
    const pack = await pub.savePack({ slug: 'bulk', title_en: 'Bulk', visibility: 'private' })
    const batch = [
      { key: 'aboleth', name_en: 'Aboleth', name_es: 'Aboleth', data: { index: { cr: '10' } } },
      { key: 'wolf', name_en: 'Wolf', name_es: 'Lobo', data: { index: { cr: '1/4' } } },
      { key: 'wolf', name_en: 'Wolf again', data: {} },
      { key: 'Bad Key', name_en: 'Bad', data: {} },
      { key: 'nameless', data: {} },
      { key: 'listless', name_en: 'Listless', data: [] },
      'not an object',
      { key: 'huge', name_en: 'Huge', data: { text: 'x'.repeat(140000) } },
    ]
    const dry = await pub.importEntries(pack.id, 'creature', batch, true)
    expect(dry).toMatchObject({ added: 2, updated: 0, unchanged: 0, refused: 6, dry_run: true })
    expect((dry.problems as Json[]).map((p) => p.reason)).toEqual([
      'duplicate',
      'key',
      'name',
      'data',
      'data',
      'size',
    ])
    expect(await pub.drafts(pack.id, 'creature')).toEqual([])
    const key = randomUUID()
    const done = await pub.importEntries(pack.id, 'creature', batch, false, key)
    expect(done).toMatchObject({ added: 2, refused: 6, dry_run: false })
    expect(await pub.importEntries(pack.id, 'creature', batch, false, key)).toEqual(done)
    await expect(
      pub.importEntries(pack.id, 'creature', batch.slice(0, 1), false, key),
    ).rejects.toThrow(/Request mismatch/)
    const changed = [
      { key: 'aboleth', name_en: 'Aboleth', name_es: 'Aboleth', data: { index: { cr: '10' } } },
      { key: 'wolf', name_en: 'Wolf', name_es: 'Lobo', data: { index: { cr: '1/2' } } },
      { key: 'dire-wolf', name_en: 'Dire Wolf', data: {} },
    ]
    expect(await pub.importEntries(pack.id, 'creature', changed, false)).toMatchObject({
      added: 1,
      updated: 1,
      unchanged: 1,
    })
    const drafts = await pub.drafts(pack.id, 'creature')
    expect(drafts.map((d) => [d.key, d.index])).toEqual([
      ['aboleth', { cr: '10' }],
      ['dire-wolf', undefined],
      ['wolf', { cr: '1/2' }],
    ])
    await expect(pub.importEntries(pack.id, 'creature', [], false)).rejects.toThrow(
      /Invalid request/,
    )
    await expect(pub.importEntries(pack.id, 'Creature', changed, false)).rejects.toThrow(
      /Invalid request/,
    )
    // Private packs stay with their owner even once published.
    await pub.publish(pack.id, 0)
    await asUser(reader)
    expect((await pub.library()).packs.map((p) => p.slug)).not.toContain('bulk')
    await expect(pub.entries(pack.id, 'creature')).rejects.toThrow(/Forbidden/)
  })

  it('pages large kinds and caps a pack at 5000 entries per kind', async () => {
    await asUser(editor)
    const pack = await pub.savePack({ slug: 'large', title_en: 'Large', visibility: 'public' })
    const items = (from: number) =>
      Array.from({ length: 300 }, (_, i) => ({
        key: `item-${String(from + i).padStart(4, '0')}`,
        name_en: `Item ${from + i}`,
        data: {},
      }))
    await pub.importEntries(pack.id, 'item', items(0), false)
    await pub.importEntries(pack.id, 'item', items(300), false)
    await pub.publish(pack.id, 0)
    await asUser(reader)
    const first = await pub.entries(pack.id, 'item')
    expect(first.entries).toHaveLength(500)
    expect(first.next).toBe('item-0499')
    const second = await pub.entries(pack.id, 'item', first.next!)
    expect(second.entries.map((e) => e.key)).toEqual(
      Array.from({ length: 100 }, (_, i) => `item-${String(500 + i).padStart(4, '0')}`),
    )
    expect(second.next).toBeNull()
    // The cap holds for single saves and imports.
    await db.exec('reset role')
    await db.query(
      `insert into public.content_entries (pack_id, kind, key, name_en, data)
        select $1, 'item', 'more-' || g, 'More', '{}' from generate_series(1, 4400) g`,
      [pack.id],
    )
    await asUser(editor)
    await expect(
      pub.save(pack.id, { kind: 'item', key: 'one-more', name_en: 'One more', data: {} }),
    ).rejects.toThrow(/Invalid request/)
    await expect(
      pub.importEntries(pack.id, 'item', [{ key: 'extra', name_en: 'Extra', data: {} }], false),
    ).rejects.toThrow(/Invalid request/)
  })

  it('keeps pack metadata whole and visibility a deliberate change', async () => {
    await asUser(editor)
    await expect(pub.savePack({ slug: 'srd-5-2-1', title_en: 'Again' })).rejects.toThrow(
      /Slug taken/,
    )
    await expect(pub.savePack({ slug: 'No Slug', title_en: 'X' })).rejects.toThrow(
      /Invalid request/,
    )
    await expect(pub.savePack({ slug: 'untitled' })).rejects.toThrow(/Invalid request/)
    await expect(pub.savePack({ slug: 'x', title_en: 'X', visibility: 'shared' })).rejects.toThrow(
      /Invalid request/,
    )
    await expect(pub.savePack({ slug: 'x', title_en: 'X', owner_id: reader })).rejects.toThrow(
      /Invalid request/,
    )
    await expect(
      pub.savePack({ slug: 'x', title_en: 'X', description_en: 'x'.repeat(17000) }),
    ).rejects.toThrow(/Invalid request/)
    const draftPack = await pub.savePack({ slug: 'typo', title_en: 'Typo' })
    // An update without every field is refused (it would reset attribution or visibility).
    await expect(
      pub.savePack({ slug: 'fixed', title_en: 'Fixed' }, draftPack.id, draftPack.revision),
    ).rejects.toThrow(/Invalid request/)
    const renamed = await pub.savePack(
      fullPack({ slug: 'fixed', title_en: 'Fixed' }),
      draftPack.id,
      draftPack.revision,
    )
    await expect(
      pub.savePack(
        fullPack({ slug: 'srd-5-2-1', title_en: 'Fixed' }),
        draftPack.id,
        renamed.revision,
      ),
    ).rejects.toThrow(/Slug taken/)
    await expect(pub.deletePack(draftPack.id, draftPack.revision)).rejects.toThrow(/Stale revision/)
    expect(await pub.deletePack(draftPack.id, renamed.revision)).toMatchObject({ deleted: true })
    const srdPack = await findPack('srd-5-2-1')
    await expect(pub.deletePack(srdPack.id, srdPack.revision!)).rejects.toThrow(/Pack published/)
    // A published pack keeps its slug, and save never changes who can read it.
    const publicFields = fullPack({ ...srd, visibility: 'public' })
    await expect(
      pub.savePack({ ...publicFields, slug: 'srd' }, srdPack.id, srdPack.revision!),
    ).rejects.toThrow(/Invalid request/)
    await expect(
      pub.savePack({ ...publicFields, visibility: 'private' }, srdPack.id, srdPack.revision!),
    ).rejects.toThrow(/Invalid request/)
    const replayKey = randomUUID()
    const fields = { ...publicFields, title_es: 'Documento de referencia 5.2.1' }
    const updated = await pub.savePack(fields, srdPack.id, srdPack.revision!, replayKey)
    expect(await pub.savePack(fields, srdPack.id, srdPack.revision!, replayKey)).toEqual(updated)
    // The deliberate change: the SRD leaves the readers' library at once, and comes back.
    const hidden = await pub.visibility(srdPack.id, updated.revision, 'private')
    await asUser(reader)
    expect((await pub.library()).packs.map((p) => p.slug)).not.toContain('srd-5-2-1')
    await expect(pub.visibility(srdPack.id, hidden.revision, 'public')).rejects.toThrow(/Forbidden/)
    await asUser(editor)
    await expect(pub.visibility(srdPack.id, updated.revision, 'public')).rejects.toThrow(
      /Stale revision/,
    )
    await expect(pub.visibility(srdPack.id, hidden.revision, 'everyone')).rejects.toThrow(
      /Invalid request/,
    )
    await pub.visibility(srdPack.id, hidden.revision, 'public')
    await asUser(reader)
    expect((await pub.library()).packs.map((p) => p.slug)).toContain('srd-5-2-1')
  })

  it('refuses anon, readers, helpers and direct table access', async () => {
    await asUser(editor)
    const srdPack = await findPack('srd-5-2-1')
    const [entry] = await pub.drafts(srdPack.id, 'creature')
    await asUser(reader)
    for (const call of [
      () => pub.savePack({ slug: 'mine', title_en: 'Mine' }),
      () => pub.visibility(srdPack.id, srdPack.revision!, 'private'),
      () => pub.save(srdPack.id, wolf(20), entry!.id, entry!.revision),
      () => pub.remove(entry!.id, entry!.revision),
      () => pub.revert(entry!.id, entry!.revision),
      () => pub.importEntries(srdPack.id, 'creature', [wolf(20)], true),
      () => pub.importEntries(srdPack.id, 'creature', [wolf(20)], false),
      () => pub.publish(srdPack.id, srdPack.version),
      () => pub.deletePack(srdPack.id, srdPack.revision!),
      () => pub.drafts(srdPack.id, 'creature'),
      () => pub.changes(srdPack.id),
      () => pub.draft(entry!.id),
    ])
      await expect(call()).rejects.toThrow(/Forbidden/)
    for (const table of [
      'public.content_packs',
      'public.content_entries',
      'private.content_editors',
      'private.content_requests',
    ])
      await expect(db.query(`select * from ${table}`)).rejects.toThrow(/permission denied/)
    for (const sql of [
      "insert into public.content_packs (slug, title_en) values ('direct', 'Direct')",
      "update public.content_packs set visibility = 'private'",
      'delete from public.content_entries',
      `insert into private.content_editors values ('${reader}')`,
    ])
      await expect(db.query(sql)).rejects.toThrow(/permission denied/)
    await asAnon()
    for (const schema of ['public', 'pre'])
      for (const sql of allCalls(schema, srdPack.id, entry!.id))
        await expect(db.query(sql), sql).rejects.toThrow(/permission denied/)
    await expect(db.query('select * from public.content_entries')).rejects.toThrow(
      /permission denied/,
    )
    await db.exec('reset role')
    // No helper is executable by clients, in either environment.
    const helpers = (
      await db.query<{ fn: string; anon: boolean; signed: boolean }>(
        `select p.oid::regprocedure::text fn, has_function_privilege('anon', p.oid, 'execute') anon,
            has_function_privilege('authenticated', p.oid, 'execute') signed
          from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname in ('private', 'pre_private') and p.proname like '%content%'`,
      )
    ).rows
    expect(helpers.length).toBeGreaterThanOrEqual(24)
    for (const helper of helpers)
      expect(helper, helper.fn).toMatchObject({ anon: false, signed: false })
  })

  it('keeps a former editor to what readers see, apart from their own private packs', async () => {
    await grant(secondEditor)
    await asUser(secondEditor)
    const library = await pub.library()
    expect(library.editor).toBe(true)
    expect(library.packs.map((p) => p.slug)).toEqual(
      expect.arrayContaining(['bulk', 'homebrew', 'srd-5-2-1']),
    )
    await asUser(editor)
    const replayKey = randomUUID()
    const own = await pub.savePack({ slug: 'notes', title_en: 'Notes' }, null, null, replayKey)
    const bulk = await findPack('bulk')
    const [entry] = await pub.drafts(bulk.id, 'creature')
    await db.exec('reset role')
    await db.query('delete from private.content_editors where user_id = $1', [editor])
    await asUser(editor)
    const former = await pub.library()
    expect(former.editor).toBe(false)
    // Their published private pack stays readable; their unpublished one does not.
    expect(former.packs.map((p) => p.slug)).toContain('bulk')
    expect(former.packs.map((p) => p.slug)).not.toContain('notes')
    for (const pack of former.packs) expect(pack).not.toHaveProperty('pending')
    await expect(pub.drafts(bulk.id, 'creature')).rejects.toThrow(/Forbidden/)
    await expect(pub.draft(entry!.id)).rejects.toThrow(/Forbidden/)
    await expect(pub.savePack({ slug: 'later', title_en: 'Later' })).rejects.toThrow(/Forbidden/)
    // A retried request replays its own earlier result (ids only), as in RYT-089.
    expect(await pub.savePack({ slug: 'notes', title_en: 'Notes' }, null, null, replayKey)).toEqual(
      own,
    )
    await asUser(reader)
    await expect(
      pub.savePack({ slug: 'notes', title_en: 'Notes' }, null, null, replayKey),
    ).rejects.toThrow(/Request mismatch/)
    await grant(editor)
  })

  it('mirrors the change into a PRE copied before the migration, with its own editors', async () => {
    const pre = api('pre')
    // Production editors are not PRE editors.
    await asUser(editor)
    await expect(pre.savePack({ slug: 'pre-pack', title_en: 'PRE' })).rejects.toThrow(/Forbidden/)
    await grant(editor, 'pre_private')
    await asUser(editor)
    const pack = await pre.savePack({ slug: 'pre-pack', title_en: 'PRE', visibility: 'public' })
    const secret = await pre.savePack({ slug: 'pre-secret', title_en: 'Secret' })
    await pre.save(pack.id, wolf())
    await pre.save(secret.id, wolf())
    await pre.publish(pack.id, 0)
    await pre.publish(secret.id, 0)
    await asUser(secondEditor)
    await expect(pre.drafts(pack.id, 'creature')).rejects.toThrow(/Forbidden/)
    await asUser(reader)
    expect((await pre.entries(pack.id, 'creature')).entries).toHaveLength(1)
    expect((await pre.library()).packs.map((p) => p.slug)).toEqual(['pre-pack'])
    await expect(pre.entries(secret.id, 'creature')).rejects.toThrow(/Forbidden/)
    await expect(pre.savePack({ slug: 'mine', title_en: 'Mine' })).rejects.toThrow(/Forbidden/)
    // The environments stay apart.
    expect((await pub.library()).packs.map((p) => p.slug)).not.toContain('pre-pack')
    await expect(pub.entries(pack.id, 'creature')).rejects.toThrow(/Forbidden/)
    await db.exec('reset role')
    const sources = (
      await db.query<{ src: string }>(
        `select prosrc src from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname in ('pre', 'pre_private') and p.proname like '%content%'`,
      )
    ).rows
    expect(sources.length).toBeGreaterThanOrEqual(25)
    for (const { src } of sources) expect(src).not.toMatch(/\bpublic\.|\bprivate\./)
    const rls = (
      await db.query<{ name: string; rls: boolean }>(
        `select c.oid::regclass::text name, c.relrowsecurity rls from pg_class c
          join pg_namespace n on n.oid = c.relnamespace
          where n.nspname in ('public', 'private', 'pre', 'pre_private') and c.relkind = 'r'
            and c.relname like 'content_%'`,
      )
    ).rows
    expect(rls).toHaveLength(8)
    for (const table of rls) expect(table, table.name).toMatchObject({ rls: true })
  })
})
