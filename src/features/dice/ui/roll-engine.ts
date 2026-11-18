import { randomRolls, rollDice, type DieSides } from '@/shared/ui/dice/roll-dice'
import { parseExpression } from '../domain/roll'

const engineSides = new Set([4, 6, 8, 10, 12, 20])

/**
 * Rolls the dice of an expression with the 3D engine, one group at a time, and returns each die in
 * the order the database reads them. Reduced motion, no WebGL or a stuck roll give an even random
 * roll without animation (the engine decides). Null when the expression has no dice to roll.
 */
export async function rollExpressionDice(expression: string): Promise<number[] | null> {
  const parsed = parseExpression(expression)
  if (!parsed) return null
  const dice: number[] = []
  for (const term of parsed.dice)
    dice.push(
      ...(engineSides.has(term.sides)
        ? await rollDice(term.count, term.sides as DieSides)
        : randomRolls(term.count, term.sides)),
    )
  return dice
}
