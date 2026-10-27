import {
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Compass, Feather, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { campaignsQuery, CampaignAccessError } from '@/features/campaigns'
import { config } from '@/shared/lib/config'
import { modules } from '@/app/modules'

export function CampPage() {
  const { t } = useTranslation()
  const query = useQuery(campaignsQuery)
  if (query.isPending)
    return (
      <Group role="status">
        <Loader size="sm" />
        <Text>{t('common.loadingCamp')}</Text>
      </Group>
    )
  if (query.isError)
    return (
      <Alert color="red" title={t('campaigns.unavailable')}>
        <Stack>
          <Text>
            {t(
              query.error instanceof CampaignAccessError && query.error.code === 'sign-in'
                ? 'error.signIn'
                : 'error.campaigns',
            )}
          </Text>
          <Button variant="light" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        </Stack>
      </Alert>
    )
  if (config.VITE_DATA_MODE === 'supabase')
    return (
      <Stack>
        <Title order={1}>{t('campaigns.title')}</Title>
        <Text>{t('campaigns.next')}</Text>
        {query.data.length ? (
          query.data.map((c) => (
            <Paper key={c.id} p="lg">
              <Title order={2}>{c.name}</Title>
              <Text>{c.description}</Text>
            </Paper>
          ))
        ) : (
          <Paper p="xl">{t('campaigns.empty')}</Paper>
        )}
      </Stack>
    )
  return (
    <Stack gap="xl">
      <div>
        <Text className="eyebrow">{t('camp.welcome')}</Text>
        <Title order={1} maw={720}>
          {t('camp.title')}
        </Title>
        <Text c="dimmed" mt="sm" maw={600}>
          {t('camp.intro')}
        </Text>
      </div>
      <Paper className="campaign-hero" p="xl" radius="lg">
        <div className="compass-art" aria-hidden="true">
          <Compass strokeWidth={0.6} />
        </div>
        <Stack gap="md" className="hero-copy">
          <Group>
            <Badge color="forest" variant="light">
              {t('camp.sample')}
            </Badge>
            <Text size="sm">{t('camp.chapter')}</Text>
          </Group>
          <Title order={2}>{t('camp.sampleName')}</Title>
          <Text maw={390}>{t('camp.sampleDescription')}</Text>
          <Button
            component={Link}
            to="/party"
            rightSection={<ArrowRight size={17} />}
            w="fit-content"
          >
            {t('camp.explore')}
          </Button>
        </Stack>
      </Paper>
      <Group justify="space-between">
        <div>
          <Title order={2}>{t('camp.fingertips')}</Title>
          <Text c="dimmed" size="sm" mt={4}>
            {t('camp.journey')}
          </Text>
        </div>
        <Text className="section-note">{t('camp.foundation')}</Text>
      </Group>
      <SimpleGrid cols={{ base: 1, xs: 2, lg: 3 }} spacing="md">
        {modules.slice(1, 7).map(({ path, label, summary, icon: Icon }) => (
          <Paper component={Link} to={path} className="module-card" key={path} p="lg">
            <Group justify="space-between">
              <span className="module-icon">
                <Icon size={23} strokeWidth={1.5} aria-hidden="true" />
              </span>
              <ArrowRight size={17} aria-hidden="true" />
            </Group>
            <Title order={3} mt="md">
              {t(label)}
            </Title>
            <Text size="sm" c="dimmed" mt="xs">
              {t(summary)}
            </Text>
            <Text size="xs" mt="lg" fw={600}>
              {t('common.planned')}
            </Text>
          </Paper>
        ))}
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xl">
        <Group align="flex-start" wrap="nowrap">
          <ShieldCheck className="feature-icon" aria-hidden="true" />
          <div>
            <Text fw={600}>{t('camp.dm')}</Text>
            <Text c="dimmed" size="sm">
              {t('camp.permissions')}
            </Text>
          </div>
        </Group>
        <Group align="flex-start" wrap="nowrap">
          <Feather className="feature-icon" aria-hidden="true" />
          <div>
            <Text fw={600}>{t('camp.table')}</Text>
            <Text c="dimmed" size="sm">
              {t('camp.homebrew')}
            </Text>
          </div>
        </Group>
      </SimpleGrid>
    </Stack>
  )
}
