import { Alert, Button, Group, Loader, Text } from '@mantine/core'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { MembershipError } from '../domain/campaign'
import { CampaignAccessError } from '../domain/errors'

type Cause = 'offline' | 'forbidden' | 'notFound' | 'unknown'

/** The known causes of a failed load. Anything else keeps the generic line. */
function causeOf(error: unknown): Cause {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return 'offline'
  const message = error instanceof Error ? error.message : ''
  if (
    (error instanceof CampaignAccessError && error.code === 'unavailable') ||
    message === 'forbidden'
  )
    return 'forbidden'
  if (message === 'gone' || message === 'not-found') return 'notFound'
  return 'unknown'
}

/** Loading and failure of one query. `cause` is the query's error object: it picks a specific
 * line (offline, forbidden, not found); every failure keeps a way out. */
export function QueryFeedback({
  pending,
  error,
  retry,
  cause,
}: {
  pending: boolean
  error: boolean
  retry: () => void
  cause?: unknown
}) {
  const { t } = useTranslation()
  if (pending)
    return (
      <Group role="status">
        <Loader size="sm" />
        <Text>{t('common.loading')}</Text>
      </Group>
    )
  if (error) {
    const kind = causeOf(cause)
    const line = {
      offline: t('query.offline'),
      forbidden: t('query.forbidden'),
      notFound: t('query.notFound'),
      unknown: t('query.hint'),
    }[kind]
    return (
      <Alert color="red" title={t('query.error')} role="alert">
        <Text size="sm" mb="sm">
          {line}
        </Text>
        {kind === 'forbidden' || kind === 'notFound' ? (
          <Button component={Link} to="/" variant="light">
            {t('campaign.back')}
          </Button>
        ) : (
          <Button variant="light" onClick={retry}>
            {t('common.retry')}
          </Button>
        )}
      </Alert>
    )
  }
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
