import {
  memo,
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { EyeOff, Lock, Skull } from 'lucide-react'
import { useAuth } from '@/features/auth'
import { creatureArtUrl } from '@/features/bestiary'
import { Token, type Combatant } from '@/features/combat'
import { useCampaign } from '@/features/campaigns'
import { useCampaignPortraits } from '@/features/inventory'
import { mediaQuery } from '../api'
import { areaCells, areaPath, circlePath, stillHidden, stillRevealed } from '../domain/geometry'
import {
  isPassage,
  roomNumbers,
  type Fog,
  type FogOp,
  type Item,
  type ItemOf,
  type Scene,
} from '../domain/model'
import { InkFilter, PropDrawing } from './prop-art'
import { decodePictures, drawnSprite, picturesReady, propSprite, variantOf } from './sprites'
import { effectArt, type EffectArt } from './map-art'
import { effectUrl } from './materials'
import {
  damageColors,
  groundColors,
  hasDrawing,
  paintedScene,
  tokenColorValues,
  U,
} from './palette'

export type BoardMode = 'dm' | 'table' | 'player'

export interface TokenLink {
  combatant: Combatant
}

export interface DragOverride {
  id: string
  x: number
  y: number
}

interface BoardProps {
  scene: Scene
  items: readonly Item[]
  mode: BoardMode
  /** Combatants by id, from the combat projection (active turn, health, art). */
  combatants?: ReadonlyMap<string, Combatant>
  selectedId?: string | null
  drag?: DragOverride | null
  /** Overlays above everything (measure, ping, previews, the table frame), in squares. */
  overlay?: ReactNode
  /** Overlays under tokens (area previews). */
  underlay?: ReactNode
  onItemPointerDown?: (item: Item, event: PointerEvent) => void
  onItemKeyDown?: (item: Item, event: KeyboardEvent) => void
  onItemActivate?: (item: Item) => void
  /** Keyboard focus reached an item: the editor brings it into view. */
  onItemFocus?: (item: Item) => void
  /** Passage keys (P1, P2…) while the DM picks what fog, doors or events reveal. */
  showPassages?: boolean
}

/**
 * The map world: one CSS pixel per world pixel (U per square); the parent scales it. Items are named
 * buttons but not Tab stops: the keyboard reaches them through the board's square cursor.
 */
export const Board = memo(function Board(props: BoardProps) {
  const { scene, mode } = props
  // RYT-074: character tokens outside combat show the character's portrait.
  const campaign = useCampaign()
  const portraits = useCampaignPortraits(campaign.id)
  const painted = paintedScene(scene)
  // On an uploaded map the picture already shows its doors: Rytta only marks them for the DM.
  const marker = scene.map_kind === 'upload'
  const width = scene.cols * U
  const height = scene.rows * U
  const shown =
    mode === 'dm'
      ? props.items
      : props.items.filter(
          (i) =>
            !i.hidden &&
            i.kind !== 'note' &&
            i.kind !== 'event' &&
            !(i.kind === 'door' && i.data.secret),
        )
  const items = shown.map((item) =>
    props.drag && item.id === props.drag.id ? { ...item, x: props.drag.x, y: props.drag.y } : item,
  )
  const below = items.filter((i) => i.kind === 'area' || i.kind === 'prop' || i.kind === 'door')
  const art = usePropArt(painted, props.items)
  // Pictures of props without a line drawing are printed in ink on ink maps (RYT-068).
  const ink = `ink${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const tokens = items.filter((i): i is ItemOf<'token'> => i.kind === 'token')
  const pins = mode === 'dm' ? items.filter((i) => i.kind === 'note' || i.kind === 'event') : []
  return (
    <div
      className="tt-world"
      style={{ width, height }}
      data-mode={mode}
      onFocus={
        props.onItemFocus
          ? (event) => {
              const id = (event.target as Element).closest('[data-item]')?.getAttribute('data-item')
              const item = id ? props.items.find((i) => i.id === id) : undefined
              if (item) props.onItemFocus!(item)
            }
          : undefined
      }
    >
      <MapLayer scene={scene} mode={mode} />
      <svg
        className="tt-layer"
        viewBox={`0 0 ${scene.cols} ${scene.rows}`}
        width={width}
        height={height}
        aria-hidden={mode !== 'dm' ? true : undefined}
      >
        {!painted && (
          <defs>
            <InkFilter id={ink} />
          </defs>
        )}
        {scene.grid_visible && <GridLines scene={scene} />}
        {props.underlay}
        {below.map((item) =>
          item.kind === 'area' ? (
            <AreaShape
              key={item.id}
              item={item}
              scene={scene}
              mode={mode}
              selected={props.selectedId === item.id}
              onPointerDown={props.onItemPointerDown}
              onKeyDown={props.onItemKeyDown}
              onActivate={props.onItemActivate}
            />
          ) : item.kind === 'prop' ? (
            <PropShape
              key={item.id}
              item={item}
              mode={mode}
              painted={painted}
              ink={painted ? undefined : ink}
              shown={art}
              selected={props.selectedId === item.id}
              onPointerDown={props.onItemPointerDown}
              onKeyDown={props.onItemKeyDown}
              onActivate={props.onItemActivate}
            />
          ) : item.kind === 'door' ? (
            <DoorShape
              key={item.id}
              item={item}
              mode={mode}
              painted={painted}
              marker={marker}
              selected={props.selectedId === item.id}
              onPointerDown={props.onItemPointerDown}
              onKeyDown={props.onItemKeyDown}
              onActivate={props.onItemActivate}
            />
          ) : null,
        )}
      </svg>
      {tokens.map((item) => (
        <MapToken
          key={item.id}
          item={item}
          mode={mode}
          combatant={item.combatant_id ? props.combatants?.get(item.combatant_id) : undefined}
          portrait={item.character_id ? (portraits.get(item.character_id) ?? null) : null}
          selected={props.selectedId === item.id}
          dragging={props.drag?.id === item.id}
          onPointerDown={props.onItemPointerDown}
          onKeyDown={props.onItemKeyDown}
          onActivate={props.onItemActivate}
        />
      ))}
      {scene.fog_enabled && <FogLayer scene={scene} fog={scene.fog} opaque={mode !== 'dm'} />}
      <svg
        className="tt-layer tt-top"
        viewBox={`0 0 ${scene.cols} ${scene.rows}`}
        width={width}
        height={height}
        aria-hidden={mode !== 'dm' ? true : undefined}
      >
        {/* Room keys sit above the fog so the DM reads them on any map. */}
        {mode === 'dm' && (
          <RoomNumbers scene={scene} items={props.items} passages={props.showPassages} />
        )}
        {pins.map((item) => (
          <PinShape
            key={item.id}
            item={item as ItemOf<'note'> | ItemOf<'event'>}
            selected={props.selectedId === item.id}
            onPointerDown={props.onItemPointerDown}
            onKeyDown={props.onItemKeyDown}
            onActivate={props.onItemActivate}
          />
        ))}
        {props.overlay}
      </svg>
    </div>
  )
})

function MapLayer({ scene, mode }: { scene: Scene; mode: BoardMode }) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const url = useQuery(mediaQuery(state.user?.id ?? 'anonymous', scene.map_path))
  const [broken, setBroken] = useState<string | null>(null)
  const ground = groundColors[scene.ground]
  if (scene.map_kind === 'blank' || !scene.map_path)
    return (
      <div className="tt-ground" style={{ background: ground.fill }} data-ground={scene.ground} />
    )
  const scale = U / scene.cell_px
  return (
    <div className="tt-ground" style={{ background: '#1b1712' }}>
      {(url.isError || (url.data && broken === url.data)) && (
        <p
          className="tt-map-failed"
          role={mode === 'dm' ? 'status' : undefined}
          style={{ fontSize: Math.max(20, (scene.cols * U) / 44) }}
        >
          {t('tabletop.map.failed')}
        </p>
      )}
      {url.data && broken !== url.data && (
        <img
          className="tt-map"
          src={url.data}
          alt=""
          draggable={false}
          onError={() => setBroken(url.data ?? null)}
          style={{
            left: -scene.offset_x * scale,
            top: -scene.offset_y * scale,
            width: (scene.map_width ?? scene.cols * scene.cell_px) * scale,
            height: (scene.map_height ?? scene.rows * scene.cell_px) * scale,
          }}
        />
      )}
    </div>
  )
}

function GridLines({ scene }: { scene: Scene }) {
  const lines: string[] = []
  for (let x = 1; x < scene.cols; x++) lines.push(`M ${x} 0 V ${scene.rows}`)
  for (let y = 1; y < scene.rows; y++) lines.push(`M 0 ${y} H ${scene.cols}`)
  const color =
    scene.map_kind === 'blank' ? groundColors[scene.ground].grid : 'rgba(20, 14, 8, 0.32)'
  return (
    <path
      d={lines.join(' ')}
      stroke={color}
      strokeWidth={1.25}
      vectorEffect="non-scaling-stroke"
      fill="none"
      className="tt-grid"
    />
  )
}

/**
 * Room keys: a plate in a corner of the room that holds no note, event or token (then props),
 * trying the corners in reading order and the centre last.
 */
function RoomNumbers({
  scene,
  items,
  passages,
}: {
  scene: Scene
  items: readonly Item[]
  passages?: boolean
}) {
  const { t } = useTranslation()
  const numbers = roomNumbers(scene.rooms ?? [])
  const rooms = (scene.rooms ?? []).filter((room) => passages || !isPassage(room.id))
  if (!rooms.length) return null
  const weight = new Map<string, number>()
  for (const item of items) {
    const cost =
      item.kind === 'note' || item.kind === 'event' || item.kind === 'token'
        ? 4
        : item.kind === 'prop'
          ? 1
          : 0
    if (!cost) continue
    for (let i = Math.floor(item.x); i < Math.ceil(item.x + item.w); i++)
      for (let j = Math.floor(item.y); j < Math.ceil(item.y + item.h); j++)
        weight.set(`${i}:${j}`, Math.max(weight.get(`${i}:${j}`) ?? 0, cost))
  }
  const covered = (cx: number, cy: number, plate: number) => {
    let sum = 0
    const j = Math.floor(cy)
    for (let i = Math.floor(cx - plate / 2); i <= Math.floor(cx + plate / 2 - 0.001); i++)
      sum += weight.get(`${i}:${j}`) ?? 0
    return sum
  }
  return (
    <g className="tt-room-numbers" aria-hidden="true">
      {rooms.map((room) => {
        const [x, y, w, h] = [...room.rects].sort((a, b) => b[2] * b[3] - a[2] * a[3])[0] ?? [
          0, 0, 0, 0,
        ]
        const number = numbers.get(room.id)!
        const label = number.passage
          ? t('tabletop.room.passageKey', { n: number.n })
          : String(number.n)
        const plate = 0.42 + label.length * 0.3
        const left = x + plate / 2 + 0.08
        const right = x + w - plate / 2 - 0.08
        const candidates: [number, number][] =
          w >= 2 && h >= 2
            ? [
                [left, y + 0.42],
                [right, y + 0.42],
                [left, y + h - 0.42],
                [right, y + h - 0.42],
                [x + w / 2, y + h / 2],
              ]
            : [
                [x + w / 2, y + h / 2],
                [x + Math.min(w, h) / 2, y + Math.min(w, h) / 2],
                [x + w - Math.min(w, h) / 2, y + h - Math.min(w, h) / 2],
              ]
        let [px, py] = candidates[0]!
        let best = Infinity
        for (const [cx, cy] of candidates) {
          const cost = covered(cx, cy, plate)
          if (cost < best) {
            best = cost
            ;[px, py] = [cx, cy]
          }
          if (cost === 0) break
        }
        return (
          <g
            key={room.id}
            className={number.passage ? 'is-passage' : undefined}
            transform={`translate(${px} ${py})`}
          >
            <rect x={-plate / 2} y={-0.34} width={plate} height={0.68} rx={0.16} />
            <text y={0.21} textAnchor="middle">
              {label}
            </text>
          </g>
        )
      })}
    </g>
  )
}

function AreaShape({
  item,
  scene,
  mode,
  selected,
  onPointerDown,
  onKeyDown,
  onActivate,
}: {
  item: ItemOf<'area'>
  scene: Scene
  mode: BoardMode
  selected: boolean
  onPointerDown?: BoardProps['onItemPointerDown']
  onKeyDown?: BoardProps['onItemKeyDown']
  onActivate?: BoardProps['onItemActivate']
}) {
  const { t } = useTranslation()
  const placement = { data: item.data, x: item.x, y: item.y, w: item.w, h: item.h }
  const color = damageColors[item.data.damage ?? 'force'] ?? damageColors.force
  const shape = t(`tabletop.area.${item.data.shape}`)
  const label = [
    t('tabletop.area.itemLabel', { name: item.label || shape, shape }),
    item.hidden ? t('tabletop.token.hidden') : '',
  ]
    .filter(Boolean)
    .join(', ')
  return (
    <g data-item={item.id}>
      <AreaDrawing
        placement={placement}
        scene={scene}
        selected={selected}
        dim={mode === 'dm' && item.hidden}
      />
      {/* The DM grabs a lasting area by its origin seal, so the ground inside still pans. */}
      {mode === 'dm' && (
        <g
          className="tt-area-handle"
          transform={`translate(${item.x} ${item.y})`}
          role="button"
          tabIndex={-1}
          aria-label={label}
          onPointerDown={onPointerDown ? (e) => onPointerDown(item, e) : undefined}
          onKeyDown={onKeyDown ? (e) => onKeyDown(item, e) : undefined}
          onClick={onActivate ? (e) => e.detail === 0 && onActivate(item) : undefined}
        >
          <circle className="tt-hit" r={0.45} fill="transparent" />
          <path
            d="M 0 -0.24 L 0.24 0 L 0 0.24 L -0.24 0 Z"
            fill={color}
            stroke="#140f0b"
            strokeWidth={0.05}
          />
        </g>
      )}
    </g>
  )
}

export function AreaDrawing({
  placement,
  scene,
  selected = false,
  dim = false,
  preview = false,
}: {
  placement: Parameters<typeof areaPath>[0]
  scene: Pick<Scene, 'cols' | 'rows'> &
    Partial<Pick<Scene, 'recipe' | 'look' | 'map_kind' | 'ground'>>
  selected?: boolean
  dim?: boolean
  preview?: boolean
}) {
  const damage = placement.data.damage ?? 'force'
  const color = damageColors[damage] ?? damageColors.force
  const cells = areaCells(placement, scene.cols, scene.rows)
  // RYT-068: on painted maps the damage's painted effect (a 4 × 4 square tile), translucent so
  // walls, doors and props stay readable under it; ink maps hatch the area in the damage colour.
  const fill = `fx${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const painted =
    scene.map_kind === undefined ||
    paintedScene(scene as Pick<Scene, 'recipe' | 'look' | 'map_kind' | 'ground'>)
  const effect = painted && damage in effectArt ? effectUrl(damage as EffectArt) : null
  const d = areaPath(placement)
  return (
    <g className={`tt-area ${preview ? 'is-preview' : ''}`} opacity={dim ? 0.45 : 1}>
      <defs>
        {effect ? (
          <pattern id={fill} patternUnits="userSpaceOnUse" width={4} height={4}>
            <image href={effect} width={4} height={4} preserveAspectRatio="none" />
          </pattern>
        ) : (
          <pattern
            id={fill}
            patternUnits="userSpaceOnUse"
            width={0.35}
            height={0.35}
            patternTransform="rotate(45)"
          >
            <rect width={0.08} height={0.35} fill={color} fillOpacity={0.6} />
          </pattern>
        )}
      </defs>
      <path d={d} fill={color} fillOpacity={effect ? 0.12 : 0.16} />
      <path
        className="tt-area-effect"
        d={d}
        fill={`url(#${fill})`}
        fillOpacity={effect ? (preview ? 0.4 : 0.5) : 1}
      />
      {/* A dark halo under the outline and the counted squares, so both read over any floor. */}
      <path d={d} fill="none" stroke="#0a0806" strokeOpacity={0.7} strokeWidth={0.15} />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={0.07}
        strokeDasharray={preview ? '0.25 0.15' : undefined}
      />
      {cells.map(([x, y]) => {
        const tick = `M ${x + 0.1} ${y + 0.28} V ${y + 0.1} H ${x + 0.28} M ${x + 0.72} ${y + 0.9} H ${x + 0.9} V ${y + 0.72}`
        return (
          <g key={`${x}:${y}`} fill="none">
            <path d={tick} stroke="#0a0806" strokeOpacity={0.75} strokeWidth={0.11} />
            <path d={tick} stroke={color} strokeWidth={0.05} />
          </g>
        )
      })}
      {selected && (
        <path d={d} className="tt-sel" fill="none" stroke="var(--app-focus)" strokeWidth={0.08} />
      )}
    </g>
  )
}

/** The turned footprint's own proportions: the drawing keeps the prop's size before the turn. */
const drawnSize = (item: ItemOf<'prop'>): [number, number] =>
  item.rotation % 180 !== 0 ? [item.h, item.w] : [item.w, item.h]

/**
 * RYT-066: whether a painted map's prop pictures may show. They are decoded first, so on the table's
 * first load the props appear together (up to 1.5 s) instead of one by one; afterwards new pictures
 * simply load.
 */
function usePropArt(painted: boolean, items: readonly Item[]) {
  const urls = useMemo(() => {
    const set = new Set<string>()
    for (const item of items) {
      if (item.kind !== 'prop' || (!painted && hasDrawing(item.data.prop))) continue
      const [w, h] = drawnSize(item)
      const sprite = propSprite(item.data.prop, w, h, variantOf(item.id))
      if (sprite?.picture) set.add(sprite.url)
    }
    return [...set]
  }, [painted, items])
  const [shown, setShown] = useState(() => picturesReady(urls))
  useEffect(() => {
    if (shown) return
    let live = true
    void decodePictures(urls).then(() => {
      if (live) setShown(true)
    })
    return () => {
      live = false
    }
  }, [shown, urls])
  return shown
}

function PropShape({
  item,
  mode,
  painted,
  ink,
  shown,
  selected,
  onPointerDown,
  onKeyDown,
  onActivate,
}: {
  item: ItemOf<'prop'>
  mode: BoardMode
  painted: boolean
  /** The ink filter's id on ink maps, for props that only have a picture. */
  ink?: string
  shown: boolean
  selected: boolean
  onPointerDown?: BoardProps['onItemPointerDown']
  onKeyDown?: BoardProps['onItemKeyDown']
  onActivate?: BoardProps['onItemActivate']
}) {
  const { t } = useTranslation()
  const interactive = mode === 'dm'
  const label = [
    t('tabletop.prop.itemLabel', {
      name: t(`tabletop.prop.${item.data.prop}` as never, { defaultValue: item.data.prop }),
    }),
    item.hidden ? t('tabletop.token.hidden') : '',
    item.locked ? t('tabletop.token.locked') : '',
  ]
    .filter(Boolean)
    .join(', ')
  const cx = item.w / 2
  const cy = item.h / 2
  // The footprint (w × h) is already turned; the drawing keeps the prop's own proportions.
  const [dw, dh] = drawnSize(item)
  // A picture that fails to load falls back to the sprite Rytta draws (for that picture only).
  const [failed, setFailed] = useState<string | null>(null)
  const variant = variantOf(item.id)
  const printed = !painted && !hasDrawing(item.data.prop)
  const chosen = painted || printed ? propSprite(item.data.prop, dw, dh, variant) : null
  const sprite =
    chosen?.picture && chosen.url === failed ? drawnSprite(item.data.prop, dw, dh, variant) : chosen
  // Mirrored or turned a quarter inside its box, about the box's middle (pictures only).
  const inner = [
    sprite?.turn ? `rotate(${sprite.turn} ${dw / 2} ${dh / 2})` : '',
    sprite?.flip ? `translate(${dw} 0) scale(-1 1)` : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <g
      className={`tt-prop ${mode === 'dm' && item.hidden ? 'is-hidden' : ''}`}
      transform={`translate(${item.x} ${item.y})`}
      data-item={item.id}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? -1 : undefined}
      aria-label={interactive ? label : undefined}
      onPointerDown={onPointerDown ? (e) => onPointerDown(item, e) : undefined}
      onKeyDown={onKeyDown ? (e) => onKeyDown(item, e) : undefined}
      onClick={onActivate ? (e) => e.detail === 0 && onActivate(item) : undefined}
    >
      {/* The hit rect below is the target; a light's halo reaches past it without catching taps. */}
      <g
        transform={
          item.rotation
            ? `rotate(${item.rotation} ${cx} ${cy}) translate(${cx - dw / 2} ${cy - dh / 2})`
            : undefined
        }
        opacity={mode === 'dm' && item.hidden ? 0.45 : 1}
      >
        {sprite ? (
          <image
            className="tt-prop-art"
            // Drawn sprites wait with the pictures, so a mixed map's props all appear at once.
            data-shown={shown}
            href={sprite.url}
            x={-sprite.pad}
            y={-sprite.pad}
            width={dw + sprite.pad * 2}
            height={dh + sprite.pad * 2}
            transform={inner || undefined}
            filter={printed && ink ? `url(#${ink})` : undefined}
            pointerEvents="none"
            onError={sprite.picture ? () => setFailed(sprite.url) : undefined}
          />
        ) : (
          <PropDrawing prop={item.data.prop} w={dw} h={dh} />
        )}
      </g>
      {mode === 'dm' && item.hidden && (
        <rect
          x={0.04}
          y={0.04}
          width={item.w - 0.08}
          height={item.h - 0.08}
          fill="none"
          stroke="var(--app-focus)"
          strokeWidth={0.03}
          strokeDasharray="0.1 0.08"
        />
      )}
      {selected && (
        <rect
          x={-0.04}
          y={-0.04}
          width={item.w + 0.08}
          height={item.h + 0.08}
          className="tt-sel"
          fill="none"
          stroke="var(--app-focus)"
          strokeWidth={0.06}
          rx={0.06}
        />
      )}
      <rect className="tt-hit" x={0} y={0} width={item.w} height={item.h} fill="transparent" />
    </g>
  )
}

function DoorShape({
  item,
  mode,
  painted,
  marker,
  selected,
  onPointerDown,
  onKeyDown,
  onActivate,
}: {
  item: ItemOf<'door'>
  mode: BoardMode
  painted: boolean
  marker: boolean
  selected: boolean
  onPointerDown?: BoardProps['onItemPointerDown']
  onKeyDown?: BoardProps['onItemKeyDown']
  onActivate?: BoardProps['onItemActivate']
}) {
  const { t } = useTranslation()
  const length = item.w
  const state = item.data.state
  const secret = mode === 'dm' && item.data.secret
  const interactive = mode === 'dm'
  const label = t('tabletop.door.label', {
    state: t(`tabletop.door.${state}`),
    secret: secret ? t('tabletop.door.secretNote') : '',
  })
  // Marked doors (uploaded maps) are the DM's handles only; the table sees the picture's door.
  if (marker && mode !== 'dm') return null
  const thick = painted && !marker
  return (
    <g
      className={`tt-door is-${state} ${secret ? 'is-secret' : ''}`}
      transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}
      data-item={item.id}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? -1 : undefined}
      aria-label={interactive ? label : undefined}
      onPointerDown={onPointerDown ? (e) => onPointerDown(item, e) : undefined}
      onKeyDown={onKeyDown ? (e) => onKeyDown(item, e) : undefined}
      onClick={onActivate ? (e) => e.detail === 0 && onActivate(item) : undefined}
    >
      <rect
        className="tt-hit"
        x={-length / 2}
        y={-0.35}
        width={length}
        height={0.7}
        fill="transparent"
      />
      {thick && !secret && (
        // Stone jambs as deep as the wall frame the doorway on painted maps.
        <g className="tt-door-jambs">
          {[-1, 1].map((side) => (
            <rect
              key={side}
              x={side * (length / 2) - 0.1}
              y={-0.31}
              width={0.2}
              height={0.62}
              rx={0.02}
              fill="#a99f90"
              stroke="#1d1915"
              strokeWidth={0.035}
            />
          ))}
        </g>
      )}
      {marker && (
        // The DM's handle on an uploaded door: a dashed outline over the picture's own door.
        <rect
          className="tt-door-marker"
          x={-length / 2}
          y={-0.16}
          width={length}
          height={0.32}
          rx={0.06}
          fill="rgba(237, 161, 69, 0.12)"
          stroke="var(--app-focus)"
          strokeWidth={0.04}
          strokeDasharray="0.12 0.08"
        />
      )}
      {state === 'open' ? (
        <g className="tt-door-leaf is-open">
          <rect
            x={-length / 2}
            y={-0.07}
            width={0.12}
            height={0.14}
            fill="#7a4e2a"
            stroke="#2b1d10"
            strokeWidth={0.03}
          />
          <rect
            x={-length / 2}
            y={-length * 0.86}
            width={0.12}
            height={length * 0.86}
            fill="#b07a45"
            stroke="#2b1d10"
            strokeWidth={0.03}
          />
        </g>
      ) : (
        <g className="tt-door-leaf">
          {!marker && (
            <rect
              x={-length / 2 + 0.04}
              y={thick ? -0.19 : -0.11}
              width={length - 0.08}
              height={thick ? 0.38 : 0.22}
              rx={0.03}
              fill={secret ? 'none' : '#a06c3c'}
              stroke="#2b1d10"
              strokeWidth={0.04}
              strokeDasharray={secret ? '0.1 0.07' : undefined}
            />
          )}
          {!secret && !marker && (
            <path
              // Planks along the leaf; on painted maps two iron bands across it.
              d={
                thick
                  ? `M ${-length / 2 + 0.08} -0.06 H ${length / 2 - 0.08} M ${-length / 2 + 0.08} 0.06 H ${length / 2 - 0.08} M ${-length / 2 + 0.3} -0.19 V 0.19 M ${length / 2 - 0.3} -0.19 V 0.19`
                  : `M ${-length / 2 + 0.3} -0.11 V 0.11 M ${length / 2 - 0.3} -0.11 V 0.11`
              }
              stroke="#2b1d10"
              strokeWidth={thick ? 0.03 : 0.02}
            />
          )}
          {state === 'locked' && (
            <g transform="translate(0 0)">
              <rect
                x={-0.09}
                y={-0.06}
                width={0.18}
                height={0.14}
                rx={0.02}
                fill="#d9b24a"
                stroke="#2b1d10"
                strokeWidth={0.025}
              />
              <path
                d="M -0.05 -0.06 V -0.12 A 0.05 0.05 0 0 1 0.05 -0.12 V -0.06"
                fill="none"
                stroke="#2b1d10"
                strokeWidth={0.025}
              />
            </g>
          )}
        </g>
      )}
      {secret && (
        <text
          x={0}
          y={0.07}
          textAnchor="middle"
          fontSize={0.22}
          fontWeight={700}
          fill="var(--app-focus)"
          stroke="#140f0b"
          strokeWidth={0.05}
          paintOrder="stroke"
          className="tt-door-mark"
        >
          S
        </text>
      )}
      {selected && (
        <rect
          x={-length / 2 - 0.06}
          y={-0.24}
          width={length + 0.12}
          height={0.48}
          rx={0.08}
          className="tt-sel"
          fill="none"
          stroke="var(--app-focus)"
          strokeWidth={0.06}
        />
      )}
    </g>
  )
}

