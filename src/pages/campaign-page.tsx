import { Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useCampaign } from '@/features/campaigns'
import { modules } from '@/app/modules'

export function CampaignPage() {
  const campaign = useCampaign()
  const { t } = useTranslation()
  return (
    <Stack gap="xl">
      <div>
        <Title order={1}>{campaign.name}</Title>
        <Text mt="sm" c="dimmed" className="user-copy">
          {campaign.description || t('campaign.planned')}
        </Text>
      </div>
      <Group>
        <Button component={Link} to={`/campaign/${campaign.id}/members`}>
          {t('campaign.manage')}
        </Button>
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2 }}>
        {modules.slice(1).map(({ path, label, icon: Icon }) => (
          <Paper
            component={Link}
            to={`/campaign/${campaign.id}${path}`}
            key={path}
            p="lg"
            className="module-card"
          >
            <Group>
              <Icon size={22} aria-hidden="true" />
              <div>
                <Title order={2}>{t(label)}</Title>
                <Text size="sm" c="dimmed">
                  {t(path === '/party' ? 'summary.party' : 'common.planned')}
                </Text>
              </div>
            </Group>
          </Paper>
        ))}
      </SimpleGrid>
    </Stack>
  )
}
