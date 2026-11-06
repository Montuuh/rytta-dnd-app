import { describe, expect, it } from 'vitest'
import { audioPlan, effectFreshMs, TableAudio } from './engine'
import type { Live } from '../domain/model'

const live = (patch: Partial<Live> = {}): Live => ({
  scene_id: null,
  view_x: null,
  view_y: null,
  card_id: null,
  ambience: 'rain',
  track_id: '7b0a0f1e-3c2d-4c6a-9b51-2f7a4f7f2c11',
  volume: 40,
  playing: true,
  loop: false,
  sound: null,
  ping: null,
  measure: null,
  screen: {},
  revision: 3,
  updated_at: null,
  ...patch,
})

describe('RYT-061 table audio plan', () => {
  it('plays the ambience and track only while playing', () => {
    expect(audioPlan(live())).toMatchObject({ ambience: 'rain', volume: 0.4, loop: false })
    expect(audioPlan(live({ playing: false }))).toMatchObject({ ambience: null, trackId: null })
    expect(audioPlan(null)).toMatchObject({ ambience: null, trackId: null, effect: null })
    expect(audioPlan(live({ volume: 250 })).volume).toBe(1)
  })

  it('plays each fresh cue once and skips stale ones', () => {
    const audio = new TableAudio()
    const now = Date.parse('2026-11-05T12:00:10Z')
    const cue = { key: 'gong' as const, at: '2026-11-05T12:00:05Z' }
    expect(audio.playCue(cue, now)).toBe(true)
    expect(audio.playCue(cue, now)).toBe(false)
    const old = { key: 'door' as const, at: new Date(now - effectFreshMs - 1).toISOString() }
    expect(audio.playCue(old, now)).toBe(false)
    expect(audio.playCue(null, now)).toBe(false)
  })
})
