import './dice.css'

/**
 * RYT-082: 3D dice that roll across the screen, as in Foundry. The vendored dice-box build
 * (public/vendor/dice-box, see its NOTICE.md) loads on the first roll only. Reduced motion, no
 * WebGL, a load failure or a stuck roll fall back to an even random roll without animation.
 */
export type DieSides = 4 | 6 | 8 | 10 | 12 | 20

/** Rytta's amber for every die (user decision 2026-11-10). */
const amber = '#eda145'
const holdMs = 1800
const timeoutMs = 9000

type DiceBox = {
  init: () => Promise<unknown>
  roll: (notation: string, options?: { themeColor?: string }) => Promise<{ value: number }[]>
  clear: () => unknown
  show: () => unknown
}

let instance: Promise<DiceBox> | null = null
let stage: HTMLDivElement | null = null
let clearTimer: number | undefined

/** Even values in 1..sides from the platform's cryptographic generator (rejection sampling). */
export function randomRolls(count: number, sides: number): number[] {
  const values: number[] = []
  const limit = Math.floor(0x1_0000_0000 / sides) * sides
  const buffer = new Uint32Array(1)
  while (values.length < count) {
    crypto.getRandomValues(buffer)
    const value = buffer[0]!
    if (value < limit) values.push((value % sides) + 1)
  }
  return values
}

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

const timeout = () =>
  new Promise<never>((_, reject) =>
    window.setTimeout(() => reject(new Error('timeout')), timeoutMs),
  )

/** Rolls `count` dice with `sides` faces and resolves with each die's value. */
export async function rollDice(count: number, sides: DieSides): Promise<number[]> {
  if (count < 1) return []
  if (reducedMotion() || !webgl()) return randomRolls(count, sides)
  try {
    instance ??= load()
    const box = await instance
    window.clearTimeout(clearTimer)
    box.show()
    stage?.classList.add('is-rolling')
    const results = await Promise.race([
      box.roll(`${count}d${sides}`, { themeColor: amber }),
      timeout(),
    ])
    const values = results.map((result) => result.value)
    // The dice stay on the table for a moment, then the overlay clears.
    clearTimer = window.setTimeout(() => {
      stage?.classList.remove('is-rolling')
      box.clear()
    }, holdMs)
    if (
      values.length !== count ||
      values.some((value) => !Number.isInteger(value) || value < 1 || value > sides)
    )
      return randomRolls(count, sides)
    return values
  } catch {
    instance = null
    stage?.remove()
    stage = null
    return randomRolls(count, sides)
  }
}
