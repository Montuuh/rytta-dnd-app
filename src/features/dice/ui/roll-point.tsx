import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { formulaOf, type RollSpec } from '../domain/roll'
import { useDice } from './dice-context'
import { useRollName } from './roll-name'
import './dice.css'

/**
 * RYT-133: a number of the sheet that can be rolled. With dice in the app a tap rolls them; with
 * physical dice a tap opens the dialog where the result is typed. It is the number itself, with a
 * solid accent underline (the glossary's dotted underline stays its own): not a chip. Where the
 * viewer cannot roll for this character (somebody else's sheet) it is plain text.
 */
export function RollPoint({
  spec,
  children,
  prefix,
  className,
  formula = 'none',
  dense = false,
}: {
  spec: RollSpec | null
  children: ReactNode
  /** Always shown before the number (the word "Save"), whatever the dice mode. */
  prefix?: ReactNode
  className?: string
  /** With physical dice: `replace` shows what to roll (`d20 + 5`) instead of the children,
   * `append` shows it under them. With dice in the app the children stay as they are. */
  formula?: 'none' | 'replace' | 'append'
  /** Narrow places (the ability medals) write the formula without spaces: `d20+5`. */
  dense?: boolean
}) {
  const { t } = useTranslation()
  const { behaviour, canRoll, roll, record, rolling } = useDice()
  const name = useRollName()
  if (!spec || !canRoll)
    return (
      <span className={className}>
        {prefix}
        {children}
      </span>
    )
  const text = formulaOf(spec.expression)
  const values = { name: name(spec.kind, spec.label), formula: text }
  const physical = behaviour === 'physical'
  const shown = dense ? text.replaceAll(' ', '') : text
  return (
    <button
      type="button"
      className={`roll-point${className ? ` ${className}` : ''}`}
      data-rollable={behaviour}
      aria-label={t(behaviour === 'app' ? 'roll.rollAction' : 'roll.recordAction', values)}
      // Busy, not disabled: the focus stays where the Player tapped.
      aria-disabled={rolling || undefined}
      onClick={(event) => {
        if (rolling) return
        if (behaviour === 'app') roll(spec)
        else record(spec, event.currentTarget)
      }}
    >
      {prefix}
      <span className="roll-point-text">
        {physical && formula === 'replace' ? shown : children}
      </span>
      {physical && formula === 'append' && <span className="roll-point-formula">{shown}</span>}
    </button>
  )
}
