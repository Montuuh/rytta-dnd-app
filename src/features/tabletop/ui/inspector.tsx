import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Button, Select, Switch, Textarea, TextInput } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Crosshair, Move, RotateCcw, RotateCw, Sparkles, Trash2, X } from 'lucide-react'
import { SizeScale, TileGroup, type Combatant } from '@/features/combat'
import { areaCells, caughtTokens, sizeSquares } from '../domain/geometry'
import {
  ambiences,
  doorStates,
  roomNumbers,
  soundEffects,
  tokenColors,
  type Card,
  type CreatureSize,
  type EventActions,
  type Item,
  type ItemOf,
  type ItemPatch,
  type Scene,
} from '../domain/model'
import { propById } from '../domain/props'
import { paintedScene, tokenColorValues } from './palette'
import { PropIcon } from './prop-art'
import { AreaOptions } from './kit'

interface InspectorProps {
  item: Item
  scene: Scene
  items: readonly Item[]
  cards: readonly Card[]
  combatant?: Combatant
  busy: boolean
  onPatch: (patch: ItemPatch) => void
  onDelete: () => void
  /** Waits for the square the item goes to: the alternative to dragging it. */
  onMove: () => void
  onClose: () => void
  onFire: (reset: boolean) => void
  onCenterTable: () => void
}

/** The selected item: its name, state and settings, saved as the DM changes them. */
export function Inspector(props: InspectorProps) {
  const { t } = useTranslation()
  const { item } = props
  const title =
    item.kind === 'token'
      ? (props.combatant?.name ?? item.label ?? t('tabletop.token.untitled'))
      : item.kind === 'prop'
        ? t(`tabletop.prop.${item.data.prop}` as never, { defaultValue: item.data.prop })
        : item.kind === 'door'
          ? t('tabletop.door.title', { state: t(`tabletop.door.${item.data.state}`) })
          : item.label || t(`tabletop.kind.${item.kind}`)
  return (
    <section className="tt-inspector" aria-labelledby={`inspect-${item.id}`}>
      <header className="tt-inspector-head">
        <div>
          <p className="tt-inspector-kind">{t(`tabletop.kind.${item.kind}`)}</p>
          <h2 id={`inspect-${item.id}`} className="tt-inspector-title" tabIndex={-1}>
            {title}
          </h2>
        </div>
        <button
          type="button"
          className="tt-icon-button"
          onClick={props.onClose}
          aria-label={t('tabletop.inspector.close')}
        >
          <X size={20} aria-hidden="true" />
        </button>
      </header>
      <div className="tt-inspector-body">
        {item.kind === 'token' && <TokenFields {...props} item={item} />}
        {item.kind === 'prop' && <PropFields {...props} item={item} />}
        {item.kind === 'door' && <DoorFields {...props} item={item} />}
        {item.kind === 'note' && <NoteFields {...props} item={item} />}
        {item.kind === 'event' && <EventFields {...props} item={item} />}
        {item.kind === 'area' && <AreaFields {...props} item={item} />}
        {(item.kind === 'token' || item.kind === 'prop' || item.kind === 'area') && (
          <Switch
            label={t('tabletop.inspector.hidden')}
            description={t('tabletop.inspector.hiddenHelp')}
            checked={Boolean(item.hidden)}
            onChange={(e) => props.onPatch({ id: item.id, hidden: e.currentTarget.checked })}
          />
        )}
        {(item.kind === 'token' || item.kind === 'prop') && (
          <Switch
            label={t('tabletop.inspector.locked')}
            checked={Boolean(item.locked)}
            onChange={(e) => props.onPatch({ id: item.id, locked: e.currentTarget.checked })}
          />
        )}
      </div>
      <footer className="tt-inspector-foot">
        {item.kind !== 'note' && item.kind !== 'event' && (
          <Button
            variant="subtle"
            leftSection={<Move size={18} aria-hidden="true" />}
            onClick={props.onMove}
            disabled={Boolean(item.locked)}
          >
            {t('tabletop.inspector.move')}
          </Button>
        )}
        <Button
          variant="subtle"
          leftSection={<Crosshair size={18} aria-hidden="true" />}
          onClick={props.onCenterTable}
        >
          {t('tabletop.inspector.centerTable')}
        </Button>
        <Button
          variant="subtle"
          color="red"
          leftSection={<Trash2 size={18} aria-hidden="true" />}
          onClick={props.onDelete}
          disabled={props.busy}
        >
          {t('tabletop.inspector.remove')}
        </Button>
      </footer>
    </section>
  )
}

