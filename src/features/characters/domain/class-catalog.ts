import { z } from 'zod'
import {
  abilityKeys,
  casterKinds,
  hitDice,
  skillKeys,
  type Ability,
  type CasterKind,
  type HitDie,
  type Skill,
} from './srd'

/**
 * RYT-168: classes and subclasses come from the campaign's packs (ADR 051). A class's table is
 * data: hit die, saving throws, skill choices, spellcasting, the level its subclass is chosen,
 * its improvement levels, its prepared spells by level and whether it learns cantrips. Class
 * resources with uses stay in the app for the SRD classes (owner choice P1 A).
 *
 * SRD classes keep their bare key (`wizard`); pack classes are `<ref>--<key>`. Since RYT-167 the
 * code holds no class table: a campaign has the classes of its packs.
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
  cat: string
  key: string
  en: string
  es: string
  data: Record<string, unknown>
  hidden?: boolean
  pack?: { title_en: string; title_es: string }
}

/** The classes and subclasses a campaign has, from its packs. */
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
    } else if (row.cat === 'subclass') {
      if (catalog.subclasses.some((item) => item.key === row.key)) continue
      const parsed = subclassIndexSchema.safeParse(row.data)
      if (!parsed.success) continue
      catalog.subclasses.push({ key: row.key, classKey: parsed.data.class, srd, name, ...extra })
    }
  }
  return catalog
}

/** A class's definition in the campaign's packs. */
export function classDefFor(catalog: ClassCatalog | null | undefined, key: string) {
  return catalog?.classes.find((item) => item.key === key) ?? null
}

/** Classes a new character can take: the ones the campaign offers, SRD first. */
export const offeredClasses = (catalog: ClassCatalog) =>
  catalog.classes.filter((item) => !item.hidden)

/** Subclasses offered for a class (from the SRD or any enabled pack). */
export function subclassesFor(catalog: ClassCatalog | null | undefined, classKey: string) {
  const list = catalog?.subclasses ?? []
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