function PinShape({
  item,
  selected,
  onPointerDown,
  onKeyDown,
  onActivate,
}: {
  item: ItemOf<'note'> | ItemOf<'event'>
  selected: boolean
  onPointerDown?: BoardProps['onItemPointerDown']
  onKeyDown?: BoardProps['onItemKeyDown']
  onActivate?: BoardProps['onItemActivate']
}) {
  const { t } = useTranslation()
  const cx = item.x + item.w / 2
  const cy = item.y + item.h / 2
  const fired = item.kind === 'event' && item.data.fired
  const label =
    item.kind === 'note'
      ? t('tabletop.pin.note', { name: item.label ?? t('tabletop.note.untitled') })
      : t(fired ? 'tabletop.pin.eventFired' : 'tabletop.pin.event', {
          name: item.label ?? t('tabletop.event.untitled'),
        })
  return (
    <g
      className={`tt-pin is-${item.kind} ${fired ? 'is-fired' : ''}`}
      transform={`translate(${cx} ${cy})`}
      role="button"
      tabIndex={-1}
      aria-label={label}
      data-item={item.id}
      onPointerDown={onPointerDown ? (e) => onPointerDown(item, e) : undefined}
      onKeyDown={onKeyDown ? (e) => onKeyDown(item, e) : undefined}
      onClick={onActivate ? (e) => e.detail === 0 && onActivate(item) : undefined}
    >
      <circle r={0.42} className="tt-pin-disc" />
      {item.kind === 'note' ? (
        <path
          d="M -0.17 -0.22 H 0.08 L 0.18 -0.12 V 0.22 H -0.17 Z M 0.08 -0.22 V -0.12 H 0.18 M -0.1 -0.04 H 0.1 M -0.1 0.06 H 0.1"
          className="tt-pin-glyph"
        />
      ) : (
        <path
          d="M 0 -0.24 L 0.07 -0.07 L 0.24 -0.07 L 0.1 0.04 L 0.16 0.22 L 0 0.11 L -0.16 0.22 L -0.1 0.04 L -0.24 -0.07 L -0.07 -0.07 Z"
          className="tt-pin-glyph"
        />
      )}
      {fired && <path d="M -0.3 0.3 L 0.3 -0.3" className="tt-pin-strike" />}
      {selected && (
        <circle
          r={0.52}
          className="tt-sel"
          fill="none"
          stroke="var(--app-focus)"
          strokeWidth={0.06}
        />
      )}
    </g>
  )
}

