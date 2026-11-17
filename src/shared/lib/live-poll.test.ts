import { describe, expect, it } from 'vitest'
import { liveChannelUp, livePollInterval, slowPollMs, trackLiveChannel } from './live-poll'

describe('live polling', () => {
  it('backs off to the slow interval only while the channel is subscribed', () => {
    expect(livePollInterval(true, 10_000)).toBe(slowPollMs)
    expect(livePollInterval(false, 10_000)).toBe(10_000)
    expect(livePollInterval(true, 3_000, 20_000)).toBe(20_000)
    expect(livePollInterval(true, 90_000)).toBe(90_000)
  })

  it('counts subscriptions per key and releases them', () => {
    const a = trackLiveChannel('t:1')
    const b = trackLiveChannel('t:1')
    expect(liveChannelUp('t:1')).toBe(false)
    a.set(true)
    a.set(true)
    b.set(true)
    a.release()
    expect(liveChannelUp('t:1')).toBe(true)
    b.set(false)
    expect(liveChannelUp('t:1')).toBe(false)
    expect(liveChannelUp('t:2')).toBe(false)
  })
})
