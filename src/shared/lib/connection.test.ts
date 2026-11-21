import { describe, expect, it } from 'vitest'
import { connectionPhaseAfterRefresh, recoveredMs } from './connection'

describe('connection phase after a refetch (RYT-013)', () => {
  it('says up to date only when every query on screen refreshed online', () => {
    expect(connectionPhaseAfterRefresh({ online: true, failed: false })).toBe('recovered')
    expect(connectionPhaseAfterRefresh({ online: true, failed: true })).toBe('failed')
  })
  it('goes back to offline when the network dropped again meanwhile', () => {
    expect(connectionPhaseAfterRefresh({ online: false, failed: false })).toBe('offline')
    expect(connectionPhaseAfterRefresh({ online: false, failed: true })).toBe('offline')
  })
  it('keeps the confirmation short', () => {
    expect(recoveredMs).toBeLessThanOrEqual(5000)
  })
})
