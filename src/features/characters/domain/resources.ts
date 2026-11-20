import type { Build } from './sheet'
import type { RestKind } from './progression'
import {
  backgrounds,
  classes,
  species as speciesTable,
  type Ability,
  type ChoiceKey,
  metamagicCost,
  metamagicKeys,
  type ClassKey,
  type MetamagicKey,
  type SpeciesKey,
} from './srd'

/**
 * RYT-071 / RYT-102 resources from the SRD 5.2.1 class tables, the SRD subclass of each class,
 * species traits and feats (names and numbers only; the rules text is the linked glossary
 * entry). Each becomes a tracker whose maximum follows the level. Several features regain one use
 * on a Short Rest and all on a Long Rest; Rytta tracks them as long-rest resources and the
 * glossary text explains the partial recovery.
 */
export type ResourceSource = 'class' | 'species' | 'feat'
/** Origin feats Rytta tracks; both Magic Initiate backgrounds grant the same feat. */
export type TrackedFeat = 'magicInitiate' | 'savageAttacker'
export type ResourceSpec = {
  key: string
  source: ResourceSource
  /** Class resources: the class, and the SRD subclass when only the subclass grants it. */
  classKey?: ClassKey
  subclass?: string
  /** Species resources: the species, and the trait option that grants it. */
  species?: SpeciesKey
  choice?: readonly [ChoiceKey, string]
  feat?: TrackedFeat
  /** Glossary entry that explains the resource (a feature or, for lineage spells, the spell). */
  feature: string
  /** First class (or character) level with the resource. */
  from: number
  max: (level: number, mods: Record<Ability, number>) => number
  reset: (level: number) => RestKind
  display: 'pips' | 'counter'
  /** Once-per-turn benefits: one light mark, cleared by hand or by any rest (RYT-102). */
  per?: 'turn'
  /** A die that grows with the level (Bardic Inspiration d8, Sneak Attack 3d6). */
  die?: (level: number) => string
}

const byLevel = (steps: [number, number][]) => (level: number) =>
  steps.reduce((value, [from, count]) => (level >= from ? count : value), 0)
const always = (kind: RestKind) => (): RestKind => kind
const once = () => 1
const proficiency = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4)
const atLeastOne = (ability: Ability) => (_level: number, mods: Record<Ability, number>) =>
  Math.max(1, mods[ability])
const dieBy = (steps: [number, string][]) => (level: number) =>
  steps.reduce((value, [from, die]) => (level >= from ? die : value), steps[0]![1])

type ClassSpec = Omit<ResourceSpec, 'source' | 'classKey'> & { classKey: ClassKey }
const classSpec = (spec: Omit<ClassSpec, 'display'> & { display?: ResourceSpec['display'] }) =>
  ({ display: 'pips', ...spec, source: 'class' }) as ResourceSpec & { classKey: ClassKey }
const turnSpec = (spec: Omit<ResourceSpec, 'max' | 'reset' | 'display' | 'per'>): ResourceSpec => ({
  ...spec,
  max: once,
  reset: always('short'),
  display: 'pips',
  per: 'turn',
})

