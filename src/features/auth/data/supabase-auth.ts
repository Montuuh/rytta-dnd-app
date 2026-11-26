import { z } from 'zod'
import type { AppSupabaseClient } from '@/shared/api/database.types'
import { AuthFailure, PasswordFailure, type AuthAdapter, type PasswordIssue } from '../domain/auth'
import { rememberReturnTo } from '../domain/return-to'
import { routeOf } from '@/shared/lib/app-path'

const identitySchema = z
  .object({
    id: z.uuid(),
    email: z.email(),
    app_metadata: z.object({ providers: z.array(z.string()).optional() }).optional(),
  })
  .transform(({ id, email, app_metadata }) => ({
    id,
    email,
    hasPassword: app_metadata?.providers?.includes('email') ?? false,
  }))

/** The app's own address (with the deploy subpath) plus a marker for the link it returns from. */
function returnUrl(marker?: 'recovery' | 'confirmed') {
  const url = new URL(import.meta.env.BASE_URL, window.location.origin)
  if (marker) url.searchParams.set('auth', marker)
  return url.href
}

/** RYT-157: Supabase Auth errors to the few cases the UI explains. Unknown means retry later. */
export function passwordIssue(error: { code?: string; status?: number } | null): PasswordIssue {
  const code = error?.code ?? ''
  if (code === 'invalid_credentials' || code === 'user_not_found') return 'credentials'
  if (code === 'email_not_confirmed') return 'unconfirmed'
  if (code === 'weak_password') return 'weak'
  if (code === 'same_password') return 'same'
  if (code.startsWith('captcha')) return 'captcha'
  if (code === 'reauthentication_needed' || code === 'reauthentication_not_valid') return 'reauth'
  if (code.startsWith('over_') || error?.status === 429) return 'rate'
  return 'connection'
}
const fail = (error: { code?: string; status?: number } | null) => {
  if (error) throw new PasswordFailure(passwordIssue(error))
}
const captchaOption = (captcha?: string) => (captcha ? { captchaToken: captcha } : {})

export function consumeCallback(url: URL, replace: (cleanUrl: string) => void) {
  const code = url.searchParams.get('code')
  const flowId = url.searchParams.get('sb_flow_id')
  const failed = url.searchParams.has('error') || url.searchParams.has('error_description')
  // RYT-157: our own marker on the reset link, so a recovered session asks for a new password.
  const recovery = url.searchParams.get('auth') === 'recovery'
  // Drop provider descriptions and tokens without displaying or logging them.
  const implicit = /(?:access_token|refresh_token|error)=/.test(url.hash)
  if (code || failed || implicit || url.searchParams.has('auth')) {
    for (const key of [
      'code',
      'error',
      'error_code',
      'error_description',
      'state',
      'sb_flow_id',
      'auth',
    ])
      url.searchParams.delete(key)
    url.hash = ''
    replace(url.pathname + url.search)
  }
  return { code, failed: failed || implicit, recovery, ...(flowId ? { flowId } : {}) }
}

export function createAuthAdapter(client: AppSupabaseClient): AuthAdapter {
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
      const user = data.session ? identitySchema.parse(data.session.user) : null
      return { user, recovery: Boolean(user && callback.recovery && callback.code) }
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
      // The callback lands on the hub; the router sends the visitor back to this page afterwards.
      rememberReturnTo(
        routeOf(window.location.href, window.location.origin, import.meta.env.BASE_URL) ?? '',
      )
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
    async signInWithPassword(email, password, captcha) {
      const { error } = await client.auth.signInWithPassword({
        email,
        password,
        options: captchaOption(captcha),
      })
      fail(error)
    },
    async signUp(email, password, captcha) {
      const { error } = await client.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: returnUrl('confirmed'), ...captchaOption(captcha) },
      })
      // An address that already has an account gets the same answer as a new one.
      if (error && error.code !== 'user_already_exists') fail(error)
    },
    async resendConfirmation(email, captcha) {
      const { error } = await client.auth.resend({
        type: 'signup',
        email,
        options: { emailRedirectTo: returnUrl('confirmed'), ...captchaOption(captcha) },
      })
      fail(error)
    },
    async requestPasswordReset(email, captcha) {
      const { error } = await client.auth.resetPasswordForEmail(email, {
        redirectTo: returnUrl('recovery'),
        ...captchaOption(captcha),
      })
      fail(error)
    },
    async updatePassword(password) {
      const { error } = await client.auth.updateUser({ password })
      fail(error)
    },
  }
}
