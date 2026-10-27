import { describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'
import { AuthController, AuthFailure, type AuthAdapter, type Identity } from './auth'
import { consumeCallback } from '../data/supabase-auth'

const a = { id: '10000000-0000-4000-8000-000000000001', email: 'a@example.com' }
const b = { id: '10000000-0000-4000-8000-000000000002', email: 'b@example.com' }
function fixture(initialize: () => Promise<Identity | null> = async () => a) {
  let event: (user: Identity | null) => void = () => {}
  const adapter: AuthAdapter = {
    initialize: vi.fn(initialize),
    subscribe: (listener) => {
      event = listener
      return () => {}
    },
    signIn: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
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
    f.adapter.initialize = async () => null
    await f.controller.retry()
    expect(f.controller.getSnapshot()).toMatchObject({ status: 'signed-out', issue: null })
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
    ).toEqual({ code: 'once', failed: false })
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