export const classResources: readonly (ResourceSpec & { classKey: ClassKey })[] = [
  classSpec({
    key: 'barbarian-rage',
    classKey: 'barbarian',
    feature: 'feature.barbarian-rage',
    from: 1,
    max: byLevel([
      [1, 2],
      [3, 3],
      [6, 4],
      [12, 5],
      [17, 6],
    ]),
    reset: always('long'),
  }),
  classSpec({
    key: 'barbarian-persistent-rage',
    classKey: 'barbarian',
    feature: 'feature.barbarian-persistent-rage',
    from: 15,
    max: once,
    reset: always('long'),
  }),
  classSpec({
    key: 'barbarian-intimidating-presence',
    classKey: 'barbarian',
    subclass: 'berserker',
    feature: 'feature.barbarian-berserker-intimidating-presence',
    from: 14,
    max: once,
    reset: always('long'),
  }),
  {
    ...turnSpec({
      key: 'barbarian-frenzy',
      source: 'class',
      subclass: 'berserker',
      feature: 'feature.barbarian-berserker-frenzy',
      from: 3,
    }),
    classKey: 'barbarian',
  },
  classSpec({
    key: 'bard-bardic-inspiration',
    classKey: 'bard',
    feature: 'feature.bard-bardic-inspiration',
    from: 1,
    max: atLeastOne('cha'),
    // Font of Inspiration (level 5): regained on a Short or Long Rest.
    reset: (level) => (level >= 5 ? 'short' : 'long'),
    die: dieBy([
      [1, 'd6'],
      [5, 'd8'],
      [10, 'd10'],
      [15, 'd12'],
    ]),
  }),
  classSpec({
    key: 'cleric-channel-divinity',
    classKey: 'cleric',
    feature: 'feature.cleric-channel-divinity',
    from: 2,
    max: byLevel([
      [2, 2],
      [6, 3],
      [18, 4],
    ]),
    reset: always('long'),
  }),
  classSpec({
    key: 'cleric-divine-intervention',
    classKey: 'cleric',
    feature: 'feature.cleric-divine-intervention',
    from: 10,
    max: once,
    reset: always('long'),
  }),
  classSpec({
    key: 'druid-wild-shape',
    classKey: 'druid',
    feature: 'feature.druid-wild-shape',
    from: 2,
    max: byLevel([
      [2, 2],
      [6, 3],
      [17, 4],
    ]),
    reset: always('long'),
  }),
  classSpec({
    key: 'druid-wild-resurgence',
    classKey: 'druid',
    feature: 'feature.druid-wild-resurgence',
    from: 5,
    max: once,
    reset: always('long'),
  }),
  classSpec({
    key: 'druid-nature-magician',
    classKey: 'druid',
    feature: 'feature.druid-archdruid',
    from: 20,
    max: once,
    reset: always('long'),
  }),
  classSpec({
    key: 'druid-natural-recovery',
    classKey: 'druid',
    subclass: 'land',
    feature: 'feature.druid-land-natural-recovery',
    from: 6,
    // One circle spell without a slot and one slot recovery, each once per Long Rest.
    max: () => 2,
    reset: always('long'),
  }),
  classSpec({
    key: 'fighter-second-wind',
    classKey: 'fighter',
    feature: 'feature.fighter-second-wind',
    from: 1,
    max: byLevel([
      [1, 2],
      [4, 3],
      [10, 4],
    ]),
    reset: always('long'),
  }),
  classSpec({
    key: 'fighter-action-surge',
    classKey: 'fighter',
    feature: 'feature.fighter-action-surge',
    from: 2,
    max: byLevel([
      [2, 1],
      [17, 2],
    ]),
    reset: always('short'),
  }),
  classSpec({
    key: 'fighter-indomitable',
    classKey: 'fighter',
    feature: 'feature.fighter-indomitable',
    from: 9,
    max: byLevel([
      [9, 1],
      [13, 2],
      [17, 3],
    ]),
    reset: always('long'),
  }),
  classSpec({
    key: 'monk-focus',
    classKey: 'monk',
    feature: 'feature.monk-monks-focus',
    from: 2,
    max: (level) => level,
    reset: always('short'),
  }),
  classSpec({
    key: 'monk-uncanny-metabolism',
    classKey: 'monk',
    feature: 'feature.monk-uncanny-metabolism',
    from: 2,
    max: once,
    reset: always('long'),
  }),
  classSpec({
    key: 'monk-wholeness-of-body',
    classKey: 'monk',
    subclass: 'open-hand',
    feature: 'feature.monk-open-hand-wholeness-of-body',
    from: 6,
    max: atLeastOne('wis'),
    reset: always('long'),
  }),
  classSpec({
    key: 'paladin-lay-on-hands',
    classKey: 'paladin',
    feature: 'feature.paladin-lay-on-hands',
    from: 1,
    max: (level) => 5 * level,
    reset: always('long'),
    display: 'counter',
  }),
  classSpec({
    key: 'paladin-smite',
    classKey: 'paladin',
    feature: 'feature.paladin-paladins-smite',
    from: 2,
    max: once,
    reset: always('long'),
  }),
  classSpec({
    key: 'paladin-channel-divinity',
    classKey: 'paladin',
    feature: 'feature.paladin-channel-divinity',
    from: 3,
    max: byLevel([
      [3, 2],
      [11, 3],
    ]),
    reset: always('long'),
  }),
  classSpec({
    key: 'paladin-faithful-steed',
    classKey: 'paladin',
    feature: 'feature.paladin-faithful-steed',
    from: 5,
    max: once,
    reset: always('long'),
  }),
  classSpec({
    key: 'paladin-holy-nimbus',
    classKey: 'paladin',
    subclass: 'devotion',
    feature: 'feature.paladin-devotion-holy-nimbus',
    from: 20,
    max: once,
    reset: always('long'),
  }),
  classSpec({
    key: 'ranger-favored-enemy',
    classKey: 'ranger',
    feature: 'feature.ranger-favored-enemy',
    from: 1,
    max: byLevel([
      [1, 2],
      [5, 3],
      [9, 4],
      [13, 5],
      [17, 6],
    ]),
    reset: always('long'),
  }),
  classSpec({
    key: 'ranger-tireless',
    classKey: 'ranger',
    feature: 'feature.ranger-tireless',
    from: 10,
    max: atLeastOne('wis'),
    reset: always('long'),
  }),
  classSpec({
    key: 'ranger-natures-veil',
    classKey: 'ranger',
    feature: 'feature.ranger-natures-veil',
    from: 14,
    max: atLeastOne('wis'),
    reset: always('long'),
  }),
  {
    ...turnSpec({
      key: 'ranger-hunters-prey',
      source: 'class',
      subclass: 'hunter',
      feature: 'feature.ranger-hunter-hunters-prey',
      from: 3,
    }),
    classKey: 'ranger',
  },
  {
    ...turnSpec({
      key: 'rogue-sneak-attack',
      source: 'class',
      feature: 'feature.rogue-sneak-attack',
      from: 1,
      die: (level) => `${Math.ceil(level / 2)}d6`,
    }),
    classKey: 'rogue',
  },
  classSpec({
    key: 'rogue-stroke-of-luck',
    classKey: 'rogue',
    feature: 'feature.rogue-stroke-of-luck',
    from: 20,
    max: once,
    reset: always('short'),
  }),
  classSpec({
    key: 'sorcerer-innate-sorcery',
    classKey: 'sorcerer',
    feature: 'feature.sorcerer-innate-sorcery',
    from: 1,
    max: () => 2,
    reset: always('long'),
  }),
  classSpec({
    key: 'sorcerer-sorcery-points',
    classKey: 'sorcerer',
    feature: 'feature.sorcerer-font-of-magic',
    from: 2,
    max: (level) => level,
    reset: always('long'),
    display: 'counter',
  }),
  classSpec({
    key: 'sorcerer-sorcerous-restoration',
    classKey: 'sorcerer',
    feature: 'feature.sorcerer-sorcerous-restoration',
    from: 5,
    max: once,
    reset: always('long'),
  }),
  classSpec({
    key: 'sorcerer-dragon-wings',
    classKey: 'sorcerer',
    subclass: 'draconic',
    feature: 'feature.sorcerer-draconic-dragon-wings',
    from: 14,
    max: once,
    reset: always('long'),
  }),
  classSpec({
    key: 'sorcerer-dragon-companion',
    classKey: 'sorcerer',
    subclass: 'draconic',
    feature: 'feature.sorcerer-draconic-dragon-companion',
    from: 18,
    max: once,
    reset: always('long'),
  }),
  {
    ...turnSpec({
      key: 'sorcerer-arcane-apotheosis',
      source: 'class',
      feature: 'feature.sorcerer-arcane-apotheosis',
      from: 20,
    }),
    classKey: 'sorcerer',
  },
  classSpec({
    key: 'warlock-magical-cunning',
    classKey: 'warlock',
    feature: 'feature.warlock-magical-cunning',
    from: 2,
    max: once,
    reset: always('long'),
  }),
  classSpec({
    key: 'warlock-contact-patron',
    classKey: 'warlock',
    feature: 'feature.warlock-contact-patron',
    from: 9,
    max: once,
    reset: always('long'),
  }),
  classSpec({
    key: 'warlock-mystic-arcanum',
    classKey: 'warlock',
    feature: 'feature.warlock-mystic-arcanum',
    from: 11,
    // One arcanum spell at 11 (level 6), 13 (7), 15 (8) and 17 (9), each once per Long Rest.
    max: byLevel([
      [11, 1],
      [13, 2],
      [15, 3],
      [17, 4],
    ]),
    reset: always('long'),
  }),
  classSpec({
    key: 'warlock-dark-ones-own-luck',
    classKey: 'warlock',
    subclass: 'fiend',
    feature: 'feature.warlock-fiend-dark-ones-own-luck',
    from: 6,
    max: atLeastOne('cha'),
    reset: always('long'),
  }),
  classSpec({
    key: 'warlock-hurl-through-hell',
    classKey: 'warlock',
    subclass: 'fiend',
    feature: 'feature.warlock-fiend-hurl-through-hell',
    from: 14,
    max: once,
    reset: always('long'),
  }),
  classSpec({
    key: 'wizard-arcane-recovery',
    classKey: 'wizard',
    feature: 'feature.wizard-arcane-recovery',
    from: 1,
    max: once,
    reset: always('long'),
  }),
  classSpec({
    key: 'wizard-signature-spells',
    classKey: 'wizard',
    feature: 'feature.wizard-signature-spells',
    from: 20,
    max: () => 2,
    reset: always('short'),
  }),
  classSpec({
    key: 'wizard-overchannel',
    classKey: 'wizard',
    subclass: 'evoker',
    feature: 'feature.wizard-evoker-overchannel',
    from: 14,
    max: once,
    reset: always('long'),
  }),
]

