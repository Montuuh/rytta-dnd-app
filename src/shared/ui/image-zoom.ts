/**
 * Zoom and pan of the image viewer, kept pure so the gestures can be tested without a browser.
 * Points and offsets are in CSS pixels relative to the centre of the stage; the picture is drawn
 * with `translate(x, y) scale(scale)` around that centre.
 */
export type Zoom = { scale: number; x: number; y: number }
export type Size = { width: number; height: number }
export type Point = { x: number; y: number }
export type Tap = Point & { time: number }

export const minZoom = 1
export const maxZoom = 4
/** A double tap or the zoom key toggles between the whole picture and this. */
export const tapZoom = 2
export const wholePicture: Zoom = { scale: 1, x: 0, y: 0 }
/** At 1× a small picture grows to at most twice its own size, so it never turns to mush. */
export const maxUpscale = 2

/** Two taps this close in time and space are a double tap. */
const doubleTapMs = 320
const doubleTapPx = 28

export const clampScale = (scale: number) =>
  Number.isFinite(scale) ? Math.min(maxZoom, Math.max(minZoom, scale)) : minZoom

/**
 * The picture's painted size at 1×: contained in the stage, never cropped, and never larger than
 * `upscale` times its own size.
 */
export function containedSize(natural: Size, stage: Size, upscale = maxUpscale): Size {
  if (natural.width <= 0 || natural.height <= 0) return { width: stage.width, height: stage.height }
  const fit = Math.min(stage.width / natural.width, stage.height / natural.height, upscale)
  return { width: natural.width * fit, height: natural.height * fit }
}

/**
 * Keeps a zoomed picture over the stage: on an axis where it overflows it can move until its edge
 * meets the stage's edge, never further; on an axis where it fits it stays centred.
 */
export function clampPan(zoom: Zoom, picture: Size, stage: Size): Zoom {
  const scale = clampScale(zoom.scale)
  const limit = (painted: number, room: number, offset: number) => {
    const spare = (painted * scale - room) / 2
    if (spare <= 0 || !Number.isFinite(offset)) return 0
    return Math.min(spare, Math.max(-spare, offset))
  }
  return {
    scale,
    x: limit(picture.width, stage.width, zoom.x),
    y: limit(picture.height, stage.height, zoom.y),
  }
}

/** Zooms to `scale` keeping the part of the picture under `point` where it is. */
export function zoomAt(zoom: Zoom, scale: number, point: Point, picture: Size, stage: Size): Zoom {
  const next = clampScale(scale)
  if (next === minZoom) return wholePicture
  const ratio = next / zoom.scale
  return clampPan(
    {
      scale: next,
      x: point.x - (point.x - zoom.x) * ratio,
      y: point.y - (point.y - zoom.y) * ratio,
    },
    picture,
    stage,
  )
}

/** A double tap: 2× at the tapped point, or back to the whole picture. */
export function toggleZoom(zoom: Zoom, point: Point, picture: Size, stage: Size): Zoom {
  return zoom.scale > minZoom ? wholePicture : zoomAt(zoom, tapZoom, point, picture, stage)
}

/** Drags a zoomed picture; at 1× there is nothing to move. */
export function panBy(start: Zoom, delta: Point, picture: Size, stage: Size): Zoom {
  if (start.scale <= minZoom) return wholePicture
  return clampPan({ ...start, x: start.x + delta.x, y: start.y + delta.y }, picture, stage)
}

const midpoint = ([a, b]: readonly [Point, Point]): Point => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
})
const distance = ([a, b]: readonly [Point, Point]) => Math.hypot(a.x - b.x, a.y - b.y)

/**
 * Two fingers: the scale follows the change in their distance (1× to 4×) and the point of the
 * picture that was between them stays between them.
 */
export function pinch(
  start: Zoom,
  from: readonly [Point, Point],
  to: readonly [Point, Point],
  picture: Size,
  stage: Size,
): Zoom {
  const before = distance(from)
  const scale = clampScale(before > 0 ? (start.scale * distance(to)) / before : start.scale)
  if (scale === minZoom) return wholePicture
  const anchor = midpoint(from)
  const now = midpoint(to)
  const qx = (anchor.x - start.x) / start.scale
  const qy = (anchor.y - start.y) / start.scale
  return clampPan({ scale, x: now.x - qx * scale, y: now.y - qy * scale }, picture, stage)
}

export function isDoubleTap(previous: Tap | null, next: Tap) {
  return (
    previous !== null &&
    next.time - previous.time <= doubleTapMs &&
    Math.hypot(next.x - previous.x, next.y - previous.y) <= doubleTapPx
  )
}
