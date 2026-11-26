import { describe, expect, it } from 'vitest'
import type { GlossaryEntry } from '../domain/catalog'
import { packNameOf, packRefOf } from './pack-mark'

const entry = (id: string, source: 'srd' | 'homebrew' = 'srd') => ({ id, source }) as GlossaryEntry
const packs = [
  { ref: 'a1b2c3d4', srd: false, title_en: 'Northern Lore', title_es: 'Saber del Norte' },
]

describe('pack mark', () => {
  it('reads the reference of a pack entry id', () => {
    expect(packRefOf('spell.a1b2c3d4--frost-lance')).toBe('a1b2c3d4')
    expect(packRefOf('spell.fireball')).toBeNull()
  })
  it('names the pack by language, the base pack by its label, homebrew by nothing', () => {
    expect(packNameOf(entry('spell.a1b2c3d4--frost-lance'), packs, 'es', 'SRD')).toBe(
      'Saber del Norte',
    )
    expect(packNameOf(entry('spell.a1b2c3d4--frost-lance'), packs, 'en', 'SRD')).toBe(
      'Northern Lore',
    )
    expect(packNameOf(entry('spell.fireball'), packs, 'es', 'SRD')).toBe('SRD')
    expect(packNameOf(entry('hb.1', 'homebrew'), packs, 'es', 'SRD')).toBeNull()
    expect(packNameOf(entry('spell.ffffffff--x'), packs, 'es', 'SRD')).toBeNull()
  })
})
