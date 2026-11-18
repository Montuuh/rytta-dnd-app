import './dice.css'

/**
 * RYT-082/133: 3D dice that tumble across the screen. The vendored dice-box build
 * (public/vendor/dice-box, see its NOTICE.md) loads on the first tumble only. The engine cannot be
 * told which faces to land on, so the dice are decoration: a roll's result comes from the server
 * and the tumble is cleared before the dice settle, so no face on screen can contradict it.
 * Reduced motion, no WebGL or a load failure play nothing.
 */
export type DieSides = 4 | 6 | 8 | 10 | 12 | 20

/** Rytta's amber for every die (user decision 2026-11-10). */
const amber = '#eda145'

type DiceBox = {
  init: () => Promise<unknown>
  roll: (notation: string, options?: { themeColor?: string }) => Promise<{ value: number }[]>
  clear: () => unknown
  show: () => unknown
}

let instance: Promise<DiceBox> | null = null
let stage: HTMLDivElement | null = null

function reducedMotion() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches
  } catch {
    return false
  }
}

function webgl() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'))
  } catch {
    return false
  }
}

async function load(): Promise<DiceBox> {
  stage = document.createElement('div')
  stage.id = 'rytta-dice-stage'
  stage.className = 'dice-stage'
  stage.setAttribute('aria-hidden', 'true')
  document.body.appendChild(stage)
  const base = new URL(`${import.meta.env.BASE_URL}vendor/dice-box/`, window.location.href)
  const module = (await import(/* @vite-ignore */ new URL('dice-box.es.min.js', base).href)) as {
    default: new (config: Record<string, unknown>) => DiceBox
  }
  const box = new module.default({
    container: `#${stage.id}`,
    assetPath: `${base.pathname}assets/`,
    origin: base.origin,
    themeColor: amber,
    scale: 5,
    offscreen: true,
  })
  await box.init()
  return box
}

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

/**
 * Plays a short tumble of `count` dice with `sides` faces for `ms` milliseconds, then fades the
 * stage out while the dice are still in the air. Resolves when the stage is clear; never rejects
 * and never reports a value.
 */
export async function tumbleDice(count: number, sides: DieSides, ms = 800): Promise<void> {
  if (count < 1 || reducedMotion() || !webgl()) return
  try {
    instance ??= load()
    const box = await instance
    box.show()
    stage?.classList.remove('is-settled')
    stage?.classList.add('is-rolling')
    // The result of the engine's own roll is ignored on purpose.
    void box.roll(`${count}d${sides}`, { themeColor: amber }).catch(() => undefined)
    await wait(ms)
    stage?.classList.remove('is-rolling')
    // The fade is 0.2s; clear the dice once it is done.
    await wait(260)
    box.clear()
  } catch {
    instance = null
    stage?.remove()
    stage = null
  }
}
