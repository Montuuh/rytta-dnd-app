import type { Page } from '@playwright/test'

// RYT-093 SDK contract fixture: an in-memory content library mirroring the RPC rules the manager
// relies on (drafts, revisions, publish, import reports). Authorization and limits are verified
// against PostgreSQL in tests/database/content-library.test.ts.
type Json = Record<string, unknown>
type Pack = {
  id: string
  slug: string
  title_en: string
  title_es: string
  description_en: string
  description_es: string
  edition: string | null
  license: string
  attribution: string
  visibility: 'public' | 'private'
  version: number
  revision: number
}
type Entry = {
  id: string
  pack_id: string
  kind: string
  key: string
  name_en: string
  name_es: string
  data: Json
  deleted: boolean
  published: { name_en: string; name_es: string; data: Json; version: number } | null
  revision: number
  updated_at: string
}

let counter = 0
const id = (prefix: string) =>
  `${prefix}000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const state = (e: Entry) =>
  !e.published
    ? 'new'
    : e.deleted
      ? 'deleted'
      : same(e.data, e.published.data) &&
          e.name_en === e.published.name_en &&
          e.name_es === e.published.name_es
        ? 'published'
        : 'changed'
const keyPattern = /^[a-z0-9]+(-[a-z0-9]+)*$/

export const homebrewPackId = '70000000-0000-4000-8000-000000000001'

export function libraryServer(options: { editor?: boolean; sample?: boolean } = {}) {
  const editor = options.editor ?? true
  const calls: { method: string; body: Json }[] = []
  const packs: Pack[] = []
  let entries: Entry[] = []
  if (options.sample) {
    packs.push({
      id: homebrewPackId,
      slug: 'table-homebrew',
      title_en: 'Table homebrew',
      title_es: 'Homebrew de la mesa',
      description_en: '',
      description_es: '',
      edition: '2024',
      license: '',
      attribution: '',
      visibility: 'private',
      version: 1,
      revision: 2,
    })
    const published = (kind: string, key: string, name_en: string, name_es: string, data: Json) => {
      entries.push({
        id: id('71'),
        pack_id: homebrewPackId,
        kind,
        key,
        name_en,
        name_es,
        data,
        deleted: false,
        published: { name_en, name_es, data, version: 1 },
        revision: 1,
        updated_at: '2026-11-13T10:00:00Z',
      })
    }
    published('spell', 'frost-lance', 'Frost Lance', 'Lanza de escarcha', {
      index: { lv: 2, sc: 'evocation', cl: ['wizard'] },
      es: {
        summary: 'Una lanza de hielo atraviesa a una criatura.',
        blocks: [
          { t: 'p', x: 'Lanzas un proyectil de hielo contra una criatura que veas.' },
          { t: 'p', lead: 'Con un espacio de nivel superior.', x: 'El daño aumenta en 1d8.' },
          { t: 'table', head: ['Nivel', 'Daño'], rows: [['2', '3d8']] },
        ],
      },
    })
    published('subclass', 'circle-of-embers', 'Circle of Embers', 'Círculo de las Brasas', {
      index: { class: 'druid' },
      es: {
        summary: 'Druidas del fuego que renace.',
        blocks: [{ t: 'p', x: 'Guardas la llama.' }],
      },
    })
  }

  const packRow = (p: Pack) => {
    const mine = entries.filter((e) => e.pack_id === p.id)
    const count = (rows: Entry[]) =>
      rows.reduce<Record<string, number>>(
        (all, e) => ({ ...all, [e.kind]: (all[e.kind] ?? 0) + 1 }),
        {},
      )
    return {
      ...p,
      edition: p.edition ?? undefined,
      mine: true,
      kinds: count(mine.filter((e) => e.published)),
      ...(editor
        ? {
            drafts: count(mine.filter((e) => !e.deleted)),
            pending: mine.filter((e) => state(e) !== 'published').length,
          }
        : { revision: undefined }),
    }
  }
  const draftRow = (e: Entry, index = true) => ({
    id: e.id,
    kind: e.kind,
    key: e.key,
    name_en: e.name_en,
    name_es: e.name_es,
    ...(index && e.data.index ? { index: e.data.index } : {}),
    state: state(e),
    revision: e.revision,
    updated_at: e.updated_at,
  })
  const problem = (kind: string, item: Json) => {
    const key = typeof item.key === 'string' ? item.key : ''
    const en = typeof item.name_en === 'string' ? item.name_en.trim() : ''
    const es = typeof item.name_es === 'string' ? item.name_es.trim() : ''
    if (!keyPattern.test(key)) return 'key'
    if (!en && !es) return 'name'
    if (!item.data || typeof item.data !== 'object' || Array.isArray(item.data)) return 'data'
    if (JSON.stringify(item.data).length > 131072) return 'size'
    return kind ? null : 'kind'
  }

  function handle(method: string, body: Json): unknown {
    calls.push({ method, body })
    if (method === 'get_content_library')
      return {
        editor,
        packs: packs
          .filter((p) => editor || (p.version > 0 && p.visibility === 'public'))
          .map(packRow)
          .sort((a, b) => a.slug.localeCompare(b.slug)),
      }
    if (!editor) return { error: 'Forbidden' }
    if (method === 'list_content_drafts')
      return entries
        .filter((e) => e.pack_id === body.target_pack && e.kind === body.entry_kind)
        .sort((a, b) => a.key.localeCompare(b.key))
        .map((e) => draftRow(e))
    if (method === 'list_content_changes')
      return entries
        .filter((e) => e.pack_id === body.target_pack && state(e) !== 'published')
        .map((e) => draftRow(e, false))
    if (method === 'get_content_draft') {
      const e = entries.find((x) => x.id === body.target_entry)
      if (!e) return { error: 'Entry unavailable' }
      return {
        ...draftRow(e, false),
        pack_id: e.pack_id,
        data: e.data,
        published: e.published ?? undefined,
      }
    }
    if (method === 'save_content_pack') {
      const input = body.payload as Json
      if (!keyPattern.test(String(input.slug))) return { error: 'Invalid request' }
      if (body.target_pack === null) {
        if (packs.some((p) => p.slug === input.slug)) return { error: 'Slug taken' }
        const pack: Pack = {
          id: id('72'),
          slug: String(input.slug),
          title_en: String(input.title_en ?? ''),
          title_es: String(input.title_es ?? ''),
          description_en: String(input.description_en ?? ''),
          description_es: String(input.description_es ?? ''),
          edition: (input.edition as string | null) ?? null,
          license: String(input.license ?? ''),
          attribution: String(input.attribution ?? ''),
          visibility: input.visibility === 'public' ? 'public' : 'private',
          version: 0,
          revision: 1,
        }
        packs.push(pack)
        return { id: pack.id, revision: pack.revision }
      }
      const pack = packs.find((p) => p.id === body.target_pack)
      if (!pack) return { error: 'Pack unavailable' }
      if (pack.revision !== body.expected_revision) return { error: 'Stale revision' }
      if (pack.version > 0 && (input.slug !== pack.slug || input.visibility !== pack.visibility))
        return { error: 'Invalid request' }
      Object.assign(pack, input, { revision: pack.revision + 1 })
      return { id: pack.id, revision: pack.revision }
    }
    if (method === 'set_content_pack_visibility') {
      const pack = packs.find((p) => p.id === body.target_pack)!
      if (pack.revision !== body.expected_revision) return { error: 'Stale revision' }
      pack.visibility = body.new_visibility as Pack['visibility']
      pack.revision += 1
      return { id: pack.id, revision: pack.revision, visibility: pack.visibility }
    }
    if (method === 'delete_content_pack') {
      const pack = packs.find((p) => p.id === body.target_pack)!
      if (pack.version > 0) return { error: 'Pack published' }
      packs.splice(packs.indexOf(pack), 1)
      entries = entries.filter((e) => e.pack_id !== pack.id)
      return { id: pack.id, deleted: true }
    }
    if (method === 'save_content_entry') {
      const input = body.payload as Json
      const reason = problem(String(input.kind), input)
      if (reason) return { error: 'Invalid request' }
      if (body.target_entry === null) {
        if (
          entries.some(
            (e) => e.pack_id === body.target_pack && e.kind === input.kind && e.key === input.key,
          )
        )
          return { error: 'Key taken' }
        const entry: Entry = {
          id: id('73'),
          pack_id: String(body.target_pack),
          kind: String(input.kind),
          key: String(input.key),
          name_en: String(input.name_en ?? '').trim(),
          name_es: String(input.name_es ?? '').trim(),
          data: input.data as Json,
          deleted: false,
          published: null,
          revision: 1,
          updated_at: new Date().toISOString(),
        }
        entries.push(entry)
        return { id: entry.id, revision: 1, state: 'new' }
      }
      const entry = entries.find((e) => e.id === body.target_entry)
      if (!entry) return { error: 'Entry unavailable' }
      if (entry.revision !== body.expected_revision) return { error: 'Stale revision' }
      Object.assign(entry, {
        name_en: String(input.name_en ?? '').trim(),
        name_es: String(input.name_es ?? '').trim(),
        data: input.data,
        deleted: false,
        revision: entry.revision + 1,
      })
      return { id: entry.id, revision: entry.revision, state: state(entry) }
    }
    if (method === 'delete_content_entry' || method === 'revert_content_entry') {
      const entry = entries.find((e) => e.id === body.target_entry)
      if (!entry) return { error: 'Entry unavailable' }
      if (entry.revision !== body.expected_revision) return { error: 'Stale revision' }
      if (!entry.published) {
        entries = entries.filter((e) => e !== entry)
        return { id: entry.id, deleted: true }
      }
      if (method === 'delete_content_entry') entry.deleted = true
      else
        Object.assign(entry, {
          name_en: entry.published.name_en,
          name_es: entry.published.name_es,
          data: entry.published.data,
          deleted: false,
        })
      entry.revision += 1
      return { id: entry.id, revision: entry.revision, state: state(entry) }
    }
    if (method === 'import_content_entries') {
      const items = body.entries as Json[]
      const kind = String(body.entry_kind)
      const report = {
        added: 0,
        updated: 0,
        unchanged: 0,
        refused: 0,
        problems: [] as Json[],
        dry_run: body.dry_run,
      }
      const seen = new Set<string>()
      items.forEach((item, index) => {
        const reason = seen.has(String(item.key)) ? 'duplicate' : problem(kind, item)
        if (reason) {
          report.refused += 1
          report.problems.push({ position: index + 1, key: item.key ?? null, reason })
          return
        }
        seen.add(String(item.key))
        const existing = entries.find(
          (e) => e.pack_id === body.target_pack && e.kind === kind && e.key === item.key,
        )
        const names = { name_en: String(item.name_en ?? ''), name_es: String(item.name_es ?? '') }
        if (!existing) {
          report.added += 1
          if (!body.dry_run)
            entries.push({
              id: id('74'),
              pack_id: String(body.target_pack),
              kind,
              key: String(item.key),
              ...names,
              data: item.data as Json,
              deleted: false,
              published: null,
              revision: 1,
              updated_at: new Date().toISOString(),
            })
        } else if (
          same(existing.data, item.data) &&
          existing.name_en === names.name_en &&
          existing.name_es === names.name_es &&
          !existing.deleted
        ) {
          report.unchanged += 1
        } else {
          report.updated += 1
          if (!body.dry_run)
            Object.assign(existing, names, {
              data: item.data,
              deleted: false,
              revision: existing.revision + 1,
            })
        }
      })
      return report
    }
    if (method === 'publish_content_pack') {
      const pack = packs.find((p) => p.id === body.target_pack)!
      if (pack.version !== body.expected_version) return { error: 'Stale revision' }
      const mine = entries.filter((e) => e.pack_id === pack.id)
      const added = mine.filter((e) => state(e) === 'new').length
      const changed = mine.filter((e) => state(e) === 'changed').length
      const removed = mine.filter((e) => state(e) === 'deleted').length
      if (!added && !changed && !removed) return { error: 'Nothing to publish' }
      entries = entries.filter((e) => !(e.pack_id === pack.id && e.deleted))
      pack.version += 1
      pack.revision += 1
      for (const e of entries)
        if (e.pack_id === pack.id && state(e) !== 'published')
          e.published = {
            name_en: e.name_en,
            name_es: e.name_es,
            data: e.data,
            version: pack.version,
          }
      return {
        id: pack.id,
        version: pack.version,
        revision: pack.revision,
        added,
        changed,
        removed,
      }
    }
    return { error: 'Unhandled content route' }
  }

  return {
    calls,
    packs,
    entries: () => entries,
    /** Registers the content library RPCs for a page (after identityFixture). */
    async install(page: Page) {
      await page.route(/\/rest\/v1\/rpc\/[a-z_]*content[a-z_]*$/, async (route) => {
        const method = new URL(route.request().url()).pathname.split('/').at(-1)!
        let body: Json = {}
        try {
          body = route.request().postDataJSON() ?? {}
        } catch {
          /* GET */
        }
        const result = handle(method, body) as Json
        if (
          result &&
          typeof result === 'object' &&
          'error' in result &&
          Object.keys(result).length === 1
        )
          return route.fulfill({
            status: 400,
            contentType: 'application/json',
            body: JSON.stringify({ code: 'P0001', message: result.error }),
          })
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify(result),
        })
      })
    },
  }
}
