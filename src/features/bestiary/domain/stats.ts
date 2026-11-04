import type { AbilityKey, Baseline, ChallengeRating, CreatureSize } from './types'

/** SRD 5.2.1 "Experience Points by Challenge Rating" (CC-BY-4.0). */
const xpByCr: Record<string, number> = {
  '0': 10,
  '1/8': 25,
  '1/4': 50,
  '1/2': 100,
  '1': 200,
  '2': 450,
  '3': 700,
  '4': 1100,
  '5': 1800,
  '6': 2300,
  '7': 2900,
  '8': 3900,
  '9': 5000,
  '10': 5900,
  '11': 7200,
  '12': 8400,
  '13': 10000,
  '14': 11500,
  '15': 13000,
  '16': 15000,
  '17': 18000,
  '18': 20000,
  '19': 22000,
  '20': 25000,
  '21': 33000,
  '22': 41000,
  '23': 50000,
  '24': 62000,
  '25': 75000,
  '26': 90000,
  '27': 105000,
  '28': 120000,
  '29': 135000,
  '30': 155000,
}

/** SRD 5.2.1 "Hit Dice by Size" (CC-BY-4.0). */
export const hitDieBySize: Record<CreatureSize, number> = {
  tiny: 4,
  small: 6,
  medium: 8,
  large: 10,
  huge: 12,
  gargantuan: 20,
}

export const abilityModifier = (score: number) => Math.floor((score - 10) / 2)

export function crValue(cr: ChallengeRating): number {
  const [a, b] = cr.split('/')
  return b ? Number(a) / Number(b) : Number(cr)
}

export const xpForCr = (cr: ChallengeRating) => xpByCr[cr] ?? 0

/** SRD "Proficiency Bonus by Challenge Rating": +2 up to CR 4, then +1 every four CRs. */
export function proficiencyForCr(cr: ChallengeRating): number {
  const value = crValue(cr)
  return value < 5 ? 2 : Math.min(9, 2 + Math.ceil((Math.floor(value) - 4) / 4))
}

export const signed = (n: number) => (n >= 0 ? `+${n}` : `−${Math.abs(n)}`)

export type Dice = { count: number; faces: number; bonus: number }

/** Parses hit dice such as "20d10 + 40", "1d4 − 1" or "3d6". */
export function parseDice(text: string): Dice | null {
  const m = text
    .replace(/[−–]/g, '-')
    .replace(/\s+/g, '')
    .match(/^([1-9]\d{0,2})d(4|6|8|10|12|20)([+-]\d{1,4})?$/)
  if (!m) return null
  return { count: Number(m[1]), faces: Number(m[2]), bonus: Number(m[3] ?? 0) }
}

/** Compact storage form accepted by the server ("20d10+40"). */
export const diceKey = (d: Dice) =>
  `${d.count}d${d.faces}${d.bonus ? (d.bonus > 0 ? `+${d.bonus}` : String(d.bonus)) : ''}`

/** Printed form ("20d10 + 40", "1d4 − 1"). */
export const diceText = (d: Dice) =>
  `${d.count}d${d.faces}${d.bonus ? (d.bonus > 0 ? ` + ${d.bonus}` : ` − ${-d.bonus}`) : ''}`

export const averageDice = (d: Dice) =>
  Math.max(1, Math.floor((d.count * (d.faces + 1)) / 2) + d.bonus)

/** Hit dice for a size and Constitution that land near a target average. */
export function diceForHp(hp: number, size: CreatureSize, con: number): Dice {
  const faces = hitDieBySize[size]
  const mod = abilityModifier(con)
  const perDie = (faces + 1) / 2 + mod
  const count = Math.max(1, Math.min(999, Math.round(hp / Math.max(1, perDie))))
  return { count, faces, bonus: count * mod }
}

export const passivePerception = (wisMod: number, perceptionBonus: number | null) =>
  10 + (perceptionBonus ?? wisMod)

export type CrEstimate = { low: ChallengeRating; high: ChallengeRating }

/**
 * A balance hint, not a rule: compares hit points and AC (defence) and the attack bonus or save
 * DC (offence) with the SRD's medians per CR, and returns the CR band they look like.
 */
export function estimateCr(
  numbers: { hp: number; ac: number; attack?: number | null; dc?: number | null },
  baselines: Baseline[],
): CrEstimate | null {
  if (!baselines.length) return null
  const nearest = (score: (b: Baseline) => number) =>
    baselines.reduce((best, b) => (score(b) < score(best) ? b : best), baselines[0]!)
  const index = (b: Baseline) => baselines.indexOf(b)
  const defensive = nearest((b) => Math.abs(Math.log(numbers.hp / Math.max(1, b.hp))))
  // Every 2 points of AC above or below the median moves defence one step.
  const acShift = Math.trunc((numbers.ac - defensive.ac) / 2)
  const defence = Math.max(0, Math.min(baselines.length - 1, index(defensive) + acShift))
  let offence = defence
  if (numbers.attack != null) offence = index(nearest((b) => Math.abs(b.attack - numbers.attack!)))
  else if (numbers.dc != null) offence = index(nearest((b) => Math.abs(b.dc - numbers.dc!)))
  const [a, b] = [Math.min(defence, offence), Math.max(defence, offence)]
  const mid = (a + b) / 2
  return {
    low: baselines[Math.floor(mid)]!.cr,
    high: baselines[Math.ceil(mid)]!.cr,
  }
}

export const abilityOrder: AbilityKey[] = ['str', 'dex', 'con', 'int', 'wis', 'cha']
