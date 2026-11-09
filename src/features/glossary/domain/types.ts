import { z } from 'zod'

/**
 * Bundled SRD content (scripts/glossary → src/features/glossary/content). Content comes from the
 * System Reference Document 5.2.1 and 5.1 by Wizards of the Coast LLC, CC-BY-4.0 (ADR 025).
 * Text uses Rytta's inline mini-markup (`*em*`, `**strong**`) and is never rendered as HTML.
 */
export type GlossaryLanguage = 'es' | 'en'

export const srdCategories = [
  'condition',
  'action',
  'rule',
  'area',
  'attitude',
  'hazard',
  'ability',
  'skill',
  'damage',
  'property',
  'mastery',
  'spell',
  'feature',
] as const
export type SrdCategory = (typeof srdCategories)[number]

export const factKeys = [
  'action',
  'cause',
  'trigger',
  'effect',
  'attack',
  'save',
  'check',
  'speed',
  'damage',
  'duration',
  'escape',
  'ends',
] as const
export type FactKey = (typeof factKeys)[number]

export const spellSchools = [
  'abjuration',
  'conjuration',
  'divination',
  'enchantment',
  'evocation',
  'illusion',
  'necromancy',
  'transmutation',
] as const
export type SpellSchool = (typeof spellSchools)[number]

export const spellClasses = [
  'bard',
  'cleric',
  'druid',
  'paladin',
  'ranger',
  'sorcerer',
  'warlock',
  'wizard',
] as const
export type SpellClass = (typeof spellClasses)[number]

/** Every class (features); spellClasses lists only the eight with a spell list. */
export const featureClasses = [
  'barbarian',
  'bard',
  'cleric',
  'druid',
  'fighter',
  'monk',
  'paladin',
  'ranger',
  'rogue',
  'sorcerer',
  'warlock',
  'wizard',
] as const
export type FeatureClass = (typeof featureClasses)[number]
/** The one SRD 5.2.1 subclass of each class. */
export const featureSubclasses = [
  'berserker',
  'lore',
  'life',
  'land',
  'champion',
  'open-hand',
  'devotion',
  'hunter',
  'thief',
  'draconic',
  'fiend',
  'evoker',
] as const
export type FeatureSubclass = (typeof featureSubclasses)[number]

export const abilityIds = [
  'strength',
  'dexterity',
  'constitution',
  'intelligence',
  'wisdom',
  'charisma',
] as const
export type AbilityId = (typeof abilityIds)[number]

const text = z.string().max(4000)
export const blockSchema = z.discriminatedUnion('t', [
  z.object({ t: z.literal('p'), x: text, lead: z.string().min(1).max(200).optional() }).strict(),
  z.object({ t: z.literal('ul'), items: z.array(text.min(1)).min(1) }).strict(),
  z
    .object({
      t: z.literal('table'),
      caption: z.string().min(1).max(120).optional(),
      head: z.array(z.string().max(120)).optional(),
      rows: z.array(z.array(z.string().max(1200)).min(1)).min(1),
    })
    .strict(),
])
export type Block = z.infer<typeof blockSchema>

export const spellStatsSchema = z
  .object({
    time: z.string().min(1).max(200),
    range: z.string().min(1).max(120),
    components: z.string().regex(/^M?S?V?$/),
    duration: z.string().min(1).max(120),
    material: z.string().min(1).max(400).optional(),
    save: z.enum(abilityIds).optional(),
    attack: z.enum(['melee', 'ranged']).optional(),
    damage: z.array(z.string().min(1).max(20)).min(1).optional(),
  })
  .strict()
export type SpellStats = z.infer<typeof spellStatsSchema>

export const entryBodySchema = z
  .object({
    page: z.number().int().min(1).max(500),
    summary: z.string().min(1).max(300),
    blocks: z.array(blockSchema).min(1),
    facts: z.array(z.tuple([z.enum(factKeys), z.string().min(1).max(400)])).optional(),
    spell: spellStatsSchema.optional(),
    legacy: z
      .object({ page: z.number().int().min(1).max(500), blocks: z.array(blockSchema).min(1) })
      .strict()
      .optional(),
  })
  .strict()
export type EntryBody = z.infer<typeof entryBodySchema>
export type EntryBodies = Record<string, EntryBody>

const name = z.string().min(1).max(80)
export const indexRowSchema = z
  .object({
    id: z.string().regex(/^[a-z]+\.[a-z0-9-]+$/),
    cat: z.enum(srdCategories),
    en: name,
    es: name,
    ea: z.array(name).min(1).optional(),
    sa: z.array(name).min(1).optional(),
    nl: z.literal(1).optional(),
    lv: z.number().int().min(0).max(20).optional(),
    sc: z.enum(spellSchools).optional(),
    cl: z.array(z.enum(spellClasses)).min(1).optional(),
    co: z.literal(1).optional(),
    ri: z.literal(1).optional(),
    ab: z.enum(abilityIds).optional(),
    fc: z.enum(featureClasses).optional(),
    sb: z.enum(featureSubclasses).optional(),
    ed: z.literal('2014').optional(),
  })
  .strict()
export type IndexRow = z.infer<typeof indexRowSchema>
