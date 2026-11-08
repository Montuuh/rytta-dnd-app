import { useMemo, useState } from 'react'
import { Button, FileButton, Select, Slider, Switch, Textarea, TextInput } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import {
  Beer,
  Bell,
  Castle,
  CloudLightning,
  CloudRain,
  Coins,
  DoorOpen,
  Flame,
  ImageUp,
  Mountain,
  Music,
  Play,
  Plus,
  Search,
  Square,
  Swords,
  Trash2,
  TreePine,
  Upload,
  Users,
  Volume2,
  VolumeX,
  Waves,
} from 'lucide-react'
import { useAuth } from '@/features/auth'
import { monsterIndexQuery } from '@/features/bestiary'
import {
  combatStateQuery,
  encountersQuery,
  SizeScale,
  TileGroup,
  Token,
  type Combatant,
} from '@/features/combat'
import { libraryQuery, mediaQuery, useMediaUpload, useTabletopAction } from '../api'
import { mediaLimit } from '../data/repository'
import { prepareImage } from './media'
import { sizeSquares } from '../domain/geometry'
import {
  ambiences,
  grounds,
  soundEffects,
  tokenColors,
  type Card,
  type CreatureSize,
  type Item,
  type ItemPatch,
  type Live,
  type Scene,
  type SceneFields,
  type TokenColor,
} from '../domain/model'
import { propCategories, propLibrary, type PropCategory } from '../domain/props'
import { groundColors, tokenColorValues } from './palette'
import { PropIcon } from './prop-art'
import type { TableAudio } from '../audio/engine'

/** One glyph per table sound, so the keys read apart at a glance. */
/** About what the table shows at a readable size; longer cards shrink their type to fit. */
const storyFit = 900

/** A drawn glyph per ambience, so the choice reads without the word. */
const ambienceGlyphs = {
  none: VolumeX,
  dungeon: Castle,
  cave: Mountain,
  forest: TreePine,
  rain: CloudRain,
  storm: CloudLightning,
  campfire: Flame,
  tavern: Beer,
  sea: Waves,
} as const

const effectGlyphs = {
  door: DoorOpen,
  thunder: CloudLightning,
  gong: Bell,
  swords: Swords,
  coins: Coins,
}

const normalize = (value: string) =>
  value
    .toLocaleLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

// ---------------------------------------------------------------------------------------------
// Tokens (RYT-057)
// ---------------------------------------------------------------------------------------------

