import { AttackLines } from './paper-doll'
import type { Attack } from '../domain/equipment'

/** Attack lines inside the character sheet: the sheet's own list, so the tile and this block agree. */
export function SheetAttacks({ lines }: { lines: Attack[] }) {
  return <AttackLines lines={lines} />
}