const speciesSpec = (
  spec: Omit<ResourceSpec, 'source' | 'display' | 'reset'> & { reset?: RestKind },
): ResourceSpec => ({
  display: 'pips',
  ...spec,
  reset: always(spec.reset ?? 'long'),
  source: 'species',
})
const pbUses = (level: number) => proficiency(level)
/** A lineage or legacy spell cast once per Long Rest without a slot (character level 3 and 5). */
const lineageSpell = (
  species: SpeciesKey,
  choice: readonly [ChoiceKey, string],
  spell: string,
  from: number,
) =>
  speciesSpec({
    key: `${species}-${spell}`,
    species,
    choice,
    feature: `spell.${spell}`,
    from,
    max: once,
  })

export const originResources: readonly ResourceSpec[] = [
  speciesSpec({
    key: 'dragonborn-breath-weapon',
    species: 'dragonborn',
    feature: 'feature.species-dragonborn-breath-weapon',
    from: 1,
    max: pbUses,
    die: dieBy([
      [1, '1d10'],
      [5, '2d10'],
      [11, '3d10'],
      [17, '4d10'],
    ]),
  }),
  speciesSpec({
    key: 'dragonborn-draconic-flight',
    species: 'dragonborn',
    feature: 'feature.species-dragonborn-draconic-flight',
    from: 5,
    max: once,
  }),
  speciesSpec({
    key: 'dwarf-stonecunning',
    species: 'dwarf',
    feature: 'feature.species-dwarf-stonecunning',
    from: 1,
    max: pbUses,
  }),
  lineageSpell('elf', ['elvenLineage', 'drow'], 'faerie-fire', 3),
  lineageSpell('elf', ['elvenLineage', 'drow'], 'darkness', 5),
  lineageSpell('elf', ['elvenLineage', 'high'], 'detect-magic', 3),
  lineageSpell('elf', ['elvenLineage', 'high'], 'misty-step', 5),
  lineageSpell('elf', ['elvenLineage', 'wood'], 'longstrider', 3),
  lineageSpell('elf', ['elvenLineage', 'wood'], 'pass-without-trace', 5),
  speciesSpec({
    key: 'gnome-speak-with-animals',
    species: 'gnome',
    choice: ['gnomishLineage', 'forest'],
    feature: 'spell.speak-with-animals',
    from: 1,
    max: pbUses,
  }),
  speciesSpec({
    key: 'goliath-giant-ancestry',
    species: 'goliath',
    feature: 'feature.species-goliath-giant-ancestry',
    from: 1,
    max: pbUses,
  }),
  speciesSpec({
    key: 'goliath-large-form',
    species: 'goliath',
    feature: 'feature.species-goliath-large-form',
    from: 5,
    max: once,
  }),
  speciesSpec({
    key: 'orc-adrenaline-rush',
    species: 'orc',
    feature: 'feature.species-orc-adrenaline-rush',
    from: 1,
    max: pbUses,
    reset: 'short',
  }),
  speciesSpec({
    key: 'orc-relentless-endurance',
    species: 'orc',
    feature: 'feature.species-orc-relentless-endurance',
    from: 1,
    max: once,
  }),
  lineageSpell('tiefling', ['fiendishLegacy', 'abyssal'], 'ray-of-sickness', 3),
  lineageSpell('tiefling', ['fiendishLegacy', 'abyssal'], 'hold-person', 5),
  lineageSpell('tiefling', ['fiendishLegacy', 'chthonic'], 'false-life', 3),
  lineageSpell('tiefling', ['fiendishLegacy', 'chthonic'], 'ray-of-enfeeblement', 5),
  lineageSpell('tiefling', ['fiendishLegacy', 'infernal'], 'hellish-rebuke', 3),
  lineageSpell('tiefling', ['fiendishLegacy', 'infernal'], 'darkness', 5),
  {
    key: 'feat-magic-initiate',
    source: 'feat',
    feat: 'magicInitiate',
    feature: 'feature.feat-magic-initiate',
    from: 1,
    max: once,
    reset: always('long'),
    display: 'pips',
  },
  turnSpec({
    key: 'feat-savage-attacker',
    source: 'feat',
    feat: 'savageAttacker',
    feature: 'feature.feat-savage-attacker',
    from: 1,
  }),
]