/** A text field that saves when it loses focus or on Enter. */
function SavedText({
  label,
  value,
  onSave,
  multiline = false,
  maxLength,
  description,
}: {
  label: ReactNode
  value: string
  onSave: (value: string) => void
  multiline?: boolean
  maxLength: number
  description?: ReactNode
}) {
  const [draft, setDraft] = useState(value)
  const [base, setBase] = useState(value)
  if (value !== base) {
    setBase(value)
    setDraft(value)
  }
  const save = () => {
    if (draft !== value) onSave(draft)
  }
  return multiline ? (
    <Textarea
      label={label}
      description={description}
      value={draft}
      maxLength={maxLength}
      autosize
      minRows={3}
      maxRows={10}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={save}
    />
  ) : (
    <TextInput
      label={label}
      description={description}
      value={draft}
      maxLength={maxLength}
      onChange={(e) => setDraft(e.currentTarget.value)}
      onBlur={save}
      onKeyDown={(e) => {
        if (e.key === 'Enter') save()
      }}
    />
  )
}

function TokenFields({ item, combatant, onPatch }: InspectorProps & { item: ItemOf<'token'> }) {
  const { t } = useTranslation()
  const size = (item.data.size ?? 'medium') as CreatureSize
  return (
    <>
      {combatant ? (
        <p className="tt-note">{t('tabletop.token.linked', { name: combatant.name })}</p>
      ) : (
        <SavedText
          label={t('tabletop.token.name')}
          value={item.label ?? ''}
          maxLength={80}
          onSave={(label) => onPatch({ id: item.id, label })}
        />
      )}
      <SizeScale
        legend={t('tabletop.token.size')}
        value={size}
        onChange={(next) => {
          const squares = sizeSquares[next]
          onPatch({ id: item.id, w: squares, h: squares, data: { ...item.data, size: next } })
        }}
      />
      {!combatant && (
        <TileGroup
          legend={t('tabletop.token.color')}
          className="tt-tiles-compact"
          seal={false}
          value={item.data.color ?? 'amber'}
          onChange={(color) => onPatch({ id: item.id, data: { ...item.data, color } })}
          options={tokenColors.map((color) => ({
            value: color,
            content: (
              <span className="tt-damage-tile">
                <span
                  className="tt-swatch"
                  style={{ background: tokenColorValues[color] }}
                  aria-hidden="true"
                />
                <span>{t(`tabletop.color.${color}`)}</span>
              </span>
            ),
          }))}
        />
      )}
    </>
  )
}

