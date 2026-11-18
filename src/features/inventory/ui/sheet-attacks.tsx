import type { ComponentProps } from 'react'
import { AttackLines } from './paper-doll'
import type { Attack } from '../domain/equipment'

/** Attack lines inside the character sheet: the sheet's own list, so the tile and this block agree.
 * `renderRoll` lets the sheet make the to-hit number and the damage dice rollable. */
export function SheetAttacks({
  lines,
  renderRoll,
}: {
  lines: Attack[]
  renderRoll?: ComponentProps<typeof AttackLines>['renderRoll']
}) {
  return <AttackLines lines={lines} renderRoll={renderRoll} />
}
