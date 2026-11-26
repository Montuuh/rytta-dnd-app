import { describe, expect, it } from 'vitest'
import {
  basePackLabel,
  entryOrigin,
  entryOriginById,
  noPackOrigins,
  parsePackOrigins,
  shortPackName,
} from './pack-origins'

describe('one short name per pack (RYT-184)', () => {
  it('keeps every title but the base pack long one, which falls back', () => {
    expect(shortPackName('Rytta', true, 'SRD')).toBe('Rytta')
    expect(shortPackName('Bestias del Norte', false, 'SRD')).toBe('Bestias del Norte')
    expect(shortPackName('Documento de referencia del sistema 5.2.1', true, 'SRD')).toBe('SRD')
    // A long title of another pack is kept: only the base pack has a short fallback.
    expect(shortPackName('Un paquete con un título muy largo', false, 'SRD')).toBe(
      'Un paquete con un título muy largo',
    )
  })

  it('is the rule basePackLabel answers by', () => {
    const origins = parsePackOrigins(pack([], 'Rytta', 'Rytta'))
    expect(basePackLabel(origins, 'es', 'SRD')).toBe(shortPackName('Rytta', true, 'SRD'))
  })
})

const pack = (entries: unknown[], title_en = 'Rytta', title_es = 'Rytta') => [
  { id: 'a', title_en, title_es, entries },
]

describe('pack origins (RYT-174)', () => {
  it('reads the entries the server sends and treats the rest as the SRD', () => {
    const origins = parsePackOrigins(
      pack([
        { kind: 'spell', key: 'shield', origin: 'changed' },
        { kind: 'creature', key: 'ash-wolf', origin: 'own' },
      ]),
    )
    expect(entryOrigin(origins, 'spell', 'shield')).toBe('changed')
    expect(entryOrigin(origins, 'creature', 'ash-wolf')).toBe('own')
    expect(entryOrigin(origins, 'spell', 'fireball')).toBe('srd')
    expect(entryOriginById(origins, 'spell.shield')).toBe('changed')
    expect(entryOriginById(origins, 'condition.prone')).toBe('srd')
  })

  it('gives no origin without a base pack or for another pack', () => {
    expect(parsePackOrigins([])).toBe(noPackOrigins)
    expect(entryOrigin(noPackOrigins, 'spell', 'fireball')).toBeNull()
    expect(entryOriginById(noPackOrigins, 'spell.fireball')).toBeNull()
    const origins = parsePackOrigins(pack([]))
    expect(entryOriginById(origins, 'spell.northern-lore--frost-lance')).toBeNull()
  })

  it('skips a row that does not read and keeps the others', () => {
    const origins = parsePackOrigins(
      pack([
        { kind: 'spell', key: 'shield', origin: 'srd' },
        { kind: 'spell', origin: 'own' },
        { kind: 'spell', key: 'moon-ray', origin: 'own' },
      ]),
    )
    expect([...origins.entries]).toEqual([['spell.moon-ray', 'own']])
  })

  it('refuses a result that is not a list of packs', () => {
    expect(() => parsePackOrigins({})).toThrow()
    expect(() => parsePackOrigins([{ title_en: 'Rytta' }])).toThrow()
  })

  it('uses a short title where the app said SRD and keeps the fallback for a long one', () => {
    expect(basePackLabel(parsePackOrigins(pack([])), 'es', 'SRD')).toBe('Rytta')
    const long = parsePackOrigins(
      pack([], 'System Reference Document 5.2.1', 'Documento de referencia del sistema 5.2.1'),
    )
    expect(basePackLabel(long, 'es', 'SRD')).toBe('SRD')
    expect(basePackLabel(noPackOrigins, 'en', 'SRD')).toBe('SRD')
    // One language is enough: the other falls back to it.
    expect(parsePackOrigins(pack([], '', 'Rytta')).title).toEqual({ en: 'Rytta', es: 'Rytta' })
  })
})
