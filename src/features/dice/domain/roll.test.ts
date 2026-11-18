import { describe, expect, it } from 'vitest'
import {
  attackSpecs,
  checkSpec,
  createRollRequestIds,
  d20Expression,
  damageExpression,
  diceSlots,
  formulaOf,
  hitDiceExpression,
  mathsText,
  parseExpression,
  rollMaths,
  rollPayloadKey,
  totalRange,
  typedDice,
  typedTotal,
} from './roll'
import { diceBehaviour, readDiceChoice } from './mode'
import { mergeRoll } from './rolls'
import type { CampaignRoll } from '@/features/campaigns'

describe('expressions', () => {
  it('builds the d20 of a check from its modifier', () => {
    expect(d20Expression(5)).toBe('d20+5')
    expect(d20Expression(-1)).toBe('d20-1')
    expect(d20Expression(0)).toBe('d20')
    expect(d20Expression(1000)).toBeNull()
    expect(d20Expression(1.5)).toBeNull()
  })
  it('says what to roll and add, as the table reads it', () => {
    expect(formulaOf('d20+5')).toBe('d20 + 5')
    expect(formulaOf('d20-1')).toBe('d20 − 1')
    expect(formulaOf('1d8+3')).toBe('1d8 + 3')
    expect(formulaOf('d20')).toBe('d20')
  })
  it('builds a damage expression only from a plain die', () => {
    expect(damageExpression('1d8', 3)).toBe('1d8+3')
    expect(damageExpression('2d6', -1)).toBe('2d6-1')
    expect(damageExpression('1d6', 0)).toBe('1d6')
    // An unarmed strike without a die deals a flat number: nothing to roll.
    expect(damageExpression('1', 3)).toBeNull()
    expect(damageExpression('great', 3)).toBeNull()
  })
  it('keeps what the database rejects out: no keep-highest, no empty dice, at most 20 dice', () => {
    expect(parseExpression('2d20kh1+5')).toBeNull()
    expect(parseExpression('5')).toBeNull()
    expect(parseExpression('21d6')).toBeNull()
    expect(parseExpression('d20+1d4-2')).toEqual({
      dice: [
        { sign: 1, count: 1, sides: 20 },
        { sign: 1, count: 1, sides: 4 },
      ],
      flat: [{ sign: -1, value: 2 }],
    })
  })
  it('adds the CON modifier once per hit die', () => {
    expect(hitDiceExpression(2, 8, 2)).toBe('2d8+4')
    expect(hitDiceExpression(1, 10, -1)).toBe('1d10-1')
    expect(hitDiceExpression(3, 6, 0)).toBe('3d6')
  })
})

describe('the lines of the sheet', () => {
  it('names the check, save and attack rolls with a stable key', () => {
    expect(checkSpec('skill', 'perception', 8)).toEqual({
      kind: 'skill',
      label: 'perception',
      expression: 'd20+8',
    })
    expect(checkSpec('save', 'dex', -2)?.expression).toBe('d20-2')
    expect(checkSpec('ability', 'str', 5000)).toBeNull()
  })
  it('gives each weapon a hit line and a damage line', () => {
    const specs = attackSpecs({ name: 'Longsword', attack: 5, dice: '1d8', damageBonus: 3 })
    expect(specs.hit).toEqual({ kind: 'attack', label: 'Longsword', expression: 'd20+5' })
    expect(specs.damage).toEqual({ kind: 'damage', label: 'Longsword', expression: '1d8+3' })
    expect(attackSpecs({ name: 'Unarmed', attack: 4, dice: '1', damageBonus: 2 }).damage).toBeNull()
  })
  it('trims the weapon name to what the database stores', () => {
    const name = ` ${'x'.repeat(100)} `
    expect(attackSpecs({ name, attack: 0, dice: '1d4', damageBonus: 0 }).hit?.label).toHaveLength(
      80,
    )
  })
})

