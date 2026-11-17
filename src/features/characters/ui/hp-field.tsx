import { useState, type ReactNode } from 'react'
import { NumberInput } from '@mantine/core'

const max = 9999

/**
 * Maximum HP as typed text: an empty or half-typed field never reaches the sheet, and leaving the
 * field puts the last valid number back instead of showing a blank the draft does not have.
 */
export function HpField({
  value,
  onChange,
  label,
  description,
  className,
}: {
  value: number
  onChange: (value: number) => void
  label: string
  description?: ReactNode
  className?: string
}) {
  const [text, setText] = useState<number | string>(value)
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    setText(value)
  }
  return (
    <NumberInput
      hideControls
      className={className}
      label={label}
      description={description}
      min={1}
      max={max}
      allowDecimal={false}
      allowNegative={false}
      inputMode="numeric"
      value={text}
      onChange={(next) => {
        setText(next)
        if (typeof next === 'number' && Number.isFinite(next))
          onChange(Math.min(max, Math.max(1, Math.trunc(next))))
      }}
      onBlur={() => setText(value)}
    />
  )
}
