// The map on a phone (RYT-132, ADR 046): when the board is the page, what it measures and where the
// view goes. Pure functions; the Player's map only paints them.

/**
 * Phones, in either orientation: below 48em wide (portrait) or a short, narrow screen (a phone on
 * its side). Tablets, in both orientations, and laptops keep the page layout.
 */
export const phoneMapQuery = '(max-width: 47.99em), (max-height: 30em) and (max-width: 60em)'

/**
 * How much to scale something drawn for `design` zoom so that it keeps its size on screen at `zoom`:
 * the board scales the world by `zoom`, so a label is multiplied by the inverse. A name plate drawn in
 * CSS pixels has `design` 1; the measuring plate was drawn in squares, at the zoom its size reads at.
 */
export const labelScale = (zoom: number, design = 1) => design / Math.max(zoom, 0.01)

/** The board's own limits (`viewport.ts`): centring never asks for a zoom outside them. */
export const boardMinZoom = 0.08
export const boardMaxZoom = 4

/**
 * Name plates keep their size on screen only while the squares are big enough to hold them: below this
 * zoom (a square under about 35px) a plate would span four or more squares and cover its neighbours,
 * so the tokens show their own monogram alone.
 */
export const labelMinZoom = 0.55
export const labelsShown = (zoom: number) => zoom >= labelMinZoom
/** A plate is never wider than this many squares, in world pixels per square `unit`. */
export const labelMaxSquares = 3

export type Box = { x: number; y: number; w: number; h: number }

export const boxesOverlap = (a: Box, b: Box) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

const area = (box: Box) => box.w * box.h

/**
 * The largest part of the viewport that holds none of the floating buttons: whichever side of the
 * buttons (left, right, above or below them, each with `margin` to spare) leaves the most room.
 */
export function freeArea(viewport: { w: number; h: number }, buttons: readonly Box[], margin = 12) {
  const whole: Box = { x: 0, y: 0, w: viewport.w, h: viewport.h }
  if (buttons.length === 0) return whole
  const left = Math.min(...buttons.map((b) => b.x)) - margin
  const right = Math.max(...buttons.map((b) => b.x + b.w)) + margin
  const top = Math.min(...buttons.map((b) => b.y)) - margin
  const bottom = Math.max(...buttons.map((b) => b.y + b.h)) + margin
  const candidates: Box[] = [
    { x: 0, y: 0, w: left, h: viewport.h },
    { x: right, y: 0, w: viewport.w - right, h: viewport.h },
    { x: 0, y: 0, w: viewport.w, h: top },
    { x: 0, y: bottom, w: viewport.w, h: viewport.h - bottom },
  ].filter((box) => box.w > 0 && box.h > 0)
  return candidates.reduce(
    (best, box) => (area(box) > area(best) ? box : best),
    candidates[0] ?? whole,
  )
}

/**
 * The view that covers a board of `cols` x `rows` squares (no empty surround on the short side),
 * centred on the map: where a phone opens a map with no token of the Player's to go to.
 */
export function coverView(
  viewport: { w: number; h: number },
  cols: number,
  rows: number,
  unit: number,
) {
  const z = Math.max(
    boardMinZoom,
    Math.min(boardMaxZoom, Math.max(viewport.w / (cols * unit), viewport.h / (rows * unit))),
  )
  return { z, x: (viewport.w - cols * unit * z) / 2, y: (viewport.h - rows * unit * z) / 2 }
}

export type CentreInput = {
  viewport: { w: number; h: number }
  /** Where the floating buttons sit, in viewport pixels. */
  buttons: readonly Box[]
  /** The token in squares. */
  token: Box
  /** The zoom now, in screen pixels per world pixel. */
  zoom: number
  /** World pixels per square. */
  unit: number
  /** Tokens read from this zoom up, so centring never leaves the map smaller than that. */
  minZoom?: number
  /** Room under the token for its name plate, in pixels. */
  plate?: number
  margin?: number
}

/**
 * The view that puts a token in the middle of what the buttons leave free, at a zoom where tokens
 * read, never so close that the token (and its name under it) would not fit in that space. `clear`
 * says whether the token and its name stay off every button, so the test and the screen agree.
 */
export function centreOnToken({
  viewport,
  buttons,
  token,
  zoom,
  unit,
  minZoom = 0.6,
  plate = 40,
  margin = 12,
}: CentreInput) {
  const free = freeArea(viewport, buttons, margin)
  const cx = free.x + free.w / 2
  const cy = free.y + free.h / 2
  const span = Math.max(token.w, token.h) * unit
  // The token and its plate take at most three fifths of the smaller side of the free space.
  const fits = (Math.min(free.w, free.h - plate) * 0.6) / span
  const z = Math.max(boardMinZoom, Math.min(boardMaxZoom, Math.max(zoom, minZoom), fits))
  const covered: Box = {
    x: cx - (token.w * unit * z) / 2,
    y: cy - (token.h * unit * z) / 2,
    w: token.w * unit * z,
    h: token.h * unit * z + plate,
  }
  return {
    z,
    x: cx - (token.x + token.w / 2) * unit * z,
    y: cy - (token.y + token.h / 2) * unit * z,
    free,
    clear: !buttons.some((button) => boxesOverlap(button, covered)),
  }
}
