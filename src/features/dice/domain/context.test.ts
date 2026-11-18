import { describe, expect, it } from 'vitest'
import type { CampaignRoll } from '@/features/campaigns'
import {
  initiativeExpression,
  initiativeModifier,
  isSpent,
  createAttemptBook,
  reRollApplied,
  rerollExpression,
  resetSlot,
  rollContextSchema,
  rollInForce,
  withRoll,
  type RollContext,
} from './context'

const fight = '11111111-1111-4111-8111-111111111111'
const other = '22222222-2222-4222-8222-222222222222'
const arin = '33333333-3333-4333-8333-333333333333'
const bea = '44444444-4444-4444-8444-444444444444'
const campaign = '55555555-5555-4555-8555-555555555555'
const user = '66666666-6666-4666-8666-666666666666'
const firstRoll = '77777777-7777-4777-8777-777777777771'

const roll = (over: Partial<CampaignRoll>): CampaignRoll => ({
  id: firstRoll,
  campaign_id: campaign,
  character_id: arin,
  roller_id: user,
  label: 'initiative',
  expression: 'd20+2',
  dice: [13],
  total: 15,
  kind: 'initiative',
  source: 'app',
  visibility: 'roller_dm',
  created_at: '2026-11-18T10:05:00+00:00',
  encounter_id: fight,
  rest_id: null,
  superseded_at: null,
  ...over,
})
const context = (over: Partial<RollContext> = {}): RollContext => ({
  encounter_id: fight,
  rest_id: null,
  spent: [{ character_id: arin, kind: 'initiative' }],
  rolls: [roll({})],
  ...over,
})

describe('the roll context the server returns', () => {
  it('parses the server answer and drops columns it does not use', () => {
    const parsed = rollContextSchema.parse({
      encounter_id: fight,
      rest_id: null,
      spent: [{ character_id: arin, kind: 'initiative' }],
      rolls: [
        {
          ...roll({ created_at: '2026-11-18T10:05:00.123456+00:00' }),
          extra_column: 'ignored',
        },
      ],
    })
    expect(parsed.rolls[0]).not.toHaveProperty('extra_column')
    expect(parsed.rolls[0]?.encounter_id).toBe(fight)
  })
  it('fills an empty state', () => {
    expect(rollContextSchema.parse({ encounter_id: null, rest_id: null })).toEqual({
      encounter_id: null,
      rest_id: null,
      spent: [],
      rolls: [],
    })
  })
  it('refuses a kind or a shape it does not know', () => {
    expect(() =>
      rollContextSchema.parse({
        encounter_id: null,
        rest_id: null,
        spent: [{ character_id: arin, kind: 'attack' }],
      }),
    ).toThrow()
    expect(() => rollContextSchema.parse({ encounter_id: 'x', rest_id: null })).toThrow()
  })
})

describe('the roll in force', () => {
  it('finds the character roll of that kind in the live fight', () => {
    expect(rollInForce(context(), arin, 'initiative')?.total).toBe(15)
    expect(rollInForce(context(), bea, 'initiative')).toBeUndefined()
    expect(rollInForce(context(), arin, 'hit_die')).toBeUndefined()
    expect(rollInForce(undefined, arin, 'initiative')).toBeUndefined()
    expect(rollInForce(context(), null, 'initiative')).toBeUndefined()
  })
  it('ignores an initiative roll of another fight, a superseded roll and a typed one', () => {
    expect(rollInForce(context({ encounter_id: other }), arin, 'initiative')).toBeUndefined()
    expect(rollInForce(context({ encounter_id: null }), arin, 'initiative')).toBeUndefined()
    expect(
      rollInForce(
        context({ rolls: [roll({ superseded_at: '2026-11-18T10:06:00+00:00' })] }),
        arin,
        'initiative',
      ),
    ).toBeUndefined()
    expect(
      rollInForce(context({ rolls: [roll({ source: 'recorded' })] }), arin, 'initiative'),
    ).toBeUndefined()
  })
  it('keeps a hit-dice roll made in an earlier rest, and takes the newest', () => {
    const early = roll({
      id: '77777777-7777-4777-8777-777777777772',
      kind: 'hit_die',
      label: 'hit_die',
      expression: '1d8+2',
      encounter_id: null,
      rest_id: other,
      created_at: '2026-11-18T09:00:00+00:00',
      dice: [3],
      total: 5,
    })
    const late = { ...early, id: '77777777-7777-4777-8777-777777777773', total: 9, dice: [7] }
    const ctx = context({ encounter_id: null, rest_id: fight, rolls: [early, late] })
    expect(rollInForce(ctx, arin, 'hit_die')?.id).toBe(late.id)
  })
  it('leaves out a roll the card has not revealed yet', () => {
    const held = new Set([firstRoll])
    expect(rollInForce(context(), arin, 'initiative', held)).toBeUndefined()
    expect(isSpent(context(), arin, 'initiative', held)).toBe(false)
  })
})

