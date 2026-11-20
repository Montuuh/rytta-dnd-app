import { describe, expect, it, vi } from 'vitest'
import { createBatchSigner } from './batch-sign'

describe('batch signer (RYT-114)', () => {
  it('signs paths asked in the same moment with one request and rejects only the failed ones', async () => {
    const createSignedUrls = vi.fn(async (paths: string[]) => ({
      data: paths.map((path) => ({
        path,
        signedUrl: path === 'pre/bad.webp' ? null : `https://x.test/${path}?t=1`,
        error: path === 'pre/bad.webp' ? 'Object not found' : null,
      })),
      error: null,
    }))
    const sign = createBatchSigner(
      async () => ({ storage: { from: () => ({ createSignedUrls }) } }),
      'creature-images',
      300,
    )
    const [a, b, again, bad] = await Promise.allSettled([
      sign('pre/a.webp'),
      sign('pre/b.webp'),
      sign('pre/a.webp'),
      sign('pre/bad.webp'),
    ])
    expect(createSignedUrls).toHaveBeenCalledTimes(1)
    expect(createSignedUrls.mock.calls[0]![0]).toEqual(['pre/a.webp', 'pre/b.webp', 'pre/bad.webp'])
    expect(a).toEqual({ status: 'fulfilled', value: 'https://x.test/pre/a.webp?t=1' })
    expect(b.status).toBe('fulfilled')
    expect(again).toEqual(a)
    expect(bad.status).toBe('rejected')
  })
})
