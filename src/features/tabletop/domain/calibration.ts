import type { ScreenSetup } from './model'

/**
 * ADR 032 calibration: one square equals one miniature base on the screen lying on the table.
 * Pixels are physical pixels of the table screen (CSS pixels × devicePixelRatio).
 */
export interface Calibration {
  diagonalIn: number
  pxW: number
  pxH: number
  baseMm: number
  /** Fine adjustment after checking a real base against the ruler (0.85–1.15). */
  fine: number
  /** Rotate the table view 180° for players sitting on the far side. */
  flip: boolean
}

export const tvSizes = [32, 43, 50, 55, 65, 75, 86] as const
/** Common miniature bases: 25 mm, one inch (25.4 mm), 28 mm and 32 mm. */
export const baseSizes = [25, 25.4, 28, 32] as const
export const defaultCalibration: Calibration = {
  diagonalIn: 55,
  pxW: 3840,
  pxH: 2160,
  baseMm: 25.4,
  fine: 1,
  flip: false,
}

export const pixelsPerInch = (c: Pick<Calibration, 'diagonalIn' | 'pxW' | 'pxH'>) =>
  Math.hypot(c.pxW, c.pxH) / c.diagonalIn

/** One square in physical pixels of the table screen. */
export const squarePx = (c: Calibration) => (c.baseMm / 25.4) * pixelsPerInch(c) * c.fine

/** One square in CSS pixels on a device with this pixel ratio. */
export const squareCss = (c: Calibration, devicePixelRatio: number) =>
  squarePx(c) / Math.max(devicePixelRatio, 0.25)

/** Whole squares that fit on the table screen. */
export function squaresThatFit(c: Calibration) {
  const size = squarePx(c)
  return { cols: Math.floor(c.pxW / size), rows: Math.floor(c.pxH / size) }
}

/** Physical width and height of the screen in inches. */
export function screenInches(c: Pick<Calibration, 'diagonalIn' | 'pxW' | 'pxH'>) {
  const ppi = pixelsPerInch(c)
  return { width: c.pxW / ppi, height: c.pxH / ppi }
}

/** The stored setup as a calibration, or null while any part is missing or out of range. */
export function fromSetup(setup: ScreenSetup | null | undefined): Calibration | null {
  if (!setup) return null
  const { diagonal_in, px_w, px_h, base_mm, fine, flip } = setup
  if (!diagonal_in || !px_w || !px_h || !base_mm) return null
  if (diagonal_in < 5 || px_w < 320 || px_h < 240 || base_mm < 10) return null
  return {
    diagonalIn: diagonal_in,
    pxW: px_w,
    pxH: px_h,
    baseMm: base_mm,
    fine: fine && fine >= 0.85 && fine <= 1.15 ? fine : 1,
    flip: Boolean(flip),
  }
}

export const toSetup = (c: Calibration): Required<ScreenSetup> => ({
  diagonal_in: round(c.diagonalIn, 1),
  px_w: Math.round(c.pxW),
  px_h: Math.round(c.pxH),
  base_mm: round(c.baseMm, 1),
  fine: round(c.fine, 3),
  flip: c.flip,
})

/** The resolution a screen reports, in physical pixels (landscape first). */
export function reportedResolution(screen: { width: number; height: number }, dpr: number) {
  const w = Math.round(screen.width * dpr)
  const h = Math.round(screen.height * dpr)
  return { pxW: Math.max(w, h), pxH: Math.min(w, h) }
}

const round = (value: number, digits: number) => Number(value.toFixed(digits))
