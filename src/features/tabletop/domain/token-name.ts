// Name plates on the phone map (RYT-135): a long name is cut with an ellipsis, but the number that
// tells similar creatures apart ("Goblin arquero 14", "Goblin arquero 15") is kept whole.
import type { Item } from './model'

/** A name split before its trailing number: `head` may be cut, `tail` (with its space) never is. */
export function splitTrailingNumber(name: string): { head: string; tail: string } {
  const match = /^(.*\S)(\s+\d{1,4})$/u.exec(name)
  return match ? { head: match[1]!, tail: match[2]! } : { head: name, tail: '' }
}

type Placed = Pick<Item, 'x' | 'y' | 'w' | 'h'>

/**
 * Whether another token starts within about three quarters of a square under this one, in the span
 * a plate hangs over. Such a plate sits inside its own token instead of covering the one below.
 */
export function hasTokenBelow(token: Placed, others: readonly Placed[]) {
  return others.some(
    (other) =>
      other !== token &&
      other.x < token.x + token.w + 0.5 &&
      other.x + other.w > token.x - 0.5 &&
      other.y >= token.y + token.h - 0.25 &&
      other.y < token.y + token.h + 0.75,
  )
}
