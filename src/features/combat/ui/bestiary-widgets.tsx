import { useId, type KeyboardEvent, type ReactNode, type Ref } from 'react'
import { ActionIcon, NumberInput } from '@mantine/core'
import { Check, Minus, Plus, type LucideIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  challengeRatings,
  creatureSizes,
  creatureTypes,
  type CreatureSize,
  type CreatureType,
} from '@/features/bestiary'
import { useLongPress } from '@/shared/ui/use-long-press'
import { typeGlyphs } from './bestiary-glyphs'
import { Token } from './token'
import './bestiary-widgets.css'

/**
 * Bestiary instruments (RYT-051): the tabletop vocabulary the bestiary uses instead of generic
 * pills, segmented controls and selects. Every choice is a native radio or checkbox inside a
 * painted label (keyboard, forms and screen readers work as usual); numbers are dials with
 * 44px steppers (hold for ±5) around a typed field.
 */

/** Base diameters on a 5-foot grid: a Medium miniature fills one square, a Gargantuan four. */
const sizeSquares: Record<CreatureSize, number> = {
  tiny: 0.5,
  small: 0.8,
  medium: 1,
  large: 2,
  huge: 3,
  gargantuan: 4,
}

type TileOption<T extends string> = { value: T; content: ReactNode; disabled?: boolean }

/**
 * A fieldset of painted tiles. `multiple` uses checkboxes, otherwise radios (arrow keys move the
 * choice). The checked tile has an accent border and a check seal, never colour alone.
 */
export function TileGroup<T extends string>(
  props: {
    legend: ReactNode
    options: TileOption<T>[]
    className?: string
    hideLegend?: boolean
    seal?: boolean
  } & (
    | { multiple: true; value: readonly T[]; onChange: (value: T[]) => void }
    | { multiple?: false; value: T; onChange: (value: T) => void }
  ),
) {
  const name = useId()
  const { legend, options, className, hideLegend, seal = true } = props
  const checked = (value: T) =>
    props.multiple ? props.value.includes(value) : props.value === value
  return (
    <fieldset className={`bst-tiles ${className ?? ''}`}>
      <legend className={hideLegend ? 'visually-hidden' : 'bst-tiles-legend'}>{legend}</legend>
      <div className="bst-tiles-grid">
        {options.map((option) => (
          <label
            key={option.value}
            className="bst-tile"
            data-disabled={option.disabled || undefined}
          >
            <input
              type={props.multiple ? 'checkbox' : 'radio'}
              name={name}
              value={option.value}
              checked={checked(option.value)}
              disabled={option.disabled}
              onChange={() => {
                if (props.multiple) {
                  const on = props.value.includes(option.value)
                  props.onChange(
                    on
                      ? props.value.filter((v) => v !== option.value)
                      : [...props.value, option.value],
                  )
                } else props.onChange(option.value)
              }}
            />
            {option.content}
            {seal && (
              <span className="bst-tile-seal" aria-hidden="true">
                <Check size={12} strokeWidth={3} />
              </span>
            )}
          </label>
        ))}
      </div>
    </fieldset>
  )
}

/** Creature types as glyph tiles. */
export function TypeTiles(
  props: { legend: ReactNode; compact?: boolean } & (
    | { multiple: true; value: readonly CreatureType[]; onChange: (value: CreatureType[]) => void }
    | { multiple?: false; value: CreatureType; onChange: (value: CreatureType) => void }
  ),
) {
  const { t } = useTranslation()
  const options = creatureTypes.map((type) => {
    const Icon = typeGlyphs[type]
    return {
      value: type,
      content: (
        <span className="bst-type">
          <span className="bst-type-glyph" aria-hidden="true">
            <Icon size={18} />
          </span>
          <span className="bst-type-name">{t(`bestiary.type.${type}`)}</span>
        </span>
      ),
    }
  })
  const className = `bst-type-tiles${props.compact ? ' is-compact' : ''}`
  return props.multiple ? (
    <TileGroup
      legend={props.legend}
      className={className}
      options={options}
      multiple
      value={props.value}
      onChange={props.onChange}
    />
  ) : (
    <TileGroup
      legend={props.legend}
      className={className}
      options={options}
      value={props.value}
      onChange={props.onChange}
    />
  )
}

/** Sizes as miniature bases drawn to scale on one baseline. */
export function SizeScale(
  props: { legend: ReactNode } & (
    | { multiple: true; value: readonly CreatureSize[]; onChange: (value: CreatureSize[]) => void }
    | { multiple?: false; value: CreatureSize; onChange: (value: CreatureSize) => void }
  ),
) {
  const { t } = useTranslation()
  const options = creatureSizes.map((size) => ({
    value: size,
    content: (
      <span className="bst-size">
        <span className="bst-size-stage" aria-hidden="true">
          <span
            className="bst-size-base"
            style={{ ['--squares' as string]: String(sizeSquares[size]) }}
          />
        </span>
        <span className="bst-size-name">{t(`bestiary.size.${size}`)}</span>
      </span>
    ),
  }))
  return props.multiple ? (
    <TileGroup
      legend={props.legend}
      className="bst-size-scale"
      options={options}
      multiple
      value={props.value}
      onChange={props.onChange}
    />
  ) : (
    <TileGroup
      legend={props.legend}
      className="bst-size-scale"
      options={options}
      value={props.value}
      onChange={props.onChange}
    />
  )
}

