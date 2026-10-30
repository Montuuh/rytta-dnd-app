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

export const casterKinds = ['none', 'full', 'half', 'pact'] as const
export type CasterKind = (typeof casterKinds)[number]
export const hitDice = [6, 8, 10, 12] as const
export type HitDie = (typeof hitDice)[number]

export type ClassEntry = {
  hitDie: HitDie
  saves: readonly [Ability, Ability]
  skillCount: number
  skills: readonly Skill[] | 'any'
  caster: CasterKind
  spellAbility: Ability | null
}
export const classes = {
  barbarian: {
    hitDie: 12,
    saves: ['str', 'con'],
    skillCount: 2,
    skills: ['animalHandling', 'athletics', 'intimidation', 'nature', 'perception', 'survival'],
    caster: 'none',
    spellAbility: null,
  },
  bard: {
    hitDie: 8,
    saves: ['dex', 'cha'],
    skillCount: 3,
    skills: 'any',
    caster: 'full',
    spellAbility: 'cha',
  },
  cleric: {
    hitDie: 8,
    saves: ['wis', 'cha'],
    skillCount: 2,
    skills: ['history', 'insight', 'medicine', 'persuasion', 'religion'],
    caster: 'full',
    spellAbility: 'wis',
  },
  druid: {
    hitDie: 8,
    saves: ['int', 'wis'],
    skillCount: 2,
    skills: [
      'arcana',
      'animalHandling',
      'insight',
      'medicine',
      'nature',
      'perception',
      'religion',
      'survival',
    ],
    caster: 'full',
    spellAbility: 'wis',
  },
  fighter: {
    hitDie: 10,
    saves: ['str', 'con'],
    skillCount: 2,
    skills: [
      'acrobatics',
      'animalHandling',
      'athletics',
      'history',
      'insight',
      'intimidation',
      'persuasion',
      'perception',
      'survival',
    ],
    caster: 'none',
    spellAbility: null,
  },
  monk: {
    hitDie: 8,
    saves: ['str', 'dex'],
    skillCount: 2,
    skills: ['acrobatics', 'athletics', 'history', 'insight', 'religion', 'stealth'],
    caster: 'none',
    spellAbility: null,
  },
  paladin: {
    hitDie: 10,
    saves: ['wis', 'cha'],
    skillCount: 2,
    skills: ['athletics', 'insight', 'intimidation', 'medicine', 'persuasion', 'religion'],
    caster: 'half',
    spellAbility: 'cha',
  },
  ranger: {
    hitDie: 10,
    saves: ['str', 'dex'],
    skillCount: 3,
    skills: [
      'animalHandling',
      'athletics',
      'insight',
      'investigation',
      'nature',
      'perception',
      'stealth',
      'survival',
    ],
    caster: 'half',
    spellAbility: 'wis',
  },
  rogue: {
    hitDie: 8,
    saves: ['dex', 'int'],
    skillCount: 4,
    skills: [
      'acrobatics',
      'athletics',
      'deception',
      'insight',
      'intimidation',
      'investigation',
      'perception',
      'persuasion',
      'sleightOfHand',
      'stealth',
    ],
    caster: 'none',
    spellAbility: null,
  },
  sorcerer: {
    hitDie: 6,
    saves: ['con', 'cha'],
    skillCount: 2,
    skills: ['arcana', 'deception', 'insight', 'intimidation', 'persuasion', 'religion'],
    caster: 'full',
    spellAbility: 'cha',
  },
  warlock: {
    hitDie: 8,
    saves: ['wis', 'cha'],
    skillCount: 2,
    skills: [
      'arcana',
      'deception',
      'history',
      'intimidation',
      'investigation',
      'nature',
      'religion',
    ],
    caster: 'pact',
    spellAbility: 'cha',
  },
  wizard: {
    hitDie: 6,
    saves: ['int', 'wis'],
    skillCount: 2,
    skills: ['arcana', 'history', 'insight', 'investigation', 'medicine', 'nature', 'religion'],
    caster: 'full',
    spellAbility: 'int',
  },
} as const satisfies Record<string, ClassEntry>
export type ClassKey = keyof typeof classes
export const classKeys = Object.keys(classes) as ClassKey[]

export const species = {
  dragonborn: {
    speed: 30,
    traits: [
      'draconicAncestry',
      'breathWeapon',
      'damageResistance',
      'darkvision',
      'draconicFlight',
    ],
  },
  dwarf: {
    speed: 30,
    traits: ['darkvision', 'dwarvenResilience', 'dwarvenToughness', 'stonecunning'],
  },
  elf: { speed: 30, traits: ['darkvision', 'elvenLineage', 'feyAncestry', 'keenSenses', 'trance'] },
  gnome: { speed: 30, traits: ['darkvision', 'gnomishCunning', 'gnomishLineage'] },
  goliath: { speed: 35, traits: ['giantAncestry', 'largeForm', 'powerfulBuild'] },
  halfling: { speed: 30, traits: ['brave', 'halflingNimbleness', 'luck', 'naturallyStealthy'] },
  human: { speed: 30, traits: ['resourceful', 'skillful', 'versatile'] },
  orc: { speed: 30, traits: ['adrenalineRush', 'darkvision', 'relentlessEndurance'] },
  tiefling: { speed: 30, traits: ['darkvision', 'fiendishLegacy', 'otherworldlyPresence'] },
} as const
export type SpeciesKey = keyof typeof species
export const speciesKeys = Object.keys(species) as SpeciesKey[]
export type TraitKey = (typeof species)[SpeciesKey]['traits'][number]

export const backgrounds = {
  acolyte: {
    abilities: ['int', 'wis', 'cha'],
    skills: ['insight', 'religion'],
    feat: 'magicInitiateCleric',
  },
  criminal: {
    abilities: ['dex', 'con', 'int'],
    skills: ['sleightOfHand', 'stealth'],
    feat: 'alert',
  },
  sage: {
    abilities: ['con', 'int', 'wis'],
    skills: ['arcana', 'history'],
    feat: 'magicInitiateWizard',
  },
  soldier: {
    abilities: ['str', 'dex', 'con'],
    skills: ['athletics', 'intimidation'],
    feat: 'savageAttacker',
  },
} as const satisfies Record<
  string,
  { abilities: readonly [Ability, Ability, Ability]; skills: readonly Skill[]; feat: string }
>
export type BackgroundKey = keyof typeof backgrounds
export const backgroundKeys = Object.keys(backgrounds) as BackgroundKey[]
export type FeatKey = (typeof backgrounds)[BackgroundKey]['feat']

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
