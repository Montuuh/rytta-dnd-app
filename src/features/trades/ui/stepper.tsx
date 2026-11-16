import { NumberInput, UnstyledButton } from '@mantine/core'
import { Minus, Plus } from 'lucide-react'
import { useDecimalDraft, useDecimalSeparator } from '@/shared/ui/decimal-draft'
import { useLongPress } from '@/shared/ui/use-long-press'

/**
 * Compact −/value/+ control with 44px targets; long press steps by five. With `decimalScale`
 * (gold with cents, RYT-104) decimals use the interface language's separator and a half-typed
 * one ("12,") stays in the field until it parses.
 */
export function Stepper({
  value,
  min,
  max,
  label,
  lessLabel,
  moreLabel,
  disabled,
  onChange,
  autoFocus,
  decimalScale,
}: {
  value: number
  min: number
  max: number
  label: string
  lessLabel: string
  moreLabel: string
  disabled?: boolean
  onChange: (next: number) => void
  autoFocus?: boolean
  decimalScale?: number
}) {
  const round = (next: number) =>
    decimalScale ? Number(next.toFixed(decimalScale)) : Math.trunc(next)
  const clamp = (next: number) => Math.min(max, Math.max(min, round(next)))
  // Gold with cents reads with both decimals once settled (10,50).
  const { raw, type, settle } = useDecimalDraft(value, decimalScale)
  const separator = useDecimalSeparator()
  const less = useLongPress(
    () => onChange(clamp(value - 1)),
    () => onChange(clamp(value - 5)),
  )
  const more = useLongPress(
    () => onChange(clamp(value + 1)),
    () => onChange(clamp(value + 5)),
  )
  return (
    <div className="trade-stepper">
      <UnstyledButton
        className="trade-step"
        aria-label={lessLabel}
        disabled={disabled || value <= min}
        {...less}
      >
        <Minus size={18} aria-hidden="true" />
      </UnstyledButton>
      <NumberInput
        aria-label={label}
        value={raw}
        min={min}
        max={max}
        allowDecimal={Boolean(decimalScale)}
        decimalScale={decimalScale}
        decimalSeparator={separator}
        allowNegative={false}
        clampBehavior="strict"
        hideControls
        disabled={disabled}
        onBlur={settle}
        data-autofocus={autoFocus || undefined}
        onChange={(next) => {
          const typed = type(next)
          if (typed !== undefined) onChange(typed === null ? min : clamp(typed))
        }}
        classNames={{ input: 'trade-stepper-input' }}
      />
      <UnstyledButton
        className="trade-step"
        aria-label={moreLabel}
        disabled={disabled || value >= max}
        {...more}
      >
        <Plus size={18} aria-hidden="true" />
      </UnstyledButton>
    </div>
  )
}
