import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'
import { Button, Drawer, Menu } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import {
  ArrowLeft,
  Armchair,
  BookOpenText,
  ExternalLink,
  Frame,
  LayoutPanelLeft,
  Maximize,
  Minus,
  Monitor,
  Music,
  Plus,
  RotateCcw,
  RotateCw,
  Settings2,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '@/features/auth'
import { combatStateQuery, useCombatRealtime, type Combatant } from '@/features/combat'
import { usePhone } from '@/shared/ui/use-viewport'
import { libraryQuery, tabletopQuery, useTabletopAction, useTabletopRealtime } from '../api'
import { TableAudio } from '../audio/engine'
import { fromSetup, squaresThatFit } from '../domain/calibration'
import {
  angleTo,
  areaCells,
  caughtTokens,
  cellCenter,
  clamp,
  itemCells,
  measurePath,
  nearestEdge,
  roomAt,
  type AreaPlacement,
  snapItem,
  type Point,
} from '../domain/geometry'
import type { Card, Item, ItemPatch, Scene, TabletopView } from '../domain/model'
import type { TabletopAction } from '../data/repository'
import { propById } from '../domain/props'
import { AreaDrawing, Board, type DragOverride } from './board'
import { CaughtList, Inspector } from './inspector'
import { AreaOptions, FogOptions, MeasureReadout, OptionStrip, ToolKit } from './kit'
import { MeasureTape, PingRipple, TableFrame } from './overlays'
import { AudioPanel, PropsPanel, ScenePanel, StoryPanel, TokensPanel } from './panels'
import {
  defaultArea,
  defaultFog,
  toolKeys,
  tools,
  type AreaSettings,
  type FogSettings,
  type Tool,
} from './tools'
import { useBoardView } from './viewport'

/** The words for a failed write (see tabletopErrorCode). */
const failureKey = (code: string) =>
  code === 'full'
    ? 'tabletop.error.full'
    : code === 'fogFull'
      ? 'tabletop.error.fogFull'
      : code === 'offline'
        ? 'tabletop.error.offline'
        : code === 'stale'
          ? 'tabletop.error.stale'
          : 'tabletop.error.save'

/** Failures worth trying again as they were (a stale or full scene needs a different change). */
const retryable = (code: string) => code === 'offline' || code === 'unavailable'

type Panel = 'tokens' | 'props' | 'story' | 'audio' | 'scene'
const panels: { key: Panel; icon: typeof Users }[] = [
  { key: 'tokens', icon: Users },
  { key: 'props', icon: Armchair },
  { key: 'story', icon: BookOpenText },
  { key: 'audio', icon: Music },
  { key: 'scene', icon: Settings2 },
]

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.isContentEditable ||
    /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) ||
    Boolean(target.closest('[role="listbox"],[role="menu"]')))

/** Free squares near a point for new tokens, spiralling outwards. */
function freeSpots(scene: Scene, items: readonly Item[], center: Point, sizes: number[]) {
  const taken = new Set<string>()
  for (const item of items)
    if (item.kind === 'token') for (const [x, y] of itemCells(item)) taken.add(`${x}:${y}`)
  const spots: [number, number][] = []
  const [cx, cy] = [Math.floor(center[0]), Math.floor(center[1])]
  for (const size of sizes) {
    const s = Math.max(1, Math.ceil(size))
    let found: [number, number] | null = null
    for (let r = 0; r < 40 && !found; r++)
      for (let dx = -r; dx <= r && !found; dx++)
        for (let dy = -r; dy <= r && !found; dy++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
          const x = clamp(cx + dx, 0, scene.cols - s)
          const y = clamp(cy + dy, 0, scene.rows - s)
          let free = true
          for (let i = 0; i < s && free; i++)
            for (let j = 0; j < s; j++) if (taken.has(`${x + i}:${y + j}`)) free = false
          if (free) found = [x, y]
        }
    const spot = found ?? [cx, cy]
    for (let i = 0; i < s; i++)
      for (let j = 0; j < s; j++) taken.add(`${spot[0] + i}:${spot[1] + j}`)
    spots.push(spot)
  }
  return spots
}

export function TabletopEditor({ campaignId, sceneId }: { campaignId: string; sceneId: string }) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const userId = state.user!.id
  const navigate = useNavigate()
  const phone = usePhone()
  const connected = useTabletopRealtime(campaignId, true)
  useCombatRealtime(campaignId, true)
  const query = useQuery(tabletopQuery(userId, campaignId, sceneId, false, connected))
  const combat = useQuery(combatStateQuery(userId, campaignId, null, false))
  const library = useQuery(libraryQuery(userId, campaignId))
  const action = useTabletopAction(campaignId)
  const view = query.data
  if (query.isError && !view)
    return (
      <div className="tt-state" role="alert">
        <p>
          {t(query.error.message === 'gone' ? 'tabletop.error.sceneGone' : 'tabletop.error.load')}
        </p>
        <Button component={Link} to=".." relative="path" variant="default">
          {t('tabletop.backToLibrary')}
        </Button>
      </div>
    )
  if (!view?.scene) return <div className="tt-state">{t('tabletop.loading')}</div>
  return (
    <EditorBody
      key={view.scene.id}
      campaignId={campaignId}
      view={view as TabletopView & { scene: Scene }}
      combatants={combat.data?.combatants ?? []}
      cards={library.data?.cards ?? []}
      action={action}
      phone={phone}
      stale={query.isError}
      onLeave={() => navigate('..', { relative: 'path' })}
    />
  )
}

