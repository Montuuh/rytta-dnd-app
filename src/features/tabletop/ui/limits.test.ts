import { describe, expect, it } from 'vitest'
import { limitKey } from './limits'

describe('limitKey', () => {
  it('names the quota and scene limit failures', () => {
    expect(limitKey(new Error('storageQuota'))).toBe('common.storageQuota')
    expect(limitKey(new Error('sceneLimit'))).toBe('tabletop.error.sceneLimit')
  })
  it('leaves every other failure to the generic text', () => {
    expect(limitKey(new Error('unavailable'))).toBeNull()
    expect(limitKey('storageQuota')).toBeNull()
    expect(limitKey(null)).toBeNull()
  })
})
