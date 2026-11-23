import { useEffect } from 'react'
import { Alert, Button, Stack } from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { campaignPackImagesOptions, noPackImages } from '@/shared/api/pack-images'
import { PackImagesContext } from '@/shared/ui/pack-images-context'
import { campaignsQuery } from '../api'
import { CampaignContext } from '../campaign-context'
import { recordCampaignVisit } from '../domain/recent-campaign'
import { CampaignShellSection } from './campaign-shell'
import { useCampaignShell } from './use-campaign-shell'
import { QueryFeedback } from './feedback'
import { keepsStaleData } from './load-cause'

export function CampaignBoundary({
  shellTitle,
}: {
  /** RYT-160: the translation key of a section's title by path (null for the campaign home). */
  shellTitle?: (pathname: string) => string | null
} = {}) {
  const { campaignId } = useParams()
  const { state } = useAuth()
  const userId = state.user!.id
  const { t } = useTranslation()
  const client = useQueryClient()
  const query = useQuery(campaignsQuery(userId))
  const usable = !query.isError || keepsStaleData(query.data, query.error)
  const campaign = usable ? query.data?.find((item) => item.id === campaignId) : undefined
  const visitedId = campaign?.id
  useEffect(() => {
    if (visitedId) recordCampaignVisit(userId, visitedId)
  }, [userId, visitedId])
  const shell = useCampaignShell(userId, campaignId, query)
  // RYT-172: the pictures of the campaign's packs, for every screen inside it.
  const packImages = useQuery(
    campaignPackImagesOptions(campaign ? userId : undefined, campaign?.id),
  )
  // Players still need characters; only drop DM-only campaign caches when the role is not DM.
  useEffect(() => {
    if (campaign?.role === 'dm') return
    for (const leaf of ['members', 'sent-invitations', 'assignments', 'audit-events'] as const) {
      const queryKey = ['private', userId, 'campaign', campaignId, leaf]
      void client.cancelQueries({ queryKey })
      client.removeQueries({ queryKey })
    }
  }, [client, userId, campaignId, campaign?.role])
  useEffect(
    () => () => {
      void client.cancelQueries({ queryKey: ['private', userId, 'campaign', campaignId] })
      client.removeQueries({ queryKey: ['private', userId, 'campaign', campaignId] })
    },
    [client, userId, campaignId],
  )
  if (shell)
    return (
      <CampaignShellSection
        campaign={shell}
        titleFor={shellTitle}
        error={query.error}
        retry={() => void query.refetch()}
      />
    )
  if (query.isPending || !usable)
    return (
      <QueryFeedback
        pending={query.isPending}
        error={query.isError}
        retry={() => void query.refetch()}
        cause={query.error}
      />
    )
  if (!campaign)
    return (
      <Stack>
        <Alert>{t('campaign.unavailable')}</Alert>
        <Button component={Link} to="/">
          {t('campaign.back')}
        </Button>
      </Stack>
    )
  return (
    <CampaignContext.Provider value={campaign}>
      <PackImagesContext.Provider value={packImages.data ?? noPackImages}>
        <Outlet key={`${userId}:${campaign.id}:${campaign.role}`} />
      </PackImagesContext.Provider>
    </CampaignContext.Provider>
  )
}
