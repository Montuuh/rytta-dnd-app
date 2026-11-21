import { afterEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import {
  AuthController,
  AuthFailure,
  initializeTimeoutMs,
  PasswordFailure,
  passwordMeetsPolicy,
  type AuthAdapter,
  type Identity,
} from './auth'
import { consumeCallback, passwordIssue } from '../data/supabase-auth'

const a = { id: '10000000-0000-4000-8000-000000000001', email: 'a@example.com' }
const b = { id: '10000000-0000-4000-8000-000000000002', email: 'b@example.com' }
function fixture(initialize: () => Promise<Identity | null> = async () => a, recovery = false) {
  let event: (user: Identity | null) => void = () => {}
  const adapter: AuthAdapter = {
    initialize: vi.fn(async () => ({ user: await initialize(), recovery })),
    subscribe: (listener) => {
      event = listener
      return () => {}
    },
    signIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
    signInWithPassword: vi.fn(async () => {}),
    signUp: vi.fn(async () => {}),
    resendConfirmation: vi.fn(async () => {}),
    requestPasswordReset: vi.fn(async () => {}),
    updatePassword: vi.fn(async () => {}),
  }
  const cache = new QueryClient()
  const clear = vi.fn(() => {
    void cache.cancelQueries()
    cache.clear()
  })
  const controller = new AuthController(adapter, clear)
  return { controller, adapter, clear, cache, event: (user: Identity | null) => event(user) }
}
describe('identity lifecycle', () => {
  it('initializes once under repeated mounts and clears private data on account change', async () => {
    const f = fixture()
    await Promise.all([f.controller.start(), f.controller.start()])
    expect(f.adapter.initialize).toHaveBeenCalledTimes(1)
    f.cache.setQueryData(['private', a.id, 'campaigns'], ['secret'])
    f.event(b)
    expect(f.controller.getSnapshot().user).toEqual(b)
    expect(f.cache.getQueryCache().getAll()).toHaveLength(0)
  })
  it('cancels an outstanding private request on sign-out and never recaches its result', async () => {
    const f = fixture()
    await f.controller.start()
    let signal: AbortSignal | undefined
    let finish: (value: string) => void = () => {}
    const pending = f.cache
      .fetchQuery({
        queryKey: ['private', a.id, 'secret'],
        queryFn: ({ signal: requestSignal }) => {
          signal = requestSignal
          return new Promise<string>((resolve) => {
            finish = resolve
          })
        },
      })
      .catch(() => {})
    await f.controller.signOut()
    expect(signal?.aborted).toBe(true)
    expect(f.controller.getSnapshot().user).toBeNull()
    finish('old data')
    await pending
    expect(f.cache.getQueryCache().getAll()).toHaveLength(0)
  })
  it('session expiry closes private views and failed sign-out does not restore them', async () => {
    const f = fixture()
    await f.controller.start()
    f.event(null)
    expect(f.controller.getSnapshot().issue).toBe('expired')
    f.event(a)
    f.adapter.signOut = async () => {
      throw new Error('network')
    }
    await f.controller.signOut()
    expect(f.controller.getSnapshot()).toMatchObject({
      status: 'signed-out',
      user: null,
      issue: 'sign-out',
    })
  })
  it('keeps the newest identity if initialization finishes after an auth event', async () => {
    let finish: (user: Identity) => void = () => {}
    const f = fixture(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const boot = f.controller.start()
    f.event(b)
    finish(a)
    await boot
    expect(f.controller.getSnapshot().user).toEqual(b)
  })
  it('offers a fresh start after invalid callbacks without exposing error contents', async () => {
    const f = fixture(async () => {
      throw new AuthFailure('callback')
    })
    await f.controller.start()
    expect(f.controller.getSnapshot().issue).toBe('callback')
    f.event(null)
    expect(f.controller.getSnapshot().issue).toBe('callback')
    f.adapter.initialize = async () => ({ user: null, recovery: false })
    await f.controller.retry()
    expect(f.controller.getSnapshot()).toMatchObject({ status: 'signed-out', issue: null })
  })
})
describe('without a network', () => {
  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })
  it('publishes the connection issue when the stored session cannot be checked in time', async () => {
    vi.useFakeTimers()
    const f = fixture(() => new Promise(() => {}))
    const started = f.controller.start()
    await vi.advanceTimersByTimeAsync(initializeTimeoutMs)
    await started
    expect(f.controller.getSnapshot()).toMatchObject({ status: 'signed-out', issue: 'connection' })
  })
  it('does not start the sign-in redirect while offline', async () => {
    vi.stubGlobal('navigator', { onLine: false })
    const f = fixture()
    await f.controller.start()
    await f.controller.signIn()
    expect(f.adapter.signIn).not.toHaveBeenCalled()
    expect(f.controller.getSnapshot().issue).toBe('connection')
  })
})

