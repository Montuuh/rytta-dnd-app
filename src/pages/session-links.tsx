import { Button } from '@mantine/core'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useCampaign } from '@/features/campaigns'

export function PartyRecapLink() {
  const campaign = useCampaign()
  const { t } = useTranslation()
  if (campaign.role !== 'player') return null
  return (
    <Button component={Link} to={`/campaign/${campaign.id}/session`} mt="md" variant="subtle">
      {t('session.recap')}
    </Button>
  )
}
