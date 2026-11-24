import { describe, expect, it } from 'vitest'
import { isPackImagePath } from './pack-images'

const pack = '70000000-0000-4000-8000-000000000002'
const object = '7a000000-0000-4000-8000-000000000001'

describe('pack picture paths (RYT-172)', () => {
  it('accepts only objects of a pack in the pack-images layout', () => {
    expect(isPackImagePath(`public/${pack}/${object}.webp`)).toBe(true)
    expect(isPackImagePath(`pre/${pack}/${object}.jpg`)).toBe(true)
    for (const value of [
      `public/${pack}/${object}.gif`,
      `public/${pack}/${object}xwebp`,
      `public/${pack}/7a000000-0000-4000-8000-00000000000-1.webp`,
      `staging/${pack}/${object}.webp`,
      `public/${pack}/campaign/${object}.webp`,
      'https://example.com/x.png',
      42,
      null,
    ])
      expect(isPackImagePath(value)).toBe(false)
  })
})
