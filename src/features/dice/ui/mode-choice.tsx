import { useId } from 'react'
import { SegmentedControl } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { DiceBehaviour } from '../domain/mode'
import { useDiceMode } from './use-dice-mode'
import './dice.css'

/**
 * RYT-133: when the DM left the dice to each Player, this is where a Player chooses. The choice is
 * kept on this device only (it grants nothing) and reads as physical dice until it is made. It
 * shows nothing at tables where the DM chose the mode.
 */
export function DiceModeChoice({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation()
  const labelId = useId()
  const { mode, behaviour, setChoice } = useDiceMode(campaignId)
  if (mode !== 'player') return null
  return (
    <div className="dice-choice">
      <span id={labelId} className="dice-choice-label">
        {t('diceChoice.label')}
      </span>
      <SegmentedControl
        fullWidth
        value={behaviour}
        onChange={(value) => setChoice(value as DiceBehaviour)}
        aria-labelledby={labelId}
        data={[
          { value: 'physical', label: t('diceChoice.physical') },
          { value: 'app', label: t('diceChoice.app') },
        ]}
      />
      <p className="dice-choice-hint">{t('diceChoice.hint')}</p>
    </div>
  )
}
