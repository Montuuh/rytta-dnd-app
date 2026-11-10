import { useEffect, useMemo, useSyncExternalStore, type PropsWithChildren } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { config } from '@/shared/lib/config'
import { getSupabase } from '@/shared/api/supabase'
import { createAuthAdapter } from './data/supabase-auth'
import { AuthController } from './domain/auth'
import { AuthContext } from './auth-context'
import { forgetUsernameLater } from './domain/username-later'

export function LiveAuthProvider({ children }: PropsWithChildren) {
  const queryClient = useQueryClient()
  const controller = useMemo(
    () =>
      new AuthController(
        createAuthAdapter(
          getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!),
        ),
        () => {
          void queryClient.cancelQueries()
          queryClient.clear()
        },
      ),
    [queryClient],
  )
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot)
  useEffect(() => {
    void controller.start()
  }, [controller])
  // RYT-078: once the session ends, the next sign-in asks for a missing username again.
  useEffect(() => {
    if (state.status === 'signed-out') forgetUsernameLater()
  }, [state.status])
  return <AuthContext.Provider value={{ state, controller }}>{children}</AuthContext.Provider>
}
