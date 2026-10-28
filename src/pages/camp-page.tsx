import { ModuleCard } from '@/app/module-card'
import { Badge, Button, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { ArrowRight, Compass, Feather, ShieldCheck } from 'lucide-react'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { modules } from '@/app/modules'

export function CampPage() {
  const { t } = useTranslation()
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
          <ModuleCard to={path} enabled={path === '/party'} key={path}>
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
          </ModuleCard>
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
