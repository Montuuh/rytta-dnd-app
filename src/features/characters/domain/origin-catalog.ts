import { z } from 'zod'
import type { Build } from './sheet'
import { abilityKeys, skillKeys, type Ability, type Skill } from './srd'

/**
 * RYT-171: species, backgrounds and feats come from the campaign's packs (ADR 051, owner choices
 * of block M), in the classes category beside classes and subclasses. A species is its speed, size,
 * traits and the traits with options (lineages); a background its three abilities, its skills and
 * its origin feat; a feat its category, minimum level and whether it repeats.
 *
 * SRD entries keep their bare key (`dwarf`); pack entries are `<ref>--<key>`. Trait and feat texts
 * are the pack's features `species-<species>-<trait>` and `feat-<feat>`. Effects the app applies
 * (Dwarven Toughness, Alert, Breath Weapon uses) stay for the SRD ones (owner choice P1 A).
 */
export type Names = { en: string; es: string }
export const speciesSizes = ['small', 'medium', 'smallOrMedium', 'large'] as const
export type SpeciesSize = (typeof speciesSizes)[number]
export const featCategories = ['origin', 'general', 'fightingStyle', 'epicBoon'] as const
export type FeatCategory = (typeof featCategories)[number]

type PackInfo = { pack?: { title_en: string; title_es: string }; hidden?: boolean }
export type SpeciesDef = PackInfo & {
  key: string
  srd: boolean
  name: Names
  speed: number
  size: SpeciesSize
  traits: { key: string; name: Names }[]
  /** Traits with options the player picks (a lineage, an ancestry). */
  choices: { trait: string; options: { key: string; name: Names }[] }[]
}
export type BackgroundDef = PackInfo & {
  key: string
  srd: boolean
  name: Names
  abilities: readonly [Ability, Ability, Ability]
  skills: readonly Skill[]
  /** The origin feat it grants (its reference), and the spell list it uses, if any. */
  feat: string | null
  featList: string | null
}
export type FeatDef = PackInfo & {
  key: string
  srd: boolean
  name: Names
  category: FeatCategory
  /** Minimum character level; null for none. */
  level: number | null
  repeatable: boolean
}
export type OriginCatalog = {
  species: SpeciesDef[]
  backgrounds: BackgroundDef[]
  feats: FeatDef[]
}

const name = z.string().trim().min(1).max(80)
const traitKey = z
  .string()
  .regex(/^[a-z][a-zA-Z0-9]*(?:-[a-z0-9]+)*$/)
  .max(40)
const reference = z
  .string()
  .max(60)
  .regex(/^(?:[0-9a-f]{8}--)?[a-z0-9]+(?:-[a-z0-9]+)*$/)
const named = z.object({ key: traitKey, en: name, es: name })

/** A species entry's index fields, as the library stores them. */
export const speciesIndexSchema = z
  .object({
    speed: z.number().int().min(0).max(120),
    size: z.enum(speciesSizes).default('medium'),
    traits: z.array(named).max(12).default([]),
    choices: z
      .array(z.object({ trait: traitKey, options: z.array(named).min(2).max(20) }))
      .max(4)
      .default([]),
  })
  .refine(
    (index) =>
      index.choices.every((choice) => index.traits.some((trait) => trait.key === choice.trait)),
    { path: ['choices'] },
  )
/** A background entry's index fields. */
export const backgroundIndexSchema = z.object({
  abilities: z
    .tuple([z.enum(abilityKeys), z.enum(abilityKeys), z.enum(abilityKeys)])
    .refine((list) => new Set(list).size === 3),
  skills: z
    .array(z.enum(skillKeys as [Skill, ...Skill[]]))
    .min(1)
    .max(4)
    .refine((list) => new Set(list).size === list.length),
  feat: reference.nullable().default(null),
  featList: reference.nullable().default(null),
})
/** A feat entry's index fields. */
export const featIndexSchema = z.object({
  category: z.enum(featCategories),
  level: z.number().int().min(1).max(20).nullable().default(null),
  repeatable: z.boolean().default(false),
})
export type SpeciesIndex = z.input<typeof speciesIndexSchema>
export type BackgroundIndex = z.input<typeof backgroundIndexSchema>
export type FeatIndex = z.input<typeof featIndexSchema>

/** A species, background or feat row of the campaign's packs (the glossary's `ClassRow`). */
export type OriginRowLike = {
  cat: string
  key: string
  en: string
  es: string
  data: Record<string, unknown>
  hidden?: boolean
  pack?: { title_en: string; title_es: string }
}