describe('the maths of a roll', () => {
  it('adds dice and modifier in the order of the expression', () => {
    const maths = rollMaths('d20+8', [14])!
    expect(maths.total).toBe(22)
    expect(mathsText(maths)).toBe('14 + 8')
    const damage = rollMaths('2d6+3', [4, 6])!
    expect(damage.total).toBe(13)
    expect(mathsText(damage)).toBe('4 + 6 + 3')
    const penalty = rollMaths('d20-1', [12])!
    expect(penalty.total).toBe(11)
    expect(mathsText(penalty)).toBe('12 − 1')
    expect(rollMaths('d20', [7])?.total).toBe(7)
  })
  it('refuses dice that do not match the expression', () => {
    expect(rollMaths('d20+1', [])).toBeNull()
    expect(rollMaths('d20+1', [21])).toBeNull()
    expect(rollMaths('d20+1', [0])).toBeNull()
    expect(rollMaths('d20+1', [3, 4])).toBeNull()
    expect(rollMaths('d20+1', [2.5])).toBeNull()
  })
  it('lists one slot per die and the range a total can fall in', () => {
    expect(diceSlots('2d6+3')).toEqual([
      { sides: 6, sign: 1 },
      { sides: 6, sign: 1 },
    ])
    expect(totalRange('2d6+3')).toEqual({ min: 5, max: 15 })
    expect(totalRange('d20-1')).toEqual({ min: 0, max: 19 })
  })
})

describe('recording a physical roll', () => {
  it('checks typed dice and adds them up', () => {
    expect(typedDice('d20+5', ['14'])).toEqual({ ok: true, dice: [14], total: 19 })
    expect(typedDice('2d6+3', ['4', '6'])).toEqual({ ok: true, dice: [4, 6], total: 13 })
  })
  it('says what is wrong with the dice', () => {
    expect(typedDice('d20+5', [''])).toEqual({ ok: false, reason: 'incomplete' })
    expect(typedDice('2d6', ['3'])).toEqual({ ok: false, reason: 'incomplete' })
    expect(typedDice('d20+5', ['21'])).toEqual({ ok: false, reason: 'range' })
    expect(typedDice('d20+5', ['0'])).toEqual({ ok: false, reason: 'range' })
    expect(typedDice('d20+5', ['1e1'])).toEqual({ ok: false, reason: 'range' })
  })
  it('reads a typed total within what the database stores', () => {
    expect(typedTotal(' 23 ')).toBe(23)
    expect(typedTotal('−3')).toBe(-3)
    expect(typedTotal('1.5')).toBeNull()
    expect(typedTotal('')).toBeNull()
    expect(typedTotal('10000')).toBeNull()
  })
})

describe('request ids', () => {
  it('keeps one id per payload until it is saved', () => {
    let n = 0
    const ids = createRollRequestIds(() => `id-${++n}`)
    const spec = { kind: 'skill', label: 'perception', expression: 'd20+8' } as const
    const first = rollPayloadKey('c', spec, [14], 22)
    expect(ids.idFor(first)).toBe('id-1')
    expect(ids.idFor(first)).toBe('id-1')
    expect(ids.idFor(rollPayloadKey('c', spec, [15], 23))).toBe('id-2')
    ids.done(first)
    expect(ids.idFor(first)).toBe('id-3')
    ids.reset()
    expect(ids.idFor(first)).toBe('id-4')
  })
})

describe('one dice behaviour per table', () => {
  it('follows the campaign unless each Player chooses', () => {
    expect(diceBehaviour('physical', 'app')).toBe('physical')
    expect(diceBehaviour('app', 'physical')).toBe('app')
    expect(diceBehaviour('player', 'app')).toBe('app')
    expect(diceBehaviour('player', 'physical')).toBe('physical')
    // Physical dice until the Player chooses.
    expect(diceBehaviour('player', null)).toBe('physical')
  })
  it('reads only known device choices', () => {
    expect(readDiceChoice('app')).toBe('app')
    expect(readDiceChoice('physical')).toBe('physical')
    expect(readDiceChoice('other')).toBeNull()
    expect(readDiceChoice(null)).toBeNull()
  })
})

describe('recent rolls', () => {
  const roll = (id: string, at: string): CampaignRoll => ({
    id,
    campaign_id: 'c',
    character_id: null,
    roller_id: 'r',
    label: '',
    expression: 'd20',
    dice: [1],
    total: 1,
    kind: 'custom',
    source: 'recorded',
    visibility: 'roller_dm',
    created_at: at,
  })
  it('puts the newest first, replaces a repeated roll and keeps the limit', () => {
    const a = roll('a', '2026-11-18T10:00:00+00:00')
    const b = roll('b', '2026-11-18T10:01:00+00:00')
    const merged = mergeRoll([a], b)
    expect(merged.map((item) => item.id)).toEqual(['b', 'a'])
    expect(mergeRoll(merged, { ...a, total: 9 }).find((item) => item.id === 'a')?.total).toBe(9)
    expect(
      mergeRoll(merged, roll('c', '2026-11-18T10:02:00+00:00'), 2).map((item) => item.id),
    ).toEqual(['c', 'b'])
  })
})
