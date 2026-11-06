import type { Ambience, Live, SoundEffect } from '../domain/model'

// RYT-061: every ambience and effect is synthesized here with Web Audio (original, nothing bundled).

export interface AudioPlan {
  ambience: Ambience | null
  trackId: string | null
  volume: number
  loop: boolean
  /** A one-shot effect to play once, identified by when the DM sent it. */
  effect: { key: SoundEffect; at: string } | null
}

/** What the table should be playing for a live state (pure, tested). */
export function audioPlan(live: Live | undefined | null): AudioPlan {
  if (!live) return { ambience: null, trackId: null, volume: 0.7, loop: true, effect: null }
  return {
    ambience: live.playing ? live.ambience : null,
    trackId: live.playing ? live.track_id : null,
    volume: Math.max(0, Math.min(1, live.volume / 100)),
    loop: live.loop,
    effect: live.sound ? { key: live.sound.key, at: live.sound.at } : null,
  }
}

/** Effects older than this when they arrive (a late refetch, a reload) are not played. */
export const effectFreshMs = 12_000

type Voice = { stop: () => void }

export class TableAudio {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private ambience: { key: Ambience; voice: Voice } | null = null
  private track: HTMLAudioElement | null = null
  private trackUrl: string | null = null
  private volume = 0.7
  private lastEffect: string | null = null

  get unlocked() {
    return this.context?.state === 'running'
  }

  /** Browsers start sound only after a gesture: call from a tap. */
  async unlock() {
    if (!this.context) {
      const Context =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Context) return false
      this.context = new Context()
      this.master = this.context.createGain()
      this.master.gain.value = this.volume
      this.master.connect(this.context.destination)
    }
    if (this.context.state !== 'running') await this.context.resume().catch(() => undefined)
    if (this.track && this.track.paused && this.trackUrl)
      void this.track.play().catch(() => undefined)
    return this.unlocked
  }

  setVolume(volume: number) {
    this.volume = volume
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(volume, this.context.currentTime, 0.15)
    if (this.track) this.track.volume = volume
  }

  setAmbience(key: Ambience | null) {
    if (this.ambience?.key === key) return
    this.ambience?.voice.stop()
    this.ambience = null
    if (!key || !this.context || !this.master) return
    this.ambience = { key, voice: ambienceVoice(this.context, this.master, key) }
  }

  setTrack(url: string | null, loop: boolean) {
    if (url === this.trackUrl) {
      if (this.track) this.track.loop = loop
      return
    }
    this.track?.pause()
    this.track = null
    this.trackUrl = url
    if (!url) return
    const audio = new Audio(url)
    audio.loop = loop
    audio.volume = this.volume
    audio.crossOrigin = 'anonymous'
    this.track = audio
    if (this.unlocked) void audio.play().catch(() => undefined)
  }

  /** Plays an effect once per DM cue, and only while the cue is fresh. */
  playCue(effect: AudioPlan['effect'], now = Date.now()) {
    if (!effect || effect.at === this.lastEffect) return false
    this.lastEffect = effect.at
    if (now - Date.parse(effect.at) > effectFreshMs) return false
    this.playEffect(effect.key)
    return true
  }

  playEffect(key: SoundEffect) {
    if (!this.context || !this.master) return
    effectVoice(this.context, this.master, key)
  }

  apply(plan: AudioPlan, trackUrl: string | null) {
    this.setVolume(plan.volume)
    this.setAmbience(plan.ambience)
    this.setTrack(plan.trackId ? trackUrl : null, plan.loop)
    this.playCue(plan.effect)
  }

  dispose() {
    this.ambience?.voice.stop()
    this.ambience = null
    this.track?.pause()
    this.track = null
    void this.context?.close().catch(() => undefined)
    this.context = null
  }
}

// ---------------------------------------------------------------------------------------------
// Synthesis
// ---------------------------------------------------------------------------------------------

function noiseBuffer(ctx: AudioContext, color: 'white' | 'pink' | 'brown', seconds = 4) {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * seconds), ctx.sampleRate)
  const data = buffer.getChannelData(0)
  let last = 0
  let b0 = 0
  let b1 = 0
  let b2 = 0
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1
    if (color === 'white') data[i] = white * 0.5
    else if (color === 'brown') {
      last = (last + 0.02 * white) / 1.02
      data[i] = last * 3.2
    } else {
      b0 = 0.99765 * b0 + white * 0.099046
      b1 = 0.963 * b1 + white * 0.2965164
      b2 = 0.57 * b2 + white * 1.0526913
      data[i] = (b0 + b1 + b2 + white * 0.1848) * 0.12
    }
  }
  return buffer
}

function loopNoise(ctx: AudioContext, color: 'white' | 'pink' | 'brown') {
  const source = ctx.createBufferSource()
  source.buffer = noiseBuffer(ctx, color)
  source.loop = true
  return source
}

function filter(ctx: AudioContext, type: BiquadFilterType, frequency: number, q = 0.8) {
  const f = ctx.createBiquadFilter()
  f.type = type
  f.frequency.value = frequency
  f.Q.value = q
  return f
}

