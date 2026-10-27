import { Badge, Button, Group, Paper, Stack, Text, Title } from '@mantine/core'
import { ArrowLeft } from 'lucide-react'
import { Link, useLocation } from 'react-router'
import { useTranslation } from 'react-i18next'
import { modules } from '@/app/modules'

export function ModulePage() {
  const { t } = useTranslation()
  const { pathname } = useLocation()
  const module = modules.find((item) => item.path === pathname)
  return (
    <Stack gap="xl">
      <Button
        component={Link}
        to="/"
        variant="subtle"
        leftSection={<ArrowLeft size={18} />}
        w="fit-content"
      >
        {t('common.back')}
      </Button>
      <div>
        <Text className="eyebrow">{t('nav.adventure')}</Text>
        <Title order={1}>{t(module?.label ?? 'page.notFound')}</Title>
      </div>
      <Paper p="xl">
        <Stack>
          <Group>
            <Badge variant="light">{t(module ? 'common.planned' : 'page.unknown')}</Badge>
            {module && (
              <Text size="sm" c="dimmed">
                {module.ticket}
              </Text>
            )}
          </Group>
          <Title order={2}>{t(module?.summary ?? 'page.noPath')}</Title>
          <Text c="dimmed">{t(module ? 'page.planned' : 'page.return')}</Text>
        </Stack>
      </Paper>
    </Stack>
  )
}
