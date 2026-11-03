import { describe, expect, it } from 'vitest'
import {
  canEndTurn,
  canEnterInitiative,
  canRollDeathSave,
  combatErrorCode,
  initiativeProgress,
  combatPollInterval,
  combatStateSchema,
  concentrationDc,
  deathSaveThisRound,
  deathState,
  halfDamage,
  healthBand,
  joinPlacement,
  monogram,
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

  it('RYT-043 names five health bands from exact or projected hit points', () => {
    const hp = (current: number) => base(1, { hp: { current, max: 8, temp: 0 } })
    expect([8, 5, 3, 2, 0].map((n) => healthBand(hp(n)))).toEqual([
      'unhurt',
      'wounded',
      'bloodied',
      'critical',
      'down',
    ])
    // Without numbers the server's band wins; an old projection falls back to its status.
    expect(healthBand(base(1, { hp_band: 'critical', hp_status: 'bloodied' }))).toBe('critical')
    expect(healthBand(base(1, { hp_status: 'wounded' }))).toBe('wounded')
    expect(healthBand(base(1, { kind: 'character', side: 'party' }))).toBe('unknown')
    expect(healthBand(base(1, { defeated: true, hp_band: 'unhurt' }))).toBe('down')
    expect(healthBand(base(1, { kind: 'lair' }))).toBeNull()
    expect(monogram('Goblin 3')).toBe('G3')
    expect(monogram('  arin   vale  the bold ')).toBe('AV')
    expect(monogram('Ñandú')).toBe('Ñ')
    // The projection accepts both new fields.
    expect(
      combatStateSchema.parse({
        encounter: null,
        combatants: [base(1, { hp_band: 'critical', image_path: 'pre/a/b/c.webp' })],
      }).combatants[0],
    ).toMatchObject({ hp_band: 'critical', image_path: 'pre/a/b/c.webp' })
  })

  it('RYT-045 tells death states and when the own Player rolls or ends the turn', () => {
    const pc = (extra: Partial<Combatant> = {}) =>
      base(1, {
        kind: 'character',
        side: 'party',
        is_own: true,
        can_act: true,
        is_active: true,
        hp: { current: 0, max: 20, temp: 0 },
        death_saves: { successes: 1, failures: 0 },
        ...extra,
      })
    const state = (c: Combatant, events: CombatState['events'] = []): CombatState => ({
      encounter: { id: id(9), name: 'Fight', status: 'active', round: 2, revision: 1 },
      combatants: [c],
      effects: [],
      events,
    })
    const roll = (round: number, undone = false): CombatState['events'][number] => ({
      id: id(round + (undone ? 50 : 0)),
      kind: 'death_save',
      round,
      target_combatant: id(1),
      detail: { outcome: 'success' },
      undone,
      mine: true,
      undoable: true,
      created_at: '2026-11-03T00:00:00Z',
    })
    expect(deathState(pc())).toBe('dying')
    expect(deathState(pc({ death_saves: { successes: 3, failures: 0 } }))).toBe('stable')
    expect(deathState(pc({ defeated: true }))).toBe('dead')
    // Without vitals the server's outcome still reads (teammates who do not share, the table).
    expect(deathState(pc({ hp: undefined, death_saves: undefined, death_state: 'stable' }))).toBe(
      'stable',
    )
    expect(deathState(pc({ hp: { current: 1, max: 20, temp: 0 }, death_state: 'revived' }))).toBe(
      'revived',
    )
    expect(deathState(pc({ hp: { current: 5, max: 20, temp: 0 } }))).toBeNull()
    expect(deathState(base(2, { hp: { current: 0, max: 7, temp: 0 } }))).toBeNull()

    // Once per round, on the own turn, while dying; an undone roll frees the round again.
    expect(canRollDeathSave(state(pc()), pc())).toBe(true)
    expect(canRollDeathSave(state(pc(), [roll(1)]), pc())).toBe(true)
    expect(canRollDeathSave(state(pc(), [roll(2)]), pc())).toBe(false)
    expect(canRollDeathSave(state(pc(), [roll(2, true)]), pc())).toBe(true)
    expect(deathSaveThisRound(state(pc(), [roll(2, true), roll(2)]), id(1))?.undone).toBe(false)
    for (const other of [
      pc({ is_active: false }),
      pc({ is_own: false, can_act: false }),
      pc({ death_saves: { successes: 3, failures: 1 } }),
      pc({ defeated: true }),
    ])
      expect(canRollDeathSave(state(other), other)).toBe(false)

    expect(canEndTurn('active', pc())).toBe(true)
    expect(canEndTurn('active', pc({ defeated: true }))).toBe(true)
    expect(canEndTurn('initiative', pc())).toBe(false)
    expect(canEndTurn('active', pc({ is_own: false, can_act: false }))).toBe(false)
    expect(canEndTurn('active', base(2, { is_active: true, can_act: true }))).toBe(false)
    expect(canEndTurn('active', null)).toBe(false)
    expect(combatErrorCode('Not your turn')).toBe('notYourTurn')
    expect(combatErrorCode('Already rolled')).toBe('alreadyRolled')
  })
})
