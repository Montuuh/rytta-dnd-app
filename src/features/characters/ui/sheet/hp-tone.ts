/** Health band of the HP ring and previews: over half, over a quarter, or critical. */
export function toneOf(current: number, max: number) {
  const ratio = (current / Math.max(1, max)) * 100
  return ratio > 50 ? 'healthy' : ratio > 25 ? 'wounded' : 'critical'
}