/** Every resource Rytta manages; keys are unique across sources. */
export const managedResources: readonly ResourceSpec[] = [...classResources, ...originResources]

export const resourceSpec = (key: string | undefined) =>
  key ? managedResources.find((spec) => spec.key === key) : undefined
/** Class resources keep their RYT-071 ids; species and feat ones are `origin-<key>`. */
export const classResourceId = (key: string) => `class-${key}`
export const resourceId = (spec: Pick<ResourceSpec, 'key' | 'source'>) =>
  spec.source === 'class' ? classResourceId(spec.key) : `origin-${spec.key}`

/** Glossary entries of the feats a background grants (seeded as `background-<feat>`). */
export const featRefs: Record<string, string> = {
  alert: 'feature.feat-alert',
  magicInitiateCleric: 'feature.feat-magic-initiate',
  magicInitiateWizard: 'feature.feat-magic-initiate',
  savageAttacker: 'feature.feat-savage-attacker',
}
const trackedFeats: Record<string, TrackedFeat> = {
  'feature.feat-magic-initiate': 'magicInitiate',
  'feature.feat-savage-attacker': 'savageAttacker',
}
/** Glossary entry of a species trait (`feature.species-goliath-giant-ancestry`). */
export const traitRef = (speciesKey: string, trait: string) =>
  `feature.species-${speciesKey}-${trait.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}`

