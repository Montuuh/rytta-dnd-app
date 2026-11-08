import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Button, Loader, Modal, NumberInput, Switch, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Beer, Castle, Dices, Mountain, Skull, Trees, Undo2 } from 'lucide-react'
import { TileGroup } from '@/features/combat'
import { usePhone } from '@/shared/ui/use-viewport'
import { useMediaUpload, useTabletopAction } from '../api'
import {
  densities,
  generateMap,
  mapKinds,
  mapLooks,
  mapThemes,
  maximumSize,
  noteKeys,
  minimumSize,
  newSeed,
  recipeOf,
  sceneContent,
  sizePresets,
  type Density,
  type GeneratorOptions,
  type MapKind,
  type MapLook,
  type MapTheme,
} from '../domain/generator'
import { isPassage } from '../domain/model'
import { loadMapArt, sampleOf, type MapArt } from './materials'
import { canvasBlob, paintMap, squarePixels } from './painter'
import { hasDrawing } from './palette'
import { InkFilter, PropDrawing } from './prop-art'
import { propSprite } from './sprites'

const kindIcons = { dungeon: Castle, crypt: Skull, cave: Mountain, forest: Trees, tavern: Beer }

/**
 * RYT-056: the map generator. Options beside a live preview (stacked on phones, preview first);
 * one primary action, Create scene, paints the full map, uploads it and stores rooms, doors and props.
 */