describe('whether the one roll is spent', () => {
  it('is what the server lists, even when the roll itself is not readable', () => {
    expect(isSpent(context(), arin, 'initiative')).toBe(true)
    expect(isSpent(context({ rolls: [] }), arin, 'initiative')).toBe(true)
    expect(isSpent(context(), bea, 'initiative')).toBe(false)
    expect(isSpent(context(), arin, 'hit_die')).toBe(false)
    expect(isSpent(undefined, arin, 'initiative')).toBe(false)
    expect(isSpent(context(), null, 'initiative')).toBe(false)
  })
})

describe('initiative expressions', () => {
  it('builds only what the server accepts: d20 with a modifier from -20 to 30', () => {
    expect(initiativeExpression(2)).toBe('d20+2')
    expect(initiativeExpression(0)).toBe('d20')
    expect(initiativeExpression(-3)).toBe('d20-3')
    expect(initiativeExpression(30)).toBe('d20+30')
    expect(initiativeExpression(-20)).toBe('d20-20')
    expect(initiativeExpression(31)).toBeNull()
    expect(initiativeExpression(-21)).toBeNull()
    expect(initiativeExpression(1.5)).toBeNull()
  })
  it('reads the modifier back', () => {
    expect(initiativeModifier('d20+2')).toBe(2)
    expect(initiativeModifier('1d20-4')).toBe(-4)
    expect(initiativeModifier('d20')).toBe(0)
    expect(initiativeModifier('d20+31')).toBeNull()
    expect(initiativeModifier('2d20+1')).toBeNull()
    expect(initiativeModifier('d8+1')).toBeNull()
  })
  it('re-rolls with the bonus of the Player roll, then the sheet, then the saved one, else none', () => {
    expect(rerollExpression(roll({ expression: 'd20+4' }), 6, 1)).toBe('d20+4')
    expect(rerollExpression(undefined, 6, 1)).toBe('d20+6')
    expect(rerollExpression(undefined, null, 3)).toBe('d20+3')
    expect(rerollExpression(undefined, null, null)).toBe('d20')
    expect(rerollExpression(undefined, 99, null)).toBe('d20+30')
    expect(rerollExpression(undefined, -99, null)).toBe('d20-20')
  })
})