function PropFields({ item, scene, onPatch }: InspectorProps & { item: ItemOf<'prop'> }) {
  const { t } = useTranslation()
  const definition = propById.get(item.data.prop)
  const rotate = (by: number) => {
    const rotation = (item.rotation + by + 360) % 360
    // Long props turn their footprint; square props turn their drawing.
    if (item.w !== item.h && Math.abs(by) === 90)
      onPatch({ id: item.id, rotation, w: item.h, h: item.w })
    else onPatch({ id: item.id, rotation })
  }
  return (
    <>
      <div className="tt-prop-preview">
        <PropIcon
          prop={item.data.prop}
          w={definition?.w ?? item.w}
          h={definition?.h ?? item.h}
          size={56}
          painted={paintedScene(scene)}
        />
      </div>
      <div className="tt-row">
        <Button
          variant="default"
          leftSection={<RotateCcw size={18} aria-hidden="true" />}
          onClick={() => rotate(-90)}
        >
          {t('tabletop.prop.rotateLeft')}
        </Button>
        <Button
          variant="default"
          leftSection={<RotateCw size={18} aria-hidden="true" />}
          onClick={() => rotate(90)}
        >
          {t('tabletop.prop.rotateRight')}
        </Button>
      </div>
      <TileGroup
        legend={t('tabletop.prop.scale')}
        className="tt-tiles-compact"
        seal={false}
        value={
          String(
            Math.round(((item.rotation % 180 !== 0 ? item.h : item.w) / (definition?.w ?? 1)) * 2) /
              2,
          ) as '1' | '2' | '3'
        }
        onChange={(factor) => {
          const k = Number(factor)
          // A long prop turned a quarter keeps its turned footprint.
          const quarter = item.rotation % 180 !== 0
          const [w, h] = quarter
            ? [definition?.h ?? 1, definition?.w ?? 1]
            : [definition?.w ?? 1, definition?.h ?? 1]
          onPatch({ id: item.id, w: w * k, h: h * k })
        }}
        options={(['1', '2', '3'] as const).map((k) => ({
          value: k,
          content: <span>{t('tabletop.prop.times', { count: Number(k) })}</span>,
        }))}
      />
    </>
  )
}

function DoorFields({ item, scene, onPatch }: InspectorProps & { item: ItemOf<'door'> }) {
  const { t, i18n } = useTranslation()
  const numbers = roomNumbers(scene.rooms ?? [])
  const revealed = (item.data.rooms ?? []).flatMap((id) => {
    const number = numbers.get(id)
    return number
      ? [t(number.passage ? 'tabletop.room.passage' : 'tabletop.room.name', { n: number.n })]
      : []
  })
  return (
    <>
      <TileGroup
        legend={t('tabletop.door.state')}
        className="tt-tiles-compact"
        value={item.data.state}
        onChange={(state) => onPatch({ id: item.id, data: { ...item.data, state } })}
        options={doorStates.map((state) => ({
          value: state,
          content: <span className="tt-cap">{t(`tabletop.door.${state}`)}</span>,
        }))}
      />
      <Switch
        label={t('tabletop.door.secret')}
        description={t('tabletop.door.secretHelp')}
        checked={Boolean(item.data.secret)}
        onChange={(e) =>
          onPatch({ id: item.id, data: { ...item.data, secret: e.currentTarget.checked } })
        }
      />
      {revealed.length > 0 && (
        <p className="tt-note">
          {t('tabletop.door.revealsNamed', {
            count: revealed.length,
            list: new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(revealed),
          })}
        </p>
      )}
    </>
  )
}

function NoteFields({ item, onPatch }: InspectorProps & { item: ItemOf<'note'> }) {
  const { t } = useTranslation()
  return (
    <>
      <SavedText
        label={t('tabletop.note.title')}
        value={item.label ?? ''}
        maxLength={80}
        onSave={(label) => onPatch({ id: item.id, label })}
      />
      <SavedText
        label={t('tabletop.note.text')}
        description={t('tabletop.note.private')}
        value={item.secret?.text ?? ''}
        multiline
        maxLength={4000}
        onSave={(text) => onPatch({ id: item.id, secret: { text } })}
      />
    </>
  )
}

