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

/** RYT-102 traits with options the player picks; the choice lives in `build.choices`. */
export const traitChoices = {
  draconicAncestry: {
    species: 'dragonborn',
    options: [
      'black',
      'blue',
      'brass',
      'bronze',
      'copper',
      'gold',
      'green',
      'red',
      'silver',
      'white',
    ],
  },
  elvenLineage: { species: 'elf', options: ['drow', 'high', 'wood'] },
  gnomishLineage: { species: 'gnome', options: ['forest', 'rock'] },
  giantAncestry: {
    species: 'goliath',
    options: ['cloud', 'fire', 'frost', 'hill', 'stone', 'storm'],
  },
  fiendishLegacy: { species: 'tiefling', options: ['abyssal', 'chthonic', 'infernal'] },
} as const satisfies Record<string, { species: SpeciesKey; options: readonly string[] }>
export type ChoiceKey = keyof typeof traitChoices
export const choiceKeys = Object.keys(traitChoices) as ChoiceKey[]

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
