/** Uploaded pictures: sharp enough for the full-screen viewer, small enough for the 1 MB buckets. */
export const uploadBytes = 1_048_576
/** Squares (portraits, creature art) and the long side of item pictures. */
export const uploadSide = 1024
/** Tried in order; quality never drops below the last one. */
export const webpQualities = [0.9, 0.85, 0.8, 0.75] as const
/** When even the lowest quality is too heavy, the picture shrinks instead of blurring. */
export const fallbackScales = [1, 0.75, 0.5] as const

/** Sides of the intermediate halvings between a source and its target. One jump from a large
 * photo to a small square skips most source pixels and looks jagged; halving keeps the detail. */
export function halvingSteps(source: number, target: number): number[] {
  const steps: number[] = []
  let side = source
  while (side > target * 2) {
    side = Math.ceil(side / 2)
    steps.push(side)
  }
  return steps
}

type Source = CanvasImageSource & { width: number; height: number }

/** drawImage with high-quality smoothing and halving steps for large reductions. */
export function drawSmooth(
  context: CanvasRenderingContext2D,
  source: Source,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  dx: number,
  dy: number,
  dw: number,
  dh: number,
) {
  let current: CanvasImageSource = source
  let rect = { x: sx, y: sy, w: sw, h: sh }
  const widths = halvingSteps(sw, dw)
  const heights = halvingSteps(sh, dh)
  for (let index = 0; index < Math.min(widths.length, heights.length); index++) {
    const step = document.createElement('canvas')
    step.width = widths[index]!
    step.height = heights[index]!
    const stepContext = step.getContext('2d')
    if (!stepContext) break
    stepContext.imageSmoothingEnabled = true
    stepContext.imageSmoothingQuality = 'high'
    stepContext.drawImage(current, rect.x, rect.y, rect.w, rect.h, 0, 0, step.width, step.height)
    current = step
    rect = { x: 0, y: 0, w: step.width, h: step.height }
  }
  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(current, rect.x, rect.y, rect.w, rect.h, dx, dy, dw, dh)
}

/** The types the picture buckets accept. */
export const uploadTypes = ['image/webp', 'image/jpeg', 'image/png'] as const
/** File extension the storage paths use for each accepted type. */
export const uploadExtension = (type: string) =>
  type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : 'webp'

/** The first encoding that fits: every quality at full size, then smaller sizes. `render` draws
 * the picture at a scale; `encode` turns it into a blob (both injectable for tests). */
export async function encodeWithin<T>(
  render: (scale: number) => T,
  encode: (canvas: T, quality: number) => Promise<Blob | null>,
  maxBytes = uploadBytes,
): Promise<Blob> {
  for (const scale of fallbackScales) {
    const canvas = render(scale)
    for (const quality of webpQualities) {
      const blob = await encode(canvas, quality)
      if (blob && (uploadTypes as readonly string[]).includes(blob.type) && blob.size <= maxBytes)
        return blob
    }
  }
  throw new Error('invalid')
}

const toBlob = (canvas: HTMLCanvasElement, type: string, quality: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality))

/** Resolves once the browser has painted, so a saving state shows before heavy synchronous
 * drawing blocks the page (a rAF callback runs before the paint, its timeout after it). */
export const afterPaint = () =>
  new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)))

let webpEncoder: boolean | undefined
/** Safari decodes WebP but cannot encode it from a canvas; asked once per page. */
const encodesWebp = () =>
  (webpEncoder ??= document
    .createElement('canvas')
    .toDataURL('image/webp')
    .startsWith('data:image/webp'))

/** WebP where the browser encodes it; otherwise JPEG, or PNG when the picture is see-through. */
export function canvasToUpload(canvas: HTMLCanvasElement, quality: number, alpha = false) {
  if (encodesWebp()) return toBlob(canvas, 'image/webp', quality)
  return toBlob(canvas, alpha ? 'image/png' : 'image/jpeg', quality)
}

/** Whether a picture has see-through pixels, read from a small copy: shrinking averages alpha,
 * so a transparent area of any useful size still shows below 255. */
export function hasTransparency(source: Source) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 64
  const context = canvas.getContext('2d', { willReadFrequently: true })
  if (!context) return true
  context.drawImage(source, 0, 0, 64, 64)
  const { data } = context.getImageData(0, 0, 64, 64)
  for (let index = 3; index < data.length; index += 4) if (data[index]! < 255) return true
  return false
}
