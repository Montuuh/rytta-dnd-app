import { tumbleDice, type DieSides } from '@/shared/ui/dice/roll-dice'
import { parseExpression } from '../domain/roll'

const engineSides = new Set([4, 6, 8, 10, 12, 20])

/**
 * The decoration of a roll the server makes: the dice of the expression tumble for a moment and
 * clear before they settle (see tumbleDice). Only the first group of dice is shown; nothing is
 * read from the animation.
 */
export async function tumble(expression: string): Promise<void> {
  const first = parseExpression(expression)?.dice[0]
  if (first && engineSides.has(first.sides))
    await tumbleDice(Math.min(first.count, 6), first.sides as DieSides)
}
