import { encumbrance, type EquipmentSlot, type Equipped } from '@/features/inventory'
import type { Abilities, Build, Vitals } from './sheet'
import {
  abilityKeys,
  backgrounds,
  classes,
  fullCasterSlots,
  pointBuyBudget,
  pointBuyCost,
  skillAbilities,
  species,
  type Ability,
  type BackgroundKey,
  type CasterKind,
  type ClassKey,
  type HitDie,
  type Skill,
  type SpeciesKey,
} from './srd'

export const modifier = (score: number) => Math.floor((score - 10) / 2)
export const proficiencyBonus = (level: number) => 2 + Math.floor((Math.max(1, level) - 1) / 4)
export const signed = (value: number) => (value >= 0 ? `+${value}` : `${value}`)

export type ModifierPart = {
  key: string
  labelKey?: string
  label?: string
  value: number
}

export type StatBreakdown = {
  total: number
  base: number
  formula: string
  modified: boolean
  overridden?: boolean
  autoTotal?: number
  parts: ModifierPart[]
}

const normalizeFeature = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()

const isFeatureRemoved = (build: Build, ref: string) => {
  const removed = build.removed ?? []
  return removed.includes(`feature:${ref}`) || removed.includes(ref)
}

function hasFeature(build: Build, ref: string, names: string[]) {
  return build.features.some((f) => f.ref === ref || names.includes(normalizeFeature(f.name)))
}

function hasFeatName(build: Build, names: string[]) {
  return build.features.some((f) => names.includes(normalizeFeature(f.name)))
}

function hasFightingStyleDefense(build: Build) {
  return build.features.some((f) => {
    const n = normalizeFeature(f.name)
    if (
      n === 'defense' ||
      n === 'defensa' ||
      n === 'fighting style: defense' ||
      n === 'estilo de combate: defensa'
    )
      return true
    if (
      f.ref &&
      [
        'feature.fighter-fighting-style',
        'feature.paladin-fighting-style',
        'feature.ranger-fighting-style',
        'feature.fighter-champion-additional-fighting-style',
      ].includes(f.ref)
    ) {
      const desc = normalizeFeature(`${f.name} ${f.description}`)
      return /\b(defense|defensa)\b/.test(desc)
    }
    return false
  })
}

const formatTerm = (value: number) => (value >= 0 ? `+${value}` : `−${Math.abs(value)}`)

export function finalAbilities(build: Pick<Build, 'baseAbilities' | 'bonuses'>): Abilities {
  return Object.fromEntries(
    abilityKeys.map((key) => [key, Math.min(30, build.baseAbilities[key] + build.bonuses[key])]),
  ) as Abilities
}
export const saveBonus = (build: Build, level: number, ability: Ability) =>
  modifier(finalAbilities(build)[ability]) +
  (build.saves.includes(ability) ? proficiencyBonus(level) : 0)
export function skillBonus(build: Build, level: number, skill: Skill) {
  const proficiency = build.skills[skill]
  const multiplier = proficiency === 'expertise' ? 2 : proficiency === 'proficient' ? 1 : 0
  return (
    modifier(finalAbilities(build)[skillAbilities[skill]]) + multiplier * proficiencyBonus(level)
  )
}
export const passivePerception = (build: Build, level: number) =>
  10 + skillBonus(build, level, 'perception')

export function initiativeBreakdown(build: Build, level = 1): StatBreakdown {
  const dex = modifier(finalAbilities(build).dex)
  const parts: ModifierPart[] = [{ key: 'dex', labelKey: 'panel.mod.dex', value: dex }]
  if (hasFeatName(build, ['alert', 'alerta'])) {
    parts.push({ key: 'alert', labelKey: 'panel.mod.alert', value: proficiencyBonus(level) })
  }
  const total = parts.reduce((sum, part) => sum + part.value, 0)
  const modified = parts.length > 1
  const formula = modified
    ? `${signed(dex)}${parts
        .slice(1)
        .map((p) => formatTerm(p.value))
        .join('')}`
    : ''
  return { total, base: dex, formula, modified, parts }
}

export const initiative = (build: Build, level = 1) => initiativeBreakdown(build, level).total

