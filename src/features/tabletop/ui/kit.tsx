import { useRef, type KeyboardEvent, type ReactNode } from 'react'
import { Menu, Select, Switch } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { Ellipsis } from 'lucide-react'
import { NumberDial, TileGroup } from '@/features/combat'
import { areaShapes, damageTypes } from '../domain/model'
import { measurePath, type Point } from '../domain/geometry'
import {
  phoneTools,
  toolIcons,
  toolKeys,
  tools,
  type AreaSettings,
  type FogSettings,
  type Tool,
} from './tools'
import { damageColors } from './palette'

/**
 * The cartographer's kit: one radio group of square keys (glyph, word and the key letter engraved
 * in a corner). Arrows, Home and End move the choice; letters work from anywhere in the editor.
 */
export function ToolKit({
  tool,
  onChange,
  variant,
}: {
  tool: Tool
  onChange: (tool: Tool) => void
  /** A column beside the board, a row under it (portrait tablets) or a phone tray with "More". */
  variant: 'rail' | 'row' | 'tray'
}) {
  const { t } = useTranslation()
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const tray = variant === 'tray'
  const visible = tray ? phoneTools : tools
  const extra = tray ? tools.filter((x) => !phoneTools.includes(x)) : []
  const move = (event: KeyboardEvent, index: number) => {
    const last = visible.length - 1
    const next =
      event.key === 'ArrowDown' || event.key === 'ArrowRight'
        ? index === last
          ? 0
          : index + 1
        : event.key === 'ArrowUp' || event.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? last
              : null
    if (next === null) return
    event.preventDefault()
    onChange(visible[next]!)
    refs.current[next]?.focus()
  }
  return (
    <div className={`tt-kit is-${variant}`} role="radiogroup" aria-label={t('tabletop.kit.label')}>
      {visible.map((key, index) => {
        const Icon = toolIcons[key]
        const checked = tool === key
        return (
          <button
            key={key}
            ref={(el) => {
              refs.current[index] = el
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={checked || (!visible.includes(tool) && index === 0) ? 0 : -1}
            className={`tt-key ${checked ? 'is-active' : ''}`}
            onClick={() => onChange(key)}
            onKeyDown={(event) => move(event, index)}
            aria-keyshortcuts={toolKeys[key].toUpperCase()}
          >
            <Icon size={20} aria-hidden="true" />
            <span className="tt-key-word">{t(`tabletop.tool.${key}`)}</span>
            <span className="tt-key-letter" aria-hidden="true">
              {toolKeys[key].toUpperCase()}
            </span>
          </button>
        )
      })}
      {extra.length > 0 && (
        <Menu position="top-end" withinPortal>
          <Menu.Target>
            <button
              type="button"
              className={`tt-key ${extra.includes(tool) ? 'is-active' : ''}`}
              aria-label={
                extra.includes(tool)
                  ? t('tabletop.kit.moreActive', { tool: t(`tabletop.tool.${tool}`) })
                  : t('tabletop.kit.more')
              }
            >
              {(() => {
                const Icon = extra.includes(tool) ? toolIcons[tool] : Ellipsis
                return <Icon size={20} aria-hidden="true" />
              })()}
              <span className="tt-key-word">
                {extra.includes(tool) ? t(`tabletop.tool.${tool}`) : t('tabletop.kit.moreShort')}
              </span>
            </button>
          </Menu.Target>
          <Menu.Dropdown>
            {extra.map((key) => {
              const Icon = toolIcons[key]
              return (
                <Menu.Item
                  key={key}
                  leftSection={<Icon size={18} aria-hidden="true" />}
                  onClick={() => onChange(key)}
                >
                  {t(`tabletop.tool.${key}`)}
                </Menu.Item>
              )
            })}
          </Menu.Dropdown>
        </Menu>
      )}
    </div>
  )
}

/** A thin ruled strip above the board with the active tool's instruments. */
export function OptionStrip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="tt-strip" role="group" aria-label={label}>
      {children}
    </div>
  )
}

export function MeasureReadout({
  points,
  snap,
  onSnap,
  shared,
  onShare,
  onClear,
}: {
  points: readonly Point[]
  snap: boolean
  onSnap: (value: boolean) => void
  shared: boolean
  onShare: (value: boolean) => void
  onClear: () => void
}) {
  const { t, i18n } = useTranslation()
  const route = measurePath(points)
  const list = new Intl.ListFormat(i18n.language, { type: 'unit', style: 'narrow' })
  return (
    <>
      <div className="tt-readout">
        {points.length < 2 ? (
          <span className="tt-readout-hint">{t('tabletop.measure.hint')}</span>
        ) : (
          <>
            <span className="tt-readout-feet">
              {t('tabletop.measure.feet', { count: route.feet })}
            </span>
            <span className="tt-readout-squares">
              {route.segments.length > 1
                ? t('tabletop.measure.segments', {
                    list: list.format(route.segments.map((s) => String(s * 5))),
                    count: route.squares,
                  })
                : t('tabletop.measure.squares', { count: route.squares })}
            </span>
          </>
        )}
      </div>
      <Switch
        label={t('tabletop.measure.snap')}
        checked={snap}
        onChange={(e) => onSnap(e.currentTarget.checked)}
      />
      <Switch
        label={t('tabletop.measure.share')}
        checked={shared}
        onChange={(e) => onShare(e.currentTarget.checked)}
      />
      {points.length > 0 && (
        <button type="button" className="tt-text-action" onClick={onClear}>
          {t('tabletop.measure.clear')}
        </button>
      )}
    </>
  )
}