/** Feats the build has: its background feat and any feature linked to a tracked feat. */
export function buildFeats(build: Pick<Build, 'backgroundKey' | 'features'>): Set<TrackedFeat> {
  const feats = new Set<TrackedFeat>()
  const background = backgrounds[build.backgroundKey as keyof typeof backgrounds]
  const fromBackground = background ? trackedFeats[featRefs[background.feat] ?? ''] : undefined
  if (fromBackground) feats.add(fromBackground)
  for (const feature of build.features) {
    const feat = feature.ref ? trackedFeats[feature.ref] : undefined
    if (feat) feats.add(feat)
  }
  return feats
}

/** Resources the build's class, SRD subclass, species (and its choices) and feats grant at a
 * level, before the player's removals. */
export function grantedResources(build: Build, level: number): ResourceSpec[] {
  const feats = buildFeats(build)
  const isClass = build.classKey in classes
  const isSpecies = build.speciesKey in speciesTable
  return managedResources.filter((spec) => {
    if (level < spec.from) return false
    if (spec.source === 'class')
      return (
        isClass &&
        spec.classKey === build.classKey &&
        (!spec.subclass || spec.subclass === build.subclassKey)
      )
    if (spec.source === 'species')
      return (
        isSpecies &&
        spec.species === build.speciesKey &&
        (!spec.choice || build.choices?.[spec.choice[0]] === spec.choice[1])
      )
    return Boolean(spec.feat && feats.has(spec.feat))
  })
}

