import { rollExpressionPattern, type RollKind } from '@/features/campaigns'

/**
 * RYT-133: the dice of one roll. An expression is what the database accepts (`d20+5`, `1d8+3`);
 * the sheet builds one for each check, save, attack and damage line, so what the table is told to
 * roll, what the app rolls and what gets recorded are the same string. Advantage and
 * disadvantage are not modelled on the sheet, so keep-highest and keep-lowest are never built.
 */
export type DiceTerm = { sign: 1 | -1; count: number; sides: number }
export type FlatTerm = { sign: 1 | -1; value: number }
export type ParsedExpression = { dice: DiceTerm[]; flat: FlatTerm[] }

/** The most dice a typed roll gets one field each for; bigger pools are typed as a total. */
export const maxTypedDice = 6

const token = /([+-]?)(?:([0-9]{0,2})d([0-9]{1,3})|([0-9]{1,3}))/g

/** The dice and flat numbers of a plain expression; null for anything else (including `kh1`). */
export function parseExpression(expression: string): ParsedExpression | null {
  if (!rollExpressionPattern.test(expression) || /k[hl]/.test(expression)) return null
  const dice: DiceTerm[] = []
  const flat: FlatTerm[] = []
  for (const match of expression.matchAll(token)) {
    const sign = match[1] === '-' ? -1 : 1
    if (match[3] !== undefined)
      dice.push({ sign, count: match[2] ? Number(match[2]) : 1, sides: Number(match[3]) })
    else flat.push({ sign, value: Number(match[4]) })
  }
  const count = dice.reduce((sum, term) => sum + term.count, 0)
  return count >= 1 && count <= 20 ? { dice, flat } : null
}

const modifierSuffix = (modifier: number) =>
  modifier === 0 ? '' : modifier > 0 ? `+${modifier}` : `-${Math.abs(modifier)}`

/** `d20+5` for a check, save or attack roll; null when the modifier is out of the range stored. */
export function d20Expression(modifier: number): string | null {
  return Number.isInteger(modifier) && Math.abs(modifier) <= 999
    ? `d20${modifierSuffix(modifier)}`
    : null
}

/** `1d8+3` from an item's damage dice and the bonus; null when the dice are not a plain `NdS`
 * (an unarmed strike without a die deals a flat number, which has nothing to roll). */
export function damageExpression(dice: string, bonus: number): string | null {
  const text = `${dice.trim()}${modifierSuffix(bonus)}`
  const parsed = parseExpression(text)
  return parsed && parsed.dice.length === 1 && Math.abs(bonus) <= 999 ? text : null
}

/** What the table reads: `d20 + 5`, `1d8 − 1`. */
export function formulaOf(expression: string): string {
  return expression.replace(/([+-])/g, (sign) => (sign === '+' ? ' + ' : ' − '))
}

/** A roll the sheet can make: its kind and label are stored with the result. For checks, saves
 * and hit dice the label is the stable key (`perception`, `dex`) so every viewer reads it in
 * their own language; for attacks and damage it is the weapon's name. */
export type RollSpec = { kind: RollKind; label: string; expression: string }

export function checkSpec(
  kind: Extract<RollKind, 'ability' | 'skill' | 'save' | 'initiative'>,
  key: string,
  modifier: number,
): RollSpec | null {
  const expression = d20Expression(modifier)
  return expression ? { kind, label: key, expression } : null
}

export function attackSpecs(line: {
  name: string
  attack: number
  dice: string
  damageBonus: number
}): { hit: RollSpec | null; damage: RollSpec | null } {
  const label = line.name.trim().slice(0, 80)
  const hit = d20Expression(line.attack)
  const damage = damageExpression(line.dice, line.damageBonus)
  return {
    hit: hit ? { kind: 'attack', label, expression: hit } : null,
    damage: damage ? { kind: 'damage', label, expression: damage } : null,
  }
}

/** Hit dice of a short rest: `2d8+4` is the dice plus the CON modifier once per die. */
export function hitDiceExpression(count: number, sides: number, conMod: number): string | null {
  const text = `${count}d${sides}${modifierSuffix(conMod * count)}`
  return parseExpression(text) ? text : null
}

