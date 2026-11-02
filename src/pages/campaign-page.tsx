import { ModuleCard } from '@/app/module-card'
import { Accordion, Badge, Group, Paper, SimpleGrid, Stack, Text, Title } from '@mantine/core'
import { ArrowRight, Eye, Hourglass, Lock, Sparkles } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { revelationsQuery, useCampaign, useCampaignView } from '@/features/campaigns'
import { modules } from '@/app/modules'

/** One badge shape for every visibility state; icon + text carry the meaning, not color. */
function VisibilityBadge({ visible, labels }: { visible: boolean; labels: [string, string] }) {
  return (
    <Badge
      variant="outline"
      className="visibility-badge"
      data-visible={visible || undefined}
      leftSection={
        visible ? <Eye size={13} aria-hidden="true" /> : <Lock size={13} aria-hidden="true" />
      }
    >
      {visible ? labels[0] : labels[1]}
    </Badge>
  )
}

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
  const keyOf = (path: string) => path.replace(/^\//, '')
  const isImplemented = (module: (typeof modules)[number]) =>
    'implemented' in module && module.implemented === true
  const available = modules
    .slice(1)
    .filter((module) =>
      effectiveDm
        ? isImplemented(module) || enabledKeys.has(keyOf(module.path))
        : enabledKeys.has(keyOf(module.path)),
    )
  const planned = effectiveDm
    ? modules
        .slice(1)
        .filter((module) => !isImplemented(module) && !enabledKeys.has(keyOf(module.path)))
    : []
  const visibleRevelations =
    !revelations.isError && revelations.data
      ? revelations.data.filter((item) => effectiveDm || item.visibility === 'party')
      : []

  return (
    <Stack gap="xl">
      <Group justify="space-between" align="flex-start" gap="sm">
        <div className="page-intro">
          <Title order={1}>{campaign.name}</Title>
          <Text mt="sm" c="dimmed" className="user-copy">
            {campaign.description || t('campaign.planned')}
          </Text>
        </div>
        {effectiveDm && (
          <Badge variant="light" size="lg" leftSection={<Eye size={14} aria-hidden="true" />}>
            {t('dm.activeCount', { count: enabledKeys.size })}
          </Badge>
        )}
      </Group>
      {effectiveDm && (
        <ModuleCard to={`/campaign/${campaign.id}/items`} enabled>
          <Stack gap="xs" p="md">
            <Title order={2}>{t('catalogue.title')}</Title>
            <Text>{t('catalogue.intro')}</Text>
          </Stack>
        </ModuleCard>
      )}
      <SimpleGrid
        cols={{ base: 1, xs: 2, lg: effectiveDm ? 3 : 2 }}
        className={effectiveDm ? 'module-grid' : 'module-grid is-player'}
      >
        {available.map((module) => {
          const { path, label, summary, icon: Icon } = module
          const activeForPlayers = enabledKeys.has(keyOf(path))
          const implemented = isImplemented(module) || path === '/party'
          return (
            <ModuleCard to={`/campaign/${campaign.id}${path}`} enabled key={path}>
              <Stack gap="sm" className="module-card-body">
                <Group justify="space-between" gap="xs" wrap="nowrap" align="flex-start">
                  <span className="module-icon">
                    <Icon size={effectiveDm ? 22 : 30} aria-hidden="true" />
                  </span>
                  {effectiveDm && (
                    <VisibilityBadge
                      visible={activeForPlayers}
                      labels={[t('dm.moduleActive'), t('dm.moduleHidden')]}
                    />
                  )}
                </Group>
                <Title order={2} className="module-title">
                  {t(label)}
                </Title>
                <Text size="sm" c="dimmed">
                  {t(implemented ? summary : 'common.planned')}
                </Text>
                <Group gap={6} className="module-open" aria-hidden="true">
                  <Text size="sm" fw={600}>
                    {t('campaign.openModule')}
                  </Text>
                  <ArrowRight size={16} />
                </Group>
              </Stack>
            </ModuleCard>
          )
        })}
      </SimpleGrid>
      {planned.length > 0 && (
        <Accordion variant="separated" className="coming-soon" chevronPosition="right">
          <Accordion.Item value="planned">
            <Accordion.Control icon={<Hourglass size={20} aria-hidden="true" />}>
              <Group gap="sm" wrap="wrap" justify="space-between" pr="xs">
                <div>
                  <Text fw={700}>{t('campaign.comingSoon')}</Text>
                  <Text size="sm" c="dimmed">
                    {t('campaign.comingSoonCount', { count: planned.length })}
                  </Text>
                </div>
                <span className="coming-soon-icons" aria-hidden="true">
                  {planned.map(({ path, icon: Icon }) => (
                    <Icon key={path} size={18} />
                  ))}
                </span>
              </Group>
            </Accordion.Control>
            <Accordion.Panel>
              <Text size="sm" c="dimmed" mb="sm">
                {t('campaign.comingSoonHint')}
              </Text>
              <ul className="coming-soon-list">
                {planned.map(({ path, label, summary, icon: Icon }) => (
                  <li key={path}>
                    <Icon size={18} aria-hidden="true" />
                    <div>
                      <Text fw={600} size="sm">
                        {t(label)}
                      </Text>
                      <Text size="sm" c="dimmed">
                        {t(summary)}
                      </Text>
                    </div>
                  </li>
                ))}
              </ul>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}
      <section aria-labelledby="discoveries-heading">
        <Stack gap="md">
          <div>
            <Title order={2} id="discoveries-heading">
              {t('dm.discoveriesTitle')}
            </Title>
            <Text size="sm" c="dimmed" mt={4}>
              {t('dm.discoveriesHint')}
            </Text>
          </div>
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
                        leftSection={<Sparkles size={13} aria-hidden="true" />}
                      >
                        {t(`dm.category.${item.category}`)}
                      </Badge>
                      {effectiveDm && (
                        <VisibilityBadge
                          visible={item.visibility === 'party'}
                          labels={[t('dm.visibilityParty'), t('dm.visibilityDmOnly')]}
                        />
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