function lfo(ctx: AudioContext, target: AudioParam, rate: number, depth: number) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.frequency.value = rate
  gain.gain.value = depth
  osc.connect(gain).connect(target)
  osc.start()
  return osc
}

/** A random event every few seconds while the ambience plays. */
function every(min: number, max: number, run: () => void) {
  let timer = 0
  const schedule = () => {
    timer = window.setTimeout(
      () => {
        run()
        schedule()
      },
      (min + Math.random() * (max - min)) * 1000,
    )
  }
  schedule()
  return () => window.clearTimeout(timer)
}

function drip(ctx: AudioContext, out: AudioNode, level = 0.18) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const t = ctx.currentTime
  const pitch = 900 + Math.random() * 900
  osc.frequency.setValueAtTime(pitch, t)
  osc.frequency.exponentialRampToValueAtTime(pitch * 0.45, t + 0.12)
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(level, t + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.25)
  osc.connect(gain).connect(out)
  osc.start(t)
  osc.stop(t + 0.3)
}

function burst(
  ctx: AudioContext,
  out: AudioNode,
  {
    color = 'white',
    freq = 2000,
    type = 'bandpass',
    q = 1,
    level = 0.3,
    attack = 0.002,
    decay = 0.08,
  }: {
    color?: 'white' | 'pink' | 'brown'
    freq?: number
    type?: BiquadFilterType
    q?: number
    level?: number
    attack?: number
    decay?: number
  },
) {
  const source = ctx.createBufferSource()
  source.buffer = noiseBuffer(ctx, color, Math.min(4, attack + decay + 0.1))
  const f = filter(ctx, type, freq, q)
  const gain = ctx.createGain()
  const t = ctx.currentTime
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(level, t + attack)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay)
  source.connect(f).connect(gain).connect(out)
  source.start(t)
  source.stop(t + attack + decay + 0.05)
}

function tone(
  ctx: AudioContext,
  out: AudioNode,
  freq: number,
  level: number,
  decay: number,
  type: OscillatorType = 'sine',
  delay = 0,
) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  const t = ctx.currentTime + delay
  osc.type = type
  osc.frequency.value = freq
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(level, t + 0.005)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + decay)
  osc.connect(gain).connect(out)
  osc.start(t)
  osc.stop(t + decay + 0.05)
}

function chirp(ctx: AudioContext, out: AudioNode) {
  const t = ctx.currentTime
  const base = 2200 + Math.random() * 1800
  for (let n = 0; n < 2 + Math.floor(Math.random() * 3); n++) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    const start = t + n * 0.11
    osc.frequency.setValueAtTime(base, start)
    osc.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.4), start + 0.07)
    gain.gain.setValueAtTime(0.0001, start)
    gain.gain.exponentialRampToValueAtTime(0.05, start + 0.01)
    gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.09)
    osc.connect(gain).connect(out)
    osc.start(start)
    osc.stop(start + 0.12)
  }
}

