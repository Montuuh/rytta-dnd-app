import { ActionIcon, NumberInput } from '@mantine/core'
import { Minus, Plus } from 'lucide-react'
import { useLongPress } from '@/shared/ui/use-long-press'

/** Compact −/value/+ control with 44px targets; long press steps by five. */
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
}) {
  const clamp = (next: number) => Math.min(max, Math.max(min, Math.trunc(next)))
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
      <ActionIcon
        size={44}
        variant="default"
        aria-label={lessLabel}
        disabled={disabled || value <= min}
        {...less}
      >
        <Minus size={18} aria-hidden="true" />
      </ActionIcon>
      <NumberInput
        aria-label={label}
        value={value}
        min={min}
        max={max}
        allowDecimal={false}
        allowNegative={false}
        clampBehavior="strict"
        hideControls
        disabled={disabled}
        data-autofocus={autoFocus || undefined}
        onChange={(next) => onChange(clamp(typeof next === 'number' ? next : min))}
        classNames={{ input: 'trade-stepper-input' }}
      />
      <ActionIcon
        size={44}
        variant="default"
        aria-label={moreLabel}
        disabled={disabled || value >= max}
        {...more}
      >
        <Plus size={18} aria-hidden="true" />
      </ActionIcon>
    </div>
  )
}