export function acBreakdown(
  build: Build,
  equipped?: Map<EquipmentSlot, Equipped>,
  level = 1,
): StatBreakdown {
  const scores = finalAbilities(build)
  const dex = modifier(scores.dex)
  const con = modifier(scores.con)
  const wis = modifier(scores.wis)
  const cha = modifier(scores.cha)
  const eq = equipped ?? new Map<EquipmentSlot, Equipped>()
  const body = eq.get('body')?.definition
  const armor = body?.category === 'armor' ? body.properties : null
  const offHand = eq.get('off_hand')?.definition
  const shield = offHand?.category === 'shield' ? offHand : null
  const shieldBonus = shield ? (shield.properties.acBonus ?? 2) : 0

  const parts: ModifierPart[] = []
  const extraParts: ModifierPart[] = []
  let formulaHead = 10
  let formulaHeadExtras: ModifierPart[] = []
  let hasExternal = false

  if (armor) {
    hasExternal = true
    const armorBase = armor.base ?? 10
    const dexMod = typeof armor.dexCap === 'number' ? Math.min(dex, armor.dexCap) : dex
    parts.push({ key: 'armor', label: body!.name, value: armorBase })
    if (dexMod !== 0) parts.push({ key: 'dex', labelKey: 'panel.mod.dex', value: dexMod })
    formulaHead = armorBase + dexMod
    if ((armor.acBonus ?? 0) !== 0) {
      const magicPart: ModifierPart = {
        key: 'armor-magic',
        labelKey: 'panel.mod.magicBonus',
        value: armor.acBonus!,
      }
      parts.push(magicPart)
      extraParts.push(magicPart)
    }
    if (shield && shieldBonus !== 0) {
      const shieldPart: ModifierPart = { key: 'shield', label: shield.name, value: shieldBonus }
      parts.push(shieldPart)
      extraParts.push(shieldPart)
    }
    if (!extraParts.length && dexMod !== 0) {
      formulaHead = armorBase
      formulaHeadExtras = [{ key: 'dex', labelKey: 'panel.mod.dex', value: dexMod }]
    }
  } else {
    const monkEligible =
      !shield &&
      (build.features.some((f) => f.ref === 'feature.monk-unarmored-defense') ||
        (hasFeature(build, 'feature.monk-unarmored-defense', [
          'defensa sin armadura',
          'unarmored defense',
        ]) &&
          build.classKey === 'monk') ||
        (build.classKey === 'monk' && !isFeatureRemoved(build, 'feature.monk-unarmored-defense')))
    const barbEligible =
      build.features.some((f) => f.ref === 'feature.barbarian-unarmored-defense') ||
      (hasFeature(build, 'feature.barbarian-unarmored-defense', [
        'defensa sin armadura',
        'unarmored defense',
      ]) &&
        build.classKey === 'barbarian') ||
      (build.classKey === 'barbarian' &&
        !isFeatureRemoved(build, 'feature.barbarian-unarmored-defense'))
    const draconicEligible =
      hasFeature(build, 'feature.sorcerer-draconic-draconic-resilience', [
        'draconic resilience',
        'resiliencia draconica',
      ]) ||
      (build.classKey === 'sorcerer' &&
        (build.subclassKey === 'draconic' || normalizeFeature(build.subclass).includes('drac')) &&
        level >= 3 &&
        !isFeatureRemoved(build, 'feature.sorcerer-draconic-draconic-resilience'))

    const baseAc = 10 + dex + shieldBonus
    const monkAc = monkEligible ? 10 + dex + wis : -999
    const barbAc = barbEligible ? 10 + dex + con + shieldBonus : -999
    const draconicAc = draconicEligible ? 10 + dex + cha + shieldBonus : -999

    parts.push({ key: 'base', labelKey: 'panel.mod.base', value: 10 })
    if (dex !== 0) {
      const dexPart: ModifierPart = { key: 'dex', labelKey: 'panel.mod.dex', value: dex }
      parts.push(dexPart)
      formulaHeadExtras.push(dexPart)
    }

    const bestUnarmored = Math.max(baseAc, monkAc, barbAc, draconicAc)
    if (bestUnarmored > baseAc) {
      hasExternal = true
      if (monkAc === bestUnarmored && wis > 0) {
        const part: ModifierPart = {
          key: 'monk-unarmored',
          labelKey: 'panel.mod.monkUnarmored',
          value: wis,
        }
        parts.push(part)
        formulaHeadExtras.push(part)
      } else if (barbAc === bestUnarmored && con > 0) {
        const part: ModifierPart = {
          key: 'barbarian-unarmored',
          labelKey: 'panel.mod.barbarianUnarmored',
          value: con,
        }
        parts.push(part)
        formulaHeadExtras.push(part)
      } else if (draconicAc === bestUnarmored && cha > 0) {
        const part: ModifierPart = {
          key: 'draconic-resilience',
          labelKey: 'panel.mod.draconicResilience',
          value: cha,
        }
        parts.push(part)
        formulaHeadExtras.push(part)
      }
    }

    if (shield && shieldBonus !== 0) {
      hasExternal = true
      const shieldPart: ModifierPart = { key: 'shield', label: shield.name, value: shieldBonus }
      parts.push(shieldPart)
      extraParts.push(shieldPart)
    }
  }

  for (const [slot, entry] of eq) {
    if (slot === 'body' && armor) continue
    if (slot === 'off_hand' && shield) continue
    const bonus = entry.definition.properties.acBonus ?? 0
    if (bonus !== 0) {
      hasExternal = true
      const part: ModifierPart = {
        key: `item-${slot}`,
        label: entry.definition.name,
        value: bonus,
      }
      parts.push(part)
      extraParts.push(part)
    }
  }

  if (armor && hasFightingStyleDefense(build)) {
    hasExternal = true
    const part: ModifierPart = {
      key: 'defense',
      labelKey: 'panel.mod.fightingDefense',
      value: 1,
    }
    parts.push(part)
    extraParts.push(part)
  }

  const mainWeapon = eq.get('main_hand')?.definition
  const offWeapon = eq.get('off_hand')?.definition
  if (
    !shield &&
    mainWeapon?.category === 'weapon' &&
    !mainWeapon.properties.ranged &&
    offWeapon?.category === 'weapon' &&
    !offWeapon.properties.ranged &&
    hasFeatName(build, ['dual wielder', 'combatiente con dos armas', 'lucha con dos armas'])
  ) {
    hasExternal = true
    const part: ModifierPart = {
      key: 'dual-wielder',
      labelKey: 'panel.mod.dualWielder',
      value: 1,
    }
    parts.push(part)
    extraParts.push(part)
  }

  if ((build.acBonus ?? 0) !== 0) {
    hasExternal = true
    const part: ModifierPart = {
      key: 'manual-bonus',
      labelKey: 'panel.mod.manualBonus',
      value: build.acBonus!,
    }
    parts.push(part)
    extraParts.push(part)
  }

  const autoTotal = Math.max(
    0,
    Math.min(
      99,
      parts.reduce((sum, part) => sum + part.value, 0),
    ),
  )
  const terms = [...formulaHeadExtras, ...extraParts]
  const modified = hasExternal && terms.length > 0
  const formula = modified ? `${formulaHead}${terms.map((p) => formatTerm(p.value)).join('')}` : ''

  if (build.acOverride !== null) {
    return {
      total: build.acOverride,
      base: autoTotal,
      formula: '',
      modified: true,
      overridden: true,
      autoTotal,
      parts: [{ key: 'override', labelKey: 'panel.mod.manualOverride', value: build.acOverride }],
    }
  }

  return {
    total: autoTotal,
    base: formulaHead,
    formula,
    modified,
    overridden: false,
    autoTotal,
    parts,
  }
}

