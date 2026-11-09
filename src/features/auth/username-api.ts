import { queryOptions, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { config } from '@/shared/lib/config'
import { useAuth } from './auth-context'
import type { UsernameRepository } from './domain/username'

async function repository(): Promise<UsernameRepository> {
  const [{ getSupabase }, { createSupabaseUsernameRepository }] = await Promise.all([
    import('@/shared/api/supabase'),
    import('./data/username-repository'),
  ])
  return createSupabaseUsernameRepository(
    getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!),
  )
}

export const usernameQuery = (userId: string) =>
  queryOptions({
    queryKey: ['private', userId, 'username'],
    queryFn: async ({ signal }) => (await repository()).get(signal),
    staleTime: 5 * 60_000,
  })

/** RYT-078: the signed-in account's username; null while unset, undefined while loading. */
export function useUsername() {
  const { state } = useAuth()
  const userId = state.user?.id
  return useQuery({ ...usernameQuery(userId ?? 'none'), enabled: Boolean(userId) })
}

export function useUsernameAvailability(candidate: string | null) {
  const { state } = useAuth()
  const userId = state.user?.id
  return useQuery({
    queryKey: ['private', userId ?? 'none', 'username-available', candidate?.toLowerCase()],
    queryFn: async ({ signal }) => (await repository()).available(candidate!, signal),
    enabled: Boolean(userId && candidate),
    staleTime: 15_000,
    retry: false,
  })
}

export function useSetUsername() {
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const client = useQueryClient()
  return useMutation({
    retry: false,
    networkMode: 'always',
    mutationFn: async (username: string) => {
      if (!navigator.onLine) throw new Error('Offline')
      if (!userId || controller?.getSnapshot().user?.id !== userId)
        throw new Error('Sign in required')
      return (await repository()).set(username)
    },
    onSuccess: async (saved) => {
      if (controller?.getSnapshot().user?.id !== userId) return
      client.setQueryData(usernameQuery(userId!).queryKey, saved)
      // Member names shown to DMs come from the username.
      await client.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === 'private' &&
          q.queryKey[1] === userId &&
          (q.queryKey.includes('members') || q.queryKey[2] === 'username-available'),
      })
    },
  })
}
