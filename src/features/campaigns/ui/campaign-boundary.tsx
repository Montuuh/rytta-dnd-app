import { useEffect } from 'react'
import { Alert, Badge, Button, Group, Stack, Text } from '@mantine/core'
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
      <Stack gap="xl">
        <div className="campaign-context">
          <Group justify="space-between" align="flex-start">
            <div>
              <Text size="xs" c="dimmed">
                {t('campaign.current')}
              </Text>
              <Group gap="sm">
                <Text fw={600} className="user-copy">
                  {campaign.name}
                </Text>
                <Badge variant="light">{t(`campaign.role.${campaign.role}`)}</Badge>
              </Group>
            </div>
            <Button variant="subtle" component={Link} to="/">
              {t('campaign.switch')}
            </Button>
          </Group>
        </div>
        {query.isFetching && (
          <Text size="sm" c="dimmed" role="status">
            {t('campaign.refreshing')}
          </Text>
        )}
        <Outlet key={`${userId}:${campaign.id}:${campaign.role}`} />
      </Stack>
    </CampaignContext.Provider>
  )
}
