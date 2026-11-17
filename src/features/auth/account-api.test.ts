import { QueryClient } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// RYT-115: after a deletion the local session is dropped and every cached query is cleared;
// a refused deletion keeps both.
const signOut = vi.fn(() => Promise.resolve({ error: null }))
const deleteMyAccountRpc = vi.fn()

vi.mock('@/shared/lib/config', () => ({
  config: { VITE_SUPABASE_URL: 'https://x', VITE_SUPABASE_PUBLISHABLE_KEY: 'k' },
}))
vi.mock('@/shared/api/supabase', () => ({
  activeSchema: () => 'pre',
  getSupabase: () => ({ auth: { signOut } }),
}))
vi.mock('./data/account-repository', () => ({
  createSupabaseAccountRepository: (_client: unknown, schema: string) => ({
    deleteMyAccount: (confirmation: string, requestId: string) =>
      deleteMyAccountRpc(confirmation, requestId, schema),
  }),
}))

const { deleteMyAccount } = await import('./account-api')
const { AccountError } = await import('./domain/account')

describe('deleteMyAccount', () => {
  beforeEach(() => {
    signOut.mockClear()
    deleteMyAccountRpc.mockReset()
  })

  it('signs out locally and clears the cache after the deletion', async () => {
    const result = {
      environment: 'pre',
      authUser: 'shared',
      campaignsDeleted: [],
      campaignsLeft: [],
    }
    deleteMyAccountRpc.mockResolvedValue(result)
    const queryClient = new QueryClient()
    queryClient.setQueryData(['private', 'u1', 'username'], 'Someone')
    await expect(
      deleteMyAccount({ confirmation: 'DELETE', requestId: 'r1', queryClient }),
    ).resolves.toEqual(result)
    expect(deleteMyAccountRpc).toHaveBeenCalledWith('DELETE', 'r1', 'pre')
    expect(queryClient.getQueryData(['private', 'u1', 'username'])).toBeUndefined()
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' })
  })

  it('keeps the session and the cache when the deletion is refused', async () => {
    deleteMyAccountRpc.mockRejectedValue(new AccountError('blocked'))
    const queryClient = new QueryClient()
    queryClient.setQueryData(['private', 'u1', 'username'], 'Someone')
    await expect(
      deleteMyAccount({ confirmation: 'DELETE', requestId: 'r1', queryClient }),
    ).rejects.toMatchObject({ kind: 'blocked' })
    expect(queryClient.getQueryData(['private', 'u1', 'username'])).toBe('Someone')
    expect(signOut).not.toHaveBeenCalled()
  })

  describe('without a network', () => {
    afterEach(() => vi.unstubAllGlobals())

    it('fails at once and sends nothing', async () => {
      vi.stubGlobal('navigator', { onLine: false })
      const queryClient = new QueryClient()
      queryClient.setQueryData(['private', 'u1', 'username'], 'Someone')
      await expect(
        deleteMyAccount({ confirmation: 'DELETE', requestId: 'r1', queryClient }),
      ).rejects.toMatchObject({ kind: 'offline' })
      expect(deleteMyAccountRpc).not.toHaveBeenCalled()
      expect(signOut).not.toHaveBeenCalled()
      expect(queryClient.getQueryData(['private', 'u1', 'username'])).toBe('Someone')
    })
  })
})