export const defaultArmorClass = (
  build: Build,
  equipped?: Map<EquipmentSlot, Equipped>,
  level = 1,
) => acBreakdown(build, equipped, level).total

export function speedBreakdown(
  build: Build,
  level = 1,
  options?: { equipped?: Map<EquipmentSlot, Equipped>; carriedTenths?: number },
): StatBreakdown {
  const base = build.speed
  const parts: ModifierPart[] = [{ key: 'base', labelKey: 'panel.mod.baseSpeed', value: base }]
  const eq = options?.equipped ?? new Map<EquipmentSlot, Equipped>()
  const armor =
    eq.get('body')?.definition.category === 'armor' ? eq.get('body')?.definition.properties : null
  const shield = eq.get('off_hand')?.definition.category === 'shield'

  const monkEligible =
    !armor &&
    !shield &&
    (build.features.some((f) => f.ref === 'feature.monk-unarmored-movement') ||
      (build.classKey === 'monk' &&
        level >= 2 &&
        !isFeatureRemoved(build, 'feature.monk-unarmored-movement')))
  if (monkEligible) {
    const monkBonus =
      level >= 18 ? 30 : level >= 14 ? 25 : level >= 10 ? 20 : level >= 6 ? 15 : level >= 2 ? 10 : 0
    if (monkBonus > 0)
      parts.push({ key: 'monk-speed', labelKey: 'panel.mod.monkMovement', value: monkBonus })
  }

  const barbEligible =
    (!armor || armor.dexCap !== 0) &&
    (build.features.some((f) => f.ref === 'feature.barbarian-fast-movement') ||
      (build.classKey === 'barbarian' &&
        level >= 5 &&
        !isFeatureRemoved(build, 'feature.barbarian-fast-movement')))
  if (barbEligible) {
    parts.push({ key: 'barbarian-speed', labelKey: 'panel.mod.barbarianFast', value: 10 })
  }

  if (hasFeatName(build, ['speedy', 'veloz', 'mobile', 'movilidad'])) {
    parts.push({ key: 'speedy', labelKey: 'panel.mod.speedy', value: 10 })
  }

  for (const [slot, entry] of eq) {
    const bonus = entry.definition.properties.speedBonus ?? 0
    if (bonus !== 0) {
      parts.push({
        key: `item-speed-${slot}`,
        label: entry.definition.name,
        value: bonus,
      })
    }
  }

  if (typeof options?.carriedTenths === 'number') {
    const enc = encumbrance(options.carriedTenths, finalAbilities(build).str)
    if (enc.status === 'encumbered') {
      parts.push({ key: 'encumbered', labelKey: 'panel.mod.encumbered', value: -10 })
    } else if (enc.status === 'heavy') {
      parts.push({ key: 'heavy', labelKey: 'panel.mod.heavyEncumbered', value: -20 })
    } else if (enc.status === 'over') {
      const running = Math.max(
        0,
        parts.reduce((sum, p) => sum + p.value, 0),
      )
      const drop = Math.max(0, running - 5)
      if (drop > 0) parts.push({ key: 'over', labelKey: 'panel.mod.overCapacity', value: -drop })
    }
  }

  const total = Math.max(
    0,
    parts.reduce((sum, part) => sum + part.value, 0),
  )
  const modified = parts.length > 1
  const formula = modified
    ? `${base}${parts
        .slice(1)
        .map((p) => formatTerm(p.value))
        .join('')}`
    : ''
  return { total, base, formula, modified, parts }
}
export function spellcasting(build: Build, level: number) {
  if (build.casterKind === 'none' || !build.spellAbility) return null
  const mod = modifier(finalAbilities(build)[build.spellAbility])
  const prof = proficiencyBonus(level)
  return { ability: build.spellAbility, saveDc: 8 + prof + mod, attack: prof + mod }
}

