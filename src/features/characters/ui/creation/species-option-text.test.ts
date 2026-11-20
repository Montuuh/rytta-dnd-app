import { describe, expect, it } from 'vitest'
import { optionText } from './species-option-text'

describe('species option text (RYT-111)', () => {
  it('reads the glossary line of each option', () => {
    const body = {
      blocks: [
        { t: 'p' as const, x: 'Desciendes de los gigantes.' },
        { t: 'p' as const, lead: 'Abrasión del fuego (gigante de fuego).', x: '+1d10 de fuego.' },
        { t: 'table' as const, rows: [['Drow', 'Visión 36 m.', 'Fuego feérico', 'Oscuridad']] },
      ],
    }
    expect(optionText(body, 'Abrasión del fuego')).toBe('+1d10 de fuego.')
    expect(optionText(body, 'Drow')).toBe('Visión 36 m.')
    expect(optionText(body, 'Rojo (fuego)')).toBeNull()
    expect(optionText(undefined, 'Drow')).toBeNull()
  })
})
