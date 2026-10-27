import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import type { Database } from '@/shared/api/database.types'
import { AuthFailure, type AuthAdapter } from '../domain/auth'

const identitySchema = z.object({ id: z.uuid(), email: z.email() })

export function consumeCallback(url: URL, replace: (cleanUrl: string) => void) {
  const code = url.searchParams.get('code')
  const flowId = url.searchParams.get('sb_flow_id')
  const failed = url.searchParams.has('error') || url.searchParams.has('error_description')
  // Drop provider descriptions and tokens without displaying or logging them.
  const implicit = /(?:access_token|refresh_token|error)=/.test(url.hash)
  if (code || failed || implicit) {
    for (const key of ['code', 'error', 'error_code', 'error_description', 'state', 'sb_flow_id'])
      url.searchParams.delete(key)
    url.hash = ''
    replace(url.pathname + url.search)
  }
  return { code, failed: failed || implicit, ...(flowId ? { flowId } : {}) }
}

export function createAuthAdapter(client: SupabaseClient<Database>): AuthAdapter {
  return {
    async initialize() {
      const callback = consumeCallback(new URL(window.location.href), (url) =>
        window.history.replaceState(null, '', url),
      )
      if (callback.failed) throw new AuthFailure('callback')
      if (callback.code) {
        const { error } = await client.auth.exchangeCodeForSession(
          callback.code,
          callback.flowId ? { flowId: callback.flowId } : undefined,
        )
        if (error) throw new AuthFailure('callback')
      }
      const { data, error } = await client.auth.getSession()
      if (error) throw new AuthFailure('connection')
      return data.session ? identitySchema.parse(data.session.user) : null
    },
    subscribe(listener) {
      const { data } = client.auth.onAuthStateChange((_event, session) => {
        const parsed = identitySchema.safeParse(session?.user)
        listener(parsed.success ? parsed.data : null)
      })
      return () => data.subscription.unsubscribe()
    },
    async signIn() {
      const redirectTo = new URL(import.meta.env.BASE_URL, window.location.origin).href
      const { error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo, queryParams: { prompt: 'select_account' } },
      })
      if (error) throw new AuthFailure('connection')
    },
    async signOut() {
      const { error } = await client.auth.signOut({ scope: 'local' })
      if (error) throw new AuthFailure('sign-out')
    },
  }
}
