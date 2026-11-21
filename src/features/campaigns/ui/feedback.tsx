import { Alert, Button, Group, Loader, Text } from '@mantine/core'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { WifiOff } from 'lucide-react'
import { MembershipError } from '../domain/campaign'
import { causeOf } from './load-cause'

/** Loading and failure of one query. `cause` is the query's error object: it picks a specific
 * line (offline, forbidden, not found); every failure keeps a way out. */
export function QueryFeedback({
  pending,
  error,
  retry,
  cause,
  secondary = false,
}: {
  pending: boolean
  error: boolean
  retry: () => void
  cause?: unknown
  /** A section beside the screen's main content: offline it is one quiet line, not a second card. */
  secondary?: boolean
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
    // RYT-128: offline, nothing went wrong with the screen itself. It reloads by itself once the
    // network returns (the app refetches what is on screen); Retry stays for the impatient.
    if (kind === 'offline' && secondary)
      return (
        <Text size="sm" c="dimmed" className="offline-inline">
          <WifiOff size={16} aria-hidden="true" />
          {t('query.offlineHint')}
        </Text>
      )
    if (kind === 'offline')
      return (
        <div className="offline-placeholder">
          <WifiOff size={28} aria-hidden="true" className="offline-placeholder-icon" />
          <Text fw={650} className="offline-placeholder-title">
            {t('query.offlineTitle')}
          </Text>
          <Text size="sm" c="dimmed">
            {t('query.offlineHint')}
          </Text>
          <Button variant="light" onClick={retry}>
            {t('common.retry')}
          </Button>
        </div>
      )
    const line = {
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
