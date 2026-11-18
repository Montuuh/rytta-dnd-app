import { useTranslation } from 'react-i18next'
import { useDice } from './dice-context'
import './dice.css'

/** One line that says what tapping a number does, shown only where the viewer can roll. */
export function RollHint() {
  const { t } = useTranslation()
  const { behaviour, canRoll } = useDice()
  if (!canRoll) return null
  return (
    <p className="roll-hint">{t(behaviour === 'app' ? 'roll.hintApp' : 'roll.hintPhysical')}</p>
  )
}
