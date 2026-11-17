import { describe, expect, it } from 'vitest'
import { clampAmount, formatAmount, readAmount, separatorOf } from './amount'

const number = (text: string, separator: ',' | '.', decimals = 0) => {
  const reading = readAmount(text, separator, decimals)
  return reading.kind === 'number' ? reading.value : reading.kind
}

describe('separatorOf', () => {
  it('uses the comma in Spanish and the point in English', () => {
    expect(separatorOf('es')).toBe(',')
    expect(separatorOf('es-ES')).toBe(',')
    expect(separatorOf('en')).toBe('.')
    expect(separatorOf('EN-GB')).toBe('.')
  })
})

describe('readAmount', () => {
  it('reads "2,5" as 2.5 in Spanish and "2.5" as 2.5 in English, never 25', () => {
    expect(number('2,5', ',', 2)).toBe(2.5)
    expect(number('2.5', '.', 2)).toBe(2.5)
    // A whole-number field never reads the comma as a thousands mark: it cuts the fraction.
    expect(number('2,5', ',', 0)).toBe(2)
  })

  it('treats the other mark as a decimal point unless it groups thousands', () => {
    expect(number('2.5', ',', 2)).toBe(2.5)
    expect(number('2,5', '.', 2)).toBe(2.5)
    expect(number('1.000', ',')).toBe(1000)
    expect(number('1,000', '.')).toBe(1000)
    expect(number('1.234.567', ',')).toBe(1234567)
    expect(number('1.234,56', ',', 2)).toBe(1234.56)
    expect(number('1,234.56', '.', 2)).toBe(1234.56)
  })

  it('cuts extra decimals instead of rounding them', () => {
    expect(number('12,345', ',', 2)).toBe(12.34)
    expect(number('0.999', '.', 2)).toBe(0.99)
    expect(number('7,9', ',', 0)).toBe(7)
  })

  it('keeps a half-typed number as typed', () => {
    expect(readAmount('12,', ',', 2)).toEqual({
      kind: 'number',
      value: 12,
      trailingSeparator: true,
      truncated: false,
    })
    const cut = readAmount('12,345', ',', 2)
    expect(cut.kind === 'number' && cut.truncated).toBe(true)
    expect(number('0,0', ',', 2)).toBe(0)
    expect(number(',5', ',', 2)).toBe(0.5)
    expect(readAmount('-', ',', 0).kind).toBe('incomplete')
    expect(readAmount(',', ',', 2).kind).toBe('incomplete')
  })

  it('handles empty, negative and zero', () => {
    expect(readAmount('', ',', 0).kind).toBe('empty')
    expect(readAmount('   ', ',', 0).kind).toBe('empty')
    expect(number('0', ',')).toBe(0)
    expect(number('-4', ',')).toBe(-4)
    expect(number('+4', ',')).toBe(4)
  })

  it('refuses pasted text that is not a number instead of guessing', () => {
    for (const text of ['abc', '12 po', '1-2', '1,2,3', '1.2.3,4', '9e3', '١٢', '--1']) {
      expect(readAmount(text, ',', 2).kind).toBe('invalid')
    }
  })

  it('ignores spaces, including non-breaking ones, inside a number', () => {
    expect(number('1 000', ',')).toBe(1000)
    expect(number(' 5 ', ',')).toBe(5)
  })

  it('reads huge pasted numbers as huge, for the clamp to bound', () => {
    expect(number('9'.repeat(40), ',')).toBeGreaterThan(1e30)
    expect(number('9'.repeat(400), ',')).toBe(Infinity)
  })
})

describe('formatAmount', () => {
  it('writes the language separator and pads decimals only when asked', () => {
    expect(formatAmount(2.5, ',', 2)).toBe('2,5')
    expect(formatAmount(2.5, '.', 2)).toBe('2.5')
    expect(formatAmount(35.5, ',', 2, true)).toBe('35,50')
    expect(formatAmount(35, ',', 2, true)).toBe('35')
    expect(formatAmount(null, ',', 2)).toBe('')
    expect(formatAmount(0, ',', 0)).toBe('0')
  })
})

describe('clampAmount', () => {
  it('names the edge that was hit', () => {
    expect(clampAmount(9, 1, 3, 0)).toEqual({ value: 3, limit: 'max' })
    expect(clampAmount(5000, 1, 999, 0)).toEqual({ value: 999, limit: 'max' })
    expect(clampAmount(0, 1, 999, 0)).toEqual({ value: 1, limit: 'min' })
    expect(clampAmount(-4, 1, 999, 0)).toEqual({ value: 1, limit: 'min' })
    expect(clampAmount(2, 1, 3, 0)).toEqual({ value: 2, limit: null })
  })

  it('rounds to the precision and clamps what rounding pushes out', () => {
    expect(clampAmount(2.5, 1, 9, 0)).toEqual({ value: 3, limit: null })
    expect(clampAmount(2.999, 0, 9, 2)).toEqual({ value: 3, limit: null })
    expect(clampAmount(3.4, 1, 3, 0)).toEqual({ value: 3, limit: 'max' })
    expect(clampAmount(2.6, 1, 3, 0)).toEqual({ value: 3, limit: null })
    expect(clampAmount(Infinity, 0, 100, 2)).toEqual({ value: 100, limit: 'max' })
  })
})
