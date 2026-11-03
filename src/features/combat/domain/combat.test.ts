import { describe, expect, it } from 'vitest'
import {
  canEnterInitiative,
  combatErrorCode,
  initiativeProgress,
  combatPollInterval,
  combatStateSchema,
  concentrationDc,
  halfDamage,
  joinPlacement,
  missingInitiative,
  moveWithinTie,
  nextUp,
  previewAsPlayer,
  turnsUntil,
  type Combatant,
  type CombatState,
} from './combat'

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const base = (n: number, extra: Partial<Combatant> = {}): Combatant => ({
  id: id(n),
  kind: 'npc',
  side: 'enemy',
  name: `C${n}`,
  in_turn_order: true,
  is_active: false,
  is_own: false,
  can_act: false,
  defeated: false,
  ...extra,
})

describe('combat rules', () => {
  it('computes the concentration DC and half damage', () => {
    expect(concentrationDc(1)).toBe(10)
    expect(concentrationDc(22)).toBe(11)
    expect(concentrationDc(80)).toBe(30)
    expect(concentrationDc(-5)).toBe(10)
    expect(halfDamage(7)).toBe(3)
    expect(halfDamage(0)).toBe(0)
  })
  it('finds who is next and how many turns until the viewer acts', () => {
    const list = [
      base(1, { is_active: true }),
      base(2, { in_turn_order: false, defeated: true }),
      base(3),
      base(4, { is_own: true }),
    ]
    expect(nextUp(list)?.id).toBe(id(3))
    expect(turnsUntil(list, id(4))).toBe(2)
    expect(turnsUntil(list, id(1))).toBe(0)
    expect(turnsUntil(list, id(2))).toBeNull()
    // Wraps around the end of the round.
    const later = list.map((c) => ({ ...c, is_active: c.id === id(4) }))
    expect(nextUp(later)?.id).toBe(id(1))
    expect(turnsUntil(later, id(3))).toBe(2)
    expect(nextUp([base(1, { is_active: true })])).toBeNull()
    expect(nextUp([])).toBeNull()
  })
  it('reorders only within an initiative tie', () => {
    const list = [
      base(1, { initiative: 15, initiative_bonus: 2 }),
      base(2, { initiative: 15, initiative_bonus: 2 }),
      base(3, { initiative: 12 }),
    ]
    expect(moveWithinTie(list, id(2), -1)).toEqual([id(2), id(1), id(3)])
    expect(moveWithinTie(list, id(2), 1)).toBeNull()
    expect(moveWithinTie(list, id(1), -1)).toBeNull()
    expect(missingInitiative([base(5), base(6, { initiative: 3 })]).map((c) => c.id)).toEqual([
      id(5),
    ])
  })
  it('maps server messages to stable error codes', () => {
    expect(combatErrorCode('Stale turn')).toBe('staleTurn')
    expect(combatErrorCode('Combatant unavailable')).toBe('gone')
    expect(combatErrorCode('Request mismatch')).toBe('invalid')
    expect(combatErrorCode('Forbidden')).toBe('forbidden')
    expect(combatErrorCode('boom')).toBe('unavailable')
    expect(combatErrorCode('Initiative closed')).toBe('initiativeClosed')
  })
  it('opens the table initiative entry only for the own character while it is collected', () => {
    const own = base(1, { kind: 'character', side: 'party', is_own: true, can_act: true })
    expect(canEnterInitiative('initiative', own)).toBe(true)
    expect(canEnterInitiative('initiative', { ...own, initiative: 14 })).toBe(true)
    // During the fight only a missing total (a late joiner) can still be entered.
    expect(canEnterInitiative('active', own)).toBe(true)
    expect(canEnterInitiative('active', { ...own, initiative: 14 })).toBe(false)
    expect(canEnterInitiative('ended', own)).toBe(false)
    expect(canEnterInitiative('draft', own)).toBe(false)
    // Never a teammate or a creature.
    expect(canEnterInitiative('initiative', { ...own, is_own: false, can_act: false })).toBe(false)
    expect(canEnterInitiative('initiative', { ...own, kind: 'npc' })).toBe(false)
    expect(initiativeProgress([own, base(2, { initiative: 3 }), base(3)])).toEqual({
      ready: 1,
      total: 3,
    })
  })
  it('polls fast only during a live fight', () => {
    const live = combatStateSchema.parse({
      encounter: { id: id(9), name: 'x', status: 'active', round: 1, revision: 1 },
    })
    expect(combatPollInterval(live)).toBe(4000)
    expect(combatPollInterval(undefined)).toBe(15000)
  })
  it('previews the Player projection without DM-only data', () => {
    const state: CombatState = combatStateSchema.parse({
      viewer: { role: 'dm' },
      encounter: { id: id(9), name: 'x', status: 'active', round: 1, revision: 1 },
      combatants: [
        base(1, {
          kind: 'character',
          side: 'party',
          character_id: id(101),
          shares_live: true,
          hp: { current: 5, max: 10, temp: 0 },
          hp_status: 'wounded',
          armor_class: 14,
          can_act: true,
        }),
        base(2, {
          kind: 'character',
          side: 'party',
          character_id: id(102),
          shares_live: false,
          hp: { current: 9, max: 10, temp: 0 },
          hp_status: 'wounded',
          conditions: ['prone'],
          can_act: true,
        }),
        base(3, {
          hp: { current: 3, max: 7, temp: 0 },
          hp_status: 'bloodied',
          armor_class: 15,
          dm_notes: 'secret',
          can_act: true,
        }),
        base(4, { hidden: true, name: 'Ogre', can_act: true }),
      ],
      effects: [
        {
          id: id(201),
          target_combatant: id(3),
          label: 'Marked',
          ticks_on: 'end',
          visible: false,
          can_remove: true,
        },
      ],
      events: [
        {
          id: id(301),
          kind: 'join',
          round: 0,
          target_name: 'Ogre',
          undone: false,
          visible: false,
          created_at: 'now',
        },
      ],
    })
    const view = previewAsPlayer(state, new Set([id(101)]))
    const text = JSON.stringify(view)
    expect(view.viewer.role).toBe('player')
    expect(text).not.toMatch(/Ogre|secret|Marked/)
    expect(view.combatants.map((c) => c.id)).toEqual([id(1), id(2), id(3)])
    expect(view.combatants[0]).toMatchObject({ is_own: true, can_act: true, armor_class: 14 })
    expect(view.combatants[1]).toMatchObject({ hp_status: 'unknown', can_act: false })
    expect(view.combatants[1]!.hp).toBeUndefined()
    expect(view.combatants[1]!.conditions).toBeUndefined()
    expect(view.combatants[2]).toMatchObject({ hp_status: 'bloodied', can_act: false })
    expect(view.combatants[2]!.hp).toBeUndefined()
    expect(view.combatants[2]!.armor_class).toBeUndefined()
  })
  it('previews where a joining character lands in the current round', () => {
    const order = [
      base(1, { initiative: 18 }),
      base(2, { initiative: 15, is_active: true }),
      base(3, { initiative: 12, initiative_bonus: 2 }),
      base(4, { initiative: 12, initiative_bonus: -1 }),
      base(5, { hidden: true, in_turn_order: false }),
    ]
    // Above the active slot: it waits for the next round.
    expect(joinPlacement(order, 20)).toMatchObject({ before: null, thisRound: false })
    expect(joinPlacement(order, 16)).toMatchObject({ before: { id: id(1) }, thisRound: false })
    // Equal to the active total with no bonus: after it, still this round.
    expect(joinPlacement(order, 15)).toMatchObject({ before: { id: id(2) }, thisRound: true })
    // Ties go after a non-negative bonus and before a negative one.
    expect(joinPlacement(order, 12)).toMatchObject({
      before: { id: id(3) },
      after: { id: id(4) },
      thisRound: true,
    })
    // Below everyone with a total: before those still without one.
    expect(joinPlacement(order, -3)).toMatchObject({ before: { id: id(4) }, after: { id: id(5) } })
    // Without an active turn nothing acts "this round".
    expect(joinPlacement([base(1, { initiative: 3 })], 1).thisRound).toBe(false)
  })
})
