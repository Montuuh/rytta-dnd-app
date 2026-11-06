import { randomUUID } from 'node:crypto'
import type { Page } from '@playwright/test'
import { campaignId, dmId } from './identity.ts'

// ADR 032 SDK contract fixture: one in-memory tabletop shared by several browser contexts. It
// mirrors the RPC results and the table projection the UI relies on; authorization, validation and
// the real projection are verified against PostgreSQL in tests/database/tabletop.test.ts.
type Json = Record<string, unknown>
type Scene = Json & {
  id: string
  revision: number
  fog: { base: string; ops: Json[] }
  rooms: Json[]
}
type Item = Json & {
  id: string
  scene_id: string
  kind: string
  hidden: boolean
  data: Json
  secret: Json
}

const now = () => new Date().toISOString()

export function tabletopServer(options: { visibleCombatant?: (id: string) => boolean } = {}) {
  const scenes: Scene[] = []
  const items: Item[] = []
  const cards: Json[] = []
  const tracks: Json[] = []
  const files = new Map<string, { body: Buffer; type: string }>()
  const calls: { method: string; body: Json }[] = []
  /** The next call to this RPC fails as a server error would (the app offers a retry). */
  let failNext: string | null = null
  let live: Json = {
    scene_id: null,
    view_x: null,
    view_y: null,
    card_id: null,
    ambience: null,
    track_id: null,
    volume: 70,
    playing: false,
    loop: true,
    sound: null,
    ping: null,
    measure: null,
    screen: {},
    revision: 0,
    updated_at: null,
  }
  const requests = new Map<string, unknown>()
  const bump = () =>
    (live = { ...live, revision: (live.revision as number) + 1, updated_at: now() })
  const itemJson = (i: Item) => {
    const { scene_id: _scene, ...rest } = i
    void _scene
    return rest
  }
  const sceneJson = (s: Scene, full: boolean) => {
    const look = (s.recipe as { look?: string } | null | undefined)?.look ?? null
    if (full) return { ...s, look }
    const { rooms: _r, recipe: _c, ...rest } = s
    void _r
    void _c
    return { ...rest, look }
  }
  function view(actor: string, sceneId: string | null, asTable: boolean) {
    const dm = actor === dmId
    const full = dm && !asTable
    const wanted = full && sceneId ? sceneId : (live.scene_id as string | null)
    const scene = scenes.find((s) => s.id === wanted) ?? null
    if (full && sceneId && !scene) return { error: 'Scene unavailable' }
    const list = scene ? items.filter((i) => i.scene_id === scene.id) : []
    const visible = full
      ? list.map(itemJson)
      : list
          .filter(
            (i) =>
              !i.hidden &&
              ['token', 'prop', 'door', 'area'].includes(i.kind) &&
              !(i.kind === 'door' && i.data.secret) &&
              (!i.combatant_id || (options.visibleCombatant?.(i.combatant_id as string) ?? true)),
          )
          .map((i) => {
            const {
              secret: _s,
              hidden: _h,
              locked: _l,
              revision: _v,
              ...rest
            } = itemJson(i) as Json
            void _s
            void _h
            void _l
            void _v
            return { ...rest, data: i.kind === 'door' ? { state: i.data.state } : i.data }
          })
    const card = live.card_id ? (cards.find((c) => c.id === live.card_id) ?? null) : null
    const track = live.track_id ? (tracks.find((t) => t.id === live.track_id) ?? null) : null
    return {
      role: dm ? 'dm' : 'player',
      live,
      scene: scene ? sceneJson(scene, full) : null,
      items: visible,
      card: card && {
        id: card.id,
        title: card.title,
        body: card.body,
        image_path: card.image_path,
      },
      track: track && { id: track.id, title: track.title, path: track.path, mime: track.mime },
    }
  }
  function put(scene: Scene, entry: Json) {
    const id = (entry.id as string) || randomUUID()
    let item = items.find((i) => i.id === id)
    if (!item) {
      item = {
        id,
        scene_id: scene.id,
        kind: entry.kind as string,
        x: 0,
        y: 0,
        w: 1,
        h: 1,
        rotation: 0,
        label: null,
        hidden: false,
        locked: false,
        combatant_id: null,
        character_id: null,
        data: {},
        secret: {},
        revision: 0,
      }
      items.push(item)
    } else item.revision = (item.revision as number) + 1
    for (const key of [
      'x',
      'y',
      'w',
      'h',
      'rotation',
      'label',
      'hidden',
      'locked',
      'combatant_id',
      'character_id',
      'data',
      'secret',
    ])
      if (key in entry) (item as Json)[key] = entry[key]
    return itemJson(item)
  }
  function handle(actor: string, method: string, body: Json): unknown {
    calls.push({ method, body })
    if (failNext === method) {
      failNext = null
      return { error: 'Service unavailable' }
    }
    const dm = actor === dmId
    if (body.target_campaign && body.target_campaign !== campaignId) return { error: 'Forbidden' }
    if (method === 'get_tabletop')
      return view(actor, body.target_scene as string | null, Boolean(body.as_table))
    if (!dm) return { error: 'Forbidden' }
    if (method === 'list_tabletop_scenes')
      return {
        live,
        scenes: [...scenes].reverse().map((s) => ({
          id: s.id,
          name: s.name,
          map_kind: s.map_kind,
          map_path: s.map_path,
          cols: s.cols,
          rows: s.rows,
          ground: s.ground,
          fog_enabled: s.fog_enabled,
          recipe: s.recipe ?? null,
          revision: s.revision,
          updated_at: s.updated_at,
          items: items.filter((i) => i.scene_id === s.id).length,
        })),
      }
    if (method === 'get_tabletop_library') return { cards, tracks }
    const key = body.request_id as string
    if (key && requests.has(key)) return requests.get(key)
    const result = mutate(method, body)
    if (key) requests.set(key, result)
    return result
  }
  function mutate(method: string, body: Json): unknown {
    switch (method) {
      case 'save_tabletop_scene': {
        const fields = { ...(body.fields as Json) }
        const initial = (fields.items as Json[] | undefined) ?? []
        delete fields.items
        let scene = scenes.find((s) => s.id === body.target_scene)
        if (!scene) {
          scene = {
            id: randomUUID(),
            name: 'Scene',
            map_kind: 'blank',
            map_path: null,
            map_width: null,
            map_height: null,
            cell_px: 64,
            offset_x: 0,
            offset_y: 0,
            cols: 24,
            rows: 18,
            ground: 'parchment',
            grid_visible: true,
            fog_enabled: false,
            fog: { base: 'hidden', ops: [] },
            rooms: [],
            recipe: null,
            revision: 0,
            updated_at: now(),
          }
          scenes.push(scene)
        } else {
          if (body.expected_revision !== scene.revision) return { error: 'Stale scene' }
          scene.revision += 1
        }
        Object.assign(scene, fields, { updated_at: now() })
        for (const entry of initial) put(scene, entry)
        if (live.scene_id === scene.id) bump()
        return scene
      }
      case 'delete_tabletop_scene': {
        const index = scenes.findIndex((s) => s.id === body.target_scene)
        if (index < 0) return { error: 'Scene unavailable' }
        scenes.splice(index, 1)
        if (live.scene_id === body.target_scene) live = { ...live, scene_id: null }
        bump()
        return { id: body.target_scene }
      }
      case 'put_tabletop_items': {
        const scene = scenes.find((s) => s.id === body.target_scene)
        if (!scene) return { error: 'Scene unavailable' }
        const saved = (body.items as Json[]).map((entry) => put(scene, entry))
        if (live.scene_id === scene.id) bump()
        return saved
      }
      case 'delete_tabletop_items': {
        const ids = new Set(body.ids as string[])
        for (let i = items.length - 1; i >= 0; i--) if (ids.has(items[i]!.id)) items.splice(i, 1)
        bump()
        return { removed: ids.size }
      }
      case 'change_tabletop_fog': {
        const scene = scenes.find((s) => s.id === body.target_scene)
        if (!scene) return { error: 'Scene unavailable' }
        const op = body.op as Json
        if ('reset' in op) scene.fog = { base: op.reset as string, ops: [] }
        else if (op.shape === 'room') {
          const room = scene.rooms.find((r) => r.id === op.room)
          if (!room) return { error: 'Invalid request' }
          scene.fog = {
            ...scene.fog,
            ops: [...scene.fog.ops, { mode: op.mode, shape: 'rects', rects: room.rects }],
          }
        } else scene.fog = { ...scene.fog, ops: [...scene.fog.ops, op] }
        scene.revision += 1
        if (live.scene_id === scene.id) bump()
        return { fog: scene.fog }
      }
      case 'set_tabletop_live': {
        const patch = { ...(body.patch as Json) }
        if (typeof patch.sound === 'string') patch.sound = { key: patch.sound, at: now() }
        if (patch.ping) patch.ping = { ...(patch.ping as Json), at: now() }
        if (patch.measure) patch.measure = { ...(patch.measure as Json), at: now() }
        live = { ...live, ...patch }
        bump()
        return live
      }
      case 'save_tabletop_card': {
        const fields = body.fields as Json
        let card = cards.find((c) => c.id === body.target_card)
        if (!card) {
          card = {
            id: randomUUID(),
            title: '',
            body: '',
            image_path: null,
            revision: 0,
            updated_at: now(),
          }
          cards.push(card)
        }
        Object.assign(card, fields, { updated_at: now() })
        if (live.card_id === card.id) bump()
        return card
      }
      case 'delete_tabletop_card': {
        const index = cards.findIndex((c) => c.id === body.target_card)
        if (index >= 0) cards.splice(index, 1)
        if (live.card_id === body.target_card) live = { ...live, card_id: null }
        bump()
        return { id: body.target_card }
      }
      case 'add_tabletop_track': {
        const track = {
          id: randomUUID(),
          title: body.title,
          path: body.track_path,
          mime: body.mime,
          size_bytes: body.size_bytes,
          created_at: now(),
        }
        tracks.push(track)
        return track
      }
      case 'delete_tabletop_track': {
        const index = tracks.findIndex((t) => t.id === body.target_track)
        const [track] = index >= 0 ? tracks.splice(index, 1) : []
        if (live.track_id === body.target_track) live = { ...live, track_id: null }
        bump()
        return { id: body.target_track, path: track?.path }
      }
      case 'fire_tabletop_event': {
        const item = items.find((i) => i.id === body.target_item)
        if (!item || item.kind !== 'event') return { error: 'Item unavailable' }
        if (body.reset) {
          item.data = { ...item.data, fired: false }
          return { id: item.id, fired: false }
        }
        const scene = scenes.find((s) => s.id === item.scene_id)!
        const actions = ((item.secret.actions as Json) ?? {}) as Json
        if (actions.reveal_room) {
          const room = scene.rooms.find((r) => r.id === actions.reveal_room)
          if (room)
            scene.fog = {
              ...scene.fog,
              ops: [...scene.fog.ops, { mode: 'reveal', shape: 'rects', rects: room.rects }],
            }
        }
        let shown = 0
        if (actions.show_hidden)
          for (const other of items)
            if (
              other.scene_id === scene.id &&
              other.hidden &&
              (other.kind === 'token' || other.kind === 'prop')
            ) {
              other.hidden = false
              shown++
            }
        if (actions.card_id) live = { ...live, card_id: actions.card_id }
        if (actions.ambience) live = { ...live, ambience: actions.ambience, playing: true }
        if (actions.sound) live = { ...live, sound: { key: actions.sound, at: now() } }
        item.data = { ...item.data, fired: true }
        bump()
        return { id: item.id, fired: true, shown }
      }
    }
    return { error: 'Unknown method' }
  }
  return {
    scenes,
    items,
    cards,
    calls,
    get live() {
      return live
    },
    get failNext() {
      return failNext
    },
    set failNext(method: string | null) {
      failNext = method
    },
    act: (method: string, body: Json, actor = dmId) => handle(actor, method, body),
    async install(page: Page) {
      await page.routeWebSocket(/realtime\/v1\/websocket/, () => {
        /* Realtime unavailable: the tabletop falls back to polling. */
      })
      await page.route(/\/storage\/v1\/object\/sign\/tabletop-media\/(.+)$/, async (route) => {
        const path = decodeURIComponent(
          new URL(route.request().url()).pathname.split('/sign/tabletop-media/')[1]!,
        )
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ signedURL: `/object/tabletop-file/${path}?token=fixture` }),
        })
      })
      await page.route(/\/storage\/v1\/object\/tabletop-file\/(.+)$/, async (route) => {
        const path = decodeURIComponent(
          new URL(route.request().url()).pathname.split('/tabletop-file/')[1]!,
        )
        const file = files.get(path)
        if (!file) return route.fulfill({ status: 404, body: '' })
        return route.fulfill({ status: 200, contentType: file.type, body: file.body })
      })
      await page.route(/\/storage\/v1\/object\/tabletop-media\/(.+)$/, async (route) => {
        const request = route.request()
        const path = decodeURIComponent(
          new URL(request.url()).pathname.split('/tabletop-media/')[1]!,
        )
        if (request.method() === 'DELETE') {
          files.delete(path)
          return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
        }
        const raw = request.postDataBuffer() ?? Buffer.alloc(0)
        const type = request.headers()['content-type'] ?? 'application/octet-stream'
        files.set(path, {
          body: multipartFile(raw, type),
          type: path.endsWith('.png')
            ? 'image/png'
            : path.endsWith('.webp')
              ? 'image/webp'
              : path.endsWith('.jpg')
                ? 'image/jpeg'
                : 'audio/mpeg',
        })
        return route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ Key: `tabletop-media/${path}` }),
        })
      })
      await page.route(
        /\/rest\/v1\/rpc\/(get_tabletop|list_tabletop_scenes|get_tabletop_library|save_tabletop_scene|delete_tabletop_scene|put_tabletop_items|delete_tabletop_items|change_tabletop_fog|set_tabletop_live|save_tabletop_card|delete_tabletop_card|add_tabletop_track|delete_tabletop_track|fire_tabletop_event)$/,
        async (route) => {
          const request = route.request()
          const method = new URL(request.url()).pathname.split('/').at(-1)!
          let actor = dmId
          try {
            actor = JSON.parse(
              Buffer.from(request.headers().authorization!.split('.')[1]!, 'base64url').toString(),
            ).sub
          } catch {
            /* unsigned */
          }
          let body: Json = {}
          try {
            body = request.postDataJSON() ?? {}
          } catch {
            /* empty */
          }
          const out = handle(actor, method, body)
          if (out && typeof out === 'object' && 'error' in out && Object.keys(out).length === 1)
            return route.fulfill({
              status: 400,
              contentType: 'application/json',
              body: JSON.stringify({ code: 'P0001', message: (out as { error: string }).error }),
            })
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify(out),
          })
        },
      )
    },
  }
}

/** The file bytes of an upload: the raw body, or the first file part of a multipart body. */
function multipartFile(raw: Buffer, type: string) {
  const boundary = /boundary=(.+)$/.exec(type)?.[1]
  if (!boundary) return raw
  const text = raw.toString('latin1')
  const parts = text.split(`--${boundary}`)
  for (const part of parts) {
    const head = part.indexOf('\r\n\r\n')
    if (head < 0 || !/filename=|Content-Type: (image|audio)\//i.test(part.slice(0, head))) continue
    const body = part.slice(head + 4).replace(/\r\n$/, '')
    return Buffer.from(body, 'latin1')
  }
  return raw
}
