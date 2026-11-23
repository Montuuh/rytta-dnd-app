import { Stack, Title } from '@mantine/core'
import { useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import type { Campaign } from '../domain/campaign'
import { QueryFeedback } from './feedback'

/**
 * RYT-160: a section of a kept campaign without its data: its title and the screen's offline (or
 * failed) notice. The section's own screen loads when the list does.
 */
export function CampaignShellSection({
  campaign,
  titleFor,
  error,
  retry,
}: {
  campaign: Campaign
  titleFor?: (pathname: string) => string | null
  error: unknown
  retry: () => void
}) {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const key = titleFor?.(pathname)
  // The campaign home is the DM's command center; a Player's home is titled by the campaign.
  const title = key
    ? t(key as 'campaign.manage')
    : campaign.role === 'dm'
      ? t('campaign.manage')
      : campaign.name
  // The table screen has no page frame around it (no header, no margins).
  const bare = pathname.endsWith('/tabletop-table')
  return (
    <Stack gap="lg" p={bare ? 'md' : undefined}>
      <Title order={1} className={key || campaign.role === 'dm' ? undefined : 'user-copy'}>
        {title}
      </Title>
      <QueryFeedback pending={false} error retry={retry} cause={error} />
    </Stack>
  )
}
