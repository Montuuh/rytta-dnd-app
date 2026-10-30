import {
  ActionIcon,
  Group,
  NativeSelect,
  SegmentedControl,
  Stack,
  Text,
  VisuallyHidden,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core'
import { Moon, Sun } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useEffect, useId } from 'react'

export function PreferencesControls({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation()
  const appearanceId = useId()
  const scheme = useComputedColorScheme('dark')
  const { setColorScheme } = useMantineColorScheme()
  useEffect(() => {
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute('content', scheme === 'dark' ? '#140f0b' : '#f7efe2')
  }, [scheme])
  const language = (
    <NativeSelect
      aria-label={t('preferences.language')}
      label={compact ? undefined : t('preferences.language')}
      value={i18n.resolvedLanguage}
      onChange={(event) => void i18n.changeLanguage(event.currentTarget.value)}
      data={[
        { value: 'es', label: 'Español' },
        { value: 'en', label: 'English' },
      ]}
      className="language-select"
    />
  )
  if (compact)
    return (
      <Group gap="xs" wrap="nowrap">
        <ActionIcon
          size={44}
          variant="subtle"
          aria-label={t(scheme === 'dark' ? 'preferences.toLight' : 'preferences.toDark')}
          title={t(scheme === 'dark' ? 'preferences.toLight' : 'preferences.toDark')}
          onClick={() => setColorScheme(scheme === 'dark' ? 'light' : 'dark')}
        >
          {scheme === 'dark' ? <Sun size={21} /> : <Moon size={21} />}
        </ActionIcon>
        {language}
      </Group>
    )
  return (
    <Stack gap="lg">
      <div>
        <Text id={appearanceId} size="sm" fw={500} mb="xs">
          {t('preferences.theme')}
        </Text>
        <SegmentedControl
          aria-labelledby={appearanceId}
          value={scheme}
          onChange={(value) => setColorScheme(value === 'light' ? 'light' : 'dark')}
          data={[
            {
              value: 'dark',
              label: (
                <span className="theme-option" title={t('preferences.dark')}>
                  <Moon size={22} aria-hidden="true" />
                  <VisuallyHidden>{t('preferences.dark')}</VisuallyHidden>
                </span>
              ),
            },
            {
              value: 'light',
              label: (
                <span className="theme-option" title={t('preferences.light')}>
                  <Sun size={22} aria-hidden="true" />
                  <VisuallyHidden>{t('preferences.light')}</VisuallyHidden>
                </span>
              ),
            },
          ]}
        />
      </div>
      {language}
      <Text c="dimmed" size="sm">
        {t('preferences.saved')}
      </Text>
    </Stack>
  )
}
