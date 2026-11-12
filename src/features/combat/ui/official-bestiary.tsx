import { useRef, useState } from 'react'
import { Button, Group, Menu, Modal, Stack, Text } from '@mantine/core'
import { BookDown, BookMinus, ChevronDown, Library, Pencil, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { CreatureListItem } from '@/features/bestiary'
import type { CombatantTemplate, SrdBestiary } from '../domain/combat'

/** RYT-089: what the DM is about to do with the official bestiary, waiting for confirmation. */
export type OfficialAsk =
  | { kind: 'download' }
  | { kind: 'remove'; item: CreatureListItem }
  | { kind: 'removeAll' }
  | { kind: 'restore'; template: CombatantTemplate }

/**
 * A campaign without the official bestiary (RYT-089, ADR 039): with no creatures at all the list is
 * this invitation, its one primary action; with its own creatures it is a quiet line above them.
 */
export function OfficialMissing({
  count,
  compact,
  onDownload,
}: {
  /** Official creatures in the catalogue. */
  count: number
  /** The campaign has creatures of its own: a line above the list instead of the empty state. */
  compact: boolean
  onDownload: (target: HTMLElement) => void
}) {
  const { t } = useTranslation()
  const action = (
    <Button
      variant={compact ? 'light' : 'filled'}
      leftSection={<BookDown size={16} aria-hidden="true" />}
      onClick={(event) => onDownload(event.currentTarget)}
    >
      {t('bestiary.official.download')}
    </Button>
  )
  if (compact)
    return (
      <div className="bst-official-line" role="note">
        <Text size="sm">{t('bestiary.official.missing')}</Text>
        {action}
      </div>
    )
  return (
    <div className="bst-empty bst-official-empty">
      <span className="bst-detail-empty-icon" aria-hidden="true">
        <BookDown size={28} />
      </span>
      <Text fw={600}>{t('bestiary.official.emptyTitle')}</Text>
      {action}
      <Text size="sm" c="dimmed">
        {t('bestiary.official.source', { count })}
      </Text>
    </div>
  )
}

/**
 * Where creatures are picked for a fight (adding combatants, encounter ideas) in a campaign without
 * the official bestiary: why the SRD is missing and the way to the bestiary that downloads it.
 */
export function OfficialElsewhere({ campaignId, total }: { campaignId: string; total: number }) {
  const { t } = useTranslation()
  return (
    <Stack gap={6} align="flex-start">
      <Text size="sm">{t('bestiary.official.elsewhere', { total })}</Text>
      <Button
        component={Link}
        to={`/campaign/${campaignId}/members?panel=bestiary`}
        variant="light"
        leftSection={<BookDown size={16} aria-hidden="true" />}
      >
        {t('combat.bestiaryLink.open')}
      </Button>
    </Stack>
  )
}

/**
 * The official bestiary's own actions once downloaded, under a named button so the way back is seen,
 * not remembered: bring back removed creatures, remove the whole official bestiary.
 */
export function OfficialMenu({
  state,
  onAsk,
}: {
  state: SrdBestiary
  onAsk: (ask: OfficialAsk, target: HTMLElement) => void
}) {
  const { t } = useTranslation()
  // Menu items unmount with the menu: the question returns focus to this button.
  const trigger = useRef<HTMLButtonElement>(null)
  const ask = (next: OfficialAsk) => trigger.current && onAsk(next, trigger.current)
  return (
    <Menu position="bottom-end" withinPortal zIndex={420}>
      <Menu.Target>
        <Button
          ref={trigger}
          variant="default"
          leftSection={<Library size={16} aria-hidden="true" />}
          rightSection={<ChevronDown size={14} aria-hidden="true" />}
        >
          {t('bestiary.official.menu')}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {state.removed.length > 0 && (
          <Menu.Item
            leftSection={<RotateCcw size={16} aria-hidden="true" />}
            onClick={() => ask({ kind: 'download' })}
          >
            {t('bestiary.official.bringBack', { count: state.removed.length })}
          </Menu.Item>
        )}
        <Menu.Item
          className="bst-menu-danger"
          leftSection={<BookMinus size={16} aria-hidden="true" />}
          onClick={() => ask({ kind: 'removeAll' })}
        >
          {t('bestiary.official.removeAll')}
        </Menu.Item>
      </Menu.Dropdown>
    </Menu>
  )
}

/**
 * A campaign version of an official creature, in place of the source pills: what it is, and the way
 * back to the official creature beside it (RYT-089).
 */
export function VersionNote({ onRestore }: { onRestore: (target: HTMLElement) => void }) {
  const { t } = useTranslation()
  return (
    <div className="bst-version-note">
      <span className="bst-version-note-text">
        <Pencil size={14} aria-hidden="true" />
        {t('bestiary.official.versionNote')}
      </span>
      <Button
        variant="subtle"
        size="compact-sm"
        leftSection={<RotateCcw size={14} aria-hidden="true" />}
        onClick={(event) => onRestore(event.currentTarget)}
      >
        {t('bestiary.official.restore')}
      </Button>
    </div>
  )
}

/**
 * The question before each change to the official bestiary of the campaign. What is lost comes first
 * and says it cannot be recovered (a campaign version); the way back comes after.
 */
export function OfficialDialog({
  ask,
  count,
  removed,
  versions,
  pending,
  onConfirm,
  onClose,
}: {
  ask: OfficialAsk | null
  /** Official creatures in the catalogue. */
  count: number
  /** Official creatures the DM removed since the download. */
  removed: number
  /** Campaign versions of official creatures. */
  versions: number
  pending: boolean
  onConfirm: (ask: OfficialAsk) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  // The dialog keeps its last question while it fades out, so it never closes empty.
  const [shown, setShown] = useState(ask)
  if (ask && ask !== shown) setShown(ask)
  const current = ask ?? shown
  const text = (() => {
    if (!current) return null
    switch (current.kind) {
      case 'download':
        return removed > 0
          ? {
              title: t('bestiary.official.bringBackTitle'),
              body: [t('bestiary.official.bringBackBody', { count: removed })],
              action: t('bestiary.official.bringBackAction', { count: removed }),
              icon: RotateCcw,
              danger: false,
            }
          : {
              title: t('bestiary.official.downloadTitle'),
              body: [t('bestiary.official.downloadBody', { count })],
              action: t('bestiary.official.downloadAction', { count }),
              icon: BookDown,
              danger: false,
            }
      case 'remove':
        return {
          title: t('bestiary.official.removeTitle', { name: current.item.name }),
          body: [
            ...(current.item.version ? [t('bestiary.official.removeVersion')] : []),
            t('bestiary.official.removeBody'),
          ],
          action: t('bestiary.official.removeAction', { name: current.item.name }),
          icon: BookMinus,
          danger: true,
        }
      case 'removeAll':
        return {
          title: t('bestiary.official.removeAllTitle'),
          body: [
            ...(versions > 0
              ? [t('bestiary.official.removeAllVersions', { count: versions })]
              : []),
            t('bestiary.official.removeAllBody', { count }),
          ],
          action: t('bestiary.official.removeAll'),
          icon: BookMinus,
          danger: true,
        }
      case 'restore':
        return {
          title: t('bestiary.official.restoreTitle', { name: current.template.name }),
          body: [t('bestiary.official.restoreBody')],
          action: t('bestiary.official.restore'),
          icon: RotateCcw,
          danger: true,
        }
    }
  })()
  const Icon = text?.icon ?? BookDown
  return (
    <Modal
      opened={ask !== null}
      onClose={onClose}
      title={text?.title ?? ''}
      classNames={{ title: 'bst-dialog-title' }}
      // The panel places focus after each answer (the opener, the download, or the creature).
      returnFocus={false}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
      // Above the phone stat block sheet it may open from (z-index 300).
      zIndex={400}
    >
      {text?.body.map((line) => (
        <Text key={line} mb="xs" className="bst-dialog-body">
          {line}
        </Text>
      ))}
      <Group justify="flex-end" mt="md" className="bst-dialog-actions">
        <Button variant="subtle" data-autofocus onClick={onClose}>
          {t('action.cancel')}
        </Button>
        <Button
          color={text?.danger ? 'red' : undefined}
          variant={text?.danger ? 'light' : 'filled'}
          leftSection={<Icon size={16} aria-hidden="true" />}
          loading={pending}
          onClick={() => ask && onConfirm(ask)}
        >
          {text?.action}
        </Button>
      </Group>
    </Modal>
  )
}
