import { z } from 'zod'
import {
  abilityKeys,
  casterKinds,
  classes,
  classKeys,
  hitDice,
  skillKeys,
  subclassOf,
  type Ability,
  type CasterKind,
  type ClassKey,
  type HitDie,
  type Skill,
} from './srd'

/**
 * RYT-168: classes and subclasses come from the campaign's packs (ADR 051). A class's table is
 * data: hit die, saving throws, skill choices, spellcasting, the level its subclass is chosen,
 * its improvement levels, its prepared spells by level and whether it learns cantrips. Class
 * resources with uses stay in the app for the SRD classes (owner choice P1 A).
 *
 * SRD classes keep their bare key (`wizard`); pack classes are `<ref>--<key>`. An SRD pinned at a
 * version without classes keeps the app's SRD classes, which hold the same data.
 */
export type ClassDef = {
  key: string
  srd: boolean
  /** Names of a pack class; SRD classes are translated by key. */
  name: { en: string; es: string } | null
  hitDie: HitDie
  saves: readonly [Ability, Ability]
  skillCount: number
  skills: readonly Skill[] | 'any'
  caster: CasterKind
  spellAbility: Ability | null
  subclassLevel: number
  improvementLevels: readonly number[]
  /** Spells prepared or known at each level (index 0 = level 1); null for non-casters. */
  prepared: readonly number[] | null
  cantrips: boolean
  pack?: { title_en: string; title_es: string }
  /** No longer offered by the campaign; characters that have it keep it. */
  hidden?: boolean
}
export type SubclassDef = {
  key: string
  classKey: string
  srd: boolean
  name: { en: string; es: string } | null
  pack?: { title_en: string; title_es: string }
  hidden?: boolean
}
export type ClassCatalog = { classes: ClassDef[]; subclasses: SubclassDef[] }

export const defaultImprovementLevels = [4, 8, 12, 16, 19] as const
const improvementLevels: Partial<Record<ClassKey, readonly number[]>> = {
  fighter: [4, 6, 8, 12, 14, 16, 19],
  rogue: [4, 8, 10, 12, 16, 19],
}
/** Spells a class prepares or knows at each level (index 0 = level 1), from its class table. */
const spellsAtLevel: Partial<Record<ClassKey, readonly number[]>> = {
  bard: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  cleric: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  druid: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  sorcerer: [2, 4, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 17, 18, 18, 19, 20, 21, 22],
  warlock: [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 11, 11, 12, 12, 13, 13, 14, 14, 15, 15],
  wizard: [4, 5, 6, 7, 9, 10, 11, 12, 14, 15, 16, 16, 17, 18, 19, 21, 22, 23, 24, 25],
  paladin: [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15],
  ranger: [2, 3, 4, 5, 6, 6, 7, 7, 9, 9, 10, 10, 11, 11, 12, 12, 14, 14, 15, 15],
}
const cantripClasses: readonly ClassKey[] = [
  'bard',
  'cleric',
  'druid',
  'sorcerer',
  'warlock',
  'wizard',
]

/** The SRD classes as the app has always defined them; the SRD pack's entries hold the same. */
export const srdClassDefs: readonly ClassDef[] = classKeys.map((key) => {
  const entry = classes[key]
  return {
    key,
    srd: true,
    name: null,
    hitDie: entry.hitDie,
    saves: entry.saves,
    skillCount: entry.skillCount,
    skills: entry.skills,
    caster: entry.caster,
    spellAbility: entry.spellAbility,
    subclassLevel: 3,
    improvementLevels: improvementLevels[key] ?? defaultImprovementLevels,
    prepared: spellsAtLevel[key] ?? null,
    cantrips: cantripClasses.includes(key),
  }
})
export const srdSubclassDefs: readonly SubclassDef[] = classKeys.map((key) => ({
  key: subclassOf[key],
  classKey: key,
  srd: true,
  name: null,
}))

const reference = z
  .string()
  .max(60)
  .regex(/^(?:[0-9a-f]{8}--)?[a-z0-9]+(?:-[a-z0-9]+)*$/)
