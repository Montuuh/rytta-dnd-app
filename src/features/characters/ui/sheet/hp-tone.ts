/** Health band of the HP ring and previews: over half, over a quarter, or critical. */
export function toneOf(current: number, max: number) {
  const ratio = (current / Math.max(1, max)) * 100
  return ratio > 50 ? 'healthy' : ratio > 25 ? 'wounded' : 'critical'
}

/** Death saving throws at 0 HP: three failures end the character, three successes stabilise it. */
export type DeathState = 'dead' | 'stable' | 'dying'
export function deathState(saves: { death_successes: number; death_failures: number }): DeathState {
  return saves.death_failures >= 3 ? 'dead' : saves.death_successes >= 3 ? 'stable' : 'dying'
}
