import { useState } from 'react'
import { Alert, Button, Paper, Stack, Text, Title } from '@mantine/core'
import { Compass } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'

export function SignInPage() {
  const { t } = useTranslation()
  const { state, controller } = useAuth()
  const [busy, setBusy] = useState(false)
  const signIn = async () => {
    setBusy(true)
    await controller?.signIn()
    setBusy(false)
  }
  return (
    <Paper p="xl" className="sign-in-card">
      <Stack gap="lg">
        <Compass size={48} strokeWidth={1} aria-hidden="true" />
        <div>
          <Text className="eyebrow">RYTTA</Text>
          <Title order={1}>{t('auth.title')}</Title>
        </div>
        <Text c="dimmed">{t('auth.intro')}</Text>
        {state.issue && (
          <Alert color="red" role="alert" title={t('auth.problem')}>
            <Text>{t(`auth.issue.${state.issue}`)}</Text>
            {state.issue === 'sign-out' && (
              <Button mt="sm" variant="light" onClick={() => void controller?.signOut()}>
                {t('auth.signOut')}
              </Button>
            )}
          </Alert>
        )}
        <Button onClick={() => void signIn()} loading={busy}>
          {t('auth.google')}
        </Button>
        {state.issue === 'connection' && (
          <Button variant="subtle" onClick={() => void controller?.retry()}>
            {t('common.retry')}
          </Button>
        )}
        <Text size="sm" c="dimmed">
          {t('auth.open')}
        </Text>
      </Stack>
    </Paper>
  )
}
