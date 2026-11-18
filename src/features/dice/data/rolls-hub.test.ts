import { describe, expect, it, vi } from 'vitest'
import { createRollsHub, type RollsRealtime } from './rolls-hub'

const campaign = '11111111-1111-4111-8111-111111111111'

type State = { bindings: (() => void)[]; subscribed: boolean; status?: (s: string) => void }

/** A fake realtime client that behaves like realtime-js: the same topic gives the same channel,
 * and binding after subscribing throws. */
function fakeClient() {
  const channels = new Map<string, State>()
  const removed: string[] = []
  const db: RollsRealtime = {
    channel(topic) {
      let state = channels.get(topic)
      if (!state) {
        state = { bindings: [], subscribed: false }
        channels.set(topic, state)
      }
      const self = state
      const channel = {
        topic,
        on(_type: string, _filter: unknown, callback: () => void) {
          if (self.subscribed) throw new Error('cannot add postgres_changes after subscribe()')
          self.bindings.push(callback)
          return channel
        },
        subscribe(callback: (s: string) => void) {
          self.subscribed = true
          self.status = callback
          return channel
        },
      }
      return channel as never
    },
    // Like the real client: the channel stays handed out (subscribed) until the removal is done.
    removeChannel(channel) {
      const topic = (channel as unknown as { topic: string }).topic
      removed.push(topic)
      return new Promise((done) =>
        setTimeout(() => {
          channels.delete(topic)
          done('ok')
        }, 5),
      )
    },
  }
  return { db, channels, removed }
}
const tracker = () => ({ set: vi.fn(), release: vi.fn() })
const settle = (ms = 0) => new Promise((done) => setTimeout(done, ms))

describe('one realtime subscription per campaign', () => {
  it('gives every listener the signal, with one channel', async () => {
    const { db, channels } = fakeClient()
    const subscribe = createRollsHub(async () => ({ db, schema: 'pre' }), tracker)
    const a = vi.fn()
    const b = vi.fn()
    subscribe(campaign, a)
    subscribe(campaign, b)
    await settle()
    expect(channels.size).toBe(1)
    channels.get(`rolls:${campaign}`)!.bindings[0]!()
    expect(a).toHaveBeenCalledTimes(1)
    expect(b).toHaveBeenCalledTimes(1)
  })

  it('keeps the channel while a listener is left, and removes it with the last', async () => {
    const { db, channels, removed } = fakeClient()
    const status = tracker()
    const subscribe = createRollsHub(
      async () => ({ db, schema: 'pre' }),
      () => status,
    )
    const a = vi.fn()
    const b = vi.fn()
    const stopA = subscribe(campaign, a)
    const stopB = subscribe(campaign, b)
    await settle()
    stopA()
    expect(removed).toEqual([])
    expect(status.release).not.toHaveBeenCalled()
    channels.get(`rolls:${campaign}`)!.bindings[0]!()
    expect(a).not.toHaveBeenCalled()
    expect(b).toHaveBeenCalledTimes(1)
    stopB()
    expect(removed).toEqual([`rolls:${campaign}`])
    expect(status.release).toHaveBeenCalledTimes(1)
  })

  it('subscribes again after the last listener left', async () => {
    const { db, channels } = fakeClient()
    const subscribe = createRollsHub(async () => ({ db, schema: 'pre' }), tracker)
    const first = vi.fn()
    subscribe(campaign, first)()
    await settle()
    const again = vi.fn()
    subscribe(campaign, again)
    await settle()
    channels.get(`rolls:${campaign}`)!.bindings[0]!()
    expect(again).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })

  it('reports the connection to the fast poll and to every listener', async () => {
    const { db, channels } = fakeClient()
    const status = tracker()
    const subscribe = createRollsHub(
      async () => ({ db, schema: 'pre' }),
      () => status,
    )
    const a = vi.fn()
    const b = vi.fn()
    subscribe(campaign, a)
    subscribe(campaign, b)
    await settle()
    channels.get(`rolls:${campaign}`)!.status!('SUBSCRIBED')
    expect(status.set).toHaveBeenCalledWith(true)
    channels.get(`rolls:${campaign}`)!.status!('CLOSED')
    expect(status.set).toHaveBeenLastCalledWith(false)
    expect(a).toHaveBeenCalledTimes(2)
    expect(b).toHaveBeenCalledTimes(2)
  })

  it('joins a new listener that arrives in the same commit as the last one left', async () => {
    const { db, channels } = fakeClient()
    const subscribe = createRollsHub(async () => ({ db, schema: 'pre' }), tracker)
    const first = vi.fn()
    const stop = subscribe(campaign, first)
    await settle()
    // The last listener leaves and a new one arrives at once (a route change, StrictMode).
    stop()
    const next = vi.fn()
    subscribe(campaign, next)
    await settle(30)
    channels.get(`rolls:${campaign}`)!.bindings[0]!()
    expect(next).toHaveBeenCalledTimes(1)
    expect(first).not.toHaveBeenCalled()
  })

  it('tries again for the next listener after a failure to connect', async () => {
    const { db, channels } = fakeClient()
    let calls = 0
    const status = tracker()
    const subscribe = createRollsHub(
      async () => {
        calls += 1
        if (calls === 1) throw new Error('offline')
        return { db, schema: 'pre' }
      },
      () => status,
    )
    subscribe(campaign, vi.fn())
    await settle()
    const again = vi.fn()
    subscribe(campaign, again)
    await settle()
    expect(calls).toBe(2)
    channels.get(`rolls:${campaign}`)!.bindings[0]!()
    expect(again).toHaveBeenCalledTimes(1)
  })

  it('stays quiet when the realtime client cannot be reached', async () => {
    const subscribe = createRollsHub(async () => {
      throw new Error('offline')
    }, tracker)
    const stop = subscribe(campaign, vi.fn())
    await settle()
    expect(() => stop()).not.toThrow()
  })
})
