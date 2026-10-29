import { useEffect } from 'react'
import { Alert, Button, Stack } from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { campaignsQuery } from '../api'
import { CampaignContext } from '../campaign-context'
import { QueryFeedback } from './feedback'

export function CampaignBoundary() {
  const { campaignId } = useParams()
  const { state } = useAuth()
  const userId = state.user!.id
  const { t } = useTranslation()
  const client = useQueryClient()
  const query = useQuery(campaignsQuery(userId))
  const campaign = !query.isError ? query.data?.find((item) => item.id === campaignId) : undefined
  useEffect(() => {
    if (campaign?.role !== 'dm') {
      void client.cancelQueries({ queryKey: ['private', userId, 'campaign', campaignId] })
      client.removeQueries({ queryKey: ['private', userId, 'campaign', campaignId] })
    }
  }, [client, userId, campaignId, campaign?.role])
  useEffect(
    () => () => {
      void client.cancelQueries({ queryKey: ['private', userId, 'campaign', campaignId] })
      client.removeQueries({ queryKey: ['private', userId, 'campaign', campaignId] })
    },
    [client, userId, campaignId],
  )
  if (query.isPending || query.isError)
    return (
      <QueryFeedback
        pending={query.isPending}
        error={query.isError}
        retry={() => void query.refetch()}
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
      <Outlet key={`${userId}:${campaign.id}:${campaign.role}`} />
    </CampaignContext.Provider>
  )
}
