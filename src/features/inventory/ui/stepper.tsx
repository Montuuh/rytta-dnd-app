import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Input } from '@mantine/core'
import { Minus, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useLongPress } from '@/shared/ui/use-long-press'
import { clampAmount, formatAmount, readAmount, separatorOf } from '../domain/amount'
import './amount-stepper.css'

type Edge = 'min' | 'max' | 'digits'

/**
 * RYT-125: the one numeric field of inventory, shops and trades. A 44px −/value/+ row whose text
 * always shows what will be applied: input past [min, max] is clamped on the spot, the clamped
 * value is written back, and a line says why ("Solo quedan 3"). Decimals use the separator of the
 * interface language ("2,5" is 2.5 in Spanish), a half-typed decimal ("12,") stays until it
 * parses, and text that is not a number is refused, never guessed at.
 *
 * `required` fields never stay empty: leaving one blank restores the last value. Without it an
 * empty field reports `null` (an optional amount).
 */
export function Stepper({
  label,
  hideLabel = false,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  decimalScale,
  placeholder,
  disabled,
  suffix,
  description,
  pad = false,
  required = false,
  minMessage,
  maxMessage,
  lessLabel,
  moreLabel,
  longPress = false,
  autoFocus,
  className,
}: {
  /** Names the field; with `hideLabel` it is the accessible name only. */
  label: string
  hideLabel?: boolean
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  max: number
  step?: number
  decimalScale?: number
  placeholder?: string
  disabled?: boolean
  suffix?: string
  description?: ReactNode
  /** Gold: a value with decimals shows all of them once settled (35,50). */
  pad?: boolean
  required?: boolean
  /** Why a value was lowered or raised to the edge ("Solo quedan 3"); defaults to "Máximo 999". */
  minMessage?: string
  maxMessage?: string
  lessLabel?: string
  moreLabel?: string
  /** Holding − or + moves by five steps. */
  longPress?: boolean
  autoFocus?: boolean
  className?: string
}) {
  const { t, i18n } = useTranslation()
  const separator = separatorOf(i18n.language)
  const decimals = decimalScale ?? 0
  const id = useId()
  const reasonId = `${id}-reason`
  const write = (next: number | null) => formatAmount(next, separator, decimals, pad)
  const [text, setText] = useState(() => write(value))
  const [seen, setSeen] = useState(value)
  const [edge, setEdge] = useState<Edge | null>(null)
  const [touched, setTouched] = useState(false)
  // An outside change (a reset, a linked field, a server clamp) replaces the text; the field's own
  // edits already match the value and keep what was typed ("2,50", "12,").
  if (seen !== value) {
    setSeen(value)
    const typed = readAmount(text, separator, decimals)
    const same =
      typed.kind === 'number' ? typed.value === value : typed.kind === 'empty' && value === null
    if (!same) setText(write(value))
  }
  const apply = (next: number | null, shown = write(next), reached: Edge | null = null) => {
    setText(shown)
    setEdge(reached)
    setTouched(true)
    if (next !== value) onChange(next)
  }
  const type = (raw: string) => {
    const reading = readAmount(raw, separator, decimals)
    if (reading.kind === 'invalid') {
      setEdge('digits')
      return
    }
    if (reading.kind === 'empty') {
      setText(raw)
      setEdge(null)
      if (!required && value !== null) onChange(null)
      return
    }
    if (reading.kind === 'incomplete') {
      // A lone "-" is only a start for fields that accept negatives.
      if (/^[\s+-]*-/.test(raw) && min >= 0) setEdge('digits')
      else {
        setText(raw)
        setEdge(null)
      }
      return
    }
    const clamped = clampAmount(reading.value, min, max, decimals)
    // A whole-number field cannot keep "2,5": it is cut to 2 and says why instead of silently.
    const cut = reading.truncated && decimals === 0
    if (clamped.limit || reading.truncated)
      apply(clamped.value, write(clamped.value), clamped.limit ?? (cut ? 'digits' : null))
    else apply(clamped.value, raw)
  }
  const settle = () => {
    if (value === null) {
      if (required) apply(min)
      else setText('')
      return
    }
    setText(write(value))
  }
  const nudge = (delta: number) => {
    const current = value ?? min
    const snapped = Math.round((current + delta) / step) * step
    const clamped = clampAmount(Number(snapped.toFixed(6)), min, max, decimals)
    apply(clamped.value, write(clamped.value), null)
  }
  const less = useLongPress(
    () => nudge(-step),
    () => nudge(-5 * step),
  )
  const more = useLongPress(
    () => nudge(step),
    () => nudge(5 * step),
  )
  const atMin = value !== null && value <= min
  const atMax = value !== null && value >= max
  const field = label
  const reason =
    edge === 'digits'
      ? t('amount.digits')
      : edge === 'max' || (touched && atMax && maxMessage)
        ? (maxMessage ?? t('amount.max', { value: write(max) }))
        : edge === 'min'
          ? (minMessage ?? t('amount.min', { value: write(min) }))
          : ''
  const buttons = {
    less: longPress ? less : { onClick: () => nudge(-step) },
    more: longPress ? more : { onClick: () => nudge(step) },
  }
  return (
    <Input.Wrapper
      id={id}
      label={hideLabel ? undefined : label}
      description={description}
      className={`amount-stepper${className ? ` ${className}` : ''}`}
    >
      <div
        className="amount-row"
        data-disabled={disabled || undefined}
        data-edge={edge ?? undefined}
      >
        <button
          type="button"
          className="amount-step"
          disabled={disabled || (value !== null ? atMin : true)}
          aria-label={lessLabel ?? t('amount.less', { field })}
          {...buttons.less}
        >
          <Minus size={18} aria-hidden="true" />
        </button>
        <input
          id={id}
          className="amount-input"
          type="text"
          inputMode={decimals > 0 || min < 0 ? 'text' : 'numeric'}
          enterKeyHint="done"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          data-autofocus={autoFocus || undefined}
          aria-label={hideLabel ? label : undefined}
          aria-describedby={description ? `${id}-description ${reasonId}` : reasonId}
          aria-invalid={edge === 'digits' || undefined}
          disabled={disabled}
          placeholder={placeholder}
          value={text}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => type(event.currentTarget.value)}
          onBlur={settle}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              nudge(step)
            } else if (event.key === 'ArrowDown') {
              event.preventDefault()
              nudge(-step)
            }
          }}
        />
        {suffix && (
          <span className="amount-suffix" aria-hidden="true">
            {suffix.trim()}
          </span>
        )}
        <button
          type="button"
          className="amount-step"
          disabled={disabled || atMax}
          aria-label={moreLabel ?? t('amount.more', { field })}
          {...buttons.more}
        >
          <Plus size={18} aria-hidden="true" />
        </button>
      </div>
      <p id={reasonId} className="amount-reason" aria-live="polite" data-edge={edge ?? undefined}>
        {reason}
      </p>
    </Input.Wrapper>
  )
}
