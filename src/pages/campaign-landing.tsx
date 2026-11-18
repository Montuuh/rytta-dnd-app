import { useQuery } from '@tanstack/react-query'
import { CalendarDays, ChevronRight, Shield, Swords } from 'lucide-react'
import { Link, Navigate } from 'react-router'
import { Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { useCampaign, useCampaignView } from '@/features/campaigns'
import { useAuth } from '@/features/auth'
import { encountersQuery, isLive } from '@/features/combat'
import { PageHead } from '@/shared/ui/page-head'
import './campaign-landing.css'

export function CampaignLanding() {
  const campaign = useCampaign()
  const { playerPreview } = useCampaignView()
  const { state } = useAuth()
  const { t } = useTranslation()
  const dm = campaign.role === 'dm' && !playerPreview
  const base = `/campaign/${campaign.id}`
  const encounters = useQuery({ ...encountersQuery(state.user!.id, campaign.id), enabled: dm })
  if (!dm) return <Navigate to={`${base}/party`} replace />
  const live = encounters.data?.find((encounter) => isLive(encounter.status))
  const destinations = [
    {
      label: live ? 'dm.resumeEncounter' : 'module.combat',
      detail: live?.name,
      icon: Swords,
      path: live ? `combat/${live.id}` : 'combat',
    },
    { label: 'dm.prepareSession', icon: CalendarDays, path: 'members?panel=prepare' },
    { label: 'dm.manageCampaign', icon: Shield, path: 'members' },
  ] as const
  return (
    <Stack>
      <PageHead title={t('campaign.manage')} />
      <nav aria-label={t('campaign.manage')} className="campaign-destinations">
        {destinations.map(({ label, icon: Icon, path, ...rest }) => (
          <Link key={label} to={`${base}/${path}`}>
            <Icon size={24} aria-hidden="true" />
            <span>
              <strong>{t(label)}</strong>
              {'detail' in rest && rest.detail && (
                <Text size="sm" className="user-copy">
                  {rest.detail}
                </Text>
              )}
            </span>
            <ChevronRight size={19} aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </Stack>
  )
}