function ambienceVoice(ctx: AudioContext, master: AudioNode, key: Ambience): Voice {
  const out = ctx.createGain()
  out.gain.setValueAtTime(0.0001, ctx.currentTime)
  out.gain.exponentialRampToValueAtTime(1, ctx.currentTime + 1.5)
  out.connect(master)
  const sources: AudioScheduledSourceNode[] = []
  const timers: (() => void)[] = []
  const bed = (
    color: 'white' | 'pink' | 'brown',
    type: BiquadFilterType,
    freq: number,
    level: number,
    q = 0.7,
  ) => {
    const source = loopNoise(ctx, color)
    const f = filter(ctx, type, freq, q)
    const gain = ctx.createGain()
    gain.gain.value = level
    source.connect(f).connect(gain).connect(out)
    source.start()
    sources.push(source)
    return { f, gain }
  }
  switch (key) {
    case 'rain': {
      const { gain } = bed('pink', 'bandpass', 2400, 0.55, 0.5)
      sources.push(lfo(ctx, gain.gain, 0.08, 0.12))
      bed('brown', 'lowpass', 500, 0.25)
      timers.push(
        every(0.05, 0.25, () =>
          burst(ctx, out, { freq: 4000 + Math.random() * 3000, level: 0.04, decay: 0.03 }),
        ),
      )
      break
    }
    case 'storm': {
      const { gain } = bed('pink', 'bandpass', 2000, 0.6, 0.5)
      sources.push(lfo(ctx, gain.gain, 0.1, 0.2))
      bed('brown', 'lowpass', 180, 0.5)
      timers.push(
        every(9, 22, () =>
          burst(ctx, out, {
            color: 'brown',
            type: 'lowpass',
            freq: 160,
            level: 0.9,
            attack: 0.08,
            decay: 3.2,
          }),
        ),
      )
      break
    }
    case 'dungeon': {
      bed('brown', 'lowpass', 220, 0.35)
      for (const f of [55, 58.3]) {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.frequency.value = f
        gain.gain.value = 0.035
        osc.connect(gain).connect(out)
        osc.start()
        sources.push(osc)
      }
      timers.push(every(1.5, 5, () => drip(ctx, out)))
      break
    }
    case 'cave': {
      const { f, gain } = bed('brown', 'bandpass', 380, 0.6, 1.4)
      sources.push(lfo(ctx, f.frequency, 0.05, 160))
      sources.push(lfo(ctx, gain.gain, 0.07, 0.25))
      timers.push(every(1, 4, () => drip(ctx, out, 0.12)))
      break
    }
    case 'forest': {
      const { gain } = bed('pink', 'highpass', 1500, 0.32)
      sources.push(lfo(ctx, gain.gain, 0.06, 0.16))
      timers.push(every(2, 7, () => chirp(ctx, out)))
      break
    }
    case 'campfire': {
      bed('brown', 'lowpass', 420, 0.5)
      timers.push(
        every(0.04, 0.4, () =>
          burst(ctx, out, {
            freq: 1200 + Math.random() * 2500,
            level: 0.06 + Math.random() * 0.12,
            decay: 0.02 + Math.random() * 0.04,
            q: 2,
          }),
        ),
      )
      break
    }
    case 'tavern': {
      for (const freq of [420, 760, 1180]) {
        const { f, gain } = bed('pink', 'bandpass', freq, 0.22, 3)
        sources.push(lfo(ctx, f.frequency, 0.3 + Math.random() * 0.4, freq * 0.2))
        sources.push(lfo(ctx, gain.gain, 0.5 + Math.random(), 0.1))
      }
      timers.push(every(3, 9, () => tone(ctx, out, 2600 + Math.random() * 1400, 0.05, 0.4, 'sine')))
      break
    }
    case 'sea': {
      const { gain } = bed('brown', 'lowpass', 700, 0.6)
      sources.push(lfo(ctx, gain.gain, 0.12, 0.45))
      const hiss = bed('white', 'highpass', 3000, 0.08)
      sources.push(lfo(ctx, hiss.gain.gain, 0.12, 0.06))
      break
    }
  }
  return {
    stop: () => {
      for (const stop of timers) stop()
      const t = ctx.currentTime
      out.gain.cancelScheduledValues(t)
      out.gain.setValueAtTime(Math.max(out.gain.value, 0.0001), t)
      out.gain.exponentialRampToValueAtTime(0.0001, t + 0.8)
      window.setTimeout(() => {
        for (const source of sources) {
          try {
            source.stop()
          } catch {
            // Already stopped.
          }
        }
        out.disconnect()
      }, 900)
    },
  }
}

function effectVoice(ctx: AudioContext, master: AudioNode, key: SoundEffect) {
  switch (key) {
    case 'door': {
      const osc = ctx.createOscillator()
      const f = filter(ctx, 'bandpass', 700, 6)
      const gain = ctx.createGain()
      const t = ctx.currentTime
      osc.type = 'sawtooth'
      osc.frequency.setValueAtTime(110, t)
      osc.frequency.linearRampToValueAtTime(190, t + 0.5)
      osc.frequency.linearRampToValueAtTime(140, t + 0.9)
      gain.gain.setValueAtTime(0.0001, t)
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.08)
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 1)
      osc.connect(f).connect(gain).connect(master)
      osc.start(t)
      osc.stop(t + 1.05)
      window.setTimeout(
        () =>
          burst(ctx, master, {
            color: 'brown',
            type: 'lowpass',
            freq: 220,
            level: 0.6,
            decay: 0.25,
          }),
        950,
      )
      break
    }
    case 'thunder':
      burst(ctx, master, {
        color: 'white',
        type: 'lowpass',
        freq: 900,
        level: 0.5,
        attack: 0.01,
        decay: 0.3,
      })
      burst(ctx, master, {
        color: 'brown',
        type: 'lowpass',
        freq: 140,
        level: 1,
        attack: 0.12,
        decay: 3.5,
      })
      break
    case 'gong':
      for (const [ratio, level] of [
        [1, 0.3],
        [2.4, 0.16],
        [3.9, 0.1],
        [5.4, 0.06],
      ] as const)
        tone(ctx, master, 110 * ratio, level, 4.5 / ratio + 1.2)
      break
    case 'swords':
      burst(ctx, master, { freq: 3500, level: 0.35, decay: 0.12, q: 3 })
      for (const freq of [2093, 3136, 4186]) tone(ctx, master, freq, 0.12, 0.9, 'triangle')
      window.setTimeout(() => {
        burst(ctx, master, { freq: 3000, level: 0.25, decay: 0.1, q: 3 })
        for (const freq of [1975, 2960]) tone(ctx, master, freq, 0.1, 0.7, 'triangle')
      }, 260)
      break
    case 'coins':
      for (let n = 0; n < 7; n++)
        tone(
          ctx,
          master,
          3000 + Math.random() * 2500,
          0.08,
          0.25,
          'sine',
          n * 0.07 + Math.random() * 0.03,
        )
      break
  }
}