export function TokensPanel({
  campaignId,
  items,
  onPlace,
}: {
  campaignId: string
  items: readonly Item[]
  onPlace: (tokens: ItemPatch[]) => void
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const userId = state.user!.id
  const encounters = useQuery(encountersQuery(userId, campaignId))
  const list = (encounters.data ?? []).filter((e) => e.status !== 'ended')
  const live = list.find((e) => e.status === 'active' || e.status === 'initiative')
  const [chosen, setChosen] = useState<string | null>(null)
  const encounterId = chosen ?? live?.id ?? list[0]?.id ?? null
  const fight = useQuery({
    ...combatStateQuery(userId, campaignId, encounterId, false),
    enabled: Boolean(encounterId),
  })
  const index = useQuery(monsterIndexQuery())
  const sizes = useMemo(
    () => new Map((index.data?.monsters ?? []).map((m) => [m.id, m.size[0]!])),
    [index.data],
  )
  const placed = new Set(items.filter((i) => i.combatant_id).map((i) => i.combatant_id))
  const combatants = (fight.data?.combatants ?? []).filter((c) => c.kind !== 'lair')
  const tokenFor = (c: Combatant): ItemPatch => {
    const size = (c.srd_id ? sizes.get(c.srd_id) : undefined) ?? 'medium'
    const squares = sizeSquares[size]
    return {
      kind: 'token',
      w: squares,
      h: squares,
      label: c.name,
      hidden: Boolean(c.hidden),
      combatant_id: c.id,
      data: { size, ...(c.srd_id ? { srd_id: c.srd_id } : {}) },
    }
  }
  const unplacedEnemies = combatants.filter((c) => c.side === 'enemy' && !placed.has(c.id))
  const unplacedParty = combatants.filter((c) => c.side !== 'enemy' && !placed.has(c.id))
  const [name, setName] = useState('')
  const [color, setColor] = useState<TokenColor>('crimson')
  const [size, setSize] = useState<CreatureSize>('medium')
  return (
    <div className="tt-panel-body">
      <section className="tt-section" aria-labelledby="tt-fight">
        <h3 id="tt-fight" className="tt-section-title">
          {t('tabletop.tokens.fight')}
        </h3>
        {list.length === 0 ? (
          <p className="tt-note">{t('tabletop.tokens.noFight')}</p>
        ) : (
          <>
            <Select
              label={t('tabletop.tokens.encounter')}
              value={encounterId}
              onChange={setChosen}
              allowDeselect={false}
              data={list.map((e) => ({
                value: e.id,
                label: `${e.name} · ${t(`tabletop.tokens.status.${e.status}`)}`,
              }))}
              comboboxProps={{ zIndex: 420 }}
            />
            {encounterId && list.find((e) => e.id === encounterId)?.status === 'draft' && (
              <p className="tt-note">{t('tabletop.tokens.draftNote')}</p>
            )}
            <div className="tt-row">
              <Button
                variant="light"
                leftSection={<Plus size={18} aria-hidden="true" />}
                disabled={!unplacedEnemies.length}
                onClick={() => onPlace(unplacedEnemies.map(tokenFor))}
              >
                {t('tabletop.tokens.placeEnemies', { count: unplacedEnemies.length })}
              </Button>
              <Button
                variant="default"
                leftSection={<Users size={18} aria-hidden="true" />}
                disabled={!unplacedParty.length}
                onClick={() => onPlace(unplacedParty.map(tokenFor))}
              >
                {t('tabletop.tokens.placeParty', { count: unplacedParty.length })}
              </Button>
            </div>
            <ul className="tt-list">
              {combatants.map((c) => (
                <li key={c.id} className="tt-list-row">
                  <Token
                    name={c.name}
                    side={c.side}
                    imageKind={c.kind === 'character' ? 'character' : 'creature'}
                    path={c.image_path}
                    size={36}
                    hidden={c.hidden}
                  />
                  <span className="tt-list-name">
                    {c.name}
                    <span className="tt-list-meta">
                      {t(`combat.side.${c.side}`)}
                      {c.hidden ? ` · ${t('tabletop.token.hidden')}` : ''}
                    </span>
                  </span>
                  {placed.has(c.id) ? (
                    <span className="tt-placed">{t('tabletop.tokens.onMap')}</span>
                  ) : (
                    <Button
                      size="compact-md"
                      variant="subtle"
                      onClick={() => onPlace([tokenFor(c)])}
                      aria-label={t('tabletop.tokens.placeOne', { name: c.name })}
                    >
                      {t('tabletop.tokens.place')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section className="tt-section" aria-labelledby="tt-free">
        <h3 id="tt-free" className="tt-section-title">
          {t('tabletop.tokens.free')}
        </h3>
        <TextInput
          label={t('tabletop.token.name')}
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.currentTarget.value)}
        />
        <TileGroup
          legend={t('tabletop.token.color')}
          className="tt-tiles-compact"
          seal={false}
          value={color}
          onChange={setColor}
          options={tokenColors.map((c) => ({
            value: c,
            content: (
              <span className="tt-damage-tile">
                <span
                  className="tt-swatch"
                  style={{ background: tokenColorValues[c] }}
                  aria-hidden="true"
                />
                <span>{t(`tabletop.color.${c}`)}</span>
              </span>
            ),
          }))}
        />
        <SizeScale legend={t('tabletop.token.size')} value={size} onChange={setSize} />
        <Button
          disabled={!name.trim()}
          onClick={() => {
            const squares = sizeSquares[size]
            onPlace([
              { kind: 'token', w: squares, h: squares, label: name.trim(), data: { color, size } },
            ])
            setName('')
          }}
        >
          {t('tabletop.tokens.placeFree')}
        </Button>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Props (RYT-062)
// ---------------------------------------------------------------------------------------------

export function PropsPanel({
  chosen,
  onChoose,
  painted = true,
}: {
  chosen: string | null
  onChoose: (prop: string) => void
  /** The scene's look: pictures on painted maps, line drawings on ink maps. */
  painted?: boolean
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState<PropCategory | 'all'>('all')
  const q = normalize(query.trim())
  const shown = propLibrary.filter(
    (p) =>
      (category === 'all' || p.category === category) &&
      (!q || normalize(t(`tabletop.prop.${p.id}` as never)).includes(q) || p.id.includes(q)),
  )
  return (
    <div className="tt-panel-body">
      <TextInput
        label={t('tabletop.props.search')}
        leftSection={<Search size={18} aria-hidden="true" />}
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
      />
      <TileGroup
        legend={t('tabletop.props.category')}
        className="tt-tiles-compact"
        seal={false}
        value={category}
        onChange={setCategory}
        options={(['all', ...propCategories] as const).map((c) => ({
          value: c,
          content: <span>{t(`tabletop.props.cat.${c}`)}</span>,
        }))}
      />
      <p className="tt-note" aria-live="polite">
        {t('tabletop.props.count', { count: shown.length })}
      </p>
      <ul className="tt-prop-grid">
        {shown.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={`tt-prop-card ${chosen === p.id ? 'is-chosen' : ''}`}
              aria-pressed={chosen === p.id}
              onClick={() => onChoose(p.id)}
            >
              <PropIcon prop={p.id} w={p.w} h={p.h} size={44} painted={painted} />
              <span>{t(`tabletop.prop.${p.id}` as never)}</span>
            </button>
          </li>
        ))}
      </ul>
      {chosen && (
        <p className="tt-note">
          {t('tabletop.props.placing', { name: t(`tabletop.prop.${chosen}` as never) })}
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Story cards (RYT-060)
// ---------------------------------------------------------------------------------------------

export function StoryPanel({ campaignId, live }: { campaignId: string; live: Live }) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const library = useQuery(libraryQuery(state.user!.id, campaignId))
  const action = useTabletopAction(campaignId)
  const upload = useMediaUpload(campaignId)
  const [editing, setEditing] = useState<Card | 'new' | null>(null)
  const cards = library.data?.cards ?? []
  return (
    <div className="tt-panel-body">
      {editing ? (
        <CardForm
          campaignId={campaignId}
          card={editing === 'new' ? null : editing}
          busy={action.isPending || upload.isPending}
          onCancel={() => setEditing(null)}
          onSave={async (fields, file) => {
            let image_path = fields.image_path
            if (file)
              image_path = await upload.mutateAsync({
                kind: 'card',
                file: (await prepareImage(file, 2048)).blob,
              })
            await action.mutateAsync({
              kind: 'saveCard',
              cardId: editing === 'new' ? null : editing.id,
              fields: { ...fields, image_path },
            })
            setEditing(null)
          }}
        />
      ) : (
        <>
          <Button
            leftSection={<Plus size={18} aria-hidden="true" />}
            variant="light"
            onClick={() => setEditing('new')}
          >
            {t('tabletop.story.new')}
          </Button>
          {cards.length === 0 && <p className="tt-note">{t('tabletop.story.empty')}</p>}
          <ul className="tt-list">
            {cards.map((card) => {
              const shown = live.card_id === card.id
              return (
                <li key={card.id} className={`tt-card-row ${shown ? 'is-shown' : ''}`}>
                  <button type="button" className="tt-card-open" onClick={() => setEditing(card)}>
                    <span className="tt-card-title">{card.title}</span>
                    <span className="tt-card-excerpt">{card.body.slice(0, 90)}</span>
                  </button>
                  {shown && <span className="tt-placed">{t('tabletop.story.shown')}</span>}
                  <Button
                    size="compact-md"
                    variant={shown ? 'filled' : 'default'}
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate({ kind: 'live', patch: { card_id: shown ? null : card.id } })
                    }
                  >
                    {shown ? t('tabletop.story.hide') : t('tabletop.story.show')}
                  </Button>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </div>
  )
}

function CardForm({
  campaignId,
  card,
  busy,
  onCancel,
  onSave,
}: {
  campaignId: string
  card: Card | null
  busy: boolean
  onCancel: () => void
  onSave: (
    fields: { title: string; body: string; image_path: string | null },
    file: File | null,
  ) => Promise<void>
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const [title, setTitle] = useState(card?.title ?? '')
  const [body, setBody] = useState(card?.body ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [imagePath, setImagePath] = useState(card?.image_path ?? null)
  const [error, setError] = useState(false)
  const image = useQuery(mediaQuery(state.user!.id, imagePath))
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  return (
    <form
      className="tt-form"
      onSubmit={(e) => {
        e.preventDefault()
        setError(false)
        onSave({ title: title.trim(), body, image_path: imagePath }, file).catch(() =>
          setError(true),
        )
      }}
    >
      <TextInput
        label={t('tabletop.story.title')}
        value={title}
        required
        maxLength={80}
        onChange={(e) => setTitle(e.currentTarget.value)}
        data-autofocus
      />
      <Textarea
        label={t('tabletop.story.body')}
        description={
          body.length > storyFit ? t('tabletop.story.longHint') : t('tabletop.story.bodyHelp')
        }
        value={body}
        maxLength={4000}
        autosize
        minRows={4}
        maxRows={12}
        onChange={(e) => setBody(e.currentTarget.value)}
      />
      <div className="tt-row">
        {(preview || image.data) && (
          <img src={preview ?? image.data} alt="" className="tt-card-thumb" />
        )}
        <FileButton onChange={setFile} accept="image/webp,image/png,image/jpeg">
          {(props) => (
            <Button
              {...props}
              variant="default"
              leftSection={<ImageUp size={18} aria-hidden="true" />}
            >
              {imagePath || file ? t('tabletop.story.changeImage') : t('tabletop.story.addImage')}
            </Button>
          )}
        </FileButton>
        {(imagePath || file) && (
          <button
            type="button"
            className="tt-text-action"
            onClick={() => {
              setFile(null)
              setImagePath(null)
            }}
          >
            {t('tabletop.story.removeImage')}
          </button>
        )}
      </div>
      {error && (
        <p className="tt-error" role="alert">
          {t('tabletop.error.save')}
        </p>
      )}
      <div className="tt-row">
        <Button type="submit" disabled={!title.trim() || busy} loading={busy}>
          {t('tabletop.story.save')}
        </Button>
        <Button variant="subtle" onClick={onCancel}>
          {t('tabletop.cancel')}
        </Button>
        {card && <DeleteCard campaignId={campaignId} id={card.id} onDone={onCancel} />}
      </div>
    </form>
  )
}

function DeleteCard({
  campaignId,
  id,
  onDone,
}: {
  campaignId: string
  id: string
  onDone: () => void
}) {
  const { t } = useTranslation()
  const action = useTabletopAction(campaignId)
  const [confirm, setConfirm] = useState(false)
  return confirm ? (
    <Button
      color="red"
      variant="light"
      leftSection={<Trash2 size={18} aria-hidden="true" />}
      onClick={() => action.mutate({ kind: 'deleteCard', cardId: id }, { onSuccess: onDone })}
    >
      {t('tabletop.story.confirmDelete')}
    </Button>
  ) : (
    <Button color="red" variant="subtle" onClick={() => setConfirm(true)}>
      {t('tabletop.story.delete')}
    </Button>
  )
}

// ---------------------------------------------------------------------------------------------
// Audio (RYT-061)
// ---------------------------------------------------------------------------------------------

export function AudioPanel({
  campaignId,
  live,
  listenHere,
  onListenHere,
  engine,
}: {
  campaignId: string
  live: Live
  listenHere: boolean
  onListenHere: (value: boolean) => void
  engine: TableAudio
}) {
  const { t, i18n } = useTranslation()
  const percent = new Intl.NumberFormat(i18n.language, { style: 'percent' })
  const { state } = useAuth()
  const library = useQuery(libraryQuery(state.user!.id, campaignId))
  const action = useTabletopAction(campaignId)
  const upload = useMediaUpload(campaignId)
  const [volume, setVolume] = useState(live.volume)
  const [base, setBase] = useState(live.volume)
  const [error, setError] = useState<string | null>(null)
  if (base !== live.volume) {
    setBase(live.volume)
    setVolume(live.volume)
  }
  const send = (patch: Parameters<typeof action.mutate>[0]) => action.mutate(patch)
  const tracks = library.data?.tracks ?? []
  const nowPlaying = live.playing
    ? live.ambience
      ? t(`tabletop.ambience.${live.ambience}`)
      : tracks.find((x) => x.id === live.track_id)?.title
    : null
  return (
    <div className="tt-panel-body">
      <p className="tt-now" aria-live="polite">
        <Volume2 size={18} aria-hidden="true" />
        {nowPlaying
          ? t('tabletop.audio.playing', { name: nowPlaying })
          : t('tabletop.audio.silent')}
      </p>
      <TileGroup
        legend={t('tabletop.audio.ambience')}
        className="tt-ambience-tiles"
        value={live.playing && live.ambience ? live.ambience : ('none' as const)}
        onChange={(value) =>
          send({
            kind: 'live',
            patch:
              value === 'none'
                ? { ambience: null, playing: Boolean(live.track_id) && live.playing }
                : { ambience: value, track_id: null, playing: true },
          })
        }
        options={(['none', ...ambiences] as const).map((a) => {
          const Glyph = ambienceGlyphs[a]
          return {
            value: a,
            content: (
              <span className="tt-ambience-tile">
                <Glyph size={20} aria-hidden="true" />
                <span>{a === 'none' ? t('tabletop.audio.none') : t(`tabletop.ambience.${a}`)}</span>
              </span>
            ),
          }
        })}
      />
      <fieldset className="tt-fieldset">
        <legend>{t('tabletop.audio.effects')}</legend>
        <div className="tt-effects">
          {soundEffects.map((s) => (
            <button
              key={s}
              type="button"
              className="tt-effect"
              onClick={() => {
                send({ kind: 'live', patch: { sound: s } })
                if (listenHere) engine.playEffect(s)
              }}
            >
              {(() => {
                const Glyph = effectGlyphs[s]
                return <Glyph size={16} aria-hidden="true" className="tt-effect-glyph" />
              })()}
              {t(`tabletop.effect.${s}`)}
            </button>
          ))}
        </div>
      </fieldset>
      <Slider
        thumbLabel={t('tabletop.audio.volume')}
        label={(v) => percent.format(v / 100)}
        value={volume}
        min={0}
        max={100}
        step={5}
        onChange={setVolume}
        onChangeEnd={(v) => send({ kind: 'live', patch: { volume: v } })}
        className="tt-volume"
      />
      <p className="tt-slider-label">
        {t('tabletop.audio.volumeValue', { value: percent.format(volume / 100) })}
      </p>
      <Switch
        label={t('tabletop.audio.loop')}
        checked={live.loop}
        onChange={(e) => send({ kind: 'live', patch: { loop: e.currentTarget.checked } })}
      />
      <Switch
        label={t('tabletop.audio.listenHere')}
        description={t('tabletop.audio.listenHelp')}
        checked={listenHere}
        onChange={(e) => onListenHere(e.currentTarget.checked)}
      />
      <section className="tt-section" aria-labelledby="tt-tracks">
        <h3 id="tt-tracks" className="tt-section-title">
          {t('tabletop.audio.tracks')}
        </h3>
        {tracks.length === 0 && <p className="tt-note">{t('tabletop.audio.noTracks')}</p>}
        <ul className="tt-list">
          {tracks.map((track) => {
            const playing = live.playing && live.track_id === track.id
            return (
              <li key={track.id} className="tt-list-row">
                <Music size={18} aria-hidden="true" />
                <span className="tt-list-name">
                  {track.title}
                  {track.size_bytes ? (
                    <span className="tt-list-meta">
                      {t('tabletop.audio.size', {
                        mb: new Intl.NumberFormat(i18n.language, {
                          maximumFractionDigits: 1,
                        }).format(track.size_bytes / 1048576),
                      })}
                    </span>
                  ) : null}
                </span>
                <Button
                  size="compact-md"
                  variant="subtle"
                  leftSection={
                    playing ? (
                      <Square size={14} aria-hidden="true" />
                    ) : (
                      <Play size={14} aria-hidden="true" />
                    )
                  }
                  onClick={() =>
                    send({
                      kind: 'live',
                      patch: playing
                        ? { playing: false }
                        : { track_id: track.id, ambience: null, playing: true },
                    })
                  }
                  aria-label={t(playing ? 'tabletop.audio.stopNamed' : 'tabletop.audio.playNamed', {
                    name: track.title,
                  })}
                >
                  {playing ? t('tabletop.audio.stop') : t('tabletop.audio.play')}
                </Button>
                <button
                  type="button"
                  className="tt-icon-button"
                  aria-label={t('tabletop.audio.deleteNamed', { name: track.title })}
                  onClick={() => send({ kind: 'deleteTrack', trackId: track.id, path: track.path })}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
        <FileButton
          accept="audio/mpeg,audio/ogg,audio/mp4,audio/webm,audio/x-m4a"
          onChange={async (file) => {
            if (!file) return
            setError(null)
            const mime = file.type === 'audio/x-m4a' ? 'audio/mp4' : file.type
            if (file.size > mediaLimit) return setError(t('tabletop.audio.tooLarge'))
            try {
              const typed = new Blob([file], { type: mime })
              const path = await upload.mutateAsync({ kind: 'audio', file: typed })
              await action.mutateAsync({
                kind: 'addTrack',
                title: file.name.replace(/\.[^.]+$/, '').slice(0, 80) || 'Track',
                path,
                mime,
                size: file.size,
              })
            } catch {
              setError(t('tabletop.audio.uploadFailed'))
            }
          }}
        >
          {(props) => (
            <Button
              {...props}
              variant="default"
              leftSection={<Upload size={18} aria-hidden="true" />}
              loading={upload.isPending}
            >
              {t('tabletop.audio.upload')}
            </Button>
          )}
        </FileButton>
        {error && (
          <p className="tt-error" role="alert">
            {error}
          </p>
        )}
      </section>
    </div>
  )
}

// ---------------------------------------------------------------------------------------------
// Scene (RYT-055/059)
// ---------------------------------------------------------------------------------------------

export function ScenePanel({
  campaignId,
  scene,
  onDeleted,
}: {
  campaignId: string
  scene: Scene
  onDeleted: () => void
}) {
  const { t } = useTranslation()
  const action = useTabletopAction(campaignId)
  const [confirm, setConfirm] = useState(false)
  const save = (fields: SceneFields) =>
    action.mutate({ kind: 'saveScene', sceneId: scene.id, fields, revision: scene.revision })
  const [name, setName] = useState(scene.name)
  const [across, setAcross] = useState(
    scene.map_width ? Math.round(scene.map_width / scene.cell_px) : scene.cols,
  )
  return (
    <div className="tt-panel-body">
      <TextInput
        label={t('tabletop.scene.name')}
        value={name}
        maxLength={80}
        onChange={(e) => setName(e.currentTarget.value)}
        onBlur={() => name.trim() && name.trim() !== scene.name && save({ name: name.trim() })}
      />
      <p className="tt-note">
        {t(`tabletop.scene.kind.${scene.map_kind}`)} ·{' '}
        {t('tabletop.scene.size', { cols: scene.cols, rows: scene.rows })}
      </p>
      {scene.map_kind === 'blank' ? (
        <TileGroup
          legend={t('tabletop.scene.ground')}
          className="tt-tiles-compact"
          seal={false}
          value={scene.ground}
          onChange={(ground) => save({ ground })}
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
      ) : (
        scene.map_kind === 'upload' && (
          <fieldset className="tt-fieldset">
            <legend>{t('tabletop.scene.align')}</legend>
            <TextInput
              type="number"
              label={t('tabletop.scene.across')}
              description={t('tabletop.scene.acrossHelp')}
              value={String(across)}
              min={4}
              max={120}
              onChange={(e) => setAcross(Number(e.currentTarget.value))}
              onBlur={() => {
                if (!scene.map_width || !scene.map_height || !across || across < 4 || across > 120)
                  return
                const cell = scene.map_width / across
                save({
                  cell_px: Number(cell.toFixed(3)),
                  cols: across,
                  rows: Math.max(4, Math.min(120, Math.floor(scene.map_height / cell))),
                })
              }}
            />
            <div className="tt-row">
              {(['left', 'right', 'up', 'down'] as const).map((dir) => (
                <Button
                  key={dir}
                  variant="default"
                  size="compact-md"
                  onClick={() => {
                    const step = scene.cell_px / 8
                    save(
                      dir === 'left' || dir === 'right'
                        ? {
                            offset_x: Number(
                              (scene.offset_x + (dir === 'left' ? step : -step)).toFixed(3),
                            ),
                          }
                        : {
                            offset_y: Number(
                              (scene.offset_y + (dir === 'up' ? step : -step)).toFixed(3),
                            ),
                          },
                    )
                  }}
                >
                  {t(`tabletop.scene.nudge.${dir}`)}
                </Button>
              ))}
            </div>
          </fieldset>
        )
      )}
      <Switch
        label={t('tabletop.scene.grid')}
        checked={scene.grid_visible}
        onChange={(e) => save({ grid_visible: e.currentTarget.checked })}
      />
      <Switch
        label={t('tabletop.fog.enabled')}
        description={t('tabletop.fog.help')}
        checked={scene.fog_enabled}
        onChange={(e) => save({ fog_enabled: e.currentTarget.checked })}
      />
      {action.isError && (
        <p className="tt-error" role="alert">
          {t('tabletop.error.save')}
        </p>
      )}
      <div className="tt-danger-zone">
        {confirm ? (
          <>
            <p className="tt-note">{t('tabletop.scene.deleteWarning')}</p>
            <div className="tt-row">
              <Button
                color="red"
                variant="light"
                onClick={() =>
                  action.mutate(
                    { kind: 'deleteScene', sceneId: scene.id },
                    { onSuccess: onDeleted },
                  )
                }
              >
                {t('tabletop.scene.confirmDelete')}
              </Button>
              <Button variant="subtle" onClick={() => setConfirm(false)}>
                {t('tabletop.cancel')}
              </Button>
            </div>
          </>
        ) : (
          <Button
            color="red"
            variant="subtle"
            leftSection={<Trash2 size={18} aria-hidden="true" />}
            onClick={() => setConfirm(true)}
          >
            {t('tabletop.scene.delete')}
          </Button>
        )}
      </div>
    </div>
  )
}