const level = z.number().int().min(1).max(20)
/** A class entry's index fields, as the library stores them. */
export const classIndexSchema = z
  .object({
    hitDie: z.union(
      hitDice.map((die) => z.literal(die)) as [
        z.ZodLiteral<6>,
        z.ZodLiteral<8>,
        z.ZodLiteral<10>,
        z.ZodLiteral<12>,
      ],
    ),
    saves: z
      .tuple([z.enum(abilityKeys), z.enum(abilityKeys)])
      .refine(([first, second]) => first !== second),
    skillCount: z.number().int().min(0).max(8),
    skills: z.union([z.literal('any'), z.array(z.enum(skillKeys as [Skill, ...Skill[]])).min(1)]),
    caster: z.enum(casterKinds).default('none'),
    spellAbility: z.enum(abilityKeys).nullable().default(null),
    subclassLevel: level.default(3),
    improvementLevels: z
      .array(level)
      .max(20)
      .default([...defaultImprovementLevels]),
    prepared: z.array(z.number().int().min(0).max(40)).length(20).nullable().default(null),
    cantrips: z.boolean().default(false),
  })
  .refine((index) => index.caster === 'none' || index.spellAbility !== null, {
    path: ['spellAbility'],
  })

export type ClassIndex = z.input<typeof classIndexSchema>
export const subclassIndexSchema = z.object({ class: reference })

/** A class or subclass row of the campaign's packs (the glossary's `ClassRow`). */
export type ClassRowLike = {
  cat: 'class' | 'subclass'
  key: string
  en: string
  es: string
  data: Record<string, unknown>
  hidden?: boolean
  pack?: { title_en: string; title_es: string }
}

/**
 * The classes and subclasses a campaign has. SRD rows (bare keys) carry their SRD data; when the
 * packs have no SRD class at all, the app's SRD classes stand in for them.
 */
export function buildClassCatalog(rows: readonly ClassRowLike[]): ClassCatalog {
  const catalog: ClassCatalog = { classes: [], subclasses: [] }
  for (const row of rows) {
    const srd = !row.key.includes('--')
    const name = srd ? null : { en: row.en, es: row.es }
    const extra = {
      ...(row.hidden ? { hidden: true } : {}),
      ...(row.pack ? { pack: row.pack } : {}),
    }
    if (row.cat === 'class') {
      if (catalog.classes.some((item) => item.key === row.key)) continue
      const parsed = classIndexSchema.safeParse(row.data)
      if (!parsed.success) continue
      const data = parsed.data
      catalog.classes.push({
        key: row.key,
        srd,
        name,
        ...data,
        spellAbility: data.caster === 'none' ? null : data.spellAbility,
        improvementLevels: [...new Set(data.improvementLevels)].sort((a, b) => a - b),
        ...extra,
      })
    } else {
      if (catalog.subclasses.some((item) => item.key === row.key)) continue
      const parsed = subclassIndexSchema.safeParse(row.data)
      if (!parsed.success) continue
      catalog.subclasses.push({ key: row.key, classKey: parsed.data.class, srd, name, ...extra })
    }
  }
  if (!catalog.classes.some((item) => item.srd)) catalog.classes.unshift(...srdClassDefs)
  if (!catalog.subclasses.some((item) => item.srd)) catalog.subclasses.unshift(...srdSubclassDefs)
  return catalog
}

/** A class's definition: from the campaign's packs, or the app's SRD class of that key. */
export function classDefFor(catalog: ClassCatalog | null | undefined, key: string) {
  return (
    catalog?.classes.find((item) => item.key === key) ??
    srdClassDefs.find((item) => item.key === key) ??
    null
  )
}

/** Classes a new character can take: the ones the campaign offers, SRD first. */
export const offeredClasses = (catalog: ClassCatalog) =>
  catalog.classes.filter((item) => !item.hidden)

/** Subclasses offered for a class (from the SRD or any enabled pack). */
export function subclassesFor(catalog: ClassCatalog | null | undefined, classKey: string) {
  const list = catalog?.subclasses ?? srdSubclassDefs
  return list.filter((item) => item.classKey === classKey && !item.hidden)
}

/** A class's or subclass's name: the SRD's in the interface language, or the pack entry's. */
export function classDefName(
  t: (key: string) => string,
  def: Pick<ClassDef, 'key' | 'name'> | Pick<SubclassDef, 'key' | 'name'>,
  language: string,
  cat: 'class' | 'subclass' = 'class',
) {
  if (def.name) return language.startsWith('en') ? def.name.en : def.name.es
  return t(`srd.${cat}.${def.key}`)
}

/** A class entry's index as the library stores it, from a definition (the SRD upload). */
export function classIndexOf(def: ClassDef): Required<ClassIndex> {
  return {
    hitDie: def.hitDie,
    saves: [...def.saves] as [Ability, Ability],
    skillCount: def.skillCount,
    skills: def.skills === 'any' ? 'any' : [...def.skills],
    caster: def.caster,
    spellAbility: def.spellAbility,
    subclassLevel: def.subclassLevel,
    improvementLevels: [...def.improvementLevels],
    prepared: def.prepared ? [...def.prepared] : null,
    cantrips: def.cantrips,
  }
}
