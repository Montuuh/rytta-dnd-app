import { Button } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { BookOpen } from 'lucide-react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { useCampaign } from '@/features/campaigns'
import { sessionContinuityQuery } from '@/features/combat'

export function SessionJournalLink() {
  const campaign = useCampaign()
  const { state } = useAuth()
  const { t } = useTranslation()
  const saved = useQuery(sessionContinuityQuery(state.user!.id, campaign.id))
  return (
    <Button
      component={Link}
      to={`/campaign/${campaign.id}/session`}
      w="fit-content"
      variant="light"
      leftSection={<BookOpen size={18} aria-hidden />}
    >
      {t(saved.data?.revision ? 'session.resume' : 'session.journal')}
    </Button>
  )
}

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