function EventFields({
  item,
  scene,
  cards,
  onPatch,
  onFire,
  busy,
}: InspectorProps & { item: ItemOf<'event'> }) {
  const { t, i18n } = useTranslation()
  const actions: EventActions = item.secret?.actions ?? {}
  // Firing swaps "Activate" for "Reset" (and back): the focus moves to the key that replaces the
  // one pressed, so the keyboard stays in the inspector instead of falling to the page.
  const head = useRef<HTMLDivElement>(null)
  const handoff = useRef(false)
  const fired = Boolean(item.data.fired)
  useEffect(() => {
    if (busy || !handoff.current) return
    handoff.current = false
    head.current?.querySelector<HTMLButtonElement>('button')?.focus()
  }, [busy, fired])
  const fire = (reset: boolean) => {
    handoff.current = true
    onFire(reset)
  }
  const save = (next: EventActions) => {
    const clean = Object.fromEntries(
      Object.entries(next).filter(
        ([, v]) => v !== undefined && v !== null && v !== '' && v !== false && v !== 0,
      ),
    )
    onPatch({ id: item.id, secret: { ...(item.secret ?? {}), actions: clean } })
  }
  const rooms = scene.rooms ?? []
  const numbers = roomNumbers(rooms)
  const revealed = actions.reveal_room ? numbers.get(actions.reveal_room) : undefined
  const card = cards.find((c) => c.id === actions.card_id)
  const parts = [
    revealed
      ? t(revealed.passage ? 'tabletop.event.does.passage' : 'tabletop.event.does.room', {
          n: revealed.n,
        })
      : '',
    actions.reveal_radius
      ? t('tabletop.event.does.radius', {
          feet: t('tabletop.measure.feet', { count: actions.reveal_radius * 5 }),
        })
      : '',
    actions.show_hidden ? t('tabletop.event.does.hidden') : '',
    card ? t('tabletop.event.does.card', { title: card.title }) : '',
    actions.ambience
      ? t('tabletop.event.does.ambience', { name: t(`tabletop.ambience.${actions.ambience}`) })
      : '',
    actions.sound
      ? t('tabletop.event.does.sound', { name: t(`tabletop.effect.${actions.sound}`) })
      : '',
  ].filter(Boolean)
  const list = new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(parts)
  return (
    <>
      <div className="tt-event-head" ref={head}>
        {fired ? (
          <div className="tt-fired">
            <span className="tt-seal is-struck" aria-hidden="true">
              <Sparkles size={16} />
            </span>
            <span>{t('tabletop.event.fired')}</span>
            <button
              type="button"
              className="tt-text-action"
              onClick={() => fire(true)}
              disabled={busy}
            >
              {t('tabletop.event.reset')}
            </button>
          </div>
        ) : (
          <Button
            leftSection={<Sparkles size={18} aria-hidden="true" />}
            onClick={() => fire(false)}
            disabled={busy}
          >
            {t('tabletop.event.fire')}
          </Button>
        )}
        <p className="tt-event-summary">
          {parts.length ? t('tabletop.event.summary', { list }) : t('tabletop.event.nothing')}
        </p>
      </div>
      <SavedText
        label={t('tabletop.event.title')}
        value={item.label ?? ''}
        maxLength={80}
        onSave={(label) => onPatch({ id: item.id, label })}
      />
      <SavedText
        label={t('tabletop.event.text')}
        description={t('tabletop.note.private')}
        value={item.secret?.text ?? ''}
        multiline
        maxLength={4000}
        onSave={(text) => onPatch({ id: item.id, secret: { ...(item.secret ?? {}), text } })}
      />
      <details className="tt-disclosure" open={parts.length === 0}>
        <summary>{t('tabletop.event.settings')}</summary>
        <div className="tt-disclosure-body">
          {rooms.length > 0 && (
            <Select
              label={t('tabletop.event.revealRoom')}
              clearable
              value={actions.reveal_room ?? null}
              onChange={(room) => save({ ...actions, reveal_room: room ?? undefined })}
              searchable
              classNames={{ option: 'tt-select-option' }}
              data={[false, true]
                .map((passage) => ({
                  group: t(passage ? 'tabletop.room.passages' : 'tabletop.room.rooms'),
                  items: rooms
                    .filter((room) => numbers.get(room.id)!.passage === passage)
                    .map((room) => ({
                      value: room.id,
                      label: t(passage ? 'tabletop.room.passage' : 'tabletop.room.name', {
                        n: numbers.get(room.id)!.n,
                      }),
                    })),
                }))
                .filter((g) => g.items.length > 0)}
              comboboxProps={{ zIndex: 420 }}
            />
          )}
          <Select
            label={t('tabletop.event.revealRadius')}
            value={String(actions.reveal_radius ?? 0)}
            onChange={(r) => save({ ...actions, reveal_radius: Number(r ?? 0) || undefined })}
            data={['0', '2', '4', '6', '8', '12'].map((r) => ({
              value: r,
              label:
                r === '0'
                  ? t('tabletop.event.none')
                  : t('tabletop.measure.feet', { count: Number(r) * 5 }),
            }))}
            comboboxProps={{ zIndex: 420 }}
          />
          <Switch
            label={t('tabletop.event.showHidden')}
            checked={Boolean(actions.show_hidden)}
            onChange={(e) => save({ ...actions, show_hidden: e.currentTarget.checked })}
          />
          <Select
            label={t('tabletop.event.card')}
            clearable
            value={actions.card_id ?? null}
            onChange={(card) => save({ ...actions, card_id: card ?? undefined })}
            data={cards.map((card) => ({ value: card.id, label: card.title }))}
            placeholder={cards.length ? undefined : t('tabletop.event.noCards')}
            disabled={!cards.length}
            comboboxProps={{ zIndex: 420 }}
          />
          <Select
            label={t('tabletop.event.ambience')}
            clearable
            value={actions.ambience ?? null}
            onChange={(ambience) =>
              save({ ...actions, ambience: (ambience ?? undefined) as EventActions['ambience'] })
            }
            data={ambiences.map((a) => ({ value: a, label: t(`tabletop.ambience.${a}`) }))}
            comboboxProps={{ zIndex: 420 }}
          />
          <Select
            label={t('tabletop.event.sound')}
            clearable
            value={actions.sound ?? null}
            onChange={(sound) =>
              save({ ...actions, sound: (sound ?? undefined) as EventActions['sound'] })
            }
            data={soundEffects.map((s) => ({ value: s, label: t(`tabletop.effect.${s}`) }))}
            comboboxProps={{ zIndex: 420 }}
          />
        </div>
      </details>
    </>
  )
}

