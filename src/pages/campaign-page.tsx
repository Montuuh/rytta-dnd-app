import { ModuleCard } from '@/app/module-card'
import { Badge, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { Eye, Lock, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { revelationsQuery, useCampaign, useCampaignView } from '@/features/campaigns'
import { modules } from '@/app/modules'

export function CampaignPage() {
  const campaign = useCampaign()
  const { playerPreview } = useCampaignView()
  const { state } = useAuth()
  const { t } = useTranslation()
  const effectiveDm = campaign.role === 'dm' && !playerPreview
  const enabledKeys = new Set(campaign.player_modules ?? ['party'])
  const revelations = useQuery({
    ...revelationsQuery(state.user!.id, campaign.id),
    enabled: !!state.user,
  })
  const visibleModules = effectiveDm
    ? modules.slice(1)
    : modules.slice(1).filter(({ path }) => enabledKeys.has(path.replace(/^\//, '')))
  const visibleRevelations =
    !revelations.isError && revelations.data
      ? revelations.data.filter((item) => effectiveDm || item.visibility === 'party')
      : []

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="flex-start" gap="sm">
        <div>
          <Title order={1}>{campaign.name}</Title>
          <Text mt="sm" c="dimmed" className="user-copy">
            {campaign.description || t('campaign.planned')}
          </Text>
        </div>
        {effectiveDm && (
          <Badge variant="light">{t('dm.activeCount', { count: enabledKeys.size })}</Badge>
        )}
      </Group>
      <SimpleGrid cols={{ base: 1, sm: 2, lg: effectiveDm ? 3 : 2 }}>
        {visibleModules.map(({ path, label, summary, icon: Icon, ...module }) => {
          const key = path.replace(/^\//, '')
          const activeForPlayers = enabledKeys.has(key)
          const implemented = 'implemented' in module && module.implemented === true
          return (
            <ModuleCard
              to={`/campaign/${campaign.id}${path}`}
              enabled={path === '/party' || activeForPlayers || (effectiveDm && implemented)}
              key={path}
            >
              <Stack gap="xs">
                <Group justify="space-between" gap="xs">
                  <Group gap="sm" wrap="nowrap">
                    <span className="module-icon">
                      <Icon size={20} aria-hidden="true" />
                    </span>
                    <Title order={2}>{t(label)}</Title>
                  </Group>
                  {effectiveDm && (
                    <Badge
                      variant={activeForPlayers ? 'light' : 'outline'}
                      leftSection={
                        activeForPlayers ? (
                          <Eye size={12} aria-hidden="true" />
                        ) : (
                          <Lock size={12} aria-hidden="true" />
                        )
                      }
                    >
                      {t(activeForPlayers ? 'dm.moduleActive' : 'dm.moduleHidden')}
                    </Badge>
                  )}
                </Group>
                <Text size="sm" c="dimmed">
                  {t(
                    path === '/party' || activeForPlayers || implemented
                      ? summary
                      : 'common.planned',
                  )}
                </Text>
              </Stack>
            </ModuleCard>
          )
        })}
      </SimpleGrid>
      <section aria-labelledby="discoveries-heading">
        <Stack gap="md">
          <Group justify="space-between" align="flex-start">
            <div>
              <Title order={2} id="discoveries-heading">
                {t('dm.discoveriesTitle')}
              </Title>
              <Text size="sm" c="dimmed" mt={4}>
                {t('dm.discoveriesHint')}
              </Text>
            </div>
          </Group>
          {visibleRevelations.length === 0 ? (
            <Paper p="lg">
              <Text c="dimmed">
                {t(effectiveDm ? 'dm.noRevelations' : 'dm.noPlayerRevelations')}
              </Text>
            </Paper>
          ) : (
            <SimpleGrid cols={{ base: 1, sm: 2 }}>
              {visibleRevelations.map((item) => (
                <Paper
                  key={item.id}
                  p="lg"
                  className={
                    item.visibility === 'dm_only' ? 'revelation-card-draft' : 'revelation-card'
                  }
                >
                  <Stack gap="xs">
                    <Group justify="space-between" align="flex-start">
                      <Badge
                        variant="light"
                        leftSection={<Sparkles size={12} aria-hidden="true" />}
                      >
                        {t(`dm.category.${item.category}`)}
                      </Badge>
                      {effectiveDm && (
                        <Badge variant={item.visibility === 'party' ? 'filled' : 'outline'}>
                          {t(
                            item.visibility === 'party'
                              ? 'dm.visibilityParty'
                              : 'dm.visibilityDmOnly',
                          )}
                        </Badge>
                      )}
                    </Group>
                    <Title order={3} className="user-copy">
                      {item.title}
                    </Title>
                    {item.summary && (
                      <Text size="sm" c="dimmed" className="user-copy">
                        {item.summary}
                      </Text>
                    )}
                  </Stack>
                </Paper>
              ))}
            </SimpleGrid>
          )}
        </Stack>
      </section>
    </Stack>
  )
}
