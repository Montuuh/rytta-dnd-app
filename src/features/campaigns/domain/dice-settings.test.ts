import { describe, expect, it } from 'vitest'
import { createDiceRequestIds, sameDiceSettings, visibilityChange } from './dice-settings'

const physical = { dice_mode: 'physical', roll_visibility: 'roller_dm' } as const
const app = { dice_mode: 'app', roll_visibility: 'roller_dm' } as const
const appTable = { dice_mode: 'app', roll_visibility: 'table' } as const

describe('dice settings', () => {
  it('compares both settings', () => {
    expect(sameDiceSettings(physical, { ...physical })).toBe(true)
    expect(sameDiceSettings(physical, app)).toBe(false)
    expect(sameDiceSettings(app, appTable)).toBe(false)
  })
  it('tells a wider audience from a narrower one', () => {
    expect(visibilityChange('roller_dm', 'table')).toBe('wider')
    expect(visibilityChange('roller', 'roller_dm')).toBe('wider')
    expect(visibilityChange('table', 'roller')).toBe('narrower')
    expect(visibilityChange('table', 'roller_dm')).toBe('narrower')
    expect(visibilityChange('table', 'table')).toBe('same')
  })
  it('keeps one request id per change until it is applied or the question closes', () => {
    let n = 0
    const ids = createDiceRequestIds(() => `id-${++n}`)
    expect(ids.idFor(physical, app)).toBe('id-1')
    // A retry of the same change repeats the id.
    expect(ids.idFor(physical, app)).toBe('id-1')
    // Another target, or another starting point, is another intent.
    expect(ids.idFor(physical, appTable)).toBe('id-2')
    expect(ids.idFor(app, physical)).toBe('id-3')
    ids.done(physical, app)
    expect(ids.idFor(physical, app)).toBe('id-4')
    ids.reset()
    expect(ids.idFor(physical, appTable)).toBe('id-5')
  })
})
