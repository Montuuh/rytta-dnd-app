import { describe, expect, it, vi } from 'vitest'
import { createBackStack } from './use-back-to-close'

/** A browser history in miniature: back() is asynchronous and fires popstate, as in browsers. */
function fakeBrowser() {
  const entries: unknown[] = [{ idx: 0 }]
  let at = 0
  let listener = () => {}
  const history = {
    get state() {
      return entries[at]
    },
    pushState(state: unknown) {
      entries.splice(at + 1)
      entries.push(state)
      at += 1
    },
    back() {
      if (at === 0) return
      at -= 1
      queueMicrotask(() => listener())
    },
  }
  const win = {
    history,
    addEventListener: (_type: 'popstate', next: () => void) => {
      listener = next
    },
  }
  return {
    win,
    get depth() {
      return at
    },
    /** What the router does on a link click: a new entry with a higher index. */
    navigate: () => history.pushState({ idx: ((entries[at] as { idx: number }).idx ?? 0) + 1 }),
    /** The phone's Back button. */
    pressBack: async () => {
      history.back()
      await tick()
    },
  }
}
const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

describe('createBackStack', () => {
  it('gives an open overlay one entry and closes it on Back', async () => {
    const browser = fakeBrowser()
    const stack = createBackStack(browser.win)
    const close = vi.fn()
    stack.register(close)
    expect(browser.depth).toBe(1)
    await browser.pressBack()
    expect(close).toHaveBeenCalledOnce()
    expect(browser.depth).toBe(0)
  })

  it('removes the entry without closing again when closed by other means', async () => {
    const browser = fakeBrowser()
    const stack = createBackStack(browser.win)
    const close = vi.fn()
    const release = stack.register(close)
    release()
    await tick()
    expect(browser.depth).toBe(0)
    expect(close).not.toHaveBeenCalled()
  })

  it('closes nested overlays in order, one Back each', async () => {
    const browser = fakeBrowser()
    const stack = createBackStack(browser.win)
    const order: string[] = []
    stack.register(() => order.push('drawer'))
    stack.register(() => order.push('dialog'))
    expect(browser.depth).toBe(2)
    await browser.pressBack()
    expect(order).toEqual(['dialog'])
    await browser.pressBack()
    expect(order).toEqual(['dialog', 'drawer'])
    expect(browser.depth).toBe(0)
  })

  it('closing the dialog first (Escape) leaves the drawer on its own entry', async () => {
    const browser = fakeBrowser()
    const stack = createBackStack(browser.win)
    const drawer = vi.fn()
    stack.register(drawer)
    const releaseDialog = stack.register(() => {})
    releaseDialog()
    await tick()
    expect(browser.depth).toBe(1)
    expect(drawer).not.toHaveBeenCalled()
    await browser.pressBack()
    expect(drawer).toHaveBeenCalledOnce()
  })

  it('does not pop a new overlay opened right after another closed', async () => {
    const browser = fakeBrowser()
    const stack = createBackStack(browser.win)
    const first = stack.register(() => {})
    const second = vi.fn()
    first()
    stack.register(second)
    await tick()
    await tick()
    expect(second).not.toHaveBeenCalled()
    expect(browser.depth).toBe(1)
  })

  it('skips the leftover entry once after the page navigated away from an open overlay', async () => {
    const browser = fakeBrowser()
    const stack = createBackStack(browser.win)
    const close = vi.fn()
    const release = stack.register(close)
    browser.navigate()
    release()
    await tick()
    expect(browser.depth).toBe(2)
    expect(close).not.toHaveBeenCalled()
    await browser.pressBack()
    await tick()
    // Back from the new page lands on the page that had the overlay, past the leftover entry.
    expect(browser.depth).toBe(0)
    expect(close).not.toHaveBeenCalled()
  })
})
