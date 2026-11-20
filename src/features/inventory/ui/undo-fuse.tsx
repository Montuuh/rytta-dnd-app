import { CloseButton, Text, UnstyledButton } from '@mantine/core'
import { Undo2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { UNDO_WINDOW_MS } from '../domain/item'
import { useFuseLeft } from './use-fuse-left'

export type FuseEntry = { eventId: string; message: string; startedAt: number }

/** A ribbon with a burning fuse: the undo window drains visibly, then the ribbon goes out. */
export function UndoFuse({
  entry,
  pending,
  onUndo,
  onDismiss,
}: {
  entry: FuseEntry
  pending: boolean
  onUndo: () => void
  onDismiss: () => void
}) {
  const { t } = useTranslation()
  const left = useFuseLeft(entry.startedAt, onDismiss)
  const minutes = Math.ceil(left / 60_000)
  return (
    <div className="undo-fuse" role="status">
      <span
        className="undo-fuse-line"
        style={{ transform: `scaleX(${left / UNDO_WINDOW_MS})` }}
        aria-hidden="true"
      />
      <Text size="sm" className="undo-fuse-message user-copy">
        {entry.message}
      </Text>
      <UnstyledButton className="undo-seal" disabled={pending} onClick={onUndo}>
        <Undo2 size={18} aria-hidden="true" />
        <span>{t('inventory.undo.action')}</span>
        <span className="visually-hidden">{t('inventory.undo.left', { minutes })}</span>
      </UnstyledButton>
      <CloseButton size={44} aria-label={t('inventory.undo.dismiss')} onClick={onDismiss} />
    </div>
  )
}
