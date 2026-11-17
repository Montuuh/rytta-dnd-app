import { Button, Group, Modal, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { useBackToClose } from '@/shared/ui/use-back-to-close'

/** "Leave without saving?" for the target a guarded link pointed at. */
export function LeaveDialog({
  target,
  onKeep,
  onDiscard,
  title,
  body,
  discardLabel,
}: {
  target: string | null
  onKeep: () => void
  onDiscard: (target: string) => void
  title?: string
  body?: string
  discardLabel?: string
}) {
  const { t } = useTranslation()
  useBackToClose(target !== null, onKeep)
  return (
    <Modal
      opened={target !== null}
      onClose={onKeep}
      title={title ?? t('panel.leaveTitle')}
      closeButtonProps={{ 'aria-label': t('panel.close'), size: 44 }}
    >
      <Stack>
        <Text>{body ?? t('panel.leaveBody')}</Text>
        <Group justify="flex-end">
          <Button variant="default" data-autofocus onClick={onKeep}>
            {t('panel.keepEditing')}
          </Button>
          <Button
            variant="default"
            className="panel-danger-button"
            onClick={() => target && onDiscard(target)}
          >
            {discardLabel ?? t('panel.discardAndLeave')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
