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
    removeChannel(channel) {
      const topic = (channel as unknown as { topic: string }).topic
      removed.push(topic)
      channels.delete(topic)
    },
  }
  return { db, channels, removed }
}
const tracker = () => ({ set: vi.fn(), release: vi.fn() })
const settle = () => new Promise((done) => setTimeout(done, 0))

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

  it('stays quiet when the realtime client cannot be reached', async () => {
    const subscribe = createRollsHub(async () => {
      throw new Error('offline')
    }, tracker)
    const stop = subscribe(campaign, vi.fn())
    await settle()
    expect(() => stop()).not.toThrow()
  })
})
