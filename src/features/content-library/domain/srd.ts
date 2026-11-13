import type { EntryInput, PackInput } from './library'

/**
 * RYT-093: the SRD 5.2.1 bundled in the app (creatures, their trait library, the CR baselines and
 * every glossary entry) as content library entries. Entry data keeps the bundled shapes, so the app
 * can read the library later (RYT-094) with the parsers it already has: `index` is the bundled index
 * row and `en`/`es` the bundled bodies.
 */
export const srdSlug = 'srd-5-2-1'

export const srdPack: PackInput = {
  slug: srdSlug,
  title_en: 'System Reference Document 5.2.1',
  title_es: 'Documento de referencia del sistema 5.2.1',
  description_en: 'Creatures, their trait library and the rules glossary of the SRD 5.2.1.',
  description_es: 'Criaturas, su biblioteca de rasgos y el glosario de reglas del SRD 5.2.1.',
  edition: '2024',
  license: 'CC-BY-4.0',
  attribution:
    'This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode.',
  visibility: 'public',
}

type Named = { id: string; en: string; es: string }
type Trait = { key: string; name: string; text: string[]; from?: string; count?: number }
export type BundledSrd = {
  monsters: { monsters: Named[]; baselines: unknown[] }
  bodies: Record<'en' | 'es', { monsters: Record<string, unknown>; traits: Trait[] }>
  glossary: (Named & { cat: string })[]
  glossaryBodies: Record<'en' | 'es', Record<string, unknown>>
}

export function srdEntries(srd: BundledSrd): { kind: string; entries: EntryInput[] }[] {
  const creatures = srd.monsters.monsters.map((row) => ({
    kind: 'creature',
    key: row.id,
    name_en: row.en,
    name_es: row.es,
    data: { index: row, en: srd.bodies.en.monsters[row.id], es: srd.bodies.es.monsters[row.id] },
  }))
  const traits = srd.bodies.en.traits.map((trait, position) => {
    const es = srd.bodies.es.traits[position]
    return {
      kind: 'creature-trait',
      key: trait.key,
      name_en: trait.name,
      name_es: es?.key === trait.key ? es.name : '',
      data: {
        index: { from: trait.from, count: trait.count },
        en: { name: trait.name, text: trait.text },
        ...(es?.key === trait.key ? { es: { name: es.name, text: es.text } } : {}),
      },
    }
  })
  const baselines = {
    kind: 'table',
    key: 'creature-baselines',
    name_en: 'Creature numbers by challenge rating',
    name_es: 'Números de criatura por valor de desafío',
    data: { rows: srd.monsters.baselines },
  }
  const glossary = new Map<string, EntryInput[]>()
  for (const row of srd.glossary) {
    const kind = row.cat
    const entry = {
      kind,
      key: row.id.slice(row.id.indexOf('.') + 1),
      name_en: row.en,
      name_es: row.es,
      data: { index: row, en: srd.glossaryBodies.en[row.id], es: srd.glossaryBodies.es[row.id] },
    }
    glossary.set(kind, [...(glossary.get(kind) ?? []), entry])
  }
  return [
    { kind: 'creature', entries: creatures },
    { kind: 'creature-trait', entries: traits },
    { kind: 'table', entries: [baselines] },
    ...[...glossary].map(([kind, entries]) => ({ kind, entries })),
  ]
}
