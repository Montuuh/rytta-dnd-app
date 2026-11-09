import type { Ability, ClassKey } from './srd'
import type { RestKind } from './progression'

/**
 * RYT-071 class resources from the SRD 5.2.1 class tables (names and numbers only; the rules text
 * is the linked glossary feature). Each becomes a tracker whose maximum follows the level.
 * Several features regain one use on a Short Rest and all on a Long Rest; Rytta tracks them as
 * long-rest resources and the glossary text explains the partial recovery.
 */
export type ResourceSpec = {
  key: string
  classKey: ClassKey
  /** Glossary feature that explains the resource. */
  feature: string
  /** First class level with the resource. */
  from: number
  max: (level: number, mods: Record<Ability, number>) => number
  reset: (level: number) => RestKind
  display: 'pips' | 'counter'
}

const byLevel = (steps: [number, number][]) => (level: number) =>
  steps.reduce((value, [from, count]) => (level >= from ? count : value), 0)
const always = (kind: RestKind) => (): RestKind => kind

export const classResources: readonly ResourceSpec[] = [
  {
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
    display: 'pips',
  },
  {
    key: 'bard-bardic-inspiration',
    classKey: 'bard',
    feature: 'feature.bard-bardic-inspiration',
    from: 1,
    max: (_level, mods) => Math.max(1, mods.cha),
    // Font of Inspiration (level 5): regained on a Short or Long Rest.
    reset: (level) => (level >= 5 ? 'short' : 'long'),
    display: 'pips',
  },
  {
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
    display: 'pips',
  },
  {
    key: 'cleric-divine-intervention',
    classKey: 'cleric',
    feature: 'feature.cleric-divine-intervention',
    from: 10,
    max: () => 1,
    reset: always('long'),
    display: 'pips',
  },
  {
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
    display: 'pips',
  },
  {
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
    display: 'pips',
  },
  {
    key: 'fighter-action-surge',
    classKey: 'fighter',
    feature: 'feature.fighter-action-surge',
    from: 2,
    max: byLevel([
      [2, 1],
      [17, 2],
    ]),
    reset: always('short'),
    display: 'pips',
  },
  {
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
    display: 'pips',
  },
  {
    key: 'monk-focus',
    classKey: 'monk',
    feature: 'feature.monk-monks-focus',
    from: 2,
    max: (level) => level,
    reset: always('short'),
    display: 'pips',
  },
  {
    key: 'monk-uncanny-metabolism',
    classKey: 'monk',
    feature: 'feature.monk-uncanny-metabolism',
    from: 2,
    max: () => 1,
    reset: always('long'),
    display: 'pips',
  },
  {
    key: 'paladin-lay-on-hands',
    classKey: 'paladin',
    feature: 'feature.paladin-lay-on-hands',
    from: 1,
    max: (level) => 5 * level,
    reset: always('long'),
    display: 'counter',
  },
  {
    key: 'paladin-channel-divinity',
    classKey: 'paladin',
    feature: 'feature.paladin-channel-divinity',
    from: 3,
    max: byLevel([
      [3, 2],
      [11, 3],
    ]),
    reset: always('long'),
    display: 'pips',
  },
  {
    key: 'paladin-faithful-steed',
    classKey: 'paladin',
    feature: 'feature.paladin-faithful-steed',
    from: 5,
    max: () => 1,
    reset: always('long'),
    display: 'pips',
  },
  {
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
    display: 'pips',
  },
  {
    key: 'rogue-stroke-of-luck',
    classKey: 'rogue',
    feature: 'feature.rogue-stroke-of-luck',
    from: 20,
    max: () => 1,
    reset: always('short'),
    display: 'pips',
  },
  {
    key: 'sorcerer-innate-sorcery',
    classKey: 'sorcerer',
    feature: 'feature.sorcerer-innate-sorcery',
    from: 1,
    max: () => 2,
    reset: always('long'),
    display: 'pips',
  },
  {
    key: 'sorcerer-sorcery-points',
    classKey: 'sorcerer',
    feature: 'feature.sorcerer-font-of-magic',
    from: 2,
    max: (level) => level,
    reset: always('long'),
    display: 'counter',
  },
  {
    key: 'warlock-magical-cunning',
    classKey: 'warlock',
    feature: 'feature.warlock-magical-cunning',
    from: 2,
    max: () => 1,
    reset: always('long'),
    display: 'pips',
  },
  {
    key: 'wizard-arcane-recovery',
    classKey: 'wizard',
    feature: 'feature.wizard-arcane-recovery',
    from: 1,
    max: () => 1,
    reset: always('long'),
    display: 'pips',
  },
]

export const resourceSpec = (key: string | undefined) =>
  key ? classResources.find((spec) => spec.key === key) : undefined
export const classResourceId = (key: string) => `class-${key}`
