import { useEffect, useMemo, useSyncExternalStore, type PropsWithChildren } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { config } from '@/shared/lib/config'
import { identityChanged } from '@/shared/lib/identity-scope'
import { setWeightUnitOwner } from '@/shared/lib/weight'
import { getSupabase } from '@/shared/api/supabase'
import { createAuthAdapter } from './data/supabase-auth'
import { AuthController } from './domain/auth'
import { AuthContext } from './auth-context'
import { forgetUsernameLater } from './domain/username-later'

export function LiveAuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient()
  const controller = useMemo(() => {
    const client = getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
    return new AuthController(createAuthAdapter(client), () => {
      void queryClient.cancelQueries()
      queryClient.clear()
      // RYT-013: no realtime channel of the previous identity outlives it (the screens that
      // opened them also unmount, keyed by user).
      void client.removeAllChannels()
    })
  }, [queryClient])
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  useEffect(() => {
    void controller.start()
  }, [controller])
  // RYT-078: once the session ends, the next sign-in asks for a missing username again.
  useEffect(() => {
    if (state.status === 'signed-out') forgetUsernameLater()
  }, [state.status])
  // Per-account preferences on a shared device follow whoever is signed in.
  const userId = state.user?.id ?? null
  useEffect(() => {
    setWeightUnitOwner(userId)
    identityChanged(userId)
  }, [userId])
  return <AuthContext.Provider value={{ state, controller }}>{children}</AuthContext.Provider>
}
