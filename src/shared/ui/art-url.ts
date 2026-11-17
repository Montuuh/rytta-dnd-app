/** URL of a static illustration shipped under `public/art`, e.g. `artUrl('classes/wizard')`. */
export const artUrl = (name: string) => `${import.meta.env.BASE_URL}art/${name}.webp`

/** Stable pick from a list for a given key, so the same campaign always gets the same cover. */
export function pickByKey<T>(key: string, options: readonly T[]): T {
  let hash = 0
  for (let index = 0; index < key.length; index += 1) {
    hash = (hash * 31 + key.charCodeAt(index)) >>> 0
  }
  return options[hash % options.length] as T
}
