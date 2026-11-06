import { useDeferredValue, useEffect, useMemo, useState } from 'react'
import { Button, Modal, NumberInput, Switch, TextInput } from '@mantine/core'
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
  maximumSize,
  minimumSize,
  newSeed,
  recipeOf,
  sceneContent,
  sizePresets,
  type Density,
  type GeneratorOptions,
  type MapKind,
  type MapLook,
} from '../domain/generator'
import { isPassage } from '../domain/model'
import { canvasBlob, paintMap, squarePixels } from './painter'
import { PropDrawing } from './prop-art'
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
  const { t } = useTranslation()
  const phone = usePhone()
  const [kind, setKind] = useState<MapKind>('dungeon')
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
        ({ kind, look, cols, rows, seed, density, secret, wide, traps }) satisfies GeneratorOptions,
      [kind, look, cols, rows, seed, density, secret, wide, traps],
    ),
  )
  const map = useMemo(() => generateMap(options), [options])
  // The sticky preview sits right under the dialog's header, whatever the text size makes it.
  useEffect(() => {
    const content = preview?.closest<HTMLElement>('.tt-generator-content')
    const head = content?.querySelector<HTMLElement>('.mantine-Modal-header')
    if (!content || !head) return
    const measure = () => content.style.setProperty('--tt-modal-head', `${head.offsetHeight}px`)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(head)
    return () => observer.disconnect()
  }, [preview])
  useEffect(() => {
    if (!opened || !preview) return
    const frame = requestAnimationFrame(() => {
      // A light preview (the stored map is painted at full size on create).
      const px = Math.max(
        8,
        Math.min(24, Math.floor(1200 / Math.max(map.options.cols, map.options.rows))),
      )
      paintMap(map, map.options.look, preview, px)
    })
    return () => cancelAnimationFrame(frame)
  }, [map, opened, preview])
  // Painting and encoding take a moment before the upload starts: one creation at a time.
  const [creating, setCreating] = useState(false)
  const busy = creating || upload.isPending || action.isPending
  const create = async () => {
    if (busy) return
    setError(false)
    setCreating(true)
    try {
      const canvas = paintMap(map, map.options.look)
      const blob = await canvasBlob(canvas)
      const path = await upload.mutateAsync({ kind: 'map', file: blob })
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
          name: name.trim() || t(`tabletop.generator.kind.${kind}`),
          map_kind: 'generated',
          map_path: path,
          map_width: canvas.width,
          map_height: canvas.height,
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
      setCreating(false)
    }
  }
  const secrets = map.doors.filter((d) => d.secret).length
  const locked = map.doors.filter((d) => d.locked).length
  const passages = map.rooms.filter((r) => isPassage(r.id)).length
  const secretsAsked = secret && (kind === 'dungeon' || kind === 'crypt')
  return (
    <Modal
      closeButtonProps={{ 'aria-label': t('tabletop.close'), size: 44 }}
      opened={opened}
      onClose={onClose}
      title={t('tabletop.generator.title')}
      size="min(1100px, 96vw)"
      fullScreen={phone}
      classNames={{ body: 'tt-generator', content: 'tt-generator-content' }}
    >
      <div className="tt-generator-preview">
        <div
          className="tt-preview-frame"
          role="img"
          aria-label={t('tabletop.generator.previewLabel', {
            kind: t(`tabletop.generator.kind.${kind}`),
            cols: map.options.cols,
            rows: map.options.rows,
          })}
        >
          <canvas ref={setPreview} className="tt-preview-canvas" />
          {/* Doors and props stay items on the map; the preview draws them over the painting. */}
          <svg
            className="tt-preview-items"
            viewBox={`0 0 ${map.options.cols} ${map.options.rows}`}
            aria-hidden="true"
          >
            {map.props.map((p, i) => {
              // As on the board: the footprint is turned, the drawing keeps its proportions.
              const quarter = p.rotation % 180 !== 0
              const [dw, dh] = quarter ? [p.h, p.w] : [p.w, p.h]
              const sprite = map.options.look === 'painted' ? propSprite(p.prop, dw, dh, i) : null
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
        <p className="tt-preview-caption" aria-live="polite" aria-atomic="true">
          {map.variant && `${t(`tabletop.generator.variant.${map.variant}`)} · `}
          {t(map.doors.length ? 'tabletop.generator.caption' : 'tabletop.generator.captionOpen', {
            cols: map.options.cols,
            rows: map.options.rows,
            rooms: map.rooms.length - passages,
            doors: map.doors.length,
            props: map.props.length,
          })}
          {passages > 0 && ` ${t('tabletop.generator.passages', { count: passages })}`}
          {locked > 0 && ` ${t('tabletop.generator.locked', { count: locked })}`}
          {secrets > 0 && ` ${t('tabletop.generator.secrets', { count: secrets })}`}
          {secrets === 0 && secretsAsked && ` ${t('tabletop.generator.noSecrets')}`}
          {map.notes.length > 0 && ` ${t('tabletop.generator.notes', { count: map.notes.length })}`}
        </p>
        <div className="tt-reroll">
          <Button
            variant="default"
            leftSection={<Dices size={18} aria-hidden="true" />}
            onClick={reroll}
          >
            {t('tabletop.generator.reroll')}
          </Button>
          <Button
            variant="subtle"
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
              <span className="tt-damage-tile">
                <span className={`tt-swatch is-${l}`} aria-hidden="true" />
                <span>{t(`tabletop.generator.look.${l}`)}</span>
              </span>
            ),
          }))}
        />
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
                <span>{t(`tabletop.generator.size.${p.key}`, { cols: p.cols, rows: p.rows })}</span>
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
              kind === 'cave' ? 'tabletop.generator.trapsHelpCave' : 'tabletop.generator.trapsHelp',
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
          placeholder={t(`tabletop.generator.kind.${kind}`)}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        {error && (
          <p className="tt-error" role="alert">
            {t('tabletop.generator.failed')}
          </p>
        )}
        <div className="tt-dialog-foot">
          <Button variant="subtle" onClick={onClose}>
            {t('tabletop.cancel')}
          </Button>
          <Button onClick={create} loading={busy}>
            {t('tabletop.generator.create')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}
