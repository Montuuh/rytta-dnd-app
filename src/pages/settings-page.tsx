import { Badge, Paper, Stack, Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { config } from '@/shared/lib/config'
import { PreferencesControls } from '@/shared/ui/preferences-controls'

export function SettingsPage() {
  const { t } = useTranslation()
  return (
    <Stack gap="xl">
      <div>
        <Text className="eyebrow">{t('settings.eyebrow')}</Text>
        <Title order={1}>{t('nav.settings')}</Title>
      </div>
      <Paper p="xl">
        <Stack>
          <Title order={2}>{t('preferences.title')}</Title>
          <PreferencesControls />
        </Stack>
      </Paper>
      <Paper p="xl">
        <Stack>
          <Badge w="fit-content">
            {t(config.VITE_DATA_MODE === 'demo' ? 'settings.demo' : 'settings.backend')}
          </Badge>
          <Title order={2}>{t('settings.honest')}</Title>
          <Text>
            {t(
              config.VITE_DATA_MODE === 'demo'
                ? 'settings.demoDescription'
                : 'settings.backendDescription',
            )}
          </Text>
          <Text>
            {t('settings.connection', {
              status: t(
                config.VITE_SUPABASE_URL && config.VITE_SUPABASE_PUBLISHABLE_KEY
                  ? 'settings.provided'
                  : 'settings.missing',
              ),
            })}
          </Text>
          <Text>{t('settings.docs')}</Text>
        </Stack>
      </Paper>
    </Stack>
  )
}
