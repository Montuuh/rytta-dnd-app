import { afterEach, describe, expect, it, vi } from 'vitest'
import { newRequestId } from './request-id'

const v4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
describe('newRequestId', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('uses randomUUID when available', () => {
    expect(newRequestId()).toMatch(v4)
  })
  it('falls back to getRandomValues outside secure contexts', () => {
    vi.stubGlobal('crypto', { getRandomValues: crypto.getRandomValues.bind(crypto) })
    const ids = new Set(Array.from({ length: 20 }, newRequestId))
    expect(ids.size).toBe(20)
    for (const id of ids) expect(id).toMatch(v4)
  })
})