const namesOf = (item: { en: string; es: string }): Names => ({ en: item.en, es: item.es })

/** The species, backgrounds and feats a campaign has, from its packs (first of a key wins). */
export function buildOriginCatalog(rows: readonly OriginRowLike[]): OriginCatalog {
  const catalog: OriginCatalog = { species: [], backgrounds: [], feats: [] }
  for (const row of rows) {
    const base = {
      key: row.key,
      srd: !row.key.includes('--'),
      name: namesOf(row),
      ...(row.hidden ? { hidden: true } : {}),
      ...(row.pack ? { pack: row.pack } : {}),
    }
    if (row.cat === 'species') {
      const parsed = speciesIndexSchema.safeParse(row.data)
      if (!parsed.success || catalog.species.some((item) => item.key === row.key)) continue
      catalog.species.push({
        ...base,
        speed: parsed.data.speed,
        size: parsed.data.size,
        traits: parsed.data.traits.map((trait) => ({ key: trait.key, name: namesOf(trait) })),
        choices: parsed.data.choices.map((choice) => ({
          trait: choice.trait,
          options: choice.options.map((option) => ({ key: option.key, name: namesOf(option) })),
        })),
      })
    } else if (row.cat === 'background') {
      const parsed = backgroundIndexSchema.safeParse(row.data)
      if (!parsed.success || catalog.backgrounds.some((item) => item.key === row.key)) continue
      catalog.backgrounds.push({ ...base, ...parsed.data })
    } else if (row.cat === 'feat') {
      const parsed = featIndexSchema.safeParse(row.data)
      if (!parsed.success || catalog.feats.some((item) => item.key === row.key)) continue
      catalog.feats.push({ ...base, ...parsed.data })
    }
  }
  return catalog
}

export const speciesDefFor = (catalog: OriginCatalog | null | undefined, key: string) =>
  catalog?.species.find((item) => item.key === key) ?? null
export const backgroundDefFor = (catalog: OriginCatalog | null | undefined, key: string) =>
  catalog?.backgrounds.find((item) => item.key === key) ?? null
export const featDefFor = (catalog: OriginCatalog | null | undefined, key: string) =>
  catalog?.feats.find((item) => item.key === key) ?? null

/** What a new character can take: what the campaign offers. */
export const offeredSpecies = (catalog: OriginCatalog) =>
  catalog.species.filter((item) => !item.hidden)
export const offeredBackgrounds = (catalog: OriginCatalog) =>
  catalog.backgrounds.filter((item) => !item.hidden)
/** Feats a character can take when an improvement offers one: general ones and, from their
 * level, epic boons (RYT-171, owner choice P5 A). The SRD's Ability Score Improvement is the
 * improvement's own score choice, so it is not offered again as a feat. */
export const improvementFeats = (catalog: OriginCatalog, level: number) =>
  catalog.feats.filter(
    (item) =>
      !item.hidden &&
      item.key !== 'ability-score-improvement' &&
      (item.category === 'general' || item.category === 'epicBoon') &&
      (item.level ?? 1) <= level,
  )

/** The option picked for a trait; only the build's own keys count (RYT-171 security review). */
export const pickedOption = (build: Pick<Build, 'choices'>, trait: string) =>
  build.choices && Object.hasOwn(build.choices, trait) ? build.choices[trait] : undefined

/** A name in the reader's language. */
export const localName = (names: Names, language: string) =>
  language.startsWith('en') ? names.en : names.es

const kebab = (key: string) => key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)
const split = (key: string) => {
  const at = key.indexOf('--')
  return at < 0 ? { ref: '', bare: key } : { ref: key.slice(0, at + 2), bare: key.slice(at + 2) }
}
/** Glossary entry of a species trait: `feature.species-goliath-giant-ancestry`, or
 * `feature.<ref>--species-triton-amphibious` for a pack species. */
export const traitRef = (speciesKey: string, trait: string) => {
  const { ref, bare } = split(speciesKey)
  return `feature.${ref}species-${bare}-${kebab(trait)}`
}
/** Glossary entry of a feat: `feature.feat-alert`, or `feature.<ref>--feat-brawler`. */
export const featRef = (featKey: string) => {
  const { ref, bare } = split(featKey)
  return `feature.${ref}feat-${bare}`
}
