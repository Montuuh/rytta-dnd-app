/**
 * RYT-125: how a number typed into an amount field is read, so what the field shows is exactly
 * what will be applied. Pure functions; the stepper component owns the focus and the messages.
 */

export type Separator = ',' | '.'

/** The decimal separator of an interface language: a comma in Spanish, a point in English. */
export const separatorOf = (language: string): Separator =>
  language.toLowerCase().startsWith('en') ? '.' : ','

export type Reading =
  | { kind: 'empty' }
  /** Text that is not a number at all ("abc", "1-2"). Never guessed at. */
  | { kind: 'invalid' }
  /** A sign or a separator typed so far, with no digit yet ("-", ","): the number is still coming. */
  | { kind: 'incomplete' }
  | { kind: 'number'; value: number; trailingSeparator: boolean; truncated: boolean }

const SPACES = /[\s  ']/g

const grouped = (text: string, mark: string) =>
  new RegExp(`^\\d{1,3}(?:\\${mark}\\d{3})+$`).test(text)

/**
 * Reads typed or pasted text. The interface language's separator is the decimal one ("2,5" is 2.5
 * in Spanish, 2.5 in English reads "2.5"); the other mark is a thousands group when it splits
 * digits in threes ("1.000" in Spanish is 1000) and a decimal point otherwise ("2.5" is 2.5).
 * Decimals past `decimals` digits are cut, not rounded, so typing never jumps.
 */
export function readAmount(text: string, separator: Separator, decimals: number): Reading {
  const compact = text.replace(SPACES, '')
  if (compact === '') return { kind: 'empty' }
  const negative = compact.startsWith('-')
  const body = compact.replace(/^[+-]/, '')
  if (!/^[\d.,]*$/.test(body)) return { kind: 'invalid' }
  if (body === '' || body === '.' || body === ',') return { kind: 'incomplete' }
  const other = separator === ',' ? '.' : ','
  const own = body.split(separator).length - 1
  let whole: string
  let fraction = ''
  let trailing = false
  if (own > 1) return { kind: 'invalid' }
  if (own === 1) {
    const [head, tail] = body.split(separator) as [string, string]
    // Thousands groups may precede the decimal mark ("1.234,5"); nothing else may.
    if (head.includes(other) && !grouped(head, other)) return { kind: 'invalid' }
    if (tail.includes(other)) return { kind: 'invalid' }
    whole = head.replaceAll(other, '')
    fraction = tail
    trailing = tail === ''
  } else {
    const marks = body.split(other).length - 1
    if (marks === 0) whole = body
    else if (grouped(body, other)) whole = body.replaceAll(other, '')
    else if (marks === 1) {
      const [head, tail] = body.split(other) as [string, string]
      whole = head
      fraction = tail
      trailing = tail === ''
    } else return { kind: 'invalid' }
  }
  const digits = fraction.slice(0, Math.max(0, decimals))
  const value = Number(`${whole === '' ? '0' : whole}${digits ? `.${digits}` : ''}`)
  if (Number.isNaN(value)) return { kind: 'invalid' }
  return {
    kind: 'number',
    value: negative ? -value : value,
    trailingSeparator: trailing,
    truncated: fraction.length > digits.length,
  }
}

/** A value as field text: the language's separator, and with `pad` all its decimals (35,50). */
export function formatAmount(
  value: number | null,
  separator: Separator,
  decimals: number,
  pad = false,
) {
  if (value === null) return ''
  const text =
    pad && decimals > 0 && !Number.isInteger(value) ? value.toFixed(decimals) : String(value)
  return text.replace('.', separator)
}

const roundTo = (value: number, decimals: number) =>
  decimals > 0 ? Number(value.toFixed(decimals)) : Math.round(value)

export type Clamped = { value: number; limit: 'min' | 'max' | null }

/** Rounds to the field's precision, then keeps the number inside [min, max] and says which edge. */
export function clampAmount(value: number, min: number, max: number, decimals: number): Clamped {
  if (value > max) return { value: max, limit: 'max' }
  if (value < min) return { value: min, limit: 'min' }
  const rounded = roundTo(value, decimals)
  if (rounded > max) return { value: max, limit: 'max' }
  if (rounded < min) return { value: min, limit: 'min' }
  return { value: rounded, limit: null }
}
