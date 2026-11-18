import { describe, expect, it } from 'vitest'
import {
  boardMinZoom,
  boxesOverlap,
  centreOnToken,
  coverView,
  freeArea,
  labelMinZoom,
  labelScale,
  labelsShown,
  type Box,
} from './phone-map'

const unit = 64
// Three round 48px buttons stacked at the bottom right of a 390 x 788 board, as the screen lays them.
const column = (w: number, h: number): Box[] =>
  [0, 1, 2].map((i) => ({ x: w - 12 - 48, y: h - 16 - 48 - i * 60, w: 48, h: 48 }))

describe('labelScale', () => {
  it('keeps the size on screen the same at every zoom', () => {
    for (const design of [1, 0.55])
      for (const zoom of [0.08, 0.3, 0.6, 1, 2.5, 4])
        expect(zoom * labelScale(zoom, design)).toBeCloseTo(design, 10)
  })

  it('never divides by zero', () => {
    expect(Number.isFinite(labelScale(0))).toBe(true)
  })
})

describe('labelsShown', () => {
  it('shows name plates only where a square is big enough to keep them off their neighbours', () => {
    expect(labelsShown(0.29)).toBe(false)
    expect(labelsShown(labelMinZoom - 0.01)).toBe(false)
    expect(labelsShown(labelMinZoom)).toBe(true)
    expect(labelsShown(1.5)).toBe(true)
  })

  it('keeps a plate of 112px under four squares wide at the smallest zoom that shows it', () => {
    expect(112 / (unit * labelMinZoom)).toBeLessThan(4)
  })
})

describe('coverView', () => {
  it('covers the board and centres the map', () => {
    const view = coverView({ w: 390, h: 788 }, 20, 12, unit)
    expect(view.z).toBeCloseTo(788 / (12 * unit), 10)
    expect(view.x).toBeCloseTo((390 - 20 * unit * view.z) / 2, 6)
    expect(view.y).toBeCloseTo(0, 6)
  })
})

describe('freeArea', () => {
  it('is the whole board without buttons', () => {
    expect(freeArea({ w: 390, h: 788 }, [])).toEqual({ x: 0, y: 0, w: 390, h: 788 })
  })

  it('leaves out the column of buttons on the right', () => {
    const free = freeArea({ w: 390, h: 788 }, column(390, 788))
    expect(free.x).toBe(0)
    expect(free.w).toBe(390 - 12 - 48 - 12)
  })
})

describe('centreOnToken', () => {
  const token = { x: 4, y: 4, w: 1, h: 1 }

  it('centres the token in the free space and keeps it clear of the buttons', () => {
    for (const [w, h] of [
      [390, 788],
      [844, 334],
      [360, 640],
    ] as const) {
      const buttons = column(w, h)
      const view = centreOnToken({ viewport: { w, h }, buttons, token, zoom: 0.3, unit })
      const centre = {
        x: view.x + (token.x + 0.5) * unit * view.z,
        y: view.y + (token.y + 0.5) * unit * view.z,
      }
      expect(centre.x).toBeCloseTo(view.free.x + view.free.w / 2, 6)
      expect(centre.y).toBeCloseTo(view.free.y + view.free.h / 2, 6)
      expect(view.clear).toBe(true)
    }
  })

  it('zooms in to where tokens read, but never past the zoom the person already has', () => {
    const buttons = column(390, 788)
    const view = (zoom: number) =>
      centreOnToken({ viewport: { w: 390, h: 788 }, buttons, token, zoom, unit })
    expect(view(0.2).z).toBe(0.6)
    expect(view(1.4).z).toBe(1.4)
  })

  it('shrinks the view for a token too large for the space the buttons leave', () => {
    const buttons = column(390, 788)
    const colossus = { x: 2, y: 2, w: 8, h: 8 }
    const view = centreOnToken({
      viewport: { w: 390, h: 788 },
      buttons,
      token: colossus,
      zoom: 1,
      unit,
    })
    expect(view.z).toBeLessThan(0.6)
    expect(view.clear).toBe(true)
  })

  it('never goes below the board own smallest zoom, and the token stays where it was placed', () => {
    const buttons = column(390, 788)
    const colossus = { x: 0, y: 0, w: 400, h: 400 }
    const view = centreOnToken({
      viewport: { w: 390, h: 788 },
      buttons,
      token: colossus,
      zoom: 1,
      unit,
    })
    expect(view.z).toBe(boardMinZoom)
    const centre = view.x + 200 * unit * view.z
    expect(centre).toBeCloseTo(view.free.x + view.free.w / 2, 6)
  })

  it('says so when no zoom keeps the token off the buttons', () => {
    // A board narrower than its own buttons: the token cannot be clear of them.
    const buttons: Box[] = [{ x: 0, y: 0, w: 120, h: 120 }]
    const view = centreOnToken({
      viewport: { w: 120, h: 120 },
      buttons,
      token,
      zoom: 1,
      unit,
    })
    expect(view.clear).toBe(false)
  })
})

describe('boxesOverlap', () => {
  it('treats boxes that only touch as apart', () => {
    expect(boxesOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 10, y: 0, w: 5, h: 5 })).toBe(false)
    expect(boxesOverlap({ x: 0, y: 0, w: 10, h: 10 }, { x: 9, y: 9, w: 5, h: 5 })).toBe(true)
  })
})
