import { useState } from 'react'
import { Button, Group, Modal, Stack, Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { useBackToClose } from '@/shared/ui/use-back-to-close'

/** A sample round the DM can step through alone; nothing in the campaign changes. */
export function SoloRehearsal({ close }: { close: () => void }) {
  const { t } = useTranslation()
  const [turn, setTurn] = useState(0)
  const participants = ['Arin', 'Bea', t('dm.rehearsalCreature')]
  const round = Math.floor(turn / participants.length) + 1
  useBackToClose(true, close)
  return (
    <Modal
      opened
      onClose={close}
      title={t('dm.rehearse')}
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <Stack>
        <Text size="sm" c="dimmed">
          {t('dm.rehearseHint')}
        </Text>
        <div aria-live="polite" aria-atomic="true">
          <Text fw={700}>
            {t('combat.turn.announce', { name: participants[turn % participants.length]!, round })}
          </Text>
          <Text>
            {t('combat.turn.upNext')} · {participants[(turn + 1) % participants.length]}
          </Text>
        </div>
        <Group justify="space-between">
          <Button variant="subtle" disabled={turn === 0} onClick={() => setTurn(0)}>
            {t('dm.restartRehearsal')}
          </Button>
          <Button data-autofocus onClick={() => setTurn((current) => current + 1)}>
            {t('combat.turn.next')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}