/** Enemy or ally, shown as the token shape the creature will take at the table. */
export function SideToggle({
  legend,
  name,
  value,
  onChange,
}: {
  legend: ReactNode
  name: string
  value: 'enemy' | 'ally'
  onChange: (value: 'enemy' | 'ally') => void
}) {
  const { t } = useTranslation()
  return (
    <TileGroup
      legend={legend}
      className="bst-side"
      value={value}
      onChange={onChange}
      options={(['enemy', 'ally'] as const).map((side) => ({
        value: side,
        content: (
          <span className="bst-side-choice">
            <span aria-hidden="true">
              <Token
                name={name.trim() || t(`combat.side.${side}`)}
                side={side}
                imageKind="creature"
                path={null}
                size={36}
              />
            </span>
            <span className="bst-side-name">{t(`combat.side.${side}`)}</span>
          </span>
        ),
      }))}
    />
  )
}

function StepButton({
  label,
  disabled,
  onStep,
  children,
}: {
  label: string
  disabled: boolean
  onStep: (by: 1 | 5) => void
  children: ReactNode
}) {
  const press = useLongPress(
    () => onStep(1),
    () => onStep(5),
  )
  return (
    <ActionIcon
      variant="subtle"
      size={44}
      className="bst-dial-step"
      disabled={disabled}
      aria-label={label}
      {...press}
    >
      {children}
    </ActionIcon>
  )
}

/**
 * A number dial: the typed value in a large serif face between 44px steppers. A short press
 * steps by one, holding a stepper steps by five.
 */
export function NumberDial({
  label,
  icon: Icon,
  value,
  onChange,
  min,
  max,
  description,
  inputRef,
  autoFocus,
  ariaLabel,
  className,
}: {
  label: ReactNode
  /** Plain text for the stepper names when `label` is not a string. */
  ariaLabel?: string
  icon?: LucideIcon
  value: number | string
  onChange: (value: number | string) => void
  min: number
  max: number
  description?: ReactNode
  inputRef?: Ref<HTMLInputElement>
  autoFocus?: boolean
  className?: string
}) {
  const { t } = useTranslation()
  const name = ariaLabel ?? (typeof label === 'string' ? label : '')
  const current = typeof value === 'number' ? value : min
  const step = (by: number) => onChange(Math.min(max, Math.max(min, current + by)))
  return (
    <NumberInput
      ref={inputRef}
      data-autofocus={autoFocus || undefined}
      className={`bst-dial ${className ?? ''}`}
      classNames={{ input: 'bst-dial-input', label: 'bst-dial-label' }}
      hideControls
      allowDecimal={false}
      min={min}
      max={max}
      clampBehavior="blur"
      label={
        Icon ? (
          <span className="bst-dial-title">
            <Icon size={15} aria-hidden="true" />
            {label}
          </span>
        ) : (
          label
        )
      }
      aria-label={ariaLabel}
      description={description}
      value={value}
      onChange={onChange}
      leftSectionWidth={48}
      rightSectionWidth={48}
      leftSectionPointerEvents="all"
      rightSectionPointerEvents="all"
      leftSection={
        <StepButton
          label={t('bestiary.dial.less', { label: name })}
          disabled={current <= min}
          onStep={(by) => step(-by)}
        >
          <Minus size={18} aria-hidden="true" />
        </StepButton>
      }
      rightSection={
        <StepButton
          label={t('bestiary.dial.more', { label: name })}
          disabled={current >= max}
          onStep={(by) => step(by)}
        >
          <Plus size={18} aria-hidden="true" />
        </StepButton>
      }
    />
  )
}

/**
 * The challenge rating as a spin button over the 34 official ratings (0, 1/8 … 30), with a ladder
 * that shows where the creature sits. Arrows step one rating, Page Up/Down four, Home/End the ends.
 */
export function CrDial({
  label,
  value,
  onChange,
  description,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  description?: ReactNode
}) {
  const { t } = useTranslation()
  const labelId = useId()
  const descId = useId()
  const last = challengeRatings.length - 1
  const at = Math.max(0, challengeRatings.indexOf(value as (typeof challengeRatings)[number]))
  const go = (index: number) => onChange(challengeRatings[Math.max(0, Math.min(last, index))]!)
  const onKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const moves: Record<string, number> = {
      ArrowUp: at + 1,
      ArrowRight: at + 1,
      ArrowDown: at - 1,
      ArrowLeft: at - 1,
      PageUp: at + 4,
      PageDown: at - 4,
      Home: 0,
      End: last,
    }
    if (!(event.key in moves)) return
    event.preventDefault()
    go(moves[event.key]!)
  }
  const text = t('bestiary.crShort', { cr: value })
  return (
    <div className="bst-cr-dial">
      <span className="bst-tiles-legend" id={labelId}>
        {label}
      </span>
      <div className="bst-cr-dial-row">
        <StepButton
          label={t('bestiary.dial.less', { label })}
          disabled={at === 0}
          onStep={(by) => go(at - (by === 5 ? 4 : 1))}
        >
          <Minus size={18} aria-hidden="true" />
        </StepButton>
        <div
          role="spinbutton"
          tabIndex={0}
          className="bst-cr-dial-value"
          aria-labelledby={labelId}
          aria-describedby={description ? descId : undefined}
          aria-valuemin={0}
          aria-valuemax={last}
          aria-valuenow={at}
          aria-valuetext={text}
          onKeyDown={onKey}
        >
          {text}
        </div>
        <StepButton
          label={t('bestiary.dial.more', { label })}
          disabled={at === last}
          onStep={(by) => go(at + (by === 5 ? 4 : 1))}
        >
          <Plus size={18} aria-hidden="true" />
        </StepButton>
      </div>
      <div className="bst-cr-ladder" aria-hidden="true">
        <span className="bst-cr-ladder-fill" style={{ width: `${(at / last) * 100}%` }} />
      </div>
      {description && (
        <p className="bst-dial-help" id={descId}>
          {description}
        </p>
      )}
    </div>
  )
}
