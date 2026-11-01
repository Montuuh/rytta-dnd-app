import { describe, expect, it } from 'vitest'
import { relativeTime } from './relative-time'

describe('relativeTime', () => {
  const now = Date.UTC(2026, 10, 1, 12)
  it('returns null for very recent timestamps', () => {
    expect(relativeTime(now - 4000, now, 'es')).toBeNull()
  })
  it('formats minutes, hours and days in both languages', () => {
    expect(relativeTime(now - 2 * 60_000, now, 'es')).toMatch(/2 min/)
    expect(relativeTime(now - 3 * 3_600_000, now, 'en')).toMatch(/3 hr/)
    expect(relativeTime(now - 86_400_000, now, 'en')).toBe('yesterday')
  })
})
