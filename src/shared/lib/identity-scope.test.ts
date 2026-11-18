import { describe, expect, it, vi } from 'vitest'
import { identityChanged, onIdentityChange } from './identity-scope'

describe('identity scope', () => {
  it('runs callbacks when the account changes or signs out, not for the first report or a repeat', () => {
    const clear = vi.fn()
    const stop = onIdentityChange(clear)
    identityChanged('a')
    expect(clear).not.toHaveBeenCalled()
    identityChanged('a')
    identityChanged('b')
    expect(clear).toHaveBeenCalledTimes(1)
    identityChanged(null)
    expect(clear).toHaveBeenCalledTimes(2)
    stop()
    identityChanged('c')
    expect(clear).toHaveBeenCalledTimes(2)
  })
})
