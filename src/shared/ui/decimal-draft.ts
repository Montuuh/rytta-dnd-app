import { useState } from 'react'
import { useTranslation } from 'react-i18next'

/** The decimal separator of the interface language: a comma in Spanish, a point in English. */
export function useDecimalSeparator() {
  const { i18n } = useTranslation()
  return i18n.language.toLowerCase().startsWith('en') ? '.' : ','
}

const typedValue = (raw: number | string) =>
  typeof raw === 'number' ? raw : raw.trim() === '' ? null : Number(raw)

/** A settled value as field text: with `pad`, a value with decimals shows all of them (35.50). */
const settled = (value: number | null, pad?: number): number | string =>
  value === null ? '' : pad && !Number.isInteger(value) ? value.toFixed(pad) : value

/**
 * The text of a number field while it is typed. Partial decimals ("12," or "0,0") stay as typed
 * until they parse; an outside change (a linked field, a reset, a clamp) replaces the text.
 * Mantine reports partial decimals as strings with a point, which it reads back as such.
 * With `pad` (gold: 2), a value with decimals reads with all of them once settled: on blur and
 * after an outside change, so 35.5 gp shows "35,50" like every other price.
 */
export function useDecimalDraft(value: number | null, pad?: number) {
  const [raw, setRaw] = useState<number | string>(() => settled(value, pad))
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    if (typedValue(raw) !== value) setRaw(settled(value, pad))
  }
  /** Keeps the text and returns the number it holds: `null` when empty, `undefined` if none. */
  const type = (next: number | string): number | null | undefined => {
    setRaw(next)
    const parsed = typedValue(next)
    return parsed === null || Number.isFinite(parsed) ? parsed : undefined
  }
  /** On blur: the typed text becomes the settled form of the value it holds. */
  const settle = () => {
    if (!pad) return
    const parsed = typedValue(raw)
    if (parsed !== null && Number.isFinite(parsed) && parsed === value) setRaw(settled(value, pad))
  }
  return { raw, type, settle }
}
