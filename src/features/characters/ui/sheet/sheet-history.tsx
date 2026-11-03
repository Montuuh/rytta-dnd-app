import { useState } from 'react'
import { ActionIcon, Button, Drawer, Paper, Stack, Text, Tooltip } from '@mantine/core'
import { useMediaQuery } from '@mantine/hooks'
import { useQuery } from '@tanstack/react-query'
import { History } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { AuditTimeline, auditEventsQuery, membersQuery, QueryFeedback } from '@/features/campaigns'

/** RYT-031 DM-only per-character audit timeline, opened from the sheet header. */
export function SheetHistory({
  campaignId,
  characterId,
  name,
}: {
  campaignId: string
  characterId: string
  name: string
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const userId = state.user!.id
  const [opened, setOpened] = useState(false)
  const phone = useMediaQuery('(max-width: 47.99em)')
  const events = useQuery({
    ...auditEventsQuery(userId, campaignId, characterId),
    enabled: opened,
  })
  const members = useQuery({ ...membersQuery(userId, campaignId), enabled: opened })
  const memberNames = new Map(
    (members.data ?? []).map((member) => [member.user_id, member.display_name || member.email]),
  )
  return (
    <>
      <Button
        visibleFrom="sm"
        className="sheet-tool"
        leftSection={<History size={16} aria-hidden="true" />}
        aria-haspopup="dialog"
        onClick={() => setOpened(true)}
      >
        {t('audit.open')}
      </Button>
      <Tooltip label={t('audit.open')} events={{ hover: true, focus: true, touch: true }}>
        <ActionIcon
          hiddenFrom="sm"
          size={44}
          className="sheet-tool"
          aria-label={t('audit.open')}
          aria-haspopup="dialog"
          onClick={() => setOpened(true)}
        >
          <History size={20} aria-hidden="true" />
        </ActionIcon>
      </Tooltip>
      <Drawer
        opened={opened}
        onClose={() => setOpened(false)}
        position={phone ? 'bottom' : 'right'}
        size={phone ? '85%' : 'md'}
        title={t('audit.sheetTitle', { name })}
        className="sheet-history"
        closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
      >
        <Stack>
          <Text size="sm" c="dimmed">
            {t('audit.sheetHint')}
          </Text>
          <QueryFeedback
            pending={events.isPending}
            error={events.isError}
            retry={() => void events.refetch()}
          />
          {events.data &&
            (events.data.length > 0 ? (
              <AuditTimeline
                events={events.data}
                memberNames={memberNames}
                now={events.dataUpdatedAt}
                showCharacter={false}
              />
            ) : (
              <Paper p="lg">
                <Text c="dimmed">{t('audit.sheetEmpty')}</Text>
              </Paper>
            ))}
        </Stack>
      </Drawer>
    </>
  )
}
