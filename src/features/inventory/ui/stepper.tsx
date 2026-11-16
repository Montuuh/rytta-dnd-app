import type { ReactNode } from 'react'
import { ActionIcon, NumberInput } from '@mantine/core'
import { Minus, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useDecimalDraft, useDecimalSeparator } from '@/shared/ui/decimal-draft'

/**
 * A labelled number field flanked by 44px −/+ buttons; typing and ArrowUp/Down still work.
 * Decimals use the separator of the interface language, and partial ones ("1," or "0,0") stay in
 * the field until they parse, so cents and grams can be typed digit by digit.
 */
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
  description,
  pad = false,
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
  description?: ReactNode
  /** Gold: a value with decimals shows all of them once settled (35,50). */
  pad?: boolean
}) {
  const { t } = useTranslation()
  const { raw, type, settle } = useDecimalDraft(value, pad ? decimalScale : undefined)
  const separator = useDecimalSeparator()
  const round = (next: number) =>
    decimalScale ? Number(next.toFixed(decimalScale)) : Math.round(next)
  const clamp = (next: number) =>
    Math.min(max, Math.max(min, round(Math.round(Math.round(next / step) * step * 1e6) / 1e6)))
  const current = value ?? min
  const field = label
  return (
    <NumberInput
      className="forge-stepper"
      label={label}
      description={description}
      min={min}
      max={max}
      step={step}
      clampBehavior="strict"
      allowDecimal={Boolean(decimalScale)}
      decimalScale={decimalScale}
      decimalSeparator={separator}
      allowNegative={min < 0}
      hideControls
      disabled={disabled}
      placeholder={placeholder}
      suffix={suffix}
      value={raw}
      onBlur={settle}
      onChange={(next) => {
        const typed = type(next)
        if (typed !== undefined) onChange(typed)
      }}
      leftSectionWidth={48}
      rightSectionWidth={48}
      leftSectionPointerEvents="all"
      rightSectionPointerEvents="all"
      leftSection={
        <ActionIcon
          variant="subtle"
          size={44}
          disabled={disabled || current <= min}
          aria-label={t('characters.decrease', { field })}
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
          aria-label={t('characters.increase', { field })}
          onClick={() => onChange(clamp(value === null ? min + step : current + step))}
        >
          <Plus size={16} aria-hidden="true" />
        </ActionIcon>
      }
    />
  )
}
