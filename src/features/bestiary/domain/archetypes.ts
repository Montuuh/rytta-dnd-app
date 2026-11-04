import {
  abilityModifier,
  averageDice,
  crValue,
  diceForHp,
  diceKey,
  diceText,
  proficiencyForCr,
  signed,
  xpForCr,
} from './stats'
import type {
  AbilityKey,
  AbilityScore,
  Baseline,
  ChallengeRating,
  CreatureSize,
  CreatureType,
  StatBlock,
  StatEntry,
  StatSection,
} from './types'

/**
 * Archetype starts for homebrew creatures (ADR 028, RYT-049). Armour class, hit points, attack
 * bonus and save DC come from the SRD's medians for the chosen CR; damage per round follows
 * Rytta's own rule of thumb (6 × CR + 5, smaller below CR 1). Archetypes shift those numbers.
 * The result is a draft: the DM edits everything before saving.
 */
export const archetypes = [
  'brute',
  'skirmisher',
  'artillery',
  'spellcaster',
  'leader',
  'minion',
] as const
export type Archetype = (typeof archetypes)[number]

export type Translate = (key: string, options?: Record<string, unknown>) => string

type Shape = {
  hp: number
  ac: number
  primary: AbilityKey
  saves: AbilityKey[]
  /** Ability modifiers relative to the primary one (con, then the rest). */
  others: Partial<Record<AbilityKey, number>>
  die: number
  attacks: number
  ranged: boolean
}
const shapes: Record<Archetype, Shape> = {
  brute: {
    hp: 1.25,
    ac: -1,
    primary: 'str',
    saves: ['str', 'con'],
    others: { con: -1, dex: -3, wis: -3, int: -4, cha: -4 },
    die: 10,
    attacks: 2,
    ranged: false,
  },
  skirmisher: {
    hp: 0.9,
    ac: 1,
    primary: 'dex',
    saves: ['dex', 'wis'],
    others: { con: -2, str: -2, wis: -2, int: -3, cha: -3 },
    die: 6,
    attacks: 2,
    ranged: false,
  },
  artillery: {
    hp: 0.8,
    ac: -1,
    primary: 'dex',
    saves: ['dex', 'wis'],
    others: { con: -2, str: -3, wis: -1, int: -2, cha: -3 },
    die: 8,
    attacks: 2,
    ranged: true,
  },
  spellcaster: {
    hp: 0.8,
    ac: -1,
    primary: 'int',
    saves: ['int', 'wis'],
    others: { con: -2, dex: -2, wis: -1, str: -4, cha: -2 },
    die: 10,
    attacks: 1,
    ranged: true,
  },
  leader: {
    hp: 1,
    ac: 1,
    primary: 'cha',
    saves: ['cha', 'wis'],
    others: { con: -1, str: -1, dex: -2, wis: -1, int: -2 },
    die: 8,
    attacks: 2,
    ranged: false,
  },
  minion: {
    hp: 0,
    ac: 0,
    primary: 'str',
    saves: [],
    others: { con: -1, dex: -1, wis: -3, int: -4, cha: -4 },
    die: 6,
    attacks: 1,
    ranged: false,
  },
}

export function damagePerRound(cr: ChallengeRating): number {
  const value = crValue(cr)
  if (value >= 1) return Math.round(6 * value + 5)
  return value === 0 ? 1 : value <= 0.125 ? 3 : value <= 0.25 ? 5 : 7
}

const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))
const scoreFor = (mod: number) => clamp(10 + 2 * mod, 1, 30)

function hit(average: number, mod: number, faces: number) {
  const fromDice = Math.max(1, average - mod)
  const count = clamp(Math.round(fromDice / ((faces + 1) / 2)), 1, 30)
  const dice = { count, faces, bonus: mod }
  return { average: averageDice(dice), text: diceText(dice) }
}

export type ArchetypeInput = {
  archetype: Archetype
  cr: ChallengeRating
  name: string
  size: CreatureSize
  type: CreatureType
  baselines: Baseline[]
  t: Translate
}

export type DraftCore = {
  ac: number
  hp: number
  initiative: number
  formula: string | null
  legendary: number
}

