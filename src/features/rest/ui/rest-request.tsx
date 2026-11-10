import { useState, type RefObject } from 'react'
import { Alert, Button, Group, Modal, Stack, Text } from '@mantine/core'
import { Moon, Sunset } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { newRequestId } from '@/shared/lib/request-id'
import { useRestAction } from '../api'
import type { RestKind } from '../domain/rest'
import { RecoveryLines } from './recovery'
import { isEmptyRecovery, type RecoveryView } from './recovery-view'
import { useRestPanel } from './rest-context'

/**
 * RYT-080: the rest buttons of the sheet. First the check (is there anything to get back?), then
 * "Ask the group?", then the panel opens for everyone. A request already open leads to the panel.
 * `preview` is what the asking character would get back; null for the DM (no own character).
 */
export function RestRequestDialog({
  kind,
  preview,
  canRest,
  opener,
  onClose,
}: {
  kind: RestKind | null
  preview: RecoveryView | null
  /** False at 0 HP: the character cannot rest, but may still ask for the group. */
  canRest: boolean
  /** The rest button; focus returns to it when the panel closes. */
  opener: RefObject<HTMLElement | null>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { campaignId, state, openPanel } = useRestPanel()
  const action = useRestAction(campaignId ?? '')
  // One id per opened dialog, so a retried tap never asks twice.
  const [requestId, setRequestId] = useState(newRequestId)
  const [shownKind, setShownKind] = useState(kind)
  if (kind !== shownKind) {
    setShownKind(kind)
    if (kind) {
      setRequestId(newRequestId())
      action.reset()
    }
  }
  const pending = state?.status === 'open'
  const nothing = preview !== null && (!canRest || isEmptyRecovery(preview))
  const Icon = kind === 'short' ? Sunset : Moon
  const ask = () => {
    if (!kind || action.isPending) return
    action.mutate(
      { kind: 'request', rest: kind, requestId },
      {
        onSuccess: () => {
          onClose()
          openPanel(opener.current)
        },
      },
    )
  }
  const goToPanel = () => {
    onClose()
    openPanel(opener.current)
  }
  const title = pending
    ? t('rest.ask.openTitle')
    : nothing
      ? t('rest.ask.nothingTitle')
      : t(kind === 'short' ? 'rest.ask.titleShort' : 'rest.ask.titleLong')
  return (
    <Modal
      opened={kind !== null}
      onClose={() => !action.isPending && onClose()}
      title={title}
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <Stack>
        {pending ? (
          <Text>{t('rest.ask.openBody')}</Text>
        ) : nothing ? (
          <Text>{canRest ? t('rest.ask.nothingBody') : t('rest.ask.zeroHpBody')}</Text>
        ) : (
          <>
            <Text>{preview ? t('rest.ask.body') : t('rest.ask.bodyDm')}</Text>
            {preview && <RecoveryLines view={preview} />}
            {preview && kind === 'short' && (
              <Text size="sm" c="dimmed">
                {t('rest.ask.shortDice')}
              </Text>
            )}
            <Text size="sm" c="dimmed">
              {t('rest.ask.voters')}
            </Text>
          </>
        )}
        {action.isError && (
          <Alert color="red" role="alert">
            {t(`rest.error.${action.error.message}` as 'rest.error.unavailable', {
              defaultValue: t('rest.error.unavailable'),
            })}
          </Alert>
        )}
        <Group justify="flex-end" gap="xs" className="rest-ask-actions">
          <Button variant="subtle" onClick={onClose} aria-disabled={action.isPending || undefined}>
            {pending ? t('rest.close') : t('action.cancel')}
          </Button>
          {pending || (action.isError && action.error.message === 'open') ? (
            <Button data-autofocus onClick={goToPanel}>
              {t('rest.ask.goToPanel')}
            </Button>
          ) : (
            <Button
              data-autofocus
              leftSection={<Icon size={18} aria-hidden="true" />}
              aria-disabled={action.isPending || undefined}
              aria-busy={action.isPending || undefined}
              onClick={ask}
            >
              {nothing ? t('rest.ask.anyway') : t('rest.ask.confirm')}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  )
}
