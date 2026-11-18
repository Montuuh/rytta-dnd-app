import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { focusWhenReady } from './focus-when-ready'

/** Just enough DOM for the focus loop: elements that can hold focus and be disconnected. */
class FakeElement {
  isConnected = true
  children: FakeElement[] = []
  role: string | null
  constructor(role: string | null = null) {
    this.role = role
  }
  getAttribute(name: string) {
    return name === 'role' ? this.role : null
  }
  contains(other: unknown): boolean {
    return other === this || this.children.some((child) => child.contains(other))
  }
  closest() {
    return null
  }
  focus() {
    if (this.isConnected) doc.activeElement = this
  }
}

const body = new FakeElement()
const doc = { activeElement: body as FakeElement, body }

beforeEach(() => {
  vi.useFakeTimers()
  doc.activeElement = body
  vi.stubGlobal('document', doc)
  vi.stubGlobal('performance', { now: () => Date.now() })
  vi.stubGlobal('requestAnimationFrame', (run: () => void) => setTimeout(run, 16))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('focusWhenReady', () => {
  it('keeps returning focus until the closing overlay is gone, even after the settle window', () => {
    const target = new FakeElement()
    const overlay = new FakeElement('dialog')
    const inside = new FakeElement()
    overlay.children.push(inside)
    doc.activeElement = inside
    focusWhenReady(() => target as unknown as HTMLElement, {
      from: inside as unknown as Element,
      leaving: overlay as unknown as Element,
    })
    vi.advanceTimersByTime(700)
    expect(doc.activeElement).toBe(target)
    // A slow device removes the overlay well after the window; focus falls onto the page.
    overlay.isConnected = false
    inside.isConnected = false
    doc.activeElement = body
    vi.advanceTimersByTime(100)
    expect(doc.activeElement).toBe(target)
  })

  it('finishes after the settle window when no overlay is closing', () => {
    const target = new FakeElement()
    focusWhenReady(() => target as unknown as HTMLElement, { from: null, leaving: null })
    vi.advanceTimersByTime(700)
    expect(doc.activeElement).toBe(target)
    doc.activeElement = body
    vi.advanceTimersByTime(200)
    expect(doc.activeElement).toBe(body)
  })

  it('gives up when the person moves focus to another control, overlay or not', () => {
    const target = new FakeElement()
    const other = new FakeElement()
    const overlay = new FakeElement('dialog')
    focusWhenReady(() => target as unknown as HTMLElement, {
      from: null,
      leaving: overlay as unknown as Element,
    })
    vi.advanceTimersByTime(100)
    expect(doc.activeElement).toBe(target)
    doc.activeElement = other
    vi.advanceTimersByTime(1000)
    expect(doc.activeElement).toBe(other)
  })

  it('stops at the timeout even if the overlay never leaves', () => {
    const target = new FakeElement()
    const overlay = new FakeElement('dialog')
    focusWhenReady(() => target as unknown as HTMLElement, {
      from: null,
      leaving: overlay as unknown as Element,
      timeout: 1000,
    })
    vi.advanceTimersByTime(1200)
    doc.activeElement = body
    vi.advanceTimersByTime(500)
    expect(doc.activeElement).toBe(body)
  })
})
