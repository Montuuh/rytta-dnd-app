const steps: [Intl.RelativeTimeFormatUnit, number][] = [
  ['second', 60],
  ['minute', 60],
  ['hour', 24],
  ['day', 7],
  ['week', 4.35],
  ['month', 12],
  ['year', Number.POSITIVE_INFINITY],
]

/** Formats a past timestamp as "2 min ago" style text. Returns null below 10 seconds so
 * callers can show their own "just now" copy. */
export function relativeTime(timestamp: number, now: number, language: string): string | null {
  const seconds = Math.round((timestamp - now) / 1000)
  if (Math.abs(seconds) < 10) return null
  let value = seconds
  for (const [unit, size] of steps) {
    if (Math.abs(value) < size)
      return new Intl.RelativeTimeFormat(language, { numeric: 'auto', style: 'short' }).format(
        Math.round(value),
        unit,
      )
    value /= size
  }
  return null
}