function EditorBody({
  campaignId,
  view,
  combatants,
  cards,
  action,
  phone,
  stale,
  onLeave,
}: {
  campaignId: string
  view: TabletopView & { scene: Scene }
  combatants: readonly Combatant[]
  cards: Card[]
  action: ReturnType<typeof useTabletopAction>
  phone: boolean
  stale: boolean
  onLeave: () => void
}) {
  const { t } = useTranslation()
  const { scene, items, live } = view
  const onTable = live.scene_id === scene.id
  const [tool, setToolState] = useState<Tool>('select')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Wide screens open the Tokens panel beside the board; narrower ones keep the board clear.
  const roomy = useMediaQuery('(min-width: 75em)', undefined, { getInitialValueInEffect: false })
  // Portrait tablets keep the board full width: tools in a row under it, panels below it.
  const narrow = useMediaQuery('(max-width: 61.99em)', undefined, {
    getInitialValueInEffect: false,
  })
  const compact = narrow && !phone
  const root = useRef<HTMLDivElement>(null)
  /** The keyboard cursor: a square the arrows move and Enter acts on with the current tool. */
  const [cursor, setCursor] = useState<[number, number] | null>(null)
  /** An item waiting for the square it moves to (the alternative to dragging). */
  const [moving, setMoving] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ message: string; undo?: () => void } | null>(null)
  const [panel, setPanel] = useState<Panel | null>(roomy ? 'tokens' : null)
  const [drag, setDrag] = useState<(DragOverride & { ox: number; oy: number }) | null>(null)
  const [measure, setMeasure] = useState<Point[]>([])
  const [measureEnd, setMeasureEnd] = useState<Point | null>(null)
  const [snap, setSnap] = useState(true)
  const [share, setShare] = useState(false)
  const [area, setArea] = useState<AreaSettings>(defaultArea)
  const [areaAt, setAreaAt] = useState<{
    x: number
    y: number
    angle: number
    w?: number
    h?: number
  } | null>(null)
  const [fog, setFog] = useState<FogSettings>(defaultFog)
  const [stroke, setStroke] = useState<Point[] | null>(null)
  const [box, setBox] = useState<[Point, Point] | null>(null)
  const [propChoice, setPropChoice] = useState<string | null>(null)
  const [announce, setAnnounce] = useState('')
  // The same words twice still reach screen readers: a no-break space makes them new.
  const say = useCallback(
    (text: string) => setAnnounce((prev) => (prev === text ? `${text}\u00a0` : text)),
    [],
  )
  const [listenHere, setListenHere] = useState(false)
  const [engine] = useState(() => new TableAudio())
  const pressed = useRef<Item | null>(null)
  const tapped = useRef<Item | null>(null)
  const [measureStart, setMeasureStart] = useState<Point | null>(null)
  const byId = useMemo(() => new Map(combatants.map((c) => [c.id, c])), [combatants])
  const selected = items.find((i) => i.id === selectedId) ?? null
  const calibration = fromSetup(live.screen)
  const frame = calibration ? squaresThatFit(calibration) : null
  const frameCenter: Point = [live.view_x ?? scene.cols / 2, live.view_y ?? scene.rows / 2]

  const setTool = (next: Tool) => {
    setToolState(next)
    setMoving(null)
    setAreaAt(null)
    setStroke(null)
    setBox(null)
    if (next !== 'measure') setMeasureEnd(null)
    if (next === 'prop' && !propChoice) setPanel('props')
  }

  // Every write goes through here: a failure shows in words above the board with a retry.
  const [failure, setFailure] = useState<{
    id: number
    message: string
    retry?: () => void
  } | null>(null)
  const attempts = useRef(0)
  const run = useCallback(
    (acts: TabletopAction | TabletopAction[], done?: string, after?: () => void) => {
      // Each attempt awaits its own writes in order: a later write never swallows an earlier
      // result, a failed step stops the rest, and Try again replays the whole action.
      const list = Array.isArray(acts) ? acts : [acts]
      const id = ++attempts.current
      const attempt = async () => {
        try {
          for (const act of list) await action.mutateAsync(act)
          setFailure((f) => (f?.id === id ? null : f))
          if (done) say(done)
          after?.()
        } catch (error) {
          const code = error instanceof Error ? error.message : 'unavailable'
          setNotice(null)
          setFailure({
            id,
            message: t(failureKey(code)),
            retry: retryable(code) ? () => void attempt() : undefined,
          })
        }
      }
      void attempt()
    },
    [action, t, say],
  )
  const put = useCallback(
    (patch: ItemPatch[], message?: string) =>
      run({ kind: 'putItems', sceneId: scene.id, items: patch }, message),
    [run, scene.id],
  )
  const live_ = (patch: TabletopAction & { kind: 'live' }) => run(patch)

  // Entering the editor puts focus inside it, where its tool letters work (WCAG 2.1.4).
  useEffect(() => {
    if (!root.current?.contains(document.activeElement))
      root.current?.querySelector<HTMLElement>('.tt-title')?.focus({ preventScroll: true })
  }, [])

  // Listening locally follows the live audio state on the DM's device.
  useEffect(() => {
    const audio = engine
    if (!listenHere) {
      audio.setAmbience(null)
      audio.setTrack(null, true)
      return
    }
    void audio.unlock().then(() => {
      audio.setVolume(live.volume / 100)
      audio.setAmbience(live.playing ? live.ambience : null)
    })
  }, [engine, listenHere, live.ambience, live.playing, live.volume])
  useEffect(() => () => engine.dispose(), [engine])

  const nameOf = (item: Item) =>
    (item.kind === 'door'
      ? t('tabletop.door.title', { state: t(`tabletop.door.${item.data.state}`) })
      : null) ??
    (item.combatant_id ? byId.get(item.combatant_id)?.name : null) ??
    item.label ??
    (item.kind === 'prop'
      ? t(`tabletop.prop.${item.data.prop}` as never)
      : t(`tabletop.kind.${item.kind}`))

  /** The item drawn on a point, the way it reads on the board: tokens over pins over props. */
  const itemAt = (p: Point): Item | null => {
    const [cx, cy] = [Math.floor(p[0]), Math.floor(p[1])]
    const inside = (i: Item) => p[0] >= i.x && p[0] < i.x + i.w && p[1] >= i.y && p[1] < i.y + i.h
    const top = [...items].reverse()
    return (
      top.find((i) => i.kind === 'token' && inside(i)) ??
      top.find((i) => (i.kind === 'note' || i.kind === 'event') && inside(i)) ??
      top.find((i) => i.kind === 'door' && Math.hypot(i.x - p[0], i.y - p[1]) < 0.6) ??
      top.find((i) => i.kind === 'prop' && inside(i)) ??
      top.find(
        (i) =>
          i.kind === 'area' &&
          areaCells(i as AreaPlacement, scene.cols, scene.rows).some(
            ([x, y]) => x === cx && y === cy,
          ),
      ) ??
      null
    )
  }

  const focusBoard = () => root.current?.querySelector<HTMLElement>('.tt-viewport')?.focus()
  /** A selection made from the keyboard takes focus to the inspector and says so. */
  const focusInspector = (item: Item) => {
    say(t('tabletop.selectedAnnounce', { name: nameOf(item) }))
    requestAnimationFrame(() => document.querySelector<HTMLElement>('.tt-inspector-title')?.focus())
  }
  const closeInspector = () => {
    setSelectedId(null)
    if (!phone) focusBoard()
  }

  /** Measuring: a drag measures from where it started; a tap adds a waypoint. */
  const addRoute = (start: Point, at: Point, moved: boolean) => {
    const next = moved ? [start, at] : [...measure, at]
    const unique = next
      .filter((q, i) => i === 0 || q[0] !== next[i - 1]![0] || q[1] !== next[i - 1]![1])
      .slice(-16)
    setMeasure(unique)
    if (unique.length > 1) {
      const result = measurePath(unique)
      say(t('tabletop.measure.announce', { feet: result.feet, squares: result.squares }))
      if (share)
        live_({ kind: 'live', patch: { measure: { points: unique as [number, number][] } } })
    } else say(t('tabletop.measure.started'))
  }

  const fogRoom = (p: Point) => {
    const room = roomAt(scene.rooms ?? [], p)
    if (!room) return say(t('tabletop.fog.noRoom'))
    run({ kind: 'fog', sceneId: scene.id, op: { mode: fog.mode, shape: 'room', room: room.id } })
  }

  const fogBox = (a: Point, b: Point) => {
    const x = Math.floor(Math.min(a[0], b[0]))
    const y = Math.floor(Math.min(a[1], b[1]))
    const w = Math.max(1, Math.ceil(Math.max(a[0], b[0])) - x)
    const h = Math.max(1, Math.ceil(Math.max(a[1], b[1])) - y)
    run({ kind: 'fog', sceneId: scene.id, op: { mode: fog.mode, shape: 'rect', x, y, w, h } })
    setBox(null)
  }

  const areaAround = (p: Point, token: Item | null) => {
    if (area.shape === 'emanation') {
      const center: Point = token ? [token.x + token.w / 2, token.y + token.h / 2] : cellCenter(p)
      return { x: center[0], y: center[1], angle: 0, w: token?.w ?? 1, h: token?.h ?? 1 }
    }
    return { x: Math.round(p[0]), y: Math.round(p[1]), angle: areaAt?.angle ?? 0 }
  }

  /** A tap (or Enter on the cursor) with a placing tool. */
  const placeAt = (p: Point) => {
    const [cx, cy] = [Math.floor(p[0]), Math.floor(p[1])]
    if (tool === 'door') {
      const edge = nearestEdge(p)
      put(
        [
          {
            kind: 'door',
            x: edge.x,
            y: edge.y,
            w: 1,
            h: 0.25,
            rotation: edge.rotation,
            data: { state: 'closed' },
          },
        ],
        t('tabletop.announce.door'),
      )
    } else if (tool === 'note' || tool === 'event') {
      const id = crypto.randomUUID()
      put([
        {
          id,
          kind: tool,
          x: cx,
          y: cy,
          w: 1,
          h: 1,
          label: t(tool === 'note' ? 'tabletop.note.untitled' : 'tabletop.event.untitled'),
          data: tool === 'event' ? { fired: false } : {},
        },
      ])
      setSelectedId(id)
    } else if (tool === 'prop') {
      const definition = propChoice ? propById.get(propChoice) : null
      if (!definition) return setPanel('props')
      put(
        [
          {
            kind: 'prop',
            x: clamp(cx, 0, scene.cols - definition.w),
            y: clamp(cy, 0, scene.rows - definition.h),
            w: definition.w,
            h: definition.h,
            rotation: 0,
            data: { prop: definition.id },
          },
        ],
        t('tabletop.announce.prop', { name: t(`tabletop.prop.${definition.id}` as never) }),
      )
    } else if (tool === 'ping') {
      live_({
        kind: 'live',
        patch: { ping: { x: Number(p[0].toFixed(2)), y: Number(p[1].toFixed(2)) } },
      })
      say(t('tabletop.announce.ping'))
    }
  }

  /** The move that replaces a drag: the waiting item goes to the chosen square. */
  const moveTo = (p: Point) => {
    const item = items.find((i) => i.id === moving)
    setMoving(null)
    if (!item) return
    if (item.locked) return say(t('tabletop.announce.locked'))
    const name = nameOf(item)
    if (item.kind === 'door') {
      const edge = nearestEdge(p)
      return put(
        [{ id: item.id, x: edge.x, y: edge.y, rotation: edge.rotation }],
        t('tabletop.announce.moved', { name }),
      )
    }
    const [x, y] =
      item.kind === 'area'
        ? item.data.shape === 'emanation'
          ? cellCenter(p)
          : [Math.round(p[0]), Math.round(p[1])]
        : [
            clamp(Math.floor(p[0]), 0, scene.cols - Math.min(item.w, scene.cols)),
            clamp(Math.floor(p[1]), 0, scene.rows - Math.min(item.h, scene.rows)),
          ]
    put([{ id: item.id, x, y }], t('tabletop.announce.moved', { name }))
  }

  const board = useBoardView(
    { cols: scene.cols, rows: scene.rows },
    {
      onStart: (p) => {
        const item = pressed.current
        pressed.current = null
        tapped.current = null
        if (tool === 'select') {
          // A waiting move takes the next tap, wherever it lands.
          if (moving) return true
          if (!item) return false
          if (
            item.locked ||
            item.kind === 'note' ||
            item.kind === 'event' ||
            item.kind === 'door' ||
            item.kind === 'area'
          ) {
            tapped.current = item
            return true
          }
          setDrag({ id: item.id, x: item.x, y: item.y, ox: p[0] - item.x, oy: p[1] - item.y })
          setSelectedId(item.id)
          return true
        }
        if (tool === 'measure') {
          setMeasureStart(snap ? cellCenter(p) : p)
          return true
        }
        if (tool === 'area') {
          setAreaAt(areaAround(p, item?.kind === 'token' ? item : null))
          return true
        }
        if (tool === 'fog') {
          if (!scene.fog_enabled) return false
          if (fog.shape === 'brush') setStroke([p])
          if (fog.shape === 'rect') setBox([p, p])
          return true
        }
        return true
      },
      onMove: (p) => {
        if (drag) setDrag((d) => (d ? { ...d, x: p[0] - d.ox, y: p[1] - d.oy } : d))
        else if (tool === 'measure') setMeasureEnd(snap ? cellCenter(p) : p)
        else if (tool === 'area' && areaAt && area.shape !== 'emanation') {
          const raw = angleTo([areaAt.x, areaAt.y], p)
          setAreaAt({ ...areaAt, angle: Math.round(raw / 15) * 15 })
        } else if (tool === 'fog' && stroke) {
          const last = stroke.at(-1)!
          if (Math.hypot(p[0] - last[0], p[1] - last[1]) > 0.3 && stroke.length < 400)
            setStroke([...stroke, p])
        } else if (tool === 'fog' && box) setBox([box[0], p])
      },
      onEnd: (p, moved) => {
        if (drag) {
          const item = items.find((i) => i.id === drag.id)
          setDrag(null)
          if (item && moved) {
            const [x, y] = snapItem(drag.x, drag.y, item.w, item.h)
            const cx = clamp(x, 0, scene.cols - Math.min(item.w, scene.cols))
            const cy = clamp(y, 0, scene.rows - Math.min(item.h, scene.rows))
            put(
              [{ id: item.id, x: cx, y: cy }],
              t('tabletop.announce.moved', { name: item.label ?? t(`tabletop.kind.${item.kind}`) }),
            )
          }
          return
        }
        if (tool === 'select') {
          if (moving) {
            if (!moved) moveTo(p)
            return
          }
          const item = tapped.current
          tapped.current = null
          if (item && !moved) activate(item)
          return
        }
        if (tool === 'measure') {
          const at = snap ? cellCenter(p) : p
          const start = measureStart ?? at
          setMeasureStart(null)
          setMeasureEnd(null)
          addRoute(start, at, moved)
          return
        }
        if (tool === 'area') return
        if (tool === 'fog') {
          if (!scene.fog_enabled) return
          if (fog.shape === 'room') fogRoom(p)
          else if (fog.shape === 'brush' && stroke) {
            run({
              kind: 'fog',
              sceneId: scene.id,
              op: {
                mode: fog.mode,
                shape: 'brush',
                r: fog.radius,
                points: [...stroke, p]
                  .slice(0, 400)
                  .map(
                    ([x, y]) => [Number(x.toFixed(2)), Number(y.toFixed(2))] as [number, number],
                  ),
              },
            })
            setStroke(null)
          } else if (fog.shape === 'rect' && box) fogBox(box[0], p)
          return
        }
        if (!moved) placeAt(p)
      },
      onTap: () => {
        if (tool === 'select') setSelectedId(null)
      },
      onCancel: () => {
        setDrag(null)
        setStroke(null)
        setBox(null)
        setMeasureEnd(null)
      },
    },
    tool === 'select',
  )

  const activate = (item: Item) => {
    if (item.kind === 'door') {
      const next =
        item.data.state === 'open' ? 'closed' : item.data.state === 'locked' ? 'locked' : 'open'
      if (next === item.data.state) {
        if (!phone) setSelectedId(item.id)
        return say(t('tabletop.door.isLocked'))
      }
      // Opening a door reveals the rooms it joins when the scene has fog: one action, in order,
      // so a door that fails to open reveals nothing.
      const reveal: TabletopAction[] =
        next === 'open' && scene.fog_enabled
          ? (item.data.rooms ?? []).map((room) => ({
              kind: 'fog' as const,
              sceneId: scene.id,
              op: { mode: 'reveal' as const, shape: 'room' as const, room },
            }))
          : []
      run(
        [
          {
            kind: 'putItems',
            sceneId: scene.id,
            items: [
              {
                id: item.id,
                data: { ...item.data, state: next, ...(next === 'open' ? { secret: false } : {}) },
              },
            ],
          },
          ...reveal,
        ],
        t(next === 'open' ? 'tabletop.announce.door_open' : 'tabletop.announce.door_closed'),
      )
      // A door toggle is a quick action: phones keep the board in front (no inspector sheet).
      if (!phone) setSelectedId(item.id)
      return
    }
    setSelectedId(item.id)
    if (phone) setPanel(null)
  }

  // The board's gesture handler reads which item the press began on.
  const onItemPointerDown = (item: Item) => {
    pressed.current = item
  }

  const removeItem = (item: Item) => {
    // Everything needed to put it back, under a new id.
    const restore: ItemPatch = {
      kind: item.kind,
      x: item.x,
      y: item.y,
      w: item.w,
      h: item.h,
      rotation: item.rotation,
      label: item.label,
      hidden: item.hidden,
      locked: item.locked,
      combatant_id: item.combatant_id,
      character_id: item.character_id,
      data: item.data as Record<string, unknown>,
      ...('secret' in item && item.secret ? { secret: item.secret } : {}),
    }
    const name = nameOf(item)
    run(
      { kind: 'deleteItems', sceneId: scene.id, ids: [item.id] },
      t('tabletop.announce.removedName', { name }),
      () =>
        setNotice({
          message: t('tabletop.announce.removedName', { name }),
          undo: () => {
            setNotice(null)
            put([restore], t('tabletop.announce.restored', { name }))
          },
        }),
    )
    setSelectedId(null)
    setCursor([Math.floor(item.x), Math.floor(item.y)])
    focusBoard()
  }

  const nudge = (item: Item, dx: number, dy: number) => {
    if (item.locked) return say(t('tabletop.announce.locked'))
    const x = clamp(item.x + dx, -0.5, scene.cols - 0.5)
    const y = clamp(item.y + dy, -0.5, scene.rows - 0.5)
    put(
      [{ id: item.id, x, y }],
      t('tabletop.announce.moved', { name: item.label ?? t(`tabletop.kind.${item.kind}`) }),
    )
  }

  const onItemKeyDown = (item: Item, event: KeyboardEvent) => {
    // Doors, notes and events are drawn in SVG: Enter and Space activate them like buttons.
    if ((event.key === 'Enter' || event.key === ' ') && item.kind !== 'token') {
      event.preventDefault()
      event.stopPropagation()
      return activate(item)
    }
    const step = event.shiftKey ? 5 : 1
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    if (moves[event.key]) {
      event.preventDefault()
      event.stopPropagation()
      // Moving keeps the board in front: the inspector opens on Enter or a tap.
      return nudge(item, ...moves[event.key]!)
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      event.stopPropagation()
      return removeItem(item)
    }
    if (
      event.key.toLowerCase() === 'h' &&
      (item.kind === 'token' || item.kind === 'prop' || item.kind === 'area')
    ) {
      event.preventDefault()
      event.stopPropagation()
      put(
        [{ id: item.id, hidden: !item.hidden }],
        t(item.hidden ? 'tabletop.announce.shown' : 'tabletop.announce.hidden'),
      )
    }
  }

  // Tool letters, Escape and zoom keys work anywhere in the editor except while typing.
  useEffect(() => {
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (typing(event.target) || event.ctrlKey || event.metaKey || event.altKey) return
      // Only while the editor has focus: dialogs, drawers and menus keep their own keys.
      const target = event.target instanceof Node ? event.target : null
      if (target !== document.body && !(target && root.current?.contains(target))) return
      const key = event.key.toLowerCase()
      const found = tools.find((x) => toolKeys[x] === key)
      if (found) {
        event.preventDefault()
        setTool(found)
        say(t('tabletop.announce.tool', { tool: t(`tabletop.tool.${found}`) }))
        return
      }
      if (event.key === 'Escape') {
        if (moving) {
          setMoving(null)
          say(t('tabletop.move.cancelled'))
        } else if (measure.length || areaAt || stroke || box) {
          setMeasure([])
          setAreaAt(null)
          setStroke(null)
          setBox(null)
        } else if (selectedId) closeInspector()
        else setTool('select')
      } else if (event.key === '+' || event.key === '=') board.zoomAt(1.2)
      else if (event.key === '-') board.zoomAt(1 / 1.2)
      else if (event.key === '0') board.fit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const cursorStart = (): [number, number] => {
    const [x, y] = board.center()
    return [clamp(Math.floor(x), 0, scene.cols - 1), clamp(Math.floor(y), 0, scene.rows - 1)]
  }
  const describe = (cell: [number, number]) => {
    const item = itemAt([cell[0] + 0.5, cell[1] + 0.5])
    return item
      ? t('tabletop.cursor.item', { col: cell[0] + 1, row: cell[1] + 1, name: nameOf(item) })
      : t('tabletop.cursor.at', { col: cell[0] + 1, row: cell[1] + 1 })
  }

  /** Enter on the cursor square: what a tap does there with the current tool. */
  const actAt = (cell: [number, number]) => {
    const p: Point = [cell[0] + 0.5, cell[1] + 0.5]
    if (tool === 'select') {
      if (moving) return moveTo(p)
      const item = itemAt(p)
      if (!item) return say(t('tabletop.cursor.empty'))
      activate(item)
      if (item.kind !== 'door') focusInspector(item)
      return
    }
    if (tool === 'measure') return addRoute(p, p, false)
    if (tool === 'area') {
      const token = itemAt(p)
      const next = areaAround(p, token?.kind === 'token' ? token : null)
      setAreaAt(next)
      const cells = areaCells(
        {
          data: { shape: area.shape, size_ft: area.size, width_ft: area.width, angle: next.angle },
          ...next,
        },
        scene.cols,
        scene.rows,
      )
      return say(t('tabletop.area.previewed', { count: caughtTokens(cells, items).length }))
    }
    if (tool === 'fog') {
      if (!scene.fog_enabled) return say(t('tabletop.fog.disabled'))
      if (fog.shape === 'room') return fogRoom(p)
      if (fog.shape === 'brush')
        return run({
          kind: 'fog',
          sceneId: scene.id,
          op: { mode: fog.mode, shape: 'brush', r: fog.radius, points: [[p[0], p[1]]] },
        })
      if (!box) {
        setBox([
          [cell[0], cell[1]],
          [cell[0] + 1, cell[1] + 1],
        ])
        return say(t('tabletop.fog.boxStarted'))
      }
      return fogBox(box[0], box[1])
    }
    placeAt(p)
  }

  const onBoardKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return
    const step = event.shiftKey ? 5 : 1
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const here = cursor ?? cursorStart()
    const delta = moves[event.key]
    if (delta) {
      event.preventDefault()
      const next: [number, number] = [
        clamp(here[0] + delta[0], 0, scene.cols - 1),
        clamp(here[1] + delta[1], 0, scene.rows - 1),
      ]
      setCursor(next)
      board.reveal(next[0], next[1])
      if (box)
        setBox([box[0], [Math.max(box[0][0], next[0]) + 1, Math.max(box[0][1], next[1]) + 1]])
      return say(describe(next))
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      setCursor(here)
      actAt(here)
      return
    }
    // The selected item answers Delete and H while the board has focus.
    const target = (cursor ? itemAt([cursor[0] + 0.5, cursor[1] + 0.5]) : null) ?? selected
    if (target && (event.key === 'Delete' || event.key === 'Backspace')) {
      event.preventDefault()
      return removeItem(target)
    }
    if (
      target &&
      event.key.toLowerCase() === 'h' &&
      (target.kind === 'token' || target.kind === 'prop' || target.kind === 'area')
    ) {
      event.preventDefault()
      put(
        [{ id: target.id, hidden: !target.hidden }],
        t(target.hidden ? 'tabletop.announce.shown' : 'tabletop.announce.hidden'),
      )
    }
  }

  const startMove = (item: Item) => {
    if (item.locked) return say(t('tabletop.announce.locked'))
    setMoving(item.id)
    setToolState('select')
    setCursor([
      clamp(Math.floor(item.x), 0, scene.cols - 1),
      clamp(Math.floor(item.y), 0, scene.rows - 1),
    ])
    say(t('tabletop.move.hint', { name: nameOf(item) }))
    // Phones put the board back in front to tap the square; keyboards choose it with the cursor.
    if (phone) setSelectedId(null)
    else focusBoard()
  }

  const areaPlacement = areaAt
    ? {
        data: {
          shape: area.shape,
          size_ft: area.size,
          width_ft: area.width,
          angle: areaAt.angle,
          damage: area.damage,
        },
        x: areaAt.x,
        y: areaAt.y,
        w: areaAt.w,
        h: areaAt.h,
      }
    : null
  const caught = areaPlacement
    ? caughtTokens(areaCells(areaPlacement, scene.cols, scene.rows), items)
    : []
  const measurePoints = measureEnd && measureStart ? [measureStart, measureEnd] : measure

  const overlay = (
    <>
      {frame && (
        <TableFrame x={frameCenter[0]} y={frameCenter[1]} cols={frame.cols} rows={frame.rows} />
      )}
      {(tool === 'measure' || measure.length > 0) && <MeasureTape points={measurePoints} />}
      {stroke && (
        <polyline
          points={stroke.map(([x, y]) => `${x},${y}`).join(' ')}
          className={`tt-fog-stroke is-${fog.mode}`}
          strokeWidth={fog.radius * 2}
        />
      )}
      {box && (
        <rect
          x={Math.min(box[0][0], box[1][0])}
          y={Math.min(box[0][1], box[1][1])}
          width={Math.abs(box[1][0] - box[0][0])}
          height={Math.abs(box[1][1] - box[0][1])}
          className={`tt-fog-box is-${fog.mode}`}
        />
      )}
      <PingRipple ping={live.ping} />
      {cursor && (
        <rect
          className="tt-cursor-halo"
          x={cursor[0] + 0.04}
          y={cursor[1] + 0.04}
          width={0.92}
          height={0.92}
          rx={0.08}
        />
      )}
      {cursor && (
        <rect
          className="tt-cursor"
          x={cursor[0] + 0.04}
          y={cursor[1] + 0.04}
          width={0.92}
          height={0.92}
          rx={0.08}
        />
      )}
    </>
  )

  const movingItem = moving ? items.find((i) => i.id === moving) : null
  const strip = (() => {
    if (movingItem)
      return (
        <>
          <span className="tt-readout-hint">
            {t('tabletop.move.hint', { name: nameOf(movingItem) })}
          </span>
          <button type="button" className="tt-text-action" onClick={() => setMoving(null)}>
            {t('tabletop.move.cancel')}
          </button>
        </>
      )
    switch (tool) {
      case 'measure':
        return (
          <MeasureReadout
            points={measure}
            snap={snap}
            onSnap={setSnap}
            shared={share}
            onShare={(value) => {
              setShare(value)
              if (!value) live_({ kind: 'live', patch: { measure: null } })
              else if (measure.length > 1)
                live_({
                  kind: 'live',
                  patch: { measure: { points: measure.slice(0, 16) as [number, number][] } },
                })
            }}
            onClear={() => {
              setMeasure([])
              if (share) live_({ kind: 'live', patch: { measure: null } })
            }}
          />
        )
      case 'area':
        return <AreaOptions value={area} onChange={setArea} />
      case 'fog':
        return (
          <FogOptions
            value={fog}
            onChange={setFog}
            enabled={scene.fog_enabled}
            onEnable={(value) =>
              run({
                kind: 'saveScene',
                sceneId: scene.id,
                fields: { fog_enabled: value },
                revision: scene.revision,
              })
            }
            onReset={(to) =>
              run(
                { kind: 'fog', sceneId: scene.id, op: { reset: to } },
                t(
                  to === 'hidden' ? 'tabletop.announce.fogHidden' : 'tabletop.announce.fogRevealed',
                ),
              )
            }
          />
        )
      case 'prop':
        return (
          <span className="tt-readout-hint">
            {propChoice
              ? t('tabletop.props.placing', { name: t(`tabletop.prop.${propChoice}` as never) })
              : t('tabletop.props.choose')}
          </span>
        )
      default:
        return <span className="tt-readout-hint">{t(`tabletop.hint.${tool}`)}</span>
    }
  })()

  const placeTokens = (tokens: ItemPatch[]) => {
    const center = frame ? frameCenter : board.center()
    const spots = freeSpots(
      scene,
      items,
      center,
      tokens.map((x) => x.w ?? 1),
    )
    put(
      tokens.map((token, i) => ({ ...token, x: spots[i]![0], y: spots[i]![1] })),
      t('tabletop.announce.placed', { count: tokens.length }),
    )
    if (phone) setPanel(null)
  }

  const panelBody: Record<Panel, ReactNode> = {
    tokens: <TokensPanel campaignId={campaignId} items={items} onPlace={placeTokens} />,
    props: (
      <PropsPanel
        chosen={propChoice}
        onChoose={(prop) => {
          setPropChoice(prop)
          setToolState('prop')
          if (phone) setPanel(null)
        }}
      />
    ),
    story: <StoryPanel campaignId={campaignId} live={live} />,
    audio: (
      <AudioPanel
        campaignId={campaignId}
        live={live}
        listenHere={listenHere}
        onListenHere={setListenHere}
        engine={engine}
      />
    ),
    scene: <ScenePanel campaignId={campaignId} scene={scene} onDeleted={onLeave} />,
  }

  const inspector = selected && (
    <Inspector
      item={selected}
      scene={scene}
      items={items}
      cards={cards}
      combatant={selected.combatant_id ? byId.get(selected.combatant_id) : undefined}
      busy={action.isPending}
      onPatch={(patch) => put([patch])}
      onDelete={() => removeItem(selected)}
      onMove={() => startMove(selected)}
      onClose={closeInspector}
      onFire={(reset) =>
        run(
          { kind: 'fireEvent', itemId: selected.id, reset },
          t(reset ? 'tabletop.announce.eventReset' : 'tabletop.announce.eventFired'),
        )
      }
      onCenterTable={() =>
        live_({
          kind: 'live',
          patch: { view_x: selected.x + selected.w / 2, view_y: selected.y + selected.h / 2 },
        })
      }
    />
  )

  const side = inspector ?? (panel ? panelBody[panel] : null)

  return (
    <div
      ref={root}
      className={`tt-editor ${phone ? 'is-phone' : compact ? 'is-compact' : 'is-wide'}`}
    >
      <header className="tt-head">
        <Link to=".." relative="path" className="tt-back" aria-label={t('tabletop.backToLibrary')}>
          <ArrowLeft size={20} aria-hidden="true" />
        </Link>
        <h1 className="tt-title" tabIndex={-1}>
          {scene.name}
        </h1>
        {onTable ? (
          <span className="tt-seal-line">
            <span className="tt-seal" aria-hidden="true">
              <Monitor size={14} />
            </span>
            {t('tabletop.onTable')}
          </span>
        ) : (
          <Button
            leftSection={<Monitor size={18} aria-hidden="true" />}
            onClick={() =>
              live_({
                kind: 'live',
                patch: { scene_id: scene.id, view_x: scene.cols / 2, view_y: scene.rows / 2 },
              })
            }
            loading={action.isPending && action.variables?.kind === 'live'}
          >
            {phone ? t('tabletop.putOnTableShort') : t('tabletop.putOnTable')}
          </Button>
        )}
        <div className="tt-head-actions">
          {onTable && (
            <Button
              variant="subtle"
              leftSection={<Frame size={18} aria-hidden="true" />}
              onClick={() => {
                const [x, y] = board.center()
                live_({
                  kind: 'live',
                  patch: { view_x: Number(x.toFixed(2)), view_y: Number(y.toFixed(2)) },
                })
              }}
            >
              {phone ? t('tabletop.frame.hereShort') : t('tabletop.frame.here')}
            </Button>
          )}
          {phone ? (
            <Menu position="bottom-end" withinPortal>
              <Menu.Target>
                <Button
                  variant="default"
                  leftSection={<LayoutPanelLeft size={18} aria-hidden="true" />}
                >
                  {t('tabletop.panels')}
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {panels.map(({ key, icon: Icon }) => (
                  <Menu.Item
                    key={key}
                    leftSection={<Icon size={18} aria-hidden="true" />}
                    onClick={() => setPanel(key)}
                  >
                    {t(`tabletop.panel.${key}`)}
                  </Menu.Item>
                ))}
                <Menu.Divider />
                <Menu.Item
                  component="a"
                  href={`#/campaign/${campaignId}/tabletop-table`}
                  target="_blank"
                  rel="noopener"
                  leftSection={<Monitor size={18} aria-hidden="true" />}
                >
                  {t('tabletop.openTable')}
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          ) : (
            <a
              className="tt-open-link"
              href={`#/campaign/${campaignId}/tabletop-table`}
              target="_blank"
              rel="noopener"
            >
              {t('tabletop.openTable')}
              <ExternalLink size={16} aria-hidden="true" />
              <span className="visually-hidden">{t('tabletop.newWindow')}</span>
            </a>
          )}
        </div>
      </header>
      {stale && (
        <p className="tt-stale" role="status">
          {t('tabletop.stale')}
        </p>
      )}
      {!frame && <p className="tt-hint-line">{t('tabletop.uncalibrated')}</p>}
      <div className="tt-body">
        {!phone && !compact && <ToolKit tool={tool} onChange={setTool} variant="rail" />}
        <div className="tt-stage">
          {(tool !== 'select' || movingItem) && (
            <OptionStrip label={t('tabletop.strip', { tool: t(`tabletop.tool.${tool}`) })}>
              {strip}
            </OptionStrip>
          )}
          <div className="tt-board-frame">
            <div
              className={`tt-viewport tool-${tool} ${moving ? 'is-moving' : ''}`}
              {...board.bind}
              tabIndex={0}
              role="application"
              aria-label={t('tabletop.board', { name: scene.name })}
              aria-describedby="tt-board-help"
              onKeyDown={onBoardKeyDown}
              onFocus={(event) => {
                if (event.target === event.currentTarget) setCursor((c) => c ?? cursorStart())
              }}
            >
              <div
                className="tt-world-wrap"
                style={
                  {
                    transform: `translate(${board.view.x}px, ${board.view.y}px) scale(${board.view.z})`,
                    '--tt-z': board.view.z,
                  } as CSSProperties
                }
              >
                <Board
                  scene={scene}
                  items={items}
                  mode="dm"
                  combatants={byId}
                  selectedId={selectedId}
                  drag={drag}
                  underlay={
                    areaPlacement && <AreaDrawing placement={areaPlacement} scene={scene} preview />
                  }
                  overlay={overlay}
                  onItemPointerDown={onItemPointerDown}
                  onItemKeyDown={onItemKeyDown}
                  onItemActivate={activate}
                  showPassages={
                    tool === 'fog' || selected?.kind === 'event' || selected?.kind === 'door'
                  }
                  onItemFocus={(item) =>
                    item.kind === 'door' || item.kind === 'area'
                      ? board.reveal(item.x - 0.5, item.y - 0.5)
                      : board.reveal(item.x, item.y, item.w, item.h)
                  }
                />
              </div>
            </div>
            {tool === 'area' && !areaPlacement && (
              <p className="tt-placebar is-hint">
                {t(
                  area.shape === 'emanation' ? 'tabletop.area.hintEmanation' : 'tabletop.area.hint',
                )}
              </p>
            )}
            {tool === 'area' && areaPlacement && areaAt && (
              <div
                className="tt-placebar"
                role="group"
                aria-label={t('tabletop.area.placing', { shape: t(`tabletop.area.${area.shape}`) })}
              >
                <CaughtList items={caught} compact />
                {(area.shape === 'cone' || area.shape === 'line' || area.shape === 'cube') && (
                  <span className="tt-angle" role="group" aria-label={t('tabletop.area.angle')}>
                    <button
                      type="button"
                      className="tt-icon-button"
                      aria-label={t('tabletop.area.turnLeft')}
                      onClick={() => setAreaAt({ ...areaAt, angle: (areaAt.angle + 345) % 360 })}
                    >
                      <RotateCcw size={18} aria-hidden="true" />
                    </button>
                    <span className="tt-angle-value">
                      {t('tabletop.area.degrees', { value: areaAt.angle })}
                    </span>
                    <button
                      type="button"
                      className="tt-icon-button"
                      aria-label={t('tabletop.area.turnRight')}
                      onClick={() => setAreaAt({ ...areaAt, angle: (areaAt.angle + 15) % 360 })}
                    >
                      <RotateCw size={18} aria-hidden="true" />
                    </button>
                  </span>
                )}
                <span className="tt-placebar-actions">
                  <button type="button" className="tt-text-action" onClick={() => setAreaAt(null)}>
                    {t('tabletop.area.clear')}
                  </button>
                  <Button
                    size="compact-md"
                    onClick={() => {
                      put(
                        [
                          {
                            kind: 'area',
                            x: Number(areaPlacement.x.toFixed(3)),
                            y: Number(areaPlacement.y.toFixed(3)),
                            w: areaPlacement.w ?? 1,
                            h: areaPlacement.h ?? 1,
                            label: area.label || t(`tabletop.area.${area.shape}`),
                            data: { ...areaPlacement.data, angle: areaPlacement.data.angle },
                          },
                        ],
                        t('tabletop.announce.area'),
                      )
                      setAreaAt(null)
                    }}
                  >
                    {t('tabletop.area.keep')}
                  </Button>
                </span>
              </div>
            )}
            {failure && (
              <div className="tt-banner is-failure" role="alert">
                <p>{failure.message}</p>
                {failure.retry && (
                  <button
                    type="button"
                    className="tt-text-action"
                    onClick={() => {
                      failure.retry?.()
                      focusBoard()
                    }}
                  >
                    {t('tabletop.failure.retry')}
                  </button>
                )}
                <button
                  type="button"
                  className="tt-icon-button"
                  onClick={() => {
                    setFailure(null)
                    focusBoard()
                  }}
                  aria-label={t('tabletop.failure.dismiss')}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            )}
            {!failure && notice && (
              <div className="tt-banner" role="status">
                <p>{notice.message}</p>
                {notice.undo && (
                  <button
                    type="button"
                    className="tt-text-action"
                    onClick={() => {
                      notice.undo?.()
                      focusBoard()
                    }}
                  >
                    {t('tabletop.undo')}
                  </button>
                )}
                <button
                  type="button"
                  className="tt-icon-button"
                  onClick={() => {
                    setNotice(null)
                    focusBoard()
                  }}
                  aria-label={t('tabletop.failure.dismiss')}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
            )}
            <div className="tt-zoom" role="group" aria-label={t('tabletop.zoom.label')}>
              <button
                type="button"
                className="tt-icon-button"
                onClick={() => board.zoomAt(1.25)}
                aria-label={t('tabletop.zoom.in')}
              >
                <Plus size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="tt-icon-button"
                onClick={() => board.zoomAt(0.8)}
                aria-label={t('tabletop.zoom.out')}
              >
                <Minus size={18} aria-hidden="true" />
              </button>
              <button
                type="button"
                className="tt-icon-button"
                onClick={board.fit}
                aria-label={t('tabletop.zoom.fit')}
              >
                <Maximize size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
          <p id="tt-board-help" className="visually-hidden">
            {t('tabletop.boardHelp')}
          </p>
          {(phone || compact) && (
            <ToolKit tool={tool} onChange={setTool} variant={phone ? 'tray' : 'row'} />
          )}
        </div>
        {!phone && (
          <aside className="tt-dock" aria-label={t('tabletop.dock')}>
            <div className="tt-tabs" role="group" aria-label={t('tabletop.panels')}>
              {panels.map(({ key, icon: Icon }) => (
                <button
                  key={key}
                  type="button"
                  aria-expanded={!selected && panel === key}
                  aria-controls="tt-sheet"
                  className={`tt-tab ${!selected && panel === key ? 'is-active' : ''}`}
                  onClick={() => {
                    setSelectedId(null)
                    setPanel(panel === key && !selected ? null : key)
                  }}
                >
                  <Icon size={18} aria-hidden="true" />
                  <span>{t(`tabletop.panel.${key}`)}</span>
                </button>
              ))}
            </div>
            {side && (
              <div
                id="tt-sheet"
                className="tt-sheet"
                role={inspector ? undefined : 'region'}
                aria-label={!inspector && panel ? t(`tabletop.panel.${panel}`) : undefined}
              >
                {!inspector && panel && (
                  <h2 className="tt-sheet-title">{t(`tabletop.panel.${panel}`)}</h2>
                )}
                {side}
              </div>
            )}
          </aside>
        )}
      </div>
      {phone && (
        <Drawer
          closeButtonProps={{ 'aria-label': t('tabletop.close'), size: 44 }}
          opened={Boolean(side)}
          onClose={() => {
            setSelectedId(null)
            setPanel(null)
          }}
          position="bottom"
          size="75dvh"
          title={
            inspector ? t('tabletop.inspector.title') : panel ? t(`tabletop.panel.${panel}`) : ''
          }
          classNames={{ content: 'tt-drawer' }}
        >
          {side}
        </Drawer>
      )}
      <div className="visually-hidden" aria-live="polite" role="status">
        {announce}
      </div>
    </div>
  )
}
