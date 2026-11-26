import { afterEach, describe, expect, it, vi } from 'vitest'
import { rememberReturnTo, takeReturnTo } from './return-to'

function stubStorage() {
  const data = new Map<string, string>()
  vi.stubGlobal('sessionStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  })
}

describe('return to the deep link after sign-in', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('hands the remembered route back once', () => {
    stubStorage()
    rememberReturnTo('/campaign/abc/inventory?tab=gear')
    expect(takeReturnTo()).toBe('/campaign/abc/inventory?tab=gear')
    expect(takeReturnTo()).toBeNull()
  })

  it('ignores the home screen and anything that is not a plain in-app route', () => {
    stubStorage()
    for (const route of ['', '/', '//evil.example', 'https://evil.example', '/a<b>']) {
      rememberReturnTo(route)
      expect(takeReturnTo()).toBeNull()
    }
  })
})
