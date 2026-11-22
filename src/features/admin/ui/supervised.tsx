import { Paper, Stack, Text, Title } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Star } from 'lucide-react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { adminFavouritesQuery, useAdminStatus } from '../api'
import './admin.css'

/** RYT-153: a super admin's favourite campaigns, apart from their own, in My campaigns. */
export function SupervisedCampaigns() {
  const { t } = useTranslation()
  const { state } = useAuth()
  const status = useAdminStatus()
  const favourites = useQuery({
    ...adminFavouritesQuery(state.user?.id ?? ''),
    enabled: status.data?.super_admin === true,
  })
  if (!status.data?.super_admin || !favourites.data?.length) return null
  return (
    <section aria-labelledby="supervised-heading" className="admin-supervised">
      <Title order={2} id="supervised-heading" size="h3">
        {t('superAdmin.supervised.title')}
      </Title>
      <Stack gap="xs" mt="sm">
        {favourites.data.map((campaign) => (
          <Paper
            key={campaign.id}
            component={Link}
            to={`/admin?tab=campaigns&campaign=${campaign.id}`}
            className="admin-supervised-card"
            p="md"
          >
            <Star
              size={18}
              aria-hidden="true"
              fill="currentColor"
              className="admin-supervised-star"
            />
            <span>
              <Text fw={600} className="user-copy">
                {campaign.name}
              </Text>
              <Text size="sm" c="dimmed">
                {campaign.access_expires_at
                  ? t('superAdmin.campaigns.inside')
                  : t('superAdmin.supervised.members', { count: campaign.members })}
              </Text>
            </span>
          </Paper>
        ))}
      </Stack>
    </section>
  )
}