/** One entry per die of the expression, in the order the database reads them. */
export function diceSlots(expression: string): { sides: number; sign: 1 | -1 }[] {
  const parsed = parseExpression(expression)
  return (
    parsed?.dice.flatMap((term) =>
      Array.from({ length: term.count }, () => ({ sides: term.sides, sign: term.sign })),
    ) ?? []
  )
}

/** The flat number added to the dice (negative for a penalty). */
export const flatTotal = (parsed: ParsedExpression) =>
  parsed.flat.reduce((sum, term) => sum + term.sign * term.value, 0)

export type RollMaths = {
  /** Each die in order, then the flat modifier when there is one. */
  parts: { kind: 'die' | 'flat'; value: number; sides?: number }[]
  total: number
}

/** The maths of a result: dice in the order of the expression, then the modifier. Null when the
 * dice do not match the expression (count or faces). */
export function rollMaths(expression: string, dice: readonly number[]): RollMaths | null {
  const parsed = parseExpression(expression)
  const slots = diceSlots(expression)
  if (!parsed || slots.length !== dice.length) return null
  const parts: RollMaths['parts'] = []
  let total = 0
  for (const [index, slot] of slots.entries()) {
    const value = dice[index]!
    if (!Number.isInteger(value) || value < 1 || value > slot.sides) return null
    parts.push({ kind: 'die', value: slot.sign * value, sides: slot.sides })
    total += slot.sign * value
  }
  const flat = flatTotal(parsed)
  if (flat !== 0) {
    parts.push({ kind: 'flat', value: flat })
    total += flat
  }
  return { parts, total }
}

/** `14 + 8`, `4 + 6 + 3`, `12 − 1`: the same maths as text for the live region. */
export function mathsText(maths: RollMaths): string {
  return maths.parts
    .map((part, index) =>
      index === 0
        ? String(part.value)
        : part.value < 0
          ? `− ${Math.abs(part.value)}`
          : `+ ${part.value}`,
    )
    .join(' ')
}

export type TypedDice =
  { ok: true; dice: number[]; total: number } | { ok: false; reason: 'incomplete' | 'range' }

/** Checks the dice a Player read off physical dice against the expression and adds the maths. */
export function typedDice(expression: string, typed: readonly string[]): TypedDice {
  const slots = diceSlots(expression)
  if (typed.length !== slots.length || typed.some((value) => value.trim() === ''))
    return { ok: false, reason: 'incomplete' }
  const dice = typed.map((value) =>
    /^[0-9]{1,3}$/.test(value.trim()) ? Number(value) : Number.NaN,
  )
  const maths = rollMaths(expression, dice)
  if (!maths) return { ok: false, reason: 'range' }
  return { ok: true, dice, total: maths.total }
}

/** A typed total alone (a large pool, or a Player who added it up): the database accepts any
 * whole total it can store for a valid expression. */
export function typedTotal(value: string): number | null {
  const text = value.trim().replace('−', '-')
  if (!/^-?[0-9]{1,4}$/.test(text)) return null
  const total = Number(text)
  return total >= -999 && total <= 9999 ? total : null
}

/** Where a typed total can fall: the lowest and highest the dice allow plus the modifier. */
export function totalRange(expression: string): { min: number; max: number } | null {
  const parsed = parseExpression(expression)
  if (!parsed) return null
  let min = flatTotal(parsed)
  let max = min
  for (const term of parsed.dice) {
    const low = term.count
    const high = term.count * term.sides
    min += term.sign === 1 ? low : -high
    max += term.sign === 1 ? high : -low
  }
  return { min, max }
}

/** One request id per roll intent: the same payload keeps its id across retries, so a roll that
 * was saved but whose answer was lost is returned by the server instead of recorded twice. */
export function createRollRequestIds(newId: () => string) {
  const ids = new Map<string, string>()
  return {
    idFor(key: string) {
      let id = ids.get(key)
      if (!id) {
        id = newId()
        ids.set(key, id)
      }
      return id
    },
    done(key: string) {
      ids.delete(key)
    },
    reset() {
      ids.clear()
    },
  }
}

export const rollPayloadKey = (
  characterId: string | null,
  spec: RollSpec,
  dice: readonly number[],
  total: number,
) => JSON.stringify([characterId, spec.kind, spec.label, spec.expression, dice, total])