describe('a roll the server just stored', () => {
  const empty = context({ spent: [], rolls: [] })
  it('is added to the state at once, once', () => {
    const next = withRoll(empty, roll({}))
    expect(isSpent(next, arin, 'initiative')).toBe(true)
    expect(rollInForce(next, arin, 'initiative')?.total).toBe(15)
    expect(withRoll(next, roll({}))).toEqual(next)
  })
  it('leaves the state alone for a roll the server does not count', () => {
    expect(withRoll(empty, roll({ encounter_id: null }))).toBe(empty)
    expect(withRoll(empty, roll({ encounter_id: other }))).toBe(empty)
    expect(withRoll(empty, roll({ source: 'recorded' }))).toBe(empty)
    expect(withRoll(empty, roll({ kind: 'attack' }))).toBe(empty)
    expect(withRoll(empty, roll({ character_id: null }))).toBe(empty)
  })
  it('counts a hit-dice roll made in any rest', () => {
    const hit = roll({ kind: 'hit_die', encounter_id: null, rest_id: other, expression: '1d8+2' })
    expect(isSpent(withRoll(empty, hit), arin, 'hit_die')).toBe(true)
  })
})

describe('request ids of the DM resets', () => {
  let n = 0
  const id = () => `id-${++n}`
  it('keeps the id of a retry and gives a new intent a new one', () => {
    const book = createAttemptBook()
    const slot = resetSlot(arin, 'initiative')
    const first = book.forIntent(slot, 'fight-1|roll-a|clear', id)
    expect(book.forIntent(slot, 'fight-1|roll-a|clear', id)).toBe(first)
    // A later roll, then a new clear: another signature, another id.
    expect(book.forIntent(slot, 'fight-1|roll-b|clear', id).id).not.toBe(first.id)
  })
  it('keeps the first attempt of a re-roll whose reply was lost, with its payload', () => {
    const book = createAttemptBook()
    const slot = resetSlot(arin, 'initiative')
    const first = book.forIntent(slot, 'fight-1|roll-a|d20+2', id, { expression: 'd20+2' })
    // The first try applied: the roll in force changed, and the retry carries its own signature.
    const retry = book.forIntent(slot, 'fight-1|roll-b|d20+2', id, {
      expression: 'd20+3',
      reuse: (previous) => previous.expression !== null,
    })
    expect(retry).toBe(first)
    expect(retry.expression).toBe('d20+2')
    // Without the reuse rule the changed signature is a new intent.
    expect(book.forIntent(slot, 'fight-1|roll-c|d20+2', id).id).not.toBe(first.id)
  })
  it('ends an attempt on success without touching another slot', () => {
    const book = createAttemptBook()
    const a = resetSlot(arin, 'initiative')
    const b = resetSlot(bea, 'initiative')
    const pending = book.forIntent(b, 'x', id)
    book.forIntent(a, 'x', id)
    book.done(a)
    expect(book.has(a)).toBe(false)
    expect(book.forIntent(b, 'x', id)).toBe(pending)
  })
  it('drops the attempts of slots the server no longer marks as spent', () => {
    const book = createAttemptBook()
    const a = resetSlot(arin, 'initiative')
    const b = resetSlot(bea, 'hit_die')
    book.forIntent(a, 'x', id)
    book.forIntent(b, 'x', id)
    book.prune((slot) => slot === b)
    expect(book.has(a)).toBe(false)
    expect(book.has(b)).toBe(true)
  })
})

describe('a re-roll whose reply was lost', () => {
  const me = '99999999-9999-4999-8999-999999999999'
  const attempt = { id: 'x', signature: 'fight|roll-a|d20+2', expression: 'd20+2' }
  it('is applied once this DM roll is the one in force and is not the one it started from', () => {
    expect(reRollApplied(attempt, roll({ id: 'roll-b', roller_id: me }), me)).toBe(true)
  })
  it('is not applied while the roll in force is still the starting one, a Player one or unreadable', () => {
    expect(reRollApplied(attempt, roll({ id: 'roll-a', roller_id: me }), me)).toBe(false)
    expect(reRollApplied(attempt, roll({ id: 'roll-b', roller_id: user }), me)).toBe(false)
    expect(reRollApplied(attempt, undefined, me)).toBe(false)
  })
  it('never applies to a clear', () => {
    expect(
      reRollApplied({ ...attempt, expression: null }, roll({ id: 'roll-b', roller_id: me }), me),
    ).toBe(false)
  })
})
