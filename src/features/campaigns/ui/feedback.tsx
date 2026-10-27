import { Alert, Button, Group, Loader, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { MembershipError } from '../domain/campaign'

export function QueryFeedback({
  pending,
  error,
  retry,
}: {
  pending: boolean
  error: boolean
  retry: () => void
}) {
  const { t } = useTranslation()
  if (pending)
    return (
      <Group role="status">
        <Loader size="sm" />
        <Text>{t('common.loading')}</Text>
      </Group>
    )
  if (error)
    return (
      <Alert color="red" title={t('query.error')} role="alert">
        <Button variant="light" onClick={retry}>
          {t('common.retry')}
        </Button>
      </Alert>
    )
  return null
}
export function ActionFeedback({ error }: { error: Error | null }) {
  const { t } = useTranslation()
  return error ? (
    <Alert color="red" role="alert" title={t('action.error')}>
      {t(`action.${error instanceof MembershipError ? error.reason : 'unavailable'}`)}
    </Alert>
  ) : null
}
