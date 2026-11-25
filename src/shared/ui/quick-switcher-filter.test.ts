import { describe, expect, it } from 'vitest'
import { filterEntries, normalizeSearch } from './quick-switcher-filter'

const entries = [
  { label: 'Repartir botín', keywords: 'tesoro entregar' },
  { label: 'Almacén de objetos', keywords: 'inventario' },
  { label: 'Nivel del grupo', keywords: 'subir' },
  { label: 'Nueva criatura', keywords: 'monstruo' },
]

describe('normalizeSearch', () => {
  it('ignores case and accents', () => {
    expect(normalizeSearch('BOTÍN')).toBe('botin')
    expect(normalizeSearch('Almacén')).toBe('almacen')
    expect(normalizeSearch('Ñandú')).toBe('nandu')
  })
})

describe('filterEntries', () => {
  it('keeps everything for an empty query', () => {
    expect(filterEntries(entries, '   ')).toEqual(entries)
  })
  it('finds accented labels without the accent', () => {
    expect(filterEntries(entries, 'botin').map((e) => e.label)).toEqual(['Repartir botín'])
    expect(filterEntries(entries, 'ALMACEN').map((e) => e.label)).toEqual(['Almacén de objetos'])
  })
  it('matches keywords and requires every word', () => {
    expect(filterEntries(entries, 'monstruo')).toHaveLength(1)
    expect(filterEntries(entries, 'repartir tesoro')).toHaveLength(1)
    expect(filterEntries(entries, 'repartir monstruo')).toEqual([])
  })
  it('puts label matches before keyword-only matches', () => {
    const list = [{ label: 'Dados', keywords: 'nivel' }, { label: 'Nivel del grupo' }]
    expect(filterEntries(list, 'nivel').map((e) => e.label)).toEqual(['Nivel del grupo', 'Dados'])
  })
  it('returns nothing when nothing matches', () => {
    expect(filterEntries(entries, 'zzz')).toEqual([])
  })
})