export function GeneratorDialog({
  opened,
  onClose,
  campaignId,
  table,
  onCreated,
}: {
  opened: boolean
  onClose: () => void
  campaignId: string
  /** Whole squares the calibrated table holds, when there is a setup. */
  table: { cols: number; rows: number } | null
  onCreated: (sceneId: string) => void
}) {
  const { t, i18n } = useTranslation()
  const phone = usePhone()
  const [kind, setKind] = useState<MapKind>('dungeon')
  // RYT-068: each kind keeps the theme last chosen for it.
  const [themes, setThemes] = useState<Partial<Record<MapKind, MapTheme>>>({})
  const theme = themes[kind] ?? mapThemes[kind][0]
  // Painted by default: walls of dressed stone, lit torches and painted props (RYT-064).
  const [look, setLook] = useState<MapLook>('painted')
  const [density, setDensity] = useState<Density>('normal')
  const [secret, setSecret] = useState(true)
  const [wide, setWide] = useState(false)
  const [traps, setTraps] = useState(false)
  const [sizeKey, setSizeKey] = useState<string>(table ? 'table' : 'medium')
  const [custom, setCustom] = useState({ cols: 30, rows: 20 })
  const [seed, setSeed] = useState(() => newSeed())
  // The last few seeds, so a reroll never loses a map the DM liked.
  const [history, setHistory] = useState<number[]>([])
  const [seedEmpty, setSeedEmpty] = useState(false)
  const reroll = () => {
    setHistory((h) => [seed, ...h].slice(0, 8))
    setSeedEmpty(false)
    setSeed(newSeed())
  }
  const back = () => {
    const [previous, ...rest] = history
    if (previous === undefined) return
    setHistory(rest)
    setSeedEmpty(false)
    setSeed(previous)
  }
  const [name, setName] = useState('')
  const [error, setError] = useState(false)
  // A state ref: the Modal mounts its content after opening, so the paint waits for the canvas.
  const [preview, setPreview] = useState<HTMLCanvasElement | null>(null)
  const upload = useMediaUpload(campaignId)
  const action = useTabletopAction(campaignId)
  const size =
    sizeKey === 'table' && table
      ? table
      : sizeKey === 'custom'
        ? custom
        : (sizePresets.find((p) => p.key === sizeKey) ?? sizePresets[1])
  const { cols, rows } = size
  // Typing a seed or a size stays responsive: the map follows a moment behind.
  const options = useDeferredValue(
    useMemo(
      () =>
        ({
          kind,
          look,
          theme,
          cols,
          rows,
          seed,
          density,
          secret,
          wide,
          traps,
        }) satisfies GeneratorOptions,
      [kind, look, theme, cols, rows, seed, density, secret, wide, traps],
    ),
  )
  const map = useMemo(() => generateMap(options), [options])
  // The sticky preview sits right under the dialog's header, whatever the text size makes it, and
  // only while it leaves room: with large text it would hide the options (and the focus) under it,
  // so it scrolls with them instead (WCAG 2.4.11).
  useEffect(() => {
    const content = preview?.closest<HTMLElement>('.tt-generator-content')
    const head = content?.querySelector<HTMLElement>('.mantine-Modal-header')
    const block = preview?.closest<HTMLElement>('.tt-generator-preview')
    const foot = content?.querySelector<HTMLElement>('.tt-dialog-foot')
    if (!content || !head || !block || !foot) return
    const measure = () => {
      content.style.setProperty('--tt-modal-head', `${head.offsetHeight}px`)
      content.style.setProperty('--tt-sticky', `${block.offsetHeight}px`)
      content.style.setProperty('--tt-foot', `${foot.offsetHeight}px`)
      const room = content.clientHeight - head.offsetHeight
      // Side by side (wide dialogs) the preview column must fit the body; stacked (phones and
      // tablets) it must leave the options a window of a few tiles between it and the footer.
      const wide = getComputedStyle(block.parentElement!).gridTemplateColumns.split(' ').length > 1
      const fits = wide
        ? block.offsetHeight <= room - 8
        : room - block.offsetHeight - foot.offsetHeight >= 200
      if (fits) delete content.dataset.unstuck
      else content.dataset.unstuck = 'true'
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(head)
    observer.observe(block)
    observer.observe(foot)
    observer.observe(content)
    return () => observer.disconnect()
  }, [preview])
  // The theme's painted tiles, loaded once per page; the preview waits for them (a moment).
  const artKey = `${map.options.kind}:${map.options.theme}`
  const [art, setArt] = useState<{ key: string; art: MapArt } | null>(null)
  const painted = map.options.look === 'painted'
  const { kind: artKind, theme: artTheme } = map.options
  useEffect(() => {
    if (!opened || !painted) return
    let live = true
    // The art depends on the kind and theme only, not on the seed or the size.
    void loadMapArt({ options: { kind: artKind, theme: artTheme } }).then((loaded) => {
      if (live) setArt({ key: `${artKind}:${artTheme}`, art: loaded })
    })
    return () => {
      live = false
    }
  }, [artKind, artTheme, opened, painted])
  const ready = !painted || art?.key === artKey
  useEffect(() => {
    if (!opened || !preview || !ready) return
    const frame = requestAnimationFrame(() => {
      // A light preview (the stored map is painted at full size on create).
      const px = Math.max(
        10,
        Math.min(32, Math.floor(1400 / Math.max(map.options.cols, map.options.rows))),
      )
      paintMap(map, map.options.look, preview, px, art?.art)
    })
    return () => cancelAnimationFrame(frame)
  }, [map, opened, preview, ready, art])
  const place =
    map.variant === 'lake' && theme === 'volcanic'
      ? t('tabletop.generator.variant.lavaLake')
      : map.variant
        ? t(`tabletop.generator.variant.${map.variant}`)
        : t(`tabletop.generator.kind.${kind}`)
  const title = t('tabletop.generator.place', {
    place,
    theme: t(`tabletop.generator.theme.${theme}`),
    cols: map.options.cols,
    rows: map.options.rows,
  })
  // Painting and encoding take a moment before the upload starts: one creation at a time, its step
  // said in the footer beside Create.
  const [phase, setPhase] = useState<'paint' | 'upload' | 'save' | null>(null)
  const busy = phase !== null || upload.isPending || action.isPending
  const create = async () => {
    if (busy) return
    setError(false)
    setPhase('paint')
    try {
      const tiles = map.options.look === 'painted' ? await loadMapArt(map) : null
      // Lets the footer show the step before the canvas work holds the page.
      await new Promise((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))
      const canvas = paintMap(map, map.options.look, undefined, undefined, tiles)
      const blob = await canvasBlob(canvas)
      canvas.width = 0
      setPhase('upload')
      const path = await upload.mutateAsync({ kind: 'map', file: blob })
      setPhase('save')
      // The DM notes are written in the DM's language when the scene is made.
      const content = sceneContent(map, (note) => ({
        label: t(`tabletop.generator.note.${note.key}.label`),
        text: t(`tabletop.generator.note.${note.key}.text`),
      }))
      const scene = await action.mutateAsync({
        kind: 'saveScene',
        sceneId: null,
        revision: null,
        fields: {
          name: (name.trim() || place).slice(0, 80),
          map_kind: 'generated',
          map_path: path,
          map_width: map.options.cols * squarePixels(map.options.cols, map.options.rows),
          map_height: map.options.rows * squarePixels(map.options.cols, map.options.rows),
          cell_px: squarePixels(map.options.cols, map.options.rows),
          offset_x: 0,
          offset_y: 0,
          cols: map.options.cols,
          rows: map.options.rows,
          fog_enabled: kind !== 'forest',
          rooms: content.rooms,
          recipe: recipeOf(map.options),
          items: content.items,
        },
      })
      if (scene && typeof scene === 'object' && 'id' in scene) onCreated(scene.id as string)
    } catch {
      setError(true)
    } finally {
      setPhase(null)
    }
  }
  const secrets = map.doors.filter((d) => d.secret).length
  const locked = map.doors.filter((d) => d.locked).length
  const passages = map.rooms.filter((r) => isPassage(r.id)).length
  const secretsAsked = secret && (kind === 'dungeon' || kind === 'crypt')
  const trapNotes = map.notes.filter((n) => n.key === 'trap').length
  // RYT-068: what the map holds, as sentences ("6 rooms, 7 passages, 10 doors and 26 props.").
  const list = new Intl.ListFormat(i18n.language, { type: 'conjunction' })
  const areas = map.rooms.length - passages
  const built = kind === 'dungeon' || kind === 'crypt' || kind === 'tavern'
  const held: string[] = []
  if (areas)
    held.push(
      built
        ? t('tabletop.generator.count.rooms', { count: areas })
        : t('tabletop.generator.count.areas', { count: areas }),
    )
  if (passages) held.push(t('tabletop.generator.count.passages', { count: passages }))
  if (map.doors.length) held.push(t('tabletop.generator.count.doors', { count: map.doors.length }))
  held.push(t('tabletop.generator.count.props', { count: map.props.length }))
  const holds = list.format(held)
  const dm: string[] = []
  if (locked) dm.push(t('tabletop.generator.count.locked', { count: locked }))
  if (secrets) dm.push(t('tabletop.generator.count.secrets', { count: secrets }))
  else if (secretsAsked) dm.push(t('tabletop.generator.count.noSecrets'))
  // The notes by what they mark (the way in, the goal, a hidden treasure, traps…), in key order.
  if (map.notes.length) {
    const marked = noteKeys
      .map((key) => {
        const count = map.notes.filter((n) => n.key === key).length
        if (!count) return ''
        const label = t(`tabletop.generator.note.${key}.label`)
        return count > 1 ? `${label} ×${count}` : label
      })
      .filter(Boolean)
    dm.push(
      t('tabletop.generator.count.marked', { count: map.notes.length, list: list.format(marked) }),
    )
  }
  const forDm = dm.length ? list.format(dm) : ''
  // R rolls another map and Ctrl/Cmd+Enter creates it, from anywhere in the dialog but a text
  // field; nothing while a scene is being made.
  useEffect(() => {
    if (!opened) return
    const onKey = (event: KeyboardEvent) => {
      if (busy) return
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        void create()
        return
      }
      if (event.key.toLowerCase() !== 'r' || event.ctrlKey || event.metaKey || event.altKey) return
      // Not while typing: text fields keep the letter (radios, switches and buttons pass it on).
      const target = event.target as HTMLElement | null
      if (target?.closest('textarea, select, [contenteditable="true"]')) return
      if (
        target instanceof HTMLInputElement &&
        !['radio', 'checkbox', 'button'].includes(target.type)
      )
        return
      event.preventDefault()
      reroll()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  return (
    <Modal
      closeButtonProps={{ 'aria-label': t('tabletop.close'), size: 44 }}
      opened={opened}
      onClose={busy ? () => undefined : onClose}
      closeOnEscape={!busy}
      title={t('tabletop.generator.title')}
      size="min(1240px, 96vw)"
      fullScreen={phone}
      classNames={{ body: 'tt-generator', content: 'tt-generator-content' }}
    >
      <div className="tt-generator-preview">
        <div
          className="tt-preview-frame"
          data-loading={!ready || undefined}
          aria-busy={!ready}
          role="img"
          aria-label={`${title}. ${t('tabletop.generator.holds', { list: holds })}`}
        >
          <canvas ref={setPreview} className="tt-preview-canvas" />
          {!ready && <span className="tt-preview-wait">{t('tabletop.generator.preparing')}</span>}
          {/* Doors and props stay items on the map; the preview draws them over the painting. */}
          <svg
            className="tt-preview-items"
            data-hidden={!ready || undefined}
            viewBox={`0 0 ${map.options.cols} ${map.options.rows}`}
            aria-hidden="true"
          >
            {map.options.look === 'ink' && (
              <defs>
                <InkFilter id="tt-preview-ink" />
              </defs>
            )}
            {map.props.map((p, i) => {
              // As on the board: the footprint is turned, the drawing keeps its proportions.
              const quarter = p.rotation % 180 !== 0
              const [dw, dh] = quarter ? [p.h, p.w] : [p.w, p.h]
              // Ink maps print the pictures of props that have no line drawing (RYT-068).
              const printed = map.options.look === 'ink' && !hasDrawing(p.prop)
              const sprite =
                map.options.look === 'painted' || printed ? propSprite(p.prop, dw, dh, i) : null
              return (
                <g
                  key={`p${i}`}
                  transform={`translate(${p.x} ${p.y})${
                    p.rotation
                      ? ` rotate(${p.rotation} ${p.w / 2} ${p.h / 2}) translate(${p.w / 2 - dw / 2} ${p.h / 2 - dh / 2})`
                      : ''
                  }`}
                >
                  {sprite ? (
                    <image
                      href={sprite.url}
                      x={-sprite.pad}
                      y={-sprite.pad}
                      width={dw + sprite.pad * 2}
                      height={dh + sprite.pad * 2}
                      filter={printed ? 'url(#tt-preview-ink)' : undefined}
                      // As on the board: a picture may be mirrored or turned inside its box.
                      transform={
                        [
                          sprite.turn ? `rotate(${sprite.turn} ${dw / 2} ${dh / 2})` : '',
                          sprite.flip ? `translate(${dw} 0) scale(-1 1)` : '',
                        ]
                          .filter(Boolean)
                          .join(' ') || undefined
                      }
                    />
                  ) : (
                    <PropDrawing prop={p.prop} w={dw} h={dh} />
                  )}
                </g>
              )
            })}
            {map.doors.map((d, i) => (
              <rect
                key={`d${i}`}
                x={d.rotation === 90 ? d.x - 0.11 : d.x - 0.46}
                y={d.rotation === 90 ? d.y - 0.46 : d.y - 0.11}
                width={d.rotation === 90 ? 0.22 : 0.92}
                height={d.rotation === 90 ? 0.92 : 0.22}
                rx={0.04}
                fill={d.secret ? 'none' : d.locked ? '#6b4526' : '#b07a45'}
                stroke={d.secret || d.locked ? '#f6c478' : '#2b1d10'}
                strokeWidth={0.05}
                strokeDasharray={d.secret ? '0.12 0.08' : undefined}
              />
            ))}
            {map.doors
              .filter((d) => d.locked)
              .map((d, i) => (
                <circle
                  key={`k${i}`}
                  cx={d.x}
                  cy={d.y}
                  r={0.13}
                  fill="#2b1d10"
                  stroke="#f6c478"
                  strokeWidth={0.04}
                />
              ))}
            {/* DM notes the generator leaves: a seal on the square. */}
            {map.notes.map((n, i) => (
              <g key={`n${i}`} transform={`translate(${n.x + 0.5} ${n.y + 0.5})`}>
                {n.key === 'trap' ? (
                  <path
                    d="M0 -0.42 L0.4 0.3 L-0.4 0.3 Z"
                    fill="#eda145"
                    stroke="#2b1d10"
                    strokeWidth={0.07}
                    strokeLinejoin="round"
                  />
                ) : (
                  <>
                    <circle r={0.34} fill="#eda145" stroke="#2b1d10" strokeWidth={0.07} />
                    <circle r={0.1} fill="#2b1d10" />
                  </>
                )}
              </g>
            ))}
          </svg>
        </div>
        <div className="tt-preview-caption" aria-live="polite" aria-atomic="true">
          <p className="tt-preview-title">{title}</p>
          <p className="tt-preview-holds">{t('tabletop.generator.holds', { list: holds })}</p>
          {forDm && (
            <p className="tt-preview-dm">{t('tabletop.generator.forDm', { list: forDm })}</p>
          )}
        </div>
        {/* What the DM's marks on the preview mean; only the marks this map uses. */}
        {(map.notes.length > 0 || locked > 0 || secrets > 0) && (
          <ul className="tt-preview-legend" aria-label={t('tabletop.generator.legend.label')}>
            {map.notes.length - trapNotes > 0 && (
              <li>
                <svg viewBox="-0.6 -0.6 1.2 1.2" aria-hidden="true">
                  <rect
                    x={-0.6}
                    y={-0.6}
                    width={1.2}
                    height={1.2}
                    rx={0.18}
                    className="tt-mark-plate"
                  />
                  <circle r={0.34} fill="#eda145" stroke="#2b1d10" strokeWidth={0.07} />
                  <circle r={0.1} fill="#2b1d10" />
                </svg>
                {t('tabletop.generator.legend.note')}
              </li>
            )}
            {trapNotes > 0 && (
              <li>
                <svg viewBox="-0.6 -0.6 1.2 1.2" aria-hidden="true">
                  <rect
                    x={-0.6}
                    y={-0.6}
                    width={1.2}
                    height={1.2}
                    rx={0.18}
                    className="tt-mark-plate"
                  />
                  <path
                    d="M0 -0.42 L0.4 0.3 L-0.4 0.3 Z"
                    fill="#eda145"
                    stroke="#2b1d10"
                    strokeWidth={0.07}
                    strokeLinejoin="round"
                  />
                </svg>
                {t('tabletop.generator.legend.trap')}
              </li>
            )}
            {locked > 0 && (
              <li>
                <svg viewBox="-0.6 -0.6 1.2 1.2" aria-hidden="true">
                  <rect
                    x={-0.6}
                    y={-0.6}
                    width={1.2}
                    height={1.2}
                    rx={0.18}
                    className="tt-mark-plate"
                  />
                  <rect
                    x={-0.46}
                    y={-0.16}
                    width={0.92}
                    height={0.32}
                    rx={0.05}
                    fill="#6b4526"
                    stroke="#f6c478"
                    strokeWidth={0.06}
                  />
                  <circle r={0.11} fill="#2b1d10" />
                </svg>
                {t('tabletop.generator.legend.locked')}
              </li>
            )}
            {secrets > 0 && (
              <li>
                <svg viewBox="-0.6 -0.6 1.2 1.2" aria-hidden="true">
                  <rect
                    x={-0.6}
                    y={-0.6}
                    width={1.2}
                    height={1.2}
                    rx={0.18}
                    className="tt-mark-plate"
                  />
                  <rect
                    x={-0.46}
                    y={-0.16}
                    width={0.92}
                    height={0.32}
                    rx={0.05}
                    fill="none"
                    stroke="#f6c478"
                    strokeWidth={0.07}
                    strokeDasharray="0.14 0.08"
                  />
                </svg>
                {t('tabletop.generator.legend.secret')}
              </li>
            )}
          </ul>
        )}
        <div className="tt-reroll">
          <Button
            variant="default"
            leftSection={<Dices size={18} aria-hidden="true" />}
            rightSection={
              phone ? undefined : (
                <kbd className="tt-shortcut" aria-hidden="true">
                  R
                </kbd>
              )
            }
            aria-keyshortcuts="R"
            onClick={reroll}
          >
            {t('tabletop.generator.reroll')}
          </Button>
          <Button
            variant="default"
            className="tt-back-key"
            leftSection={<Undo2 size={18} aria-hidden="true" />}
            // Disabled in look, never in focus: the keyboard stays where it was.
            data-disabled={history.length === 0 || undefined}
            aria-disabled={history.length === 0}
            aria-label={t('tabletop.generator.previousLabel')}
            onClick={back}
          >
            {t('tabletop.generator.previous')}
          </Button>
        </div>
      </div>
      <div className="tt-generator-options">
        <fieldset className="tt-generator-fields" disabled={busy}>
          <legend className="visually-hidden">{t('tabletop.generator.options')}</legend>
          <TileGroup
            legend={t('tabletop.generator.kind.legend')}
            className="tt-kind-tiles"
            value={kind}
            onChange={setKind}
            options={mapKinds.map((k) => {
              const Icon = kindIcons[k]
              return {
                value: k,
                content: (
                  <span className="tt-kind-tile">
                    <Icon size={20} aria-hidden="true" />
                    <span>{t(`tabletop.generator.kind.${k}`)}</span>
                  </span>
                ),
              }
            })}
          />
          <TileGroup
            legend={t('tabletop.generator.look.legend')}
            className="tt-tiles-compact"
            value={look}
            onChange={setLook}
            options={mapLooks.map((l) => ({
              value: l,
              content: (
                <span className="tt-look-tile">
                  {/* The look itself: inked parchment, or the chosen setting's painted floor. */}
                  <span
                    className={`tt-look-sample is-${l}`}
                    style={
                      l === 'painted'
                        ? {
                            backgroundImage: `url("${sampleOf({ options: { kind, theme } }).floor}")`,
                          }
                        : undefined
                    }
                    aria-hidden="true"
                  />
                  <span>{t(`tabletop.generator.look.${l}`)}</span>
                </span>
              ),
            }))}
          />
          <TileGroup
            legend={t('tabletop.generator.theme.legend')}
            className="tt-theme-tiles"
            value={theme}
            onChange={(value) => setThemes((all) => ({ ...all, [kind]: value }))}
            options={mapThemes[kind].map((value) => ({
              value,
              content: (
                <span className="tt-theme-tile">
                  <ThemeSample kind={kind} theme={value} ink={look === 'ink'} />
                  <span>{t(`tabletop.generator.theme.${value}`)}</span>
                </span>
              ),
            }))}
          />
          {look === 'ink' && <p className="tt-note">{t('tabletop.generator.theme.inkNote')}</p>}
          <TileGroup
            legend={t('tabletop.generator.size.legend')}
            className="tt-tiles-compact"
            value={sizeKey}
            onChange={setSizeKey}
            options={[
              ...(table
                ? [
                    {
                      value: 'table',
                      content: <span>{t('tabletop.generator.size.table', table)}</span>,
                    },
                  ]
                : []),
              ...sizePresets.map((p) => ({
                value: p.key,
                content: (
                  <span>
                    {t(`tabletop.generator.size.${p.key}`, { cols: p.cols, rows: p.rows })}
                  </span>
                ),
              })),
              { value: 'custom', content: <span>{t('tabletop.generator.size.custom')}</span> },
            ]}
          />
          {!table && <p className="tt-note">{t('tabletop.generator.size.calibrate')}</p>}
          {sizeKey === 'custom' && (
            <div className="tt-row">
              <NumberInput
                hideControls
                label={t('tabletop.generator.size.cols')}
                value={custom.cols}
                min={minimumSize[kind].cols}
                max={maximumSize}
                clampBehavior="blur"
                onChange={(v) => setCustom((c) => ({ ...c, cols: Number(v) || c.cols }))}
              />
              <NumberInput
                hideControls
                label={t('tabletop.generator.size.rows')}
                value={custom.rows}
                min={minimumSize[kind].rows}
                max={maximumSize}
                clampBehavior="blur"
                onChange={(v) => setCustom((c) => ({ ...c, rows: Number(v) || c.rows }))}
              />
            </div>
          )}
          <TileGroup
            legend={t('tabletop.generator.density.legend')}
            className="tt-tiles-compact"
            value={density}
            onChange={setDensity}
            options={densities.map((d) => ({
              value: d,
              content: <span>{t(`tabletop.generator.density.${d}`)}</span>,
            }))}
          />
          {(kind === 'dungeon' || kind === 'crypt') && (
            <Switch
              label={t('tabletop.generator.secret')}
              description={t('tabletop.generator.secretHelp')}
              checked={secret}
              onChange={(e) => setSecret(e.currentTarget.checked)}
            />
          )}
          {(kind === 'dungeon' || kind === 'crypt' || kind === 'cave') && (
            <Switch
              label={t('tabletop.generator.traps')}
              description={t(
                kind === 'cave'
                  ? 'tabletop.generator.trapsHelpCave'
                  : 'tabletop.generator.trapsHelp',
              )}
              checked={traps}
              onChange={(e) => setTraps(e.currentTarget.checked)}
            />
          )}
          {kind === 'dungeon' && (
            <Switch
              label={t('tabletop.generator.wide')}
              description={t('tabletop.generator.wideHelp')}
              checked={wide}
              onChange={(e) => setWide(e.currentTarget.checked)}
            />
          )}
          <NumberInput
            hideControls
            label={t('tabletop.generator.seed')}
            description={t('tabletop.generator.seedHelp')}
            value={seedEmpty ? '' : seed}
            min={0}
            max={999999}
            allowDecimal={false}
            allowNegative={false}
            onChange={(v) => {
              if (v === '' || v === undefined) return setSeedEmpty(true)
              setSeedEmpty(false)
              setSeed(Number(v))
            }}
            onBlur={() => setSeedEmpty(false)}
          />
          <TextInput
            label={t('tabletop.generator.name')}
            placeholder={place}
            value={name}
            maxLength={80}
            onChange={(e) => setName(e.currentTarget.value)}
          />
        </fieldset>
        {/* Outside the locked fieldset: Create keeps the focus while saving and after a failure. */}
        <div className="tt-dialog-foot">
          <p className="tt-foot-status" role="status">
            {phase && !error ? t(`tabletop.generator.phase.${phase}`) : ''}
          </p>
          {error && (
            <p className="tt-foot-status is-error" role="alert">
              {t('tabletop.generator.failed')}
            </p>
          )}
          <Button
            variant="subtle"
            onClick={busy ? undefined : onClose}
            data-disabled={busy || undefined}
            aria-disabled={busy}
          >
            {t('tabletop.cancel')}
          </Button>
          <Button
            onClick={create}
            data-disabled={busy || undefined}
            aria-disabled={busy}
            leftSection={
              busy ? <Loader size={16} color="currentColor" aria-hidden="true" /> : undefined
            }
            aria-keyshortcuts="Control+Enter Meta+Enter"
          >
            {t(error ? 'tabletop.generator.retry' : 'tabletop.generator.create')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * RYT-068: a theme as a sample board: its floor, a band of its wall, a pool of its water or lava
 * and, for taverns, the yard outside; printed in ink when the map is drawn in ink.
 */
function ThemeSample({ kind, theme, ink }: { kind: MapKind; theme: MapTheme; ink: boolean }) {
  const sample = sampleOf({ options: { kind, theme } })
  const url = (src: string) => `url("${src}")`
  return (
    <span
      className={`tt-theme-sample ${ink ? 'is-ink' : ''}`}
      style={{ backgroundColor: sample.tone, backgroundImage: url(sample.floor) }}
      aria-hidden="true"
    >
      {sample.wall && <span className="is-wall" style={{ backgroundImage: url(sample.wall) }} />}
      {sample.ground && (
        <span className="is-ground" style={{ backgroundImage: url(sample.ground) }} />
      )}
      {sample.pool && <span className="is-pool" style={{ backgroundImage: url(sample.pool) }} />}
    </span>
  )
}