/**
 * RYT-102 options paid from another resource (Flurry of Blows from Focus Points, Divine Spark from
 * Channel Divinity). Listed under the parent with their cost; one tap spends it.
 */
export type ResourceAction = {
  key: string
  /** Resource key the cost is paid from. */
  parent: string
  feature: string
  cost: number
  /** First class level with the option. */
  from: number
  subclass?: string
  /** Another resource spent by one with it (a once-per-Long-Rest limit). */
  uses?: string
  /** A resource that gets one use back (Intimidating Presence for a use of Rage). */
  restores?: string
  /** RYT-110: a Metamagic option, listed only when the Sorcerer knows it. */
  metamagic?: MetamagicKey
}

export const resourceActions: readonly ResourceAction[] = [
  {
    key: 'barbarian-intimidating-presence',
    parent: 'barbarian-rage',
    feature: 'feature.barbarian-berserker-intimidating-presence',
    cost: 1,
    from: 14,
    subclass: 'berserker',
    restores: 'barbarian-intimidating-presence',
  },
  {
    key: 'bard-cutting-words',
    parent: 'bard-bardic-inspiration',
    feature: 'feature.bard-lore-cutting-words',
    cost: 1,
    from: 3,
    subclass: 'lore',
  },
  {
    key: 'bard-peerless-skill',
    parent: 'bard-bardic-inspiration',
    feature: 'feature.bard-lore-peerless-skill',
    cost: 1,
    from: 14,
    subclass: 'lore',
  },
  {
    key: 'cleric-divine-spark',
    parent: 'cleric-channel-divinity',
    feature: 'feature.cleric-divine-spark',
    cost: 1,
    from: 2,
  },
  {
    key: 'cleric-turn-undead',
    parent: 'cleric-channel-divinity',
    feature: 'feature.cleric-turn-undead',
    cost: 1,
    from: 2,
  },
  {
    key: 'cleric-preserve-life',
    parent: 'cleric-channel-divinity',
    feature: 'feature.cleric-life-preserve-life',
    cost: 1,
    from: 3,
    subclass: 'life',
  },
  {
    key: 'druid-wild-companion',
    parent: 'druid-wild-shape',
    feature: 'feature.druid-wild-companion',
    cost: 1,
    from: 2,
  },
  {
    key: 'druid-lands-aid',
    parent: 'druid-wild-shape',
    feature: 'feature.druid-land-lands-aid',
    cost: 1,
    from: 3,
    subclass: 'land',
  },
  {
    key: 'druid-wild-resurgence',
    parent: 'druid-wild-shape',
    feature: 'feature.druid-wild-resurgence',
    cost: 1,
    from: 5,
    uses: 'druid-wild-resurgence',
  },
  {
    key: 'druid-natures-sanctuary',
    parent: 'druid-wild-shape',
    feature: 'feature.druid-land-natures-sanctuary',
    cost: 1,
    from: 14,
    subclass: 'land',
  },
  {
    key: 'fighter-tactical-mind',
    parent: 'fighter-second-wind',
    feature: 'feature.fighter-tactical-mind',
    cost: 1,
    from: 2,
  },
  {
    key: 'monk-flurry-of-blows',
    parent: 'monk-focus',
    feature: 'feature.monk-flurry-of-blows',
    cost: 1,
    from: 2,
  },
  {
    key: 'monk-patient-defense',
    parent: 'monk-focus',
    feature: 'feature.monk-patient-defense',
    cost: 1,
    from: 2,
  },
  {
    key: 'monk-step-of-the-wind',
    parent: 'monk-focus',
    feature: 'feature.monk-step-of-the-wind',
    cost: 1,
    from: 2,
  },
  {
    key: 'monk-deflect-attacks',
    parent: 'monk-focus',
    feature: 'feature.monk-deflect-attacks',
    cost: 1,
    from: 3,
  },
  {
    key: 'monk-stunning-strike',
    parent: 'monk-focus',
    feature: 'feature.monk-stunning-strike',
    cost: 1,
    from: 5,
  },
  {
    key: 'monk-quivering-palm',
    parent: 'monk-focus',
    feature: 'feature.monk-open-hand-quivering-palm',
    cost: 4,
    from: 17,
    subclass: 'open-hand',
  },
  {
    key: 'monk-superior-defense',
    parent: 'monk-focus',
    feature: 'feature.monk-superior-defense',
    cost: 3,
    from: 18,
  },
  {
    key: 'paladin-restoring-touch',
    parent: 'paladin-lay-on-hands',
    feature: 'feature.paladin-restoring-touch',
    cost: 5,
    from: 14,
  },
  {
    key: 'paladin-divine-sense',
    parent: 'paladin-channel-divinity',
    feature: 'feature.paladin-divine-sense',
    cost: 1,
    from: 3,
  },
  {
    key: 'paladin-sacred-weapon',
    parent: 'paladin-channel-divinity',
    feature: 'feature.paladin-devotion-sacred-weapon',
    cost: 1,
    from: 3,
    subclass: 'devotion',
  },
  {
    key: 'paladin-abjure-foes',
    parent: 'paladin-channel-divinity',
    feature: 'feature.paladin-abjure-foes',
    cost: 1,
    from: 9,
  },
  {
    key: 'sorcerer-sorcery-incarnate',
    parent: 'sorcerer-sorcery-points',
    feature: 'feature.sorcerer-sorcery-incarnate',
    cost: 2,
    from: 7,
  },
  {
    key: 'sorcerer-dragon-wings',
    parent: 'sorcerer-sorcery-points',
    feature: 'feature.sorcerer-draconic-dragon-wings',
    cost: 3,
    from: 14,
    subclass: 'draconic',
    restores: 'sorcerer-dragon-wings',
  },
  ...metamagicKeys.map((key): ResourceAction => ({
    key: `sorcerer-metamagic-${key}`,
    parent: 'sorcerer-sorcery-points',
    feature: 'feature.sorcerer-metamagic',
    cost: metamagicCost[key],
    from: 2,
    metamagic: key,
  })),
]

