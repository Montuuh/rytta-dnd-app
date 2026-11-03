import { ActionIcon, NumberInput } from '@mantine/core'
import { Minus, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'

/** A labelled number field flanked by 44px −/+ buttons; typing and ArrowUp/Down still work. */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max,
  step = 1,
  decimalScale,
  placeholder,
  disabled,
  suffix,
}: {
  label: string
  value: number | null
  onChange: (value: number | null) => void
  min?: number
  max: number
  step?: number
  decimalScale?: number
  placeholder?: string
  disabled?: boolean
  suffix?: string
}) {
  const { t } = useTranslation()
  const clamp = (next: number) =>
    Math.min(max, Math.max(min, Math.round(Math.round(next / step) * step * 1e6) / 1e6))
  const current = value ?? min
  return (
    <NumberInput
      className="forge-stepper"
      label={label}
      min={min}
      max={max}
      step={step}
      clampBehavior="strict"
      allowDecimal={Boolean(decimalScale)}
      decimalScale={decimalScale}
      allowNegative={false}
      hideControls
      disabled={disabled}
      placeholder={placeholder}
      suffix={suffix}
      value={value ?? ''}
      onChange={(next) => onChange(typeof next === 'number' && Number.isFinite(next) ? next : null)}
      leftSectionWidth={48}
      rightSectionWidth={48}
      leftSectionPointerEvents="all"
      rightSectionPointerEvents="all"
      leftSection={
        <ActionIcon
          variant="subtle"
          size={44}
          disabled={disabled || current <= min}
          aria-label={t('characters.decrease', { field: label })}
          onClick={() => onChange(clamp(current - step))}
        >
          <Minus size={16} aria-hidden="true" />
        </ActionIcon>
      }
      rightSection={
        <ActionIcon
          variant="subtle"
          size={44}
          disabled={disabled || current >= max}
          aria-label={t('characters.increase', { field: label })}
          onClick={() => onChange(clamp(value === null ? min + step : current + step))}
        >
          <Plus size={16} aria-hidden="true" />
        </ActionIcon>
      }
    />
  )
}