export function archetypeDraft(input: ArchetypeInput): { block: StatBlock; core: DraftCore } {
  const { archetype, cr, t } = input
  const shape = shapes[archetype]
  const base =
    input.baselines.find((b) => b.cr === cr) ??
    input.baselines.reduce((best, b) =>
      Math.abs(crValue(b.cr) - crValue(cr)) < Math.abs(crValue(best.cr) - crValue(cr)) ? b : best,
    )
  const pb = proficiencyForCr(cr)
  const primaryMod = clamp(base.attack - pb, 0, 10)
  const abilities = {} as Record<AbilityKey, AbilityScore>
  for (const key of ['str', 'dex', 'con', 'int', 'wis', 'cha'] as AbilityKey[]) {
    const mod =
      key === shape.primary ? primaryMod : clamp(primaryMod + (shape.others[key] ?? -2), -4, 10)
    const score = scoreFor(mod)
    const real = abilityModifier(score)
    abilities[key] = { score, mod: real, save: real + (shape.saves.includes(key) ? pb : 0) }
  }
  const ac = clamp(base.ac + shape.ac, 5, 25)
  const minion = archetype === 'minion'
  const dice = minion
    ? null
    : diceForHp(Math.max(1, Math.round(base.hp * shape.hp)), input.size, abilities.con.score)
  const hp = dice ? averageDice(dice) : 1
  const attackMod = abilities[shape.primary].mod
  const attackBonus = attackMod + pb
  const dpr = damagePerRound(cr) * (minion ? 0.6 : 1)
  const sections: StatSection[] = []
  const entry = (key: string, name: string, text: string[], extra: Partial<StatEntry> = {}) => ({
    key,
    name,
    text,
    ...extra,
  })
  const traits: StatEntry[] = []
  if (minion)
    traits.push(
      entry('minion', t('bestiary.arch.minionTrait'), [t('bestiary.arch.minionTraitText')]),
    )
  if (archetype === 'skirmisher')
    traits.push(entry('evasive', t('bestiary.arch.evasive'), [t('bestiary.arch.evasiveText')]))
  if (archetype === 'leader')
    traits.push(
      entry('commanding-presence', t('bestiary.arch.presence'), [t('bestiary.arch.presenceText')]),
    )
  if (traits.length) sections.push({ kind: 'traits', entries: traits })
  const actions: StatEntry[] = []
  const perAttack = dpr / (archetype === 'spellcaster' ? 1 : shape.attacks)
  const weaponName = t(shape.ranged ? 'bestiary.arch.ranged' : 'bestiary.arch.melee')
  if (shape.attacks > 1)
    actions.push(
      entry('multiattack', t('bestiary.arch.multiattack'), [
        t('bestiary.arch.multiattackText', { count: shape.attacks, attack: weaponName }),
      ]),
    )
  const strike = hit(
    Math.round(perAttack * (archetype === 'spellcaster' ? 0.6 : 1)),
    attackMod,
    shape.die,
  )
  actions.push(
    entry(shape.ranged ? 'ranged-attack' : 'melee-attack', weaponName, [
      t(shape.ranged ? 'bestiary.arch.rangedText' : 'bestiary.arch.meleeText', {
        bonus: signed(attackBonus),
        average: strike.average,
        dice: strike.text,
      }),
    ]),
  )
  if (archetype === 'spellcaster') {
    const burst = hit(Math.round(dpr * 1.5), 0, 6)
    actions.push(
      entry(
        'arcane-burst',
        t('bestiary.arch.burst'),
        [
          t('bestiary.arch.burstText', {
            dc: base.dc + 1,
            average: burst.average,
            dice: burst.text,
          }),
        ],
        { usage: { recharge: 5 } },
      ),
    )
  }
  sections.push({ kind: 'actions', entries: actions })
  if (archetype === 'skirmisher')
    sections.push({
      kind: 'bonusActions',
      entries: [entry('nimble-escape', t('bestiary.arch.nimble'), [t('bestiary.arch.nimbleText')])],
    })
  if (archetype === 'leader') {
    sections.push({
      kind: 'bonusActions',
      entries: [
        entry(
          'rally',
          t('bestiary.arch.rally'),
          [t('bestiary.arch.rallyText', { amount: pb * 2 })],
          { usage: { perDay: 3 } },
        ),
      ],
    })
    sections.push({
      kind: 'reactions',
      entries: [
        entry('parry', t('bestiary.arch.parry'), [
          t('bestiary.arch.parryText', { bonus: Math.max(2, pb) }),
        ]),
      ],
    })
  }
  const xp = xpForCr(cr)
  const initiative = abilities.dex.mod
  const block: StatBlock = {
    name: input.name.slice(0, 120),
    meta: t('bestiary.arch.meta', {
      size: t(`bestiary.size.${input.size}`),
      type: t(`bestiary.type.${input.type}`),
    }),
    ac: String(ac),
    initiative: `${signed(initiative)} (${10 + initiative})`,
    hp: dice ? `${hp} (${diceText(dice)})` : '1',
    ...(dice ? { hpFormula: diceKey(dice) } : {}),
    speed: t('bestiary.arch.speed'),
    abilities,
    details: {
      senses: t('bestiary.arch.senses', { passive: 10 + abilities.wis.mod }),
      languages: t('bestiary.arch.languages'),
    },
    cr: t('bestiary.crLine', { cr, xp: xp.toLocaleString(), pb }),
    sections,
  }
  return {
    block,
    core: { ac, hp, initiative, formula: dice ? diceKey(dice) : null, legendary: 0 },
  }
}
