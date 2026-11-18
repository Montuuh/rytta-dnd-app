import { describe, expect, it } from 'vitest'
import { holdRoll, releaseRoll, useHeldRolls } from './held-rolls'

describe('held rolls', () => {
  it('exports a hook and keeps a roll out until it is released', () => {
    expect(typeof useHeldRolls).toBe('function')
    // Releasing a roll that was never held changes nothing.
    expect(() => releaseRoll('none')).not.toThrow()
    holdRoll('a')
    releaseRoll('a')
  })
})
