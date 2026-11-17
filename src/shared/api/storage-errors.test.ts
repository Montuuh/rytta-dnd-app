import { describe, expect, it } from 'vitest'
import { storageUploadError } from './storage-errors'

describe('RYT-113 storage upload errors', () => {
  it('reads a policy refusal as a storage quota and everything else as unavailable', () => {
    expect(storageUploadError({ message: 'new row violates row-level security policy' })).toBe(
      'storageQuota',
    )
    expect(storageUploadError({ message: 'The object exceeded the maximum allowed size' })).toBe(
      'unavailable',
    )
    expect(storageUploadError({ message: 'Failed to fetch' })).toBe('unavailable')
    expect(storageUploadError(null)).toBe('unavailable')
    expect(storageUploadError({ message: 42 })).toBe('unavailable')
  })
})