/** Spell slots per spell level (index 0 = 1st level), always nine entries. */
export function slotsFor(kind: CasterKind, level: number): number[] {
  const slots = Array<number>(9).fill(0)
  const clamped = Math.min(20, Math.max(1, level))
  if (kind === 'full' || kind === 'half') {
    // 2024 half casters follow the full table at half their level, rounded up.
    const row = fullCasterSlots[(kind === 'full' ? clamped : Math.ceil(clamped / 2)) - 1]!
    row.forEach((count, index) => (slots[index] = count))
  } else if (kind === 'pact') {
    const count = clamped >= 17 ? 4 : clamped >= 11 ? 3 : clamped >= 2 ? 2 : 1
    const slotLevel = Math.min(5, Math.ceil(clamped / 2))
    slots[slotLevel - 1] = count
  }
  return slots
}

/** Level 1 takes the full die; later levels take the fixed average. Each level grants at least 1. */
export function suggestedMaxHp(hitDie: HitDie, level: number, conScore: number) {
  const con = modifier(conScore)
  const later = Math.max(1, hitDie / 2 + 1 + con) * (Math.max(1, level) - 1)
  return Math.min(9999, Math.max(1, hitDie + con) + later)
}

export function pointBuySpent(scores: Abilities) {
  let total = 0
  for (const key of abilityKeys) {
    const cost = pointBuyCost[scores[key]]
    if (cost === undefined) return null
    total += cost
  }
  return total
}
export const pointBuyValid = (scores: Abilities) => {
  const spent = pointBuySpent(scores)
  return spent !== null && spent <= pointBuyBudget
}
export function standardArrayValid(scores: Abilities) {
  const sorted = abilityKeys.map((key) => scores[key]).sort((a, b) => b - a)
  return sorted.join() === '15,14,13,12,10,8'
}
/** 2024 backgrounds: +2/+1 or +1/+1/+1 among the background's three abilities. */
export function bonusesValid(build: Pick<Build, 'backgroundKey' | 'bonuses'>) {
  const values = abilityKeys.map((key) => build.bonuses[key])
  const total = values.reduce((sum, value) => sum + value, 0)
  if (total === 0) return true
  if (total !== 3) return false
  const allowed =
    build.backgroundKey in backgrounds
      ? (backgrounds[build.backgroundKey as BackgroundKey].abilities as readonly Ability[])
      : abilityKeys
  return abilityKeys.every((key) => build.bonuses[key] === 0 || allowed.includes(key))
}

export const isClassKey = (key: string): key is ClassKey => key in classes
export const isSpeciesKey = (key: string): key is SpeciesKey => key in species
export const isBackgroundKey = (key: string): key is BackgroundKey => key in backgrounds