/** Options of a resource the build can use at its level (its class, SRD subclass and known
 * Metamagic). */
export function actionsFor(
  build: Pick<Build, 'subclassKey' | 'metamagic'>,
  level: number,
  parent: string | undefined,
): ResourceAction[] {
  if (!parent) return []
  return resourceActions.filter(
    (action) =>
      action.parent === parent &&
      level >= action.from &&
      (!action.subclass || action.subclass === build.subclassKey) &&
      (!action.metamagic || (build.metamagic ?? []).includes(action.metamagic)),
  )
}

/** Uses spent per tracker id after taking an option, or null when it cannot be paid. */
export function spendAction(
  action: ResourceAction,
  trackers: readonly { id: string; key?: string; max: number }[],
  uses: Record<string, number>,
): Record<string, number> | null {
  const find = (key: string) => trackers.find((tracker) => tracker.key === key)
  const parent = find(action.parent)
  if (!parent) return null
  const spent = (id: string, max: number) => Math.min(max, uses[id] ?? 0)
  const next = { ...uses }
  const parentLeft = parent.max - spent(parent.id, parent.max)
  if (parentLeft < action.cost) return null
  next[parent.id] = spent(parent.id, parent.max) + action.cost
  if (action.uses) {
    const limit = find(action.uses)
    if (!limit || spent(limit.id, limit.max) >= limit.max) return null
    next[limit.id] = spent(limit.id, limit.max) + 1
  }
  if (action.restores) {
    const target = find(action.restores)
    if (!target || spent(target.id, target.max) === 0) return null
    next[target.id] = spent(target.id, target.max) - 1
  }
  return next
}
