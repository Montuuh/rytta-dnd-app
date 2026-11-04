import { z } from 'zod'

/**
 * Creature stat blocks (ADR 028). Bundled SRD monsters come from the System Reference Document
 * 5.2.1 by Wizards of the Coast LLC, CC-BY-4.0 (scripts/bestiary → src/features/bestiary/content);
 * homebrew templates store the same shape. Text uses Rytta's inline mini-markup (`*em*`,
 * `**strong**`) and is never rendered as HTML.
 */
export type BestiaryLanguage = 'es' | 'en'

export const creatureSizes = ['tiny', 'small', 'medium', 'large', 'huge', 'gargantuan'] as const
export type CreatureSize = (typeof creatureSizes)[number]

export const creatureTypes = [
  'aberration',
  'beast',
  'celestial',
  'construct',
  'dragon',
  'elemental',
  'fey',
  'fiend',
  'giant',
  'humanoid',
  'monstrosity',
  'ooze',
  'plant',
  'undead',
] as const
export type CreatureType = (typeof creatureTypes)[number]

export const challengeRatings = [
  '0',
  '1/8',
  '1/4',
  '1/2',
  ...Array.from({ length: 30 }, (_, i) => String(i + 1)),
] as const
export type ChallengeRating = string

export const abilityKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
export type AbilityKey = (typeof abilityKeys)[number]

export const sectionKinds = [
  'traits',
  'actions',
  'bonusActions',
  'reactions',
  'legendaryActions',
] as const
export type SectionKind = (typeof sectionKinds)[number]

export const detailKeys = [
  'skills',
  'resistances',
  'vulnerabilities',
  'immunities',
  'gear',
  'senses',
  'languages',
] as const
export type DetailKey = (typeof detailKeys)[number]

export const entryKeyPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

const usageSchema = z.object({
  recharge: z.number().int().min(2).max(6).optional(),
  perDay: z.number().int().min(1).max(9).optional(),
  lair: z.number().int().min(1).max(9).optional(),
  rest: z.literal(1).optional(),
})
export type EntryUsage = z.infer<typeof usageSchema>

export const entrySchema = z.object({
  key: z.string().regex(entryKeyPattern).max(80),
  name: z.string().trim().min(1).max(120),
  text: z.array(z.string().max(4000)).max(12),
  usage: usageSchema.optional(),
  /** Spells castable N times per day, by glossary spell id ("spell.fireball"). */
  spells: z
    .array(
      z.object({
        perDay: z.number().int().min(1).max(9),
        spells: z.array(z.string().regex(/^spell\.[a-z0-9-]+$/)).max(20),
      }),
    )
    .max(4)
    .optional(),
})
export type StatEntry = z.infer<typeof entrySchema>

export const sectionSchema = z.object({
  kind: z.enum(sectionKinds),
  intro: z.string().max(1000).optional(),
  entries: z.array(entrySchema).max(40),
})
export type StatSection = z.infer<typeof sectionSchema>

const abilitySchema = z.object({
  score: z.number().int().min(1).max(30),
  mod: z.number().int().min(-5).max(10),
  save: z.number().int().min(-5).max(30),
})
export type AbilityScore = z.infer<typeof abilitySchema>

export const statBlockSchema = z.object({
  name: z.string().trim().min(1).max(120),
  meta: z.string().max(200),
  ac: z.string().max(80),
  initiative: z.string().max(40),
  hp: z.string().max(80),
  hpFormula: z
    .string()
    .regex(/^[1-9]\d{0,2}d(4|6|8|10|12|20)([+-]\d{1,4})?$/)
    .optional(),
  speed: z.string().max(200),
  abilities: z.partialRecord(z.enum(abilityKeys), abilitySchema),
  details: z.partialRecord(z.enum(detailKeys), z.string().max(600)),
  cr: z.string().max(80),
  page: z.number().int().optional(),
  sections: z.array(sectionSchema).max(6),
})
export type StatBlock = z.infer<typeof statBlockSchema>

/** One SRD creature in the language-neutral index (search, filters, combat numbers). */
export const monsterRowSchema = z.object({
  id: z.string().regex(entryKeyPattern),
  en: z.string().min(1),
  es: z.string().min(1),
  cr: z.enum(challengeRatings as unknown as [string, ...string[]]),
  xp: z.number().int().min(0),
  pb: z.number().int().min(2).max(9),
  ac: z.number().int().min(1).max(30),
  hp: z.number().int().min(1),
  init: z.number().int(),
  size: z.array(z.enum(creatureSizes)).min(1),
  type: z.enum(creatureTypes),
  tags: z.array(z.string()).optional(),
  swarm: z.literal(1).optional(),
  pages: z.object({ en: z.number().int(), es: z.number().int() }),
  group: z.object({ en: z.string(), es: z.string() }).optional(),
  xpLair: z.number().int().optional(),
  leg: z.number().int().min(1).max(9).optional(),
  legLair: z.number().int().optional(),
  animal: z.literal(1).optional(),
})
export type MonsterRow = z.infer<typeof monsterRowSchema>

export const baselineSchema = z.object({
  cr: z.string(),
  n: z.number().int(),
  xp: z.number().int(),
  ac: z.number().int(),
  hp: z.number().int(),
  attack: z.number().int(),
  dc: z.number().int(),
})
export type Baseline = z.infer<typeof baselineSchema>

export const libraryTraitSchema = z.object({
  key: z.string().regex(entryKeyPattern),
  from: z.string().regex(entryKeyPattern),
  count: z.number().int().min(2),
  name: z.string().min(1),
  text: z.array(z.string()),
})
export type LibraryTrait = z.infer<typeof libraryTraitSchema>

export type MonsterIndex = { monsters: MonsterRow[]; baselines: Baseline[] }
export type MonsterBodies = { monsters: Record<string, StatBlock>; traits: LibraryTrait[] }