describe('PKCE URL cleanup', () => {
  it('removes credentials before exchange and preserves a Pages base', () => {
    const replace = vi.fn()
    expect(
      consumeCallback(
        new URL('https://example.com/rytta-dnd-app/?code=once&other=ok#/party'),
        replace,
      ),
    ).toEqual({ code: 'once', failed: false, recovery: false })
    expect(replace).toHaveBeenCalledWith('/rytta-dnd-app/?other=ok')
  })
  it('scrubs rejected and implicit callbacks without rendering provider error strings', () => {
    for (const suffix of [
      '?error=access_denied&error_description=private',
      '#access_token=private&refresh_token=private',
    ]) {
      const replace = vi.fn()
      expect(
        consumeCallback(new URL(`https://example.com/rytta-dnd-app/${suffix}`), replace).failed,
      ).toBe(true)
      expect(replace).toHaveBeenCalledWith('/rytta-dnd-app/')
    }
  })
})

describe('RYT-157 email and password', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })
  it('keeps the rule to a length of ten characters, counting letters not bytes', () => {
    expect(passwordMeetsPolicy('123456789')).toBe(false)
    expect(passwordMeetsPolicy('1234567890')).toBe(true)
    expect(passwordMeetsPolicy('ñandú-ñandú')).toBe(true)
    expect(passwordMeetsPolicy('🐉🐉🐉🐉🐉🐉🐉🐉🐉')).toBe(false)
  })
  it('maps Auth errors to what the screen explains, and anything else to a retry', () => {
    expect(passwordIssue({ code: 'invalid_credentials', status: 400 })).toBe('credentials')
    expect(passwordIssue({ code: 'email_not_confirmed' })).toBe('unconfirmed')
    expect(passwordIssue({ code: 'weak_password' })).toBe('weak')
    expect(passwordIssue({ code: 'same_password' })).toBe('same')
    expect(passwordIssue({ code: 'captcha_failed' })).toBe('captcha')
    expect(passwordIssue({ code: 'over_email_send_rate_limit' })).toBe('rate')
    expect(passwordIssue({ status: 429 })).toBe('rate')
    expect(passwordIssue({ code: 'reauthentication_needed' })).toBe('reauth')
    expect(passwordIssue({ code: 'unexpected_failure', status: 500 })).toBe('connection')
  })
  it('trims the email, passes the captcha and turns adapter errors into password failures', async () => {
    const f = fixture(async () => null)
    await f.controller.start()
    await f.controller.signInWithPassword('  ana@example.com ', 'secret-pass', 'token')
    expect(f.adapter.signInWithPassword).toHaveBeenCalledWith(
      'ana@example.com',
      'secret-pass',
      'token',
    )
    f.adapter.signUp = vi.fn(async () => {
      throw new PasswordFailure('weak')
    })
    await expect(f.controller.signUp('ana@example.com', 'x')).rejects.toMatchObject({
      issue: 'weak',
    })
    f.adapter.requestPasswordReset = vi.fn(async () => {
      throw new Error('network down')
    })
    await expect(f.controller.requestPasswordReset('ana@example.com')).rejects.toMatchObject({
      issue: 'connection',
    })
  })
  it('refuses at once without a network', async () => {
    const f = fixture(async () => null)
    await f.controller.start()
    vi.stubGlobal('navigator', { onLine: false })
    await expect(f.controller.signInWithPassword('a@example.com', 'p')).rejects.toMatchObject({
      issue: 'connection',
    })
    expect(f.adapter.signInWithPassword).not.toHaveBeenCalled()
  })
  it('asks for a new password after a reset link, until it is saved', async () => {
    const f = fixture(async () => a, true)
    await f.controller.start()
    expect(f.controller.getSnapshot()).toMatchObject({ status: 'signed-in', recovery: true })
    // A token refresh for the same user keeps the request; another user drops it.
    f.event(a)
    expect(f.controller.getSnapshot().recovery).toBe(true)
    await f.controller.updatePassword('a-new-long-password')
    expect(f.adapter.updatePassword).toHaveBeenCalledWith('a-new-long-password')
    // The dialog says it is saved; closing it ends the request.
    expect(f.controller.getSnapshot().recovery).toBe(true)
    f.controller.finishRecovery()
    expect(f.controller.getSnapshot().recovery).toBe(false)
    const g = fixture(async () => a, true)
    await g.controller.start()
    g.event(b)
    expect(g.controller.getSnapshot().recovery).toBeUndefined()
  })
  it('removes its own marker from the address with the code', () => {
    let clean = ''
    const result = consumeCallback(
      new URL('https://app.test/rytta/?code=abc&auth=recovery#/'),
      (url) => (clean = url),
    )
    expect(result).toMatchObject({ code: 'abc', recovery: true, failed: false })
    expect(clean).toBe('/rytta/')
  })
})
