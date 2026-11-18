import { Text } from '@mantine/core'
import { Lock } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { isBelowPartyLevel, useCampaign } from '@/features/campaigns'
import './level-up.css'

/**
 * RYT-130: the level of a finished sheet is not typed by a Player (the server refuses it); it
 * rises by leveling up. Shows the level and where to go instead, never a control.
 */
export function LockedLevel({ level }: { level: number }) {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const below = isBelowPartyLevel(level, campaign.party_level)
  return (
    <div className="levelup-locked">
      <span className="levelup-locked-value">
        <Lock size={16} aria-hidden="true" />
        <output>{level}</output>
      </span>
      <Text size="xs" c="dimmed">
        {t(below ? 'levelUp.lockedBelow' : 'levelUp.lockedAtParty')}
      </Text>
    </div>
  )
}
