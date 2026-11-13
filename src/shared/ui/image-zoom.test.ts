import { describe, expect, it } from 'vitest'
import {
  clampPan,
  clampScale,
  containedSize,
  isDoubleTap,
  panBy,
  pinch,
  toggleZoom,
  wholePicture,
  zoomAt,
} from './image-zoom'

const stage = { width: 400, height: 800 }
// A square picture in a tall stage: 400×400 at 1×, so it only overflows vertically past 2×.
const picture = containedSize({ width: 512, height: 512 }, stage)

describe('image viewer zoom', () => {
  it('contains the whole picture in the stage', () => {
    expect(picture).toEqual({ width: 400, height: 400 })
    expect(containedSize({ width: 1600, height: 800 }, stage)).toEqual({ width: 400, height: 200 })
    expect(containedSize({ width: 0, height: 0 }, stage)).toEqual(stage)
  })

  it('grows a small picture to at most twice its own size', () => {
    expect(containedSize({ width: 128, height: 64 }, stage)).toEqual({ width: 256, height: 128 })
    expect(containedSize({ width: 300, height: 300 }, stage)).toEqual({ width: 400, height: 400 })
    // Pan limits follow the capped size: a 256px square at 2× still fits a 400px wide stage.
    const small = containedSize({ width: 128, height: 128 }, stage)
    expect(clampPan({ scale: 2, x: 999, y: 999 }, small, stage)).toEqual({
      scale: 2,
      x: 56,
      y: 0,
    })
  })

  it('keeps the scale between 1× and 4×', () => {
    expect(clampScale(0.3)).toBe(1)
    expect(clampScale(2.5)).toBe(2.5)
    expect(clampScale(9)).toBe(4)
    expect(clampScale(Number.NaN)).toBe(1)
  })

  it('never lets a zoomed picture leave an empty band where it overflows', () => {
    // At 2× the picture is 800×800: 200px spare each side horizontally, none vertically.
    expect(clampPan({ scale: 2, x: 999, y: 999 }, picture, stage)).toEqual({
      scale: 2,
      x: 200,
      y: 0,
    })
    expect(clampPan({ scale: 2, x: -999, y: -50 }, picture, stage)).toEqual({
      scale: 2,
      x: -200,
      y: 0,
    })
  })

  it('zooms 2× at the tapped point and back to the whole picture', () => {
    const zoomed = toggleZoom(wholePicture, { x: 100, y: 0 }, picture, stage)
    expect(zoomed).toEqual({ scale: 2, x: -100, y: 0 })
    expect(toggleZoom(zoomed, { x: 0, y: 0 }, picture, stage)).toEqual(wholePicture)
  })

  it('keeps the point under the cursor still while zooming', () => {
    const point = { x: 60, y: 0 }
    const start = { scale: 2, x: -60, y: 0 }
    const next = zoomAt(start, 3, point, picture, stage)
    // The picture point under the cursor is the same before and after.
    expect((point.x - start.x) / start.scale).toBeCloseTo((point.x - next.x) / next.scale)
    expect(zoomAt(start, 1, point, picture, stage)).toEqual(wholePicture)
  })

  it('pans only while zoomed', () => {
    expect(panBy(wholePicture, { x: 80, y: 80 }, picture, stage)).toEqual(wholePicture)
    expect(panBy({ scale: 2, x: 0, y: 0 }, { x: 80, y: 80 }, picture, stage)).toEqual({
      scale: 2,
      x: 80,
      y: 0,
    })
  })

  it('pinches between 1× and 4× around the fingers', () => {
    const from = [
      { x: -50, y: 0 },
      { x: 50, y: 0 },
    ] as const
    const apart = [
      { x: -100, y: 0 },
      { x: 100, y: 0 },
    ] as const
    expect(pinch(wholePicture, from, apart, picture, stage).scale).toBe(2)
    const far = [
      { x: -500, y: 0 },
      { x: 500, y: 0 },
    ] as const
    expect(pinch(wholePicture, from, far, picture, stage).scale).toBe(4)
    const close = [
      { x: -10, y: 0 },
      { x: 10, y: 0 },
    ] as const
    expect(pinch({ scale: 2, x: 40, y: 0 }, from, close, picture, stage)).toEqual(wholePicture)
  })

  it('recognises a double tap only when quick and close', () => {
    const first = { x: 10, y: 10, time: 1000 }
    expect(isDoubleTap(null, first)).toBe(false)
    expect(isDoubleTap(first, { x: 14, y: 12, time: 1200 })).toBe(true)
    expect(isDoubleTap(first, { x: 14, y: 12, time: 1500 })).toBe(false)
    expect(isDoubleTap(first, { x: 90, y: 10, time: 1100 })).toBe(false)
  })
})