function MapToken({
  item,
  mode,
  combatant,
  portrait,
  selected,
  dragging,
  onPointerDown,
  onKeyDown,
  onActivate,
}: {
  item: ItemOf<'token'>
  mode: BoardMode
  combatant?: Combatant
  portrait: string | null
  selected: boolean
  dragging: boolean
  onPointerDown?: BoardProps['onItemPointerDown']
  onKeyDown?: BoardProps['onItemKeyDown']
  onActivate?: BoardProps['onItemActivate']
}) {
  const { t } = useTranslation()
  const name = combatant?.name ?? item.label ?? t('tabletop.token.untitled')
  const size = Math.max(item.w, item.h)
  const px = size * U
  const side = combatant ? (combatant.kind === 'lair' ? 'lair' : combatant.side) : null
  const srd = combatant?.srd_id ?? item.data.srd_id
  const defeated = combatant?.defeated || combatant?.hp_band === 'down'
  const active = combatant?.is_active ?? false
  const style = {
    left: item.x * U,
    top: item.y * U,
    width: item.w * U,
    height: item.h * U,
    '--tt-token-color': tokenColorValues[item.data.color ?? 'amber'],
  } as React.CSSProperties
  const status = [
    active ? t('tabletop.token.active') : '',
    defeated ? t('tabletop.token.defeated') : '',
    combatant?.hp_band && combatant.hp_band !== 'unknown' && !defeated
      ? t(`combat.hp.${combatant.hp_band}`)
      : '',
    mode === 'dm' && item.hidden ? t('tabletop.token.hidden') : '',
  ]
    .filter(Boolean)
    .join(', ')
  const body = (
    <>
      {side ? (
        <Token
          name={name}
          side={side}
          imageKind={combatant!.kind === 'character' ? 'character' : 'creature'}
          path={combatant!.image_path}
          art={
            srd && !(mode !== 'dm' && combatant?.public_name) ? creatureArtUrl(srd, 'thumb') : null
          }
          size={Math.round(px * 0.9)}
          active={active}
          defeated={defeated}
          hidden={mode === 'dm' && (item.hidden || combatant?.hidden)}
        />
      ) : portrait && item.character_id ? (
        <Token
          name={name}
          side="party"
          imageKind="character"
          path={portrait}
          art={null}
          size={Math.round(px * 0.9)}
          active={false}
          defeated={false}
          hidden={mode === 'dm' && item.hidden}
        />
      ) : (
        <span className="tt-free-token" aria-hidden="true">
          {initials(name)}
        </span>
      )}
      {defeated && <Skull className="tt-token-mark" aria-hidden="true" />}
      {mode === 'dm' && item.hidden && <EyeOff className="tt-token-hidden" aria-hidden="true" />}
      {mode === 'dm' && item.locked && <Lock className="tt-token-lock" aria-hidden="true" />}
      <span className="tt-token-name">{name}</span>
    </>
  )
  const className = [
    'tt-token',
    active ? 'is-active' : '',
    defeated ? 'is-defeated' : '',
    selected ? 'is-selected' : '',
    dragging ? 'is-dragging' : '',
    mode === 'dm' && item.hidden ? 'is-hidden' : '',
  ].join(' ')
  if (mode !== 'dm')
    return (
      <div className={className} style={style} data-item={item.id}>
        {body}
      </div>
    )
  return (
    <button
      type="button"
      className={className}
      style={style}
      data-item={item.id}
      tabIndex={-1}
      aria-label={status ? `${name}, ${status}` : name}
      aria-pressed={selected}
      onPointerDown={onPointerDown ? (e) => onPointerDown(item, e) : undefined}
      onKeyDown={onKeyDown ? (e) => onKeyDown(item, e) : undefined}
      onClick={onActivate ? (e) => e.detail === 0 && onActivate(item) : undefined}
    >
      {body}
    </button>
  )
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')

/** How far past its squares a revealed room shows: its walls. */
const roomMargin = 0.4

function fogShape(op: FogOp, index: number) {
  const fill = op.mode === 'reveal' ? 'black' : 'white'
  switch (op.shape) {
    case 'rect':
      return <rect key={index} x={op.x} y={op.y} width={op.w} height={op.h} fill={fill} />
    case 'circle':
      return <path key={index} d={circlePath(op.x, op.y, op.r)} fill={fill} />
    case 'rects':
      // A room's squares, grown by 0.4 of a square so its walls show with it (RYT-068: walls are
      // painted just outside the floor; the neighbour beyond a wall stays hidden).
      return (
        <g
          key={index}
          fill={fill}
          stroke={fill}
          strokeWidth={roomMargin * 2}
          strokeLinejoin="miter"
        >
          {op.rects.map(([x, y, w, h], i) => (
            <rect key={i} x={x} y={y} width={w} height={h} />
          ))}
        </g>
      )
    case 'brush':
      return op.points.length === 1 ? (
        <path key={index} d={circlePath(op.points[0]![0], op.points[0]![1], op.r)} fill={fill} />
      ) : (
        <polyline
          key={index}
          points={op.points.map(([x, y]) => `${x},${y}`).join(' ')}
          fill="none"
          stroke={fill}
          strokeWidth={op.r * 2}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )
  }
}

export function FogLayer({
  scene,
  fog,
  opaque,
}: {
  scene: Pick<Scene, 'cols' | 'rows'>
  fog: Fog
  opaque: boolean
}) {
  const id = useId().replace(/:/g, '')
  return (
    <svg
      className={`tt-fog ${opaque ? 'is-opaque' : ''}`}
      viewBox={`0 0 ${scene.cols} ${scene.rows}`}
      width={scene.cols * U}
      height={scene.rows * U}
      aria-hidden="true"
    >
      <defs>
        {opaque && (
          <filter id={`${id}-soft`} x="-5%" y="-5%" width="110%" height="110%">
            <feGaussianBlur stdDeviation={0.15} />
          </filter>
        )}
        <mask
          id={`${id}-mask`}
          maskUnits="userSpaceOnUse"
          x={0}
          y={0}
          width={scene.cols}
          height={scene.rows}
        >
          <g filter={opaque ? `url(#${id}-soft)` : undefined}>
            <rect
              x={-1}
              y={-1}
              width={scene.cols + 2}
              height={scene.rows + 2}
              fill={fog.base === 'hidden' ? 'white' : 'black'}
            />
            {fog.ops.map(fogShape)}
            {/* A room hidden again grows into a revealed neighbour by the margin: those rooms are
                revealed once more with their margin (the shared wall shows), then the rooms
                still hidden are covered again on their own squares. */}
            {stillRevealed(fog.ops).map((op, i) => (
              <g
                key={`again-${i}`}
                fill="black"
                stroke="black"
                strokeWidth={roomMargin * 2}
                strokeLinejoin="miter"
              >
                {op.rects.map(([x, y, w, h], k) => (
                  <rect key={k} x={x} y={y} width={w} height={h} />
                ))}
              </g>
            ))}
            {stillRevealed(fog.ops).length > 0 &&
              stillHidden(fog.ops).map((op, i) => (
                <g key={`still-${i}`} fill="white">
                  {op.rects.map(([x, y, w, h], k) => (
                    <rect key={k} x={x} y={y} width={w} height={h} />
                  ))}
                </g>
              ))}
          </g>
        </mask>
        <pattern
          id={`${id}-hatch`}
          width={0.5}
          height={0.5}
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect width={0.5} height={0.5} fill="#0d0a07" fillOpacity={0.3} />
          <rect width={0.14} height={0.5} fill="#0d0a07" fillOpacity={0.55} />
        </pattern>
        <pattern id={`${id}-fibre`} width={1} height={1} patternUnits="userSpaceOnUse">
          <rect width={1} height={1} fill="#0d0a07" />
          <path
            d="M 0.1 0.2 L 0.4 0.25 M 0.6 0.7 L 0.9 0.62 M 0.2 0.8 L 0.32 0.95"
            stroke="#1d1712"
            strokeWidth={0.03}
          />
        </pattern>
      </defs>
      <rect
        width={scene.cols}
        height={scene.rows}
        fill={opaque ? `url(#${id}-fibre)` : `url(#${id}-hatch)`}
        mask={`url(#${id}-mask)`}
      />
    </svg>
  )
}
