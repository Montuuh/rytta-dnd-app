import { useState } from 'react'
import { Button, Group, Menu, Stack, Text } from '@mantine/core'
import { Modal } from '@/shared/ui/overlays'
import { Library, Pencil, RotateCcw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import type { CombatantTemplate } from '../domain/combat'

/** RYT-094: the campaign's creature packs are chosen in the DM Command Center's Content tab. */
const contentPath = (campaignId: string) => `/campaign/${campaignId}/members?panel=content`

/** RYT-089: going back to a pack creature from the campaign's version of it, waiting for confirmation. */
export type OfficialAsk = { kind: 'restore'; template: CombatantTemplate }

function ChooseInContent({ campaignId, filled }: { campaignId: string; filled: boolean }) {
  const { t } = useTranslation()
  return (
    <Button
      component={Link}
      to={contentPath(campaignId)}
      variant={filled ? 'filled' : 'light'}
      leftSection={<Library size={16} aria-hidden="true" />}
    >
      {t('bestiary.packs.choose')}
    </Button>
  )
}

/**
 * A campaign that uses no creature pack (RYT-094): with no creatures at all the list is this
 * invitation to Content, its one primary action; with its own creatures it is a quiet line above them.
 */
export function PacksMissing({ campaignId, compact }: { campaignId: string; compact: boolean }) {
  const { t } = useTranslation()
  if (compact)
    return (
      <div className="bst-official-line" role="note">
        <Text size="sm">{t('bestiary.packs.none')}</Text>
        <ChooseInContent campaignId={campaignId} filled={false} />
      </div>
    )
  return (
    <div className="bst-empty bst-official-empty">
      <span className="bst-detail-empty-icon" aria-hidden="true">
        <Library size={28} />
      </span>
      <Text fw={600}>{t('bestiary.official.emptyTitle')}</Text>
      <ChooseInContent campaignId={campaignId} filled />
    </div>
  )
}

/** Where creatures are picked for a fight (adding combatants, encounter ideas) without any pack. */
export function OfficialElsewhere({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation()
  return (
    <Stack gap={6} align="flex-start">
      <Text size="sm">{t('bestiary.packs.none')}</Text>
      <ChooseInContent campaignId={campaignId} filled={false} />
    </Stack>
  )
}

/** The way to the campaign's creature packs (hidden creatures, packs), in the head menu. */
export function PacksMenuItem({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation()
  return (
    <Menu.Item
      component={Link}
      to={contentPath(campaignId)}
      leftSection={<Library size={16} aria-hidden="true" />}
    >
      {t('bestiary.packs.link')}
    </Menu.Item>
  )
}

/**
 * A campaign version of a pack creature, in place of the source pills: what it is, and the way
 * back to the pack's version beside it (RYT-089).
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

/** The question before deleting a campaign version: what is lost cannot be recovered. */
export function OfficialDialog({
  ask,
  pending,
  onConfirm,
  onClose,
}: {
  ask: OfficialAsk | null
  pending: boolean
  onConfirm: (ask: OfficialAsk) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  // The dialog keeps its last question while it fades out, so it never closes empty.
  const [shown, setShown] = useState(ask)
  if (ask && ask !== shown) setShown(ask)
  const current = ask ?? shown
  return (
    <Modal
      opened={ask !== null}
      onClose={onClose}
      title={current ? t('bestiary.official.restoreTitle', { name: current.template.name }) : ''}
      classNames={{ title: 'bst-dialog-title' }}
      // The panel places focus after each answer (the opener or the creature).
      returnFocus={false}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
      // Above the phone stat block sheet it may open from (z-index 300).
      zIndex={400}
    >
      <Text mb="xs" className="bst-dialog-body">
        {t('bestiary.official.restoreBody')}
      </Text>
      <Group justify="flex-end" mt="md" className="bst-dialog-actions">
        <Button variant="subtle" data-autofocus onClick={onClose}>
          {t('action.cancel')}
        </Button>
        <Button
          color="red"
          variant="light"
          leftSection={<RotateCcw size={16} aria-hidden="true" />}
          loading={pending}
          onClick={() => ask && onConfirm(ask)}
        >
          {t('bestiary.official.restore')}
        </Button>
      </Group>
    </Modal>
  )
}
