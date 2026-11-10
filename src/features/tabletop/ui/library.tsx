import { useMemo, useRef, useState } from 'react'
import {
  Button,
  FileButton,
  Loader,
  Menu,
  Modal,
  NumberInput,
  TextInput,
  VisuallyHidden,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router'
import {
  EllipsisVertical,
  Grid3x3,
  ImageUp,
  Monitor,
  Plus,
  Ruler,
  Trash2,
  Wand2,
} from 'lucide-react'
import { useAuth } from '@/features/auth'
import { TileGroup } from '@/features/combat'
import { PageHead } from '@/shared/ui/page-head'
import { usePhone } from '@/shared/ui/use-viewport'
import { mediaQuery, scenesQuery, useMediaUpload, useTabletopAction } from '../api'
import { fromSetup, squaresThatFit } from '../domain/calibration'
import { placeFrame } from '../domain/geometry'
import { sizePresets } from '../domain/generator'
import { grounds, type Ground, type SceneSummary } from '../domain/model'
import { groundColors } from './palette'
import { CalibrationDialog } from './calibration'
import { GeneratorDialog } from './generator-dialog'
import { prepareImage } from './media'
import { preparedView } from './prepared-view'
import {
  gridFromName,
  isUvttName,
  parseUvtt,
  uvttExtensions,
  uvttLayout,
  uvttMaxBytes,
  uvttSize,
  type UvttLayout,
} from '../domain/uvtt'

type Flow = 'choose' | 'blank' | 'upload' | 'generate' | null

export function TabletopLibrary({ campaignId }: { campaignId: string }) {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const navigate = useNavigate()
  const query = useQuery(scenesQuery(state.user!.id, campaignId))
  const action = useTabletopAction(campaignId)
  const [flow, setFlow] = useState<Flow>(null)
  const newScene = useRef<HTMLButtonElement>(null)
  // Backing out of a creation dialog returns focus to "New scene" (its own chooser has closed).
  const backOut = () => {
    setFlow(null)
    requestAnimationFrame(() => newScene.current?.focus())
  }
  const [setup, setSetup] = useState(false)
  /** RYT-076: the scene waiting for the DM to confirm its deletion, and what the page says after. */
  const [deleting, setDeleting] = useState<SceneSummary | null>(null)
  // The dialog keeps painting the last scene while it closes.
  const [shown, setShown] = useState<SceneSummary | null>(null)
  if (deleting && deleting !== shown) setShown(deleting)
  const [said, setSaid] = useState('')
  /** Closing without deleting: focus goes back to that scene's menu (its item has unmounted). */
  const keepScene = () => {
    const id = deleting?.id
    setDeleting(null)
    requestAnimationFrame(() =>
      document.querySelector<HTMLElement>(`[data-scene-menu="${id}"]`)?.focus(),
    )
  }
  const deletingNow = action.isPending && action.variables?.kind === 'deleteScene'
  const deleteScene = (scene: SceneSummary) =>
    action.mutate(
      { kind: 'deleteScene', sceneId: scene.id },
      {
        onSuccess: () => {
          setDeleting(null)
          setSaid(t('tabletop.scene.deleted', { name: scene.name }))
          // The plate is gone: focus goes back to "New scene".
          requestAnimationFrame(() => newScene.current?.focus())
        },
      },
    )
  const calibration = fromSetup(query.data?.live.screen)
  const table = calibration ? squaresThatFit(calibration) : null
  const liveId = query.data?.live.scene_id ?? null
  const scenes = query.data?.scenes ?? []
  const open = (id: string) => navigate(id)
  return (
    <div className="tt-library">
      <PageHead
        title={t('tabletop.title')}
        actions={
          <Button
            ref={newScene}
            leftSection={<Plus size={18} aria-hidden="true" />}
            onClick={() => setFlow('choose')}
          >
            {t('tabletop.newScene')}
          </Button>
        }
      />
      <section className="tt-setup-card" aria-labelledby="tt-setup-title">
        <span className="tt-setup-glyph" aria-hidden="true">
          <Ruler size={22} />
        </span>
        <div>
          <h2 id="tt-setup-title" className="tt-setup-title">
            {t('tabletop.setup.card')}
          </h2>
          <p className="tt-setup-line">
            {calibration
              ? t('tabletop.setup.summary', {
                  diagonal: calibration.diagonalIn,
                  w: calibration.pxW,
                  h: calibration.pxH,
                  base: new Intl.NumberFormat(i18n.language).format(calibration.baseMm),
                  cols: table!.cols,
                  rows: table!.rows,
                })
              : t('tabletop.setup.none')}
          </p>
        </div>
        <div className="tt-setup-actions">
          <Button variant="default" onClick={() => setSetup(true)}>
            {calibration ? t('tabletop.setup.adjust') : t('tabletop.setup.start')}
          </Button>
          <Button
            component="a"
            variant="subtle"
            href={`#/campaign/${campaignId}/tabletop-table`}
            target="_blank"
            rel="noopener"
            leftSection={<Monitor size={18} aria-hidden="true" />}
          >
            {t('tabletop.openTable')}
          </Button>
        </div>
      </section>
      {query.isPending ? (
        <p className="tt-state">{t('tabletop.loading')}</p>
      ) : query.isError ? (
        <div className="tt-state" role="alert">
          <p>{t('tabletop.error.load')}</p>
          <Button variant="default" onClick={() => void query.refetch()}>
            {t('tabletop.retry')}
          </Button>
        </div>
      ) : scenes.length === 0 ? (
        <div className="tt-empty">
          <p className="tt-empty-title">{t('tabletop.empty.title')}</p>
          <p>{t('tabletop.empty.body')}</p>
        </div>
      ) : (
        <ul className="tt-plates" aria-label={t('tabletop.scenes')}>
          {scenes.map((scene) => (
            <ScenePlate
              key={scene.id}
              scene={scene}
              live={scene.id === liveId}
              onOpen={() => open(scene.id)}
              onPut={() => {
                // The frame the DM prepared in the editor, else the map's middle, on whole squares.
                const center = preparedView(scene.id) ?? [scene.cols / 2, scene.rows / 2]
                const [view_x, view_y] = table ? placeFrame(center, table, scene) : center
                action.mutate({ kind: 'live', patch: { scene_id: scene.id, view_x, view_y } })
              }}
              onClear={() => action.mutate({ kind: 'live', patch: { scene_id: null } })}
              onDelete={() => {
                action.reset()
                setDeleting(scene)
              }}
            />
          ))}
        </ul>
      )}
      <p className="tt-said" role="status">
        {said}
      </p>
      <Modal
        closeButtonProps={{ 'aria-label': t('tabletop.close'), size: 44 }}
        opened={deleting !== null}
        onClose={keepScene}
        returnFocus={false}
        title={shown ? t('tabletop.scene.deleteTitle', { name: shown.name }) : ''}
      >
        {shown && (
          <div className="tt-confirm">
            <p>
              {t('tabletop.scene.deleteWarning')}{' '}
              {t('tabletop.scene.deleteCount', { count: shown.items })}
            </p>
            {shown.id === liveId && (
              <p className="tt-confirm-live">
                <Monitor size={18} aria-hidden="true" />
                <span>{t('tabletop.scene.deleteLive')}</span>
              </p>
            )}
            <p>{t('tabletop.scene.deleteIrreversible')}</p>
            {action.isError && action.variables?.kind === 'deleteScene' && (
              <p className="tt-error" role="alert">
                {t('tabletop.scene.deleteFailed')}
              </p>
            )}
            <div className="tt-dialog-foot">
              <Button variant="subtle" data-autofocus onClick={keepScene}>
                {t('tabletop.cancel')}
              </Button>
              {/* Busy, it stays focusable (aria-disabled): a failure keeps the focus here. */}
              <Button
                color="red"
                variant="light"
                leftSection={
                  deletingNow ? (
                    <Loader size={16} color="currentColor" aria-hidden="true" />
                  ) : (
                    <Trash2 size={18} aria-hidden="true" />
                  )
                }
                aria-disabled={deletingNow}
                data-disabled={deletingNow || undefined}
                onClick={() => {
                  if (!deletingNow) deleteScene(shown)
                }}
              >
                {t('tabletop.scene.delete')}
              </Button>
            </div>
          </div>
        )}
      </Modal>
      <Modal
        closeButtonProps={{ 'aria-label': t('tabletop.close'), size: 44 }}
        opened={flow === 'choose'}
        onClose={() => setFlow(null)}
        title={t('tabletop.newScene')}
        size="lg"
      >
        <div className="tt-choices">
          {(
            [
              ['generate', Wand2],
              ['upload', ImageUp],
              ['blank', Grid3x3],
            ] as const
          ).map(([key, Icon]) => (
            <button key={key} type="button" className="tt-choice" onClick={() => setFlow(key)}>
              <Icon size={26} aria-hidden="true" />
              <span className="tt-choice-title">{t(`tabletop.new.${key}`)}</span>
              <span className="tt-choice-help">{t(`tabletop.new.${key}Help`)}</span>
            </button>
          ))}
        </div>
      </Modal>
      {flow === 'blank' && (
        <BlankScene campaignId={campaignId} table={table} onClose={backOut} onCreated={open} />
      )}
      {flow === 'upload' && (
        <UploadScene campaignId={campaignId} onClose={backOut} onCreated={open} />
      )}
      {flow === 'generate' && (
        <GeneratorDialog
          opened
          campaignId={campaignId}
          table={table}
          onClose={backOut}
          onCreated={open}
        />
      )}
      {setup && (
        <CalibrationDialog
          opened
          campaignId={campaignId}
          current={calibration}
          onClose={() => setSetup(false)}
        />
      )}
    </div>
  )
}

function ScenePlate({
  scene,
  live,
  onOpen,
  onPut,
  onClear,
  onDelete,
}: {
  scene: SceneSummary
  live: boolean
  onOpen: () => void
  onPut: () => void
  onClear: () => void
  onDelete: () => void
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const image = useQuery(mediaQuery(state.user!.id, scene.map_path))
  const kind = scene.recipe
    ? t(`tabletop.generator.kind.${scene.recipe.kind}` as never, {
        defaultValue: scene.recipe.kind,
      })
    : t(`tabletop.scene.kind.${scene.map_kind}`)
  return (
    <li className={`tt-plate ${live ? 'is-live' : ''}`}>
      <button type="button" className="tt-plate-open" onClick={onOpen}>
        <span
          className="tt-plate-mat"
          style={
            scene.map_kind === 'blank' ? { background: groundColors[scene.ground].fill } : undefined
          }
        >
          {image.data && <img src={image.data} alt="" className="tt-plate-image" />}
        </span>
        <span className="tt-plate-name">{scene.name}</span>
        <span className="tt-plate-meta">
          {t('tabletop.plate.meta', {
            kind,
            cols: scene.cols,
            rows: scene.rows,
            count: scene.items,
          })}
        </span>
      </button>
      {live && (
        <span className="tt-seal-line tt-plate-seal">
          <span className="tt-seal" aria-hidden="true">
            <Monitor size={14} />
          </span>
          {t('tabletop.onTable')}
        </span>
      )}
      <Menu position="bottom-end" withinPortal>
        <Menu.Target>
          <button
            type="button"
            className="tt-icon-button tt-plate-menu"
            data-scene-menu={scene.id}
            aria-label={t('tabletop.plate.menu', { name: scene.name })}
          >
            <EllipsisVertical size={18} aria-hidden="true" />
          </button>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item onClick={onOpen}>{t('tabletop.plate.edit')}</Menu.Item>
          {live ? (
            <Menu.Item onClick={onClear}>{t('tabletop.plate.clear')}</Menu.Item>
          ) : (
            <Menu.Item onClick={onPut}>{t('tabletop.putOnTable')}</Menu.Item>
          )}
          <Menu.Divider />
          <Menu.Item
            className="tt-menu-danger"
            leftSection={<Trash2 size={16} aria-hidden="true" />}
            onClick={onDelete}
          >
            {t('tabletop.scene.delete')}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </li>
  )
}

function BlankScene({
  campaignId,
  table,
  onClose,
  onCreated,
}: {
  campaignId: string
  table: { cols: number; rows: number } | null
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { t } = useTranslation()
  const phone = usePhone()
  const action = useTabletopAction(campaignId)
  const [name, setName] = useState('')
  const [ground, setGround] = useState<Ground>('stone')
  const [sizeKey, setSizeKey] = useState(table ? 'table' : 'medium')
  const [custom, setCustom] = useState({ cols: 30, rows: 20 })
  const size =
    sizeKey === 'table' && table
      ? table
      : sizeKey === 'custom'
        ? custom
        : (sizePresets.find((p) => p.key === sizeKey) ?? sizePresets[1])
  return (
    <Modal
      closeButtonProps={{ 'aria-label': t('tabletop.close'), size: 44 }}
      opened
      onClose={onClose}
      title={t('tabletop.new.blank')}
      size="lg"
      fullScreen={phone}
    >
      <form
        className="tt-form"
        onSubmit={(e) => {
          e.preventDefault()
          action.mutate(
            {
              kind: 'saveScene',
              sceneId: null,
              revision: null,
              fields: {
                name: name.trim() || t('tabletop.new.blank'),
                map_kind: 'blank',
                ground,
                cols: size.cols,
                rows: size.rows,
              },
            },
            {
              onSuccess: (scene) =>
                scene &&
                typeof scene === 'object' &&
                'id' in scene &&
                onCreated(scene.id as string),
            },
          )
        }}
      >
        <TextInput
          label={t('tabletop.scene.name')}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.currentTarget.value)}
          data-autofocus
        />
        <TileGroup
          legend={t('tabletop.scene.ground')}
          className="tt-tiles-compact"
          value={ground}
          onChange={setGround}
          options={grounds.map((g) => ({
            value: g,
            content: (
              <span className="tt-damage-tile">
                <span
                  className="tt-swatch"
                  style={{ background: groundColors[g].fill }}
                  aria-hidden="true"
                />
                <span>{t(`tabletop.ground.${g}`)}</span>
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
        {sizeKey === 'custom' && (
          <div className="tt-row">
            <NumberInput
              hideControls
              label={t('tabletop.generator.size.cols')}
              value={custom.cols}
              min={4}
              max={120}
              clampBehavior="blur"
              onChange={(v) => setCustom((c) => ({ ...c, cols: Number(v) || c.cols }))}
            />
            <NumberInput
              hideControls
              label={t('tabletop.generator.size.rows')}
              value={custom.rows}
              min={4}
              max={120}
              clampBehavior="blur"
              onChange={(v) => setCustom((c) => ({ ...c, rows: Number(v) || c.rows }))}
            />
          </div>
        )}
        {action.isError && (
          <p className="tt-error" role="alert">
            {t('tabletop.error.save')}
          </p>
        )}
        <div className="tt-dialog-foot">
          <Button variant="subtle" onClick={onClose}>
            {t('tabletop.cancel')}
          </Button>
          <Button type="submit" loading={action.isPending}>
            {t('tabletop.new.create')}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function UploadScene({
  campaignId,
  onClose,
  onCreated,
}: {
  campaignId: string
  onClose: () => void
  onCreated: (id: string) => void
}) {
  const { t, i18n } = useTranslation()
  const phone = usePhone()
  const action = useTabletopAction(campaignId)
  const upload = useMediaUpload(campaignId)
  const [picked, setPicked] = useState<{
    blob: Blob
    width: number
    height: number
    name: string
    /** A Universal VTT export (Dungeon Alchemist, Dungeondraft): grid, doors and areas known. */
    layout?: UvttLayout
  } | null>(null)
  const [across, setAcross] = useState(24)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [name, setName] = useState('')
  const [error, setError] = useState<string | null>(null)
  // Reading a big export takes a moment: one file at a time, the last one picked wins.
  const [reading, setReading] = useState(false)
  const pick = useRef(0)
  const preview = useMemo(() => (picked ? URL.createObjectURL(picked.blob) : null), [picked])
  const cell = picked?.layout ? picked.layout.pixelsPerSquare : picked ? picked.width / across : 0
  // Area numbers in the preview: about a twenty-fifth of the picture's width, at least a square.
  const label = picked ? Math.max(cell * 0.6, picked.width / 25) : 0
  const rows = picked?.layout
    ? picked.layout.rows
    : picked
      ? Math.max(4, Math.min(120, Math.floor((picked.height - offset.y) / cell)))
      : 0
  return (
    <Modal
      closeButtonProps={{ 'aria-label': t('tabletop.close'), size: 44 }}
      opened
      onClose={onClose}
      title={t('tabletop.new.upload')}
      size="xl"
      fullScreen={phone}
    >
      <div className="tt-form">
        <FileButton
          accept={`image/webp,image/png,image/jpeg,${uvttExtensions.join(',')}`}
          onChange={async (file) => {
            if (!file) return
            setError(null)
            const ticket = ++pick.current
            const base = file.name.replace(/\.[^.]+$/, '')
            setReading(true)
            try {
              if (isUvttName(file.name)) {
                if (file.size > uvttMaxBytes) throw new Error('invalid')
                // RYT-065: Dungeon Alchemist and Dungeondraft exports bring their own grid,
                // doors and walls; the picture inside is decoded and fitted like any upload.
                const data = parseUvtt(await file.text())
                const size = uvttSize(data)
                if (!size.fits) {
                  if (ticket === pick.current) {
                    setPicked(null)
                    setError(t('tabletop.upload.uvttSize', { cols: size.cols, rows: size.rows }))
                  }
                  return
                }
                const layout = uvttLayout(data)
                const raw = await (await fetch(`data:image/png;base64,${data.image}`)).blob()
                const typed = new Blob([raw], { type: imageType(data.image) })
                const prepared = await prepareImage(typed)
                if (ticket !== pick.current) return
                // The square size comes from the file's own grid, scaled with the picture.
                const scale =
                  prepared.width / (data.resolution.map_size.x * data.resolution.pixels_per_grid)
                setPicked({
                  ...prepared,
                  name: base,
                  layout: { ...layout, pixelsPerSquare: data.resolution.pixels_per_grid * scale },
                })
                setAcross(layout.cols)
                setOffset({ x: 0, y: 0 })
              } else {
                const prepared = await prepareImage(file)
                if (ticket !== pick.current) return
                setPicked({ ...prepared, name: base })
                // The file name may say the grid ("Crypt_30x20"); otherwise a first guess:
                // maps are usually drawn at 70 to 140 pixels per square.
                setAcross(
                  gridFromName(file.name, prepared.width, prepared.height) ??
                    Math.max(4, Math.min(120, Math.round(prepared.width / 100))),
                )
              }
              setName((n) => n || base.slice(0, 80))
            } catch {
              if (ticket === pick.current) {
                setPicked(null)
                setError(t('tabletop.upload.invalid'))
              }
            } finally {
              if (ticket === pick.current) setReading(false)
            }
          }}
        >
          {(props) => (
            <Button
              {...props}
              // Busy, not disabled: keyboard focus stays on the picker while the file is read.
              aria-busy={reading || undefined}
              rightSection={reading ? <Loader size={16} aria-hidden="true" /> : undefined}
              variant={picked ? 'default' : 'filled'}
              leftSection={<ImageUp size={18} aria-hidden="true" />}
            >
              {picked ? t('tabletop.upload.change') : t('tabletop.upload.pick')}
            </Button>
          )}
        </FileButton>
        <p className="tt-note">{t('tabletop.upload.help')}</p>
        {picked && preview && (
          <>
            <div
              className="tt-align-preview"
              // It scrolls on tall maps, so the keyboard can reach and scroll it.
              tabIndex={0}
              role="region"
              aria-label={t('tabletop.upload.previewLabel')}
            >
              <div
                className="tt-align-frame"
                style={{ aspectRatio: `${picked.width} / ${picked.height}` }}
              >
                <img src={preview} alt="" />
                <svg
                  viewBox={`0 0 ${picked.width} ${picked.height}`}
                  aria-hidden="true"
                  preserveAspectRatio="none"
                >
                  <path
                    d={[
                      ...Array.from(
                        { length: across + 1 },
                        (_, i) => `M ${offset.x + i * cell} 0 V ${picked.height}`,
                      ),
                      ...Array.from(
                        { length: rows + 1 },
                        (_, i) => `M 0 ${offset.y + i * cell} H ${picked.width}`,
                      ),
                    ].join(' ')}
                    className="tt-align-grid"
                    vectorEffect="non-scaling-stroke"
                  />
                  {/* The fog areas the walls make, each tinted with its number, then the doors. */}
                  {picked.layout?.rooms.map((room, i) => {
                    const [x, y, w, h] = [...room.rects].sort(
                      (a, b) => b[2] * b[3] - a[2] * a[3],
                    )[0]!
                    return (
                      <g key={room.id}>
                        {room.rects.map(([rx, ry, rw, rh], k) => (
                          <rect
                            key={k}
                            x={rx * cell}
                            y={ry * cell}
                            width={rw * cell}
                            height={rh * cell}
                            fill={`hsla(${(i * 67) % 360}, 70%, 55%, 0.16)`}
                          />
                        ))}
                        <text
                          x={(x + w / 2) * cell}
                          y={(y + h / 2) * cell}
                          // Sized to the picture, not the square: legible however big the map is.
                          fontSize={label}
                          strokeWidth={label * 0.16}
                          textAnchor="middle"
                          dominantBaseline="central"
                          className="tt-align-area"
                        >
                          {i + 1}
                        </text>
                      </g>
                    )
                  })}
                  {/* The doors the file brings, where the scene will place them. */}
                  {picked.layout?.doors.map((d, i) => (
                    <rect
                      key={i}
                      x={-((d.w ?? 1) * cell) / 2}
                      y={-cell * 0.12}
                      width={(d.w ?? 1) * cell}
                      height={cell * 0.24}
                      rx={cell * 0.04}
                      fill="#b07a45"
                      stroke="#2b1d10"
                      strokeWidth={cell * 0.05}
                      transform={`translate(${(d.x ?? 0) * cell} ${(d.y ?? 0) * cell}) rotate(${d.rotation ?? 0})`}
                    />
                  ))}
                </svg>
              </div>
            </div>
            {picked.layout ? (
              <p className="tt-result-main">
                {t('tabletop.upload.uvttResult', {
                  cols: picked.layout.cols,
                  rows: picked.layout.rows,
                  px: Math.round(cell),
                  doors: picked.layout.doors.length
                    ? t('tabletop.upload.uvttDoors', { count: picked.layout.doors.length })
                    : t('tabletop.upload.uvttNoDoors'),
                  areas: t('tabletop.upload.uvttAreas', { count: picked.layout.rooms.length }),
                })}
                {picked.layout.dropped > 0 && (
                  <span className="tt-result-sub">
                    {t('tabletop.upload.uvttDropped', { count: picked.layout.dropped })}
                  </span>
                )}
                {picked.layout.windows + picked.layout.lights > 0 && (
                  <span className="tt-result-sub">
                    {t('tabletop.upload.uvttSkipped', {
                      list: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(
                        [
                          picked.layout.windows
                            ? t('tabletop.upload.uvttWindows', { count: picked.layout.windows })
                            : '',
                          picked.layout.lights
                            ? t('tabletop.upload.uvttLights', { count: picked.layout.lights })
                            : '',
                        ].filter(Boolean),
                      ),
                    })}
                  </span>
                )}
              </p>
            ) : (
              <>
                <div className="tt-row">
                  <NumberInput
                    hideControls
                    label={t('tabletop.scene.across')}
                    description={t('tabletop.scene.acrossHelp')}
                    value={across}
                    min={4}
                    max={120}
                    allowDecimal={false}
                    clampBehavior="blur"
                    onChange={(v) => setAcross(Math.max(4, Math.min(120, Number(v) || across)))}
                  />
                  <NumberInput
                    hideControls
                    label={t('tabletop.upload.offsetX')}
                    value={offset.x}
                    min={-cell}
                    max={cell}
                    decimalScale={1}
                    onChange={(v) => setOffset((o) => ({ ...o, x: Number(v) || 0 }))}
                  />
                  <NumberInput
                    hideControls
                    label={t('tabletop.upload.offsetY')}
                    value={offset.y}
                    min={-cell}
                    max={cell}
                    decimalScale={1}
                    onChange={(v) => setOffset((o) => ({ ...o, y: Number(v) || 0 }))}
                  />
                </div>
                <p className="tt-result-main">
                  {t('tabletop.upload.result', { cols: across, rows, px: Math.round(cell) })}
                </p>
              </>
            )}
            <TextInput
              label={t('tabletop.scene.name')}
              value={name}
              maxLength={80}
              onChange={(e) => setName(e.currentTarget.value)}
            />
          </>
        )}
        {error && (
          <p className="tt-error" role="alert">
            {error}
          </p>
        )}
        <VisuallyHidden role="status" aria-live="polite">
          {picked?.layout
            ? t('tabletop.upload.uvttAnnounce', {
                cols: picked.layout.cols,
                rows: picked.layout.rows,
                doors: picked.layout.doors.length,
                areas: picked.layout.rooms.length,
              })
            : ''}
        </VisuallyHidden>
        <div className="tt-dialog-foot">
          <Button variant="subtle" onClick={onClose}>
            {t('tabletop.cancel')}
          </Button>
          <Button
            disabled={!picked}
            loading={upload.isPending || action.isPending}
            onClick={async () => {
              if (!picked) return
              setError(null)
              if (picked.layout && JSON.stringify(picked.layout.rooms).length > 240_000) {
                setError(t('tabletop.upload.uvttDense'))
                return
              }
              try {
                const path = await upload.mutateAsync({ kind: 'map', file: picked.blob })
                const scene = await action.mutateAsync({
                  kind: 'saveScene',
                  sceneId: null,
                  revision: null,
                  fields: {
                    name: name.trim() || picked.name.slice(0, 80) || t('tabletop.new.upload'),
                    map_kind: 'upload',
                    map_path: path,
                    map_width: picked.width,
                    map_height: picked.height,
                    cell_px: Number(cell.toFixed(3)),
                    offset_x: Number(offset.x.toFixed(3)),
                    offset_y: Number(offset.y.toFixed(3)),
                    cols: across,
                    rows,
                    ...(picked.layout
                      ? {
                          rooms: picked.layout.rooms,
                          items: picked.layout.doors,
                          fog_enabled: picked.layout.rooms.length > 1,
                        }
                      : {}),
                  },
                })
                if (scene && typeof scene === 'object' && 'id' in scene)
                  onCreated(scene.id as string)
              } catch {
                setError(t('tabletop.upload.failed'))
              }
            }}
          >
            {t('tabletop.new.create')}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

/** The picture type inside a Universal VTT file, from its first bytes. */
function imageType(base64: string) {
  if (base64.startsWith('/9j/')) return 'image/jpeg'
  if (base64.startsWith('UklGR')) return 'image/webp'
  return 'image/png'
}