function AreaFields({ item, scene, items, onPatch }: InspectorProps & { item: ItemOf<'area'> }) {
  const { t } = useTranslation()
  const settings = {
    shape: item.data.shape,
    size: item.data.size_ft,
    width: item.data.width_ft ?? 5,
    damage: item.data.damage ?? 'force',
    label: item.label ?? '',
  }
  const caught = caughtTokens(
    areaCells(
      { data: item.data, x: item.x, y: item.y, w: item.w, h: item.h },
      scene.cols,
      scene.rows,
    ),
    items,
  )
  return (
    <>
      <SavedText
        label={t('tabletop.area.label')}
        value={item.label ?? ''}
        maxLength={80}
        onSave={(label) => onPatch({ id: item.id, label })}
      />
      <AreaOptions
        value={settings}
        onChange={(next) =>
          onPatch({
            id: item.id,
            data: {
              ...item.data,
              shape: next.shape,
              size_ft: next.size,
              width_ft: next.width,
              damage: next.damage,
            },
          })
        }
      />
      <CaughtList items={caught} />
    </>
  )
}

export function CaughtList({
  items,
  compact = false,
}: {
  items: readonly Item[]
  /** One line for the placement bar: the count and the names. */
  compact?: boolean
}) {
  const { t, i18n } = useTranslation()
  if (compact)
    return (
      <div className="tt-caught is-compact" aria-live="polite">
        <p className="tt-caught-title">{t('tabletop.area.caught', { count: items.length })}</p>
        {items.length > 0 && (
          <p className="tt-caught-names">
            {new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(
              items.map((i) => i.label ?? t('tabletop.token.untitled')),
            )}
          </p>
        )}
      </div>
    )
  return (
    <div className="tt-caught" aria-live="polite">
      <p className="tt-caught-title">{t('tabletop.area.caught', { count: items.length })}</p>
      {items.length > 0 && (
        <ul>
          {items.map((i) => (
            <li key={i.id}>{i.label ?? t('tabletop.token.untitled')}</li>
          ))}
        </ul>
      )}
      <p className="tt-convention">{t('tabletop.area.convention')}</p>
    </div>
  )
}
