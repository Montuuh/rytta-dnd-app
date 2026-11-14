import type { ItemOf } from './model'

/** Compress a server cell mask into horizontal runs for one SVG path. */
export function cellMaskPath(cells: readonly number[], cols: number, rows: number) {
  const sorted = [...new Set(cells)].filter((i) => i >= 0 && i < cols * rows).sort((a, b) => a - b)
  const runs: string[] = []
  for (let k = 0; k < sorted.length; k++) {
    const start = sorted[k]!
    let end = start
    while (sorted[k + 1] === end + 1 && Math.floor((end + 1) / cols) === Math.floor(start / cols)) {
      end++
      k++
    }
    runs.push(
      `M${start % cols} ${Math.floor(start / cols)}h${end - start + 1}v1h-${end - start + 1}z`,
    )
  }
  return runs.join('')
}

export function lightRadius(item: ItemOf<'token'> | ItemOf<'prop'>) {
  return (
    item.data.light_radius ??
    (item.kind === 'prop' &&
    ['torch', 'campfire', 'brazier', 'candles', 'lantern-post', 'hearth'].includes(item.data.prop)
      ? 4
      : 0)
  )
}
