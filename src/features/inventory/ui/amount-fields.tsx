import { NumberInput, type NumberInputProps } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { MAX_GP, roundGp } from '@/shared/lib/money'
import { KG_PER_LB, useWeightUnit } from '@/shared/lib/weight'
import { useDecimalDraft, useDecimalSeparator } from '@/shared/ui/decimal-draft'
import { Stepper } from './stepper'

const round = (value: number, digits: number) =>
  Math.round((value + Number.EPSILON) * 10 ** digits) / 10 ** digits

/**
 * RYT-104/125: a weight is stored in pounds with three decimals and shown in the reader's unit
 * (kg in Spanish, lb in English).
 */
export function WeightFields({
  pounds,
  onChange,
  label,
  max = 10000,
}: {
  pounds: number
  onChange: (pounds: number) => void
  label: string
  max?: number
}) {
  const { i18n, t } = useTranslation()
  const unit = useWeightUnit(i18n.language)
  const kilograms = (lb: number) => round(lb * KG_PER_LB, 3)
  // RYT-125: one field, in the reader's unit. Grams (0.001 kg) are exactly 0.002 lb, so a kilogram
  // value written with three decimals converts to pounds and back without drifting.
  return (
    <Stepper
      label={t(unit === 'kg' ? 'inventory.forge.weightKg' : 'inventory.forge.weight')}
      description={label}
      min={0}
      max={unit === 'kg' ? kilograms(max) : max}
      step={unit === 'kg' ? 0.25 : 0.5}
      decimalScale={3}
      value={unit === 'kg' ? kilograms(pounds) : pounds}
      onChange={(value) =>
        onChange(round(unit === 'kg' ? (value ?? 0) / KG_PER_LB : (value ?? 0), 3))
      }
    />
  )
}

type GpInputProps = Omit<
  NumberInputProps,
  | 'value'
  | 'onChange'
  | 'min'
  | 'max'
  | 'decimalScale'
  | 'allowDecimal'
  | 'decimalSeparator'
  | 'label'
  | 'description'
> & {
  /** gp with cents (0.01 gp = 1 cp); `null` is an empty field. */
  value: number | null
  onChange: (value: number | null) => void
  max?: number
  label?: string
  description?: string
  /** −/+ buttons of 44 px around the field, one gold piece per step. */
  withSteps?: boolean
}

/**
 * The gp amount field of every screen: two decimals, the decimal separator of the interface
 * language, the decimal keypad on phones and the typed text kept while a decimal is half written
 * ("12," stays until the cents arrive). Emits gp rounded to the copper, or `null` when cleared.
 */
export function GpInput({
  value,
  onChange,
  max = 100_000_000,
  label,
  description,
  placeholder,
  disabled,
  withSteps = false,
  ...props
}: GpInputProps) {
  const limit = Math.min(max, MAX_GP)
  const separator = useDecimalSeparator()
  const { raw, type, settle } = useDecimalDraft(value, 2)
  const emit = (next: number | null) =>
    onChange(next === null ? null : Math.min(limit, Math.max(0, roundGp(next))))
  if (withSteps)
    return (
      <Stepper
        label={label ?? ''}
        description={description}
        min={0}
        max={limit}
        decimalScale={2}
        pad
        placeholder={placeholder}
        disabled={disabled}
        value={value}
        onChange={emit}
      />
    )
  return (
    <NumberInput
      hideControls
      min={0}
      max={limit}
      clampBehavior="strict"
      allowNegative={false}
      allowDecimal
      decimalScale={2}
      decimalSeparator={separator}
      inputMode="decimal"
      label={label}
      description={description}
      placeholder={placeholder}
      disabled={disabled}
      {...props}
      onBlur={(event) => {
        settle()
        props.onBlur?.(event)
      }}
      value={raw}
      onChange={(next) => {
        const typed = type(next)
        if (typed !== undefined) emit(typed)
      }}
    />
  )
}
