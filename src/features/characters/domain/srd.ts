// Mechanical reference data from the System Reference Document 5.2 (D&D 2024 rules) by
// Wizards of the Coast LLC, licensed under CC-BY-4.0:
// https://creativecommons.org/licenses/by/4.0/legalcode. Only names, numbers and choices are
// encoded; no rules prose is copied. Localized names live in the i18n catalogs (srd.*).
export const abilityKeys = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const
export type Ability = (typeof abilityKeys)[number]

export const skillAbilities = {
  acrobatics: 'dex',
  animalHandling: 'wis',
  arcana: 'int',
  athletics: 'str',
  deception: 'cha',
  history: 'int',
  insight: 'wis',
  intimidation: 'cha',
  investigation: 'int',
  medicine: 'wis',
  nature: 'int',
  perception: 'wis',
  performance: 'cha',
  persuasion: 'cha',
  religion: 'int',
  sleightOfHand: 'dex',
  stealth: 'dex',
  survival: 'wis',
} as const satisfies Record<string, Ability>
export type Skill = keyof typeof skillAbilities
export const skillKeys = Object.keys(skillAbilities) as Skill[]

// Exhaustion is excluded: it stays a DM-controlled homebrew resource (RYT-003).
export const conditionKeys = [
  'blinded',
  'charmed',
  'deafened',
  'frightened',
  'grappled',
  'incapacitated',
  'invisible',
  'paralyzed',
  'petrified',
  'poisoned',
  'prone',
  'restrained',
  'stunned',
  'unconscious',
] as const
export type Condition = (typeof conditionKeys)[number]

export const casterKinds = ['none', 'full', 'half', 'third', 'pact'] as const
export type CasterKind = (typeof casterKinds)[number]
export const hitDice = [6, 8, 10, 12] as const
export type HitDie = (typeof hitDice)[number]

/**
 * The 12 SRD classes by key. Their tables (hit die, saves, skills, spellcasting, subclass and
 * improvement levels) are pack data since RYT-168 and left the code with RYT-167; the keys stay for
 * the class resources, emblems and quick-build presets the app keeps for the SRD classes.
 */
export const classKeys = [
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
export type ClassKey = (typeof classKeys)[number]

/**
 * RYT-171: the SRD species and backgrounds by key. Their tables (speed, traits, options,
 * abilities, skills and feat) come from the campaign's packs; these keys name the SRD ones in the
 * interface language and select the effects the app applies to them (owner choice P1 A).
 */
export const speciesKeys = [
  'dragonborn',
  'dwarf',
  'elf',
  'gnome',
  'goliath',
  'halfling',
  'human',
  'orc',
  'tiefling',
] as const
export type SpeciesKey = (typeof speciesKeys)[number]
export const backgroundKeys = ['acolyte', 'criminal', 'sage', 'soldier'] as const
export type BackgroundKey = (typeof backgroundKeys)[number]

export const standardArray = [15, 14, 13, 12, 10, 8] as const
export const pointBuyBudget = 27
export const pointBuyCost: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
}

// Full-caster slots by character level, spell levels 1-9.
export const fullCasterSlots: readonly (readonly number[])[] = [
  [2],
  [3],
  [4, 2],
  [4, 3],
  [4, 3, 2],
  [4, 3, 3],
  [4, 3, 3, 1],
  [4, 3, 3, 2],
  [4, 3, 3, 3, 1],
  [4, 3, 3, 3, 2],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 2, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 1, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 1, 1, 1],
  [4, 3, 3, 3, 3, 2, 2, 1, 1],
]

/** RYT-110 Metamagic options (SRD 5.2.1) and their Sorcery Point cost. */
export const metamagicKeys = [
  'careful',
  'distant',
  'empowered',
  'extended',
  'heightened',
  'quickened',
  'seeking',
  'subtle',
  'transmuted',
  'twinned',
] as const
export type MetamagicKey = (typeof metamagicKeys)[number]
export const metamagicCost: Record<MetamagicKey, number> = {
  careful: 1,
  distant: 1,
  empowered: 1,
  extended: 1,
  heightened: 2,
  quickened: 2,
  seeking: 1,
  subtle: 1,
  transmuted: 1,
  twinned: 1,
}
