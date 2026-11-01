import { useEffect, useState } from 'react'
import { ActionIcon, Group, Text } from '@mantine/core'
import { RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { relativeTime } from '@/shared/lib/relative-time'

/** Compact refresh action: an icon button that spins while fetching, preceded by a visible
 * relative "updated" stamp so freshness never depends on hover. */
export function RefreshControl({
  onRefresh,
  fetching,
  updatedAt,
  label,
}: {
  onRefresh: () => void
  fetching: boolean
  updatedAt?: number
  label?: string
}) {
  const { t, i18n } = useTranslation()
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => window.clearInterval(id)
  }, [])
  const stamp =
    updatedAt && updatedAt > 0
      ? (relativeTime(updatedAt, Math.max(now, updatedAt), i18n.language) ?? t('common.justNow'))
      : null
  return (
    <Group gap={4} wrap="nowrap" className="refresh-control">
      {stamp && (
        <Text size="xs" c="dimmed" className="refresh-stamp" aria-live="off">
          {fetching ? t('common.refreshing') : t('common.checkedAgo', { time: stamp })}
        </Text>
      )}
      <ActionIcon
        variant="subtle"
        size={44}
        aria-label={label ?? t('hub.refresh')}
        title={label ?? t('hub.refresh')}
        aria-busy={fetching || undefined}
        onClick={onRefresh}
        className="refresh-button"
        data-fetching={fetching || undefined}
      >
        <RefreshCw size={20} aria-hidden="true" />
      </ActionIcon>
    </Group>
  )
}
