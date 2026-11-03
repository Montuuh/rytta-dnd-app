import { Button, Group, Modal, Text } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useHomebrewAction } from '../api'
import { GlossaryError, homebrewEntryId, type HomebrewEntry } from '../domain/homebrew'
import { useGlossary } from './glossary-context'

/** Zero-undo, campaign-wide deletion: named in the title, Cancel holds the initial focus. */
export function HomebrewDeleteDialog({
  entry,
  campaignId,
  onClose,
  onDeleted,
}: {
  entry: HomebrewEntry | null
  campaignId: string
  onClose: () => void
  onDeleted: (entry: HomebrewEntry) => void
}) {
  const { t } = useTranslation()
  const catalog = useGlossary()?.catalog
  const action = useHomebrewAction(campaignId)
  const error =
    action.error instanceof GlossaryError ? action.error.code : action.error ? 'unknown' : null
  const close = () => {
    action.reset()
    onClose()
  }
  // The confirmation deletes what the table sees now: a refetch since the menu opened may carry
  // a newer revision of the same entry.
  const live = entry ? (catalog?.byId.get(homebrewEntryId(entry.id))?.homebrew ?? entry) : null
  return (
    <Modal
      opened={entry !== null}
      onClose={close}
      centered
      zIndex={410}
      returnFocus={false}
      classNames={{ content: 'gl-delete-modal' }}
      title={
        <span className="gl-editor-title">
          {t('glossary.hb.deleteTitle', { name: entry?.name ?? '' })}
        </span>
      }
      closeButtonProps={{ 'aria-label': t('glossary.hb.close'), size: 44 }}
    >
      {entry && live && (
        <div className="gl-delete">
          <span className="gl-delete-mark" aria-hidden="true">
            <Trash2 size={20} />
          </span>
          <Text className="gl-delete-body">{t('glossary.hb.confirmDelete')}</Text>
          {error && (
            <Text className="gl-delete-error" role="alert">
              {error === 'unknown' ? t('glossary.hb.deleteError') : t(`glossary.hb.error.${error}`)}
            </Text>
          )}
          <Group className="gl-dialog-actions" justify="flex-end" gap="sm">
            <Button variant="default" onClick={close} data-autofocus>
              {t('glossary.hb.cancel')}
            </Button>
            <Button
              color="red"
              variant="light"
              leftSection={<Trash2 size={16} aria-hidden="true" />}
              loading={action.isPending}
              onClick={() =>
                action.mutate(
                  { kind: 'delete', entryId: live.id, revision: live.revision },
                  {
                    onSuccess: () => {
                      action.reset()
                      notifications.show({
                        message: t('glossary.hb.deleted'),
                        position: 'bottom-center',
                      })
                      onDeleted(live)
                    },
                  },
                )
              }
            >
              {t('glossary.hb.delete')}
            </Button>
          </Group>
        </div>
      )}
    </Modal>
  )
}
