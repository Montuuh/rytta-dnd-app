import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { closeOnEscapeWhileOpening } from './escape-while-opening'

// The unit tests run in Node: a bare event target stands in for the window.
const fakeWindow = () => Object.assign(new EventTarget(), { setTimeout, clearTimeout })
const press = (key: string) => {
  const event = Object.assign(new Event('keydown', { cancelable: true }), { key })
  ;(window as unknown as EventTarget).dispatchEvent(event)
}

describe('closeOnEscapeWhileOpening', () => {
  beforeEach(() => vi.stubGlobal('window', fakeWindow()))
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('closes once on Escape and ignores other keys', () => {
    const close = vi.fn()
    closeOnEscapeWhileOpening(close)
    press('Tab')
    expect(close).not.toHaveBeenCalled()
    press('Escape')
    press('Escape')
    expect(close).toHaveBeenCalledTimes(1)
  })

  it('stops by itself, so the overlay is left to its own listener', () => {
    vi.useFakeTimers()
    vi.stubGlobal('window', fakeWindow())
    const close = vi.fn()
    closeOnEscapeWhileOpening(close, 600)
    vi.advanceTimersByTime(601)
    press('Escape')
    expect(close).not.toHaveBeenCalled()
  })

  it('can be stopped by the caller', () => {
    const close = vi.fn()
    closeOnEscapeWhileOpening(close)()
    press('Escape')
    expect(close).not.toHaveBeenCalled()
  })
})
