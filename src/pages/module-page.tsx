import { Badge, Button, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { ArrowLeft } from 'lucide-react'
import { Link, useLocation, useParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { modules } from '@/app/modules'

export function ModulePage() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const { campaignId } = useParams()
  const prefix = campaignId ? `/campaign/${campaignId}` : ''
  const module = modules.find((item) => item.path === pathname.slice(prefix.length))
  return (
    <Stack gap="xl">
      {/* The demo landing is /party itself, so a back link there would point at the same page. */}
      {(prefix || module?.path !== '/party') && (
        <Button
          component={Link}
          to={prefix || '/'}
          variant="subtle"
          leftSection={<ArrowLeft size={18} />}
          w="fit-content"
        >
          {t('common.back')}
        </Button>
      )}
      <div>
        <Text className="eyebrow">{t('nav.adventure')}</Text>
        <Title order={1}>{t(module?.label ?? 'page.notFound')}</Title>
      </div>
      <Paper p="xl">
        <Stack>
          <Group>
            <Badge variant="light">{t(module ? 'common.planned' : 'page.unknown')}</Badge>
          </Group>
          <Title order={2}>{t(module?.summary ?? 'page.noPath')}</Title>
          <Text c="dimmed">{t(module ? 'page.planned' : 'page.return')}</Text>
        </Stack>
      </Paper>
    </Stack>
  )
}