const shapeGlyph = (shape: string) => {
  switch (shape) {
    case 'sphere':
      return <circle cx={12} cy={12} r={8} />
    case 'cylinder':
      return (
        <>
          <ellipse cx={12} cy={7} rx={7} ry={3} />
          <path d="M 5 7 V 17 A 7 3 0 0 0 19 17 V 7" />
        </>
      )
    case 'cube':
      return <rect x={5} y={5} width={14} height={14} />
    case 'cone':
      return <path d="M 4 12 L 20 4 L 20 20 Z" />
    case 'line':
      return <rect x={3} y={9} width={18} height={6} />
    default:
      return (
        <>
          <rect x={9} y={9} width={6} height={6} />
          <rect x={4} y={4} width={16} height={16} rx={5} strokeDasharray="3 2" />
        </>
      )
  }
}

export function AreaOptions({
  value,
  onChange,
}: {
  value: AreaSettings
  onChange: (value: AreaSettings) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <TileGroup
        legend={t('tabletop.area.shape')}
        hideLegend
        className="tt-tiles-compact"
        seal={false}
        value={value.shape}
        onChange={(shape) => onChange({ ...value, shape })}
        options={areaShapes.map((shape) => ({
          value: shape,
          content: (
            <span className="tt-shape-tile">
              <svg
                viewBox="0 0 24 24"
                width={22}
                height={22}
                aria-hidden="true"
                className="tt-shape-glyph"
              >
                {shapeGlyph(shape)}
              </svg>
              <span>{t(`tabletop.area.${shape}`)}</span>
            </span>
          ),
        }))}
      />
      <NumberDial
        className="tt-dial"
        label={t(
          value.shape === 'sphere' || value.shape === 'cylinder' || value.shape === 'emanation'
            ? 'tabletop.area.radius'
            : value.shape === 'cube'
              ? 'tabletop.area.side'
              : 'tabletop.area.length',
        )}
        value={value.size}
        min={5}
        max={500}
        onChange={(size) =>
          onChange({
            ...value,
            size: typeof size === 'number' ? Math.round(size / 5) * 5 || 5 : value.size,
          })
        }
      />
      {value.shape === 'line' && (
        <NumberDial
          className="tt-dial"
          label={t('tabletop.area.width')}
          value={value.width}
          min={5}
          max={100}
          onChange={(width) =>
            onChange({
              ...value,
              width: typeof width === 'number' ? Math.round(width / 5) * 5 || 5 : value.width,
            })
          }
        />
      )}
      {/* One control, so the strip stays one row: the swatch shows the colour, the word names it. */}
      <Select
        className="tt-damage-select"
        label={t('tabletop.area.damage')}
        allowDeselect={false}
        value={value.damage}
        onChange={(damage) =>
          damage && onChange({ ...value, damage: damage as AreaSettings['damage'] })
        }
        data={damageTypes.map((damage) => ({
          value: damage,
          label: t(`tabletop.damage.${damage}`),
        }))}
        leftSection={
          <span
            className="tt-swatch"
            style={{ background: damageColors[value.damage] }}
            aria-hidden="true"
          />
        }
        renderOption={({ option }) => (
          <span className="tt-damage-tile">
            <span
              className="tt-swatch"
              style={{ background: damageColors[option.value as AreaSettings['damage']] }}
              aria-hidden="true"
            />
            <span>{option.label}</span>
          </span>
        )}
        comboboxProps={{ zIndex: 420 }}
      />
    </>
  )
}

export function FogOptions({
  value,
  onChange,
  enabled,
  onEnable,
  onReset,
}: {
  value: FogSettings
  onChange: (value: FogSettings) => void
  enabled: boolean
  onEnable: (value: boolean) => void
  onReset: (to: 'hidden' | 'revealed') => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <Switch
        label={t('tabletop.fog.enabled')}
        checked={enabled}
        onChange={(e) => onEnable(e.currentTarget.checked)}
      />
      {enabled && (
        <>
          <TileGroup
            legend={t('tabletop.fog.mode')}
            hideLegend
            className="tt-tiles-compact"
            seal={false}
            value={value.mode}
            onChange={(mode) => onChange({ ...value, mode })}
            options={(['reveal', 'hide'] as const).map((mode) => ({
              value: mode,
              content: <span>{t(`tabletop.fog.${mode}`)}</span>,
            }))}
          />
          <TileGroup
            legend={t('tabletop.fog.shape')}
            hideLegend
            className="tt-tiles-compact"
            seal={false}
            value={value.shape}
            onChange={(shape) => onChange({ ...value, shape })}
            options={(['room', 'brush', 'rect'] as const).map((shape) => ({
              value: shape,
              content: <span>{t(`tabletop.fog.${shape}`)}</span>,
            }))}
          />
          {value.shape === 'brush' && (
            <NumberDial
              className="tt-dial"
              label={t('tabletop.fog.radius')}
              value={value.radius}
              min={1}
              max={10}
              onChange={(radius) =>
                onChange({ ...value, radius: typeof radius === 'number' ? radius : value.radius })
              }
            />
          )}
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <button type="button" className="tt-text-action">
                {t('tabletop.fog.all')}
              </button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item onClick={() => onReset('revealed')}>
                {t('tabletop.fog.revealAll')}
              </Menu.Item>
              <Menu.Item onClick={() => onReset('hidden')}>{t('tabletop.fog.hideAll')}</Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </>
      )}
    </>
  )
}
