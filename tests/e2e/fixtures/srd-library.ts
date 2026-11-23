import { readFileSync } from 'node:fs'
import { srdItemEntries } from './item-packs.ts'

// RYT-167: the published SRD pack of the library, built from the test copy of the SRD in the
// shapes production holds (creatures, their traits, the CR baselines, items, classes and
// subclasses). The library's own glossary entries are left out: no library test reads them.
type Json = Record<string, unknown>
type Named = { id: string; en: string; es: string }
type Trait = { key: string; name: string; text: string[]; from?: string; count?: number }
export type SrdEntry = { kind: string; key: string; name_en: string; name_es: string; data: Json }

const file = <T>(path: string) =>
  JSON.parse(readFileSync(`tests/fixtures/srd/${path}`, 'utf8')) as T

export function srdLibraryEntries(): SrdEntry[] {
  const index = file<{ monsters: Named[]; baselines: unknown[] }>('bestiary/index.json')
  const bodies = {
    en: file<{ monsters: Record<string, Json>; traits: Trait[] }>('bestiary/en.json'),
    es: file<{ monsters: Record<string, Json>; traits: Trait[] }>('bestiary/es.json'),
  }
  const creatures = index.monsters.map((row) => ({
    kind: 'creature',
    key: row.id,
    name_en: row.en,
    name_es: row.es,
    data: { index: row, en: bodies.en.monsters[row.id], es: bodies.es.monsters[row.id] } as Json,
  }))
  const traits = bodies.en.traits.map((trait, position) => {
    const es = bodies.es.traits[position]
    const same = es?.key === trait.key
    return {
      kind: 'creature-trait',
      key: trait.key,
      name_en: trait.name,
      name_es: same ? es.name : '',
      data: {
        index: { from: trait.from, count: trait.count },
        en: { name: trait.name, text: trait.text },
        ...(same ? { es: { name: es.name, text: es.text } } : {}),
      },
    }
  })
  const baselines = {
    kind: 'table',
    key: 'creature-baselines',
    name_en: 'Creature numbers by challenge rating',
    name_es: 'Números de criatura por valor de desafío',
    data: { rows: index.baselines },
  }
  const classes = file<{
    classes: Omit<SrdEntry, 'kind'>[]
    subclasses: Omit<SrdEntry, 'kind'>[]
  }>('classes.json')
  return [
    ...creatures,
    ...traits,
    baselines,
    ...srdItemEntries().map((entry) => ({ kind: 'item', ...entry }) as SrdEntry),
    ...classes.classes.map((entry) => ({ kind: 'class', ...entry })),
    ...classes.subclasses.map((entry) => ({ kind: 'subclass', ...entry })),
  ]
}
