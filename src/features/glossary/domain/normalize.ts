/**
 * Case- and accent-insensitive comparison that keeps one output character per input UTF-16
 * code unit, so match offsets in the normalized text are valid in the original text.
 */
export function foldChar(ch: string): string {
  const base = ch.normalize('NFD')[0] ?? ch
  const lower = base.toLocaleLowerCase()
  return lower.length === 1 ? lower : ch
}
export function fold(text: string): string {
  let out = ''
  for (let i = 0; i < text.length; i++) out += foldChar(text[i]!)
  return out
}
/** Search key: folded, punctuation collapsed to spaces. */
export function searchKey(text: string): string {
  return fold(text)
    .replace(/[’'`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
}