export function emptyBuild(): Build {
  const base = { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10 }
  return {
    classKey: '',
    classLabel: '',
    subclass: '',
    speciesKey: '',
    speciesLabel: '',
    backgroundKey: '',
    backgroundLabel: '',
    alignment: '',
    abilityMethod: 'standard',
    baseAbilities: base,
    bonuses: { str: 0, dex: 0, con: 0, int: 0, wis: 0, cha: 0 },
    saves: [],
    skills: {},
    hitDie: 8,
    speed: 30,
    acOverride: null,
    casterKind: 'none',
    spellAbility: null,
    languages: '',
    proficiencies: '',
    appearance: '',
    notes: '',
    features: [],
    trackers: [],
    spells: [],
  }
}

export const hpLabel = (vitals: Pick<Vitals, 'current_hp' | 'temp_hp'>, max: number) =>
  `${vitals.current_hp}/${max}${vitals.temp_hp > 0 ? ` (+${vitals.temp_hp})` : ''}`

/** Damage consumes temporary hit points first; healing never exceeds the maximum. */
export function applyHp(vitals: Vitals, maxHp: number, kind: 'damage' | 'heal', amount: number) {
  const value = Math.max(0, Math.trunc(amount))
  if (kind === 'heal')
    return {
      ...vitals,
      current_hp: Math.min(maxHp, vitals.current_hp + value),
      death_successes: 0,
      death_failures: 0,
    }
  const absorbed = Math.min(vitals.temp_hp, value)
  return {
    ...vitals,
    temp_hp: vitals.temp_hp - absorbed,
    current_hp: Math.max(0, vitals.current_hp - (value - absorbed)),
  }
}

/**
 * RYT-080: what a rest would give this character back (the sheet's pre-check before asking the
 * group). A short rest heals only through hit dice spent in the panel, so it reports the dice
 * available instead of hit points. PostgreSQL applies the rest; this only previews it.
 */
export function restRecovery(
  vitals: Vitals,
  build: Build,
  maxHp: number,
  level: number,
  kind: 'short' | 'long',
) {
  const resets = (reset: string) => reset === 'short' || (kind === 'long' && reset === 'long')
  const canRest = vitals.current_hp > 0
  const diceLeft = Math.max(0, level - vitals.hit_dice_spent)
  const hurt = canRest && vitals.current_hp < maxHp
  return {
    canRest,
    hp:
      kind === 'long' && hurt ? { before: vitals.current_hp, after: maxHp, max: maxHp } : undefined,
    dice:
      kind === 'long' && canRest && vitals.hit_dice_spent > 0
        ? { before: diceLeft, after: level, die: build.hitDie }
        : undefined,
    healDice:
      kind === 'short' && hurt && diceLeft > 0 ? { left: diceLeft, die: build.hitDie } : undefined,
    trackers: canRest
      ? build.trackers
          .filter((tracker) => resets(tracker.reset) && (vitals.tracker_uses[tracker.id] ?? 0) > 0)
          .map((tracker) => ({
            id: tracker.id,
            key: tracker.key,
            name: tracker.name,
            before: Math.max(0, tracker.max - (vitals.tracker_uses[tracker.id] ?? 0)),
            after: tracker.max,
          }))
      : [],
    slots:
      canRest && (kind === 'long' || build.casterKind === 'pact')
        ? vitals.slots_used
            .map((count, index) => ({ level: index + 1, count }))
            .filter((slot) => slot.count > 0)
        : [],
  }
}

/** 2024 rests: a long rest restores HP, all hit dice, slots and uses; a short rest restores
 * short-rest uses and pact slots. Exhaustion stays a DM-controlled resource. */
export function applyRest(vitals: Vitals, build: Build, maxHp: number, kind: 'short' | 'long') {
  const tracker_uses = Object.fromEntries(
    Object.entries(vitals.tracker_uses).filter(([trackerId]) => {
      const tracker = build.trackers.find((item) => item.id === trackerId)
      if (!tracker) return false
      return !(tracker.reset === 'short' || (kind === 'long' && tracker.reset === 'long'))
    }),
  )
  if (kind === 'short')
    return {
      ...vitals,
      tracker_uses,
      slots_used: build.casterKind === 'pact' ? Array<number>(9).fill(0) : vitals.slots_used,
    }
  return {
    ...vitals,
    current_hp: maxHp,
    temp_hp: 0,
    hit_dice_spent: 0,
    death_successes: 0,
    death_failures: 0,
    slots_used: Array<number>(9).fill(0),
    tracker_uses,
  }
}
