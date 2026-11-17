/**
 * Where the seats of the campfire go. Seat boxes have a fixed size (their text is clipped, see
 * rest.css), so a placement either fits the scene or it does not, whatever the font: a scene that
 * cannot seat everybody without touching falls back to wrapped rows instead of overlapping.
 */
export type SeatLayout = 'arc' | 'ring' | 'rows'
export type SeatBox = { width: number; height: number }
export type SeatPoint = { x: number; y: number }

/** Fixed seat boxes in CSS pixels; rest.css sets the same values. */
export const seatBoxes: Record<'arc' | 'ring', SeatBox> = {
  arc: { width: 92, height: 106 },
  ring: { width: 80, height: 82 },
}

/** Seat centres in pixels inside a scene of the given size. Arc: upper half; ring: whole circle. */
export function seatPoints(
  layout: 'arc' | 'ring',
  count: number,
  scene: { width: number; height: number },
): SeatPoint[] {
  const box = seatBoxes[layout]
  return Array.from({ length: count }, (_, index) => {
    if (layout === 'ring') {
      // A circle through the seat centres that keeps every seat inside the square scene.
      const radius = Math.min(scene.width - box.width, scene.height - box.height) / 2
      const angle = -Math.PI / 2 + (2 * Math.PI * index) / count
      return {
        x: scene.width / 2 + radius * Math.cos(angle),
        y: scene.height / 2 + radius * Math.sin(angle),
      }
    }
    const angle = Math.PI * (count === 1 ? 1.5 : 1.08 + (0.84 * index) / (count - 1))
    return {
      x: scene.width * (0.5 + 0.38 * Math.cos(angle)),
      y: scene.height * (0.72 + 0.5 * Math.sin(angle)),
    }
  })
}

/** True when no two seat boxes touch and every one sits inside the scene. */
export function seatsFit(
  layout: 'arc' | 'ring',
  count: number,
  scene: { width: number; height: number },
): boolean {
  const { width, height } = seatBoxes[layout]
  const points = seatPoints(layout, count, scene)
  const inside = points.every(
    (p) =>
      p.x - width / 2 >= 0 &&
      p.x + width / 2 <= scene.width &&
      p.y - height / 2 >= 0 &&
      p.y + height / 2 <= scene.height,
  )
  if (!inside) return false
  return points.every((a, i) =>
    points.slice(i + 1).every((b) => Math.abs(a.x - b.x) >= width || Math.abs(a.y - b.y) >= height),
  )
}

/** The layout for a table: arc up to 4, ring up to 8, else rows; rows also when it cannot fit. */
export function pickLayout(
  count: number,
  largeText: boolean,
  sceneWidth: number,
  arcHeight = 250,
): SeatLayout {
  if (sceneWidth <= 0) return 'rows'
  if (count <= 4) {
    return seatsFit('arc', count, { width: sceneWidth, height: arcHeight }) ? 'arc' : 'rows'
  }
  if (count <= 8 && !largeText) {
    return seatsFit('ring', count, { width: sceneWidth, height: sceneWidth }) ? 'ring' : 'rows'
  }
  return 'rows'
}
