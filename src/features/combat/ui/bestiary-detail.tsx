import { useRef, useState } from 'react'
import { ActionIcon, Alert, Button, Group, Loader, Menu, Stack, Text, Title } from '@mantine/core'
import {
  Bookmark,
  Copy,
  CopyPlus,
  Ellipsis,
  EyeOff,
  FilePenLine,
  Pencil,
  SlidersHorizontal,
  Swords,
  Trash2,
} from 'lucide-react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { signed, statBlockToText, StatBlockView, type CreatureListItem } from '@/features/bestiary'
import { entryOrigin, type EntryOrigin } from '@/shared/api/pack-origins'
import { usePackOrigins } from '@/shared/ui/pack-origins-context'
import type { EncounterSummary } from '../domain/combat'
import { AddStatus, AddStepper } from './bestiary-add'
import { BestiaryCompareItem } from './bestiary-encounter'
import { FavouriteMark } from './bestiary-widgets'
import { useCreatureArt, type ArtNotice } from './creature-art-editor'
import { focusAddButton } from './focus-add'
import { itemArt, type useCreatureCatalog } from './creatures'
import type { useEncounterAdd } from './encounter-add'
import { VersionNote } from './official-bestiary'

/** RYT-174: the stat block's source line by the creature's origin in the base pack. */
function creatureSource(t: TFunction, origin: EntryOrigin | null, page: number, pack: string) {
  if (origin === 'own') return pack
  return origin === 'changed'
    ? t('bestiary.srdPageChanged', { page, pack })
    : t('bestiary.srdPage', { page })
}

/**
 * One creature's stat block, in the table order (the numbers first, then the actions, then the
 * reference), with its bar: the add to an encounter and the `···` menu with everything else.
 * A phone's sheet keeps the bar at its bottom; the side pane keeps it at its top.
 */
export function CreatureDetail({
  campaignId,
  item,
  catalog,
  favorite,
  toggleFavorite,
  encounterId,
  encounter,
  target,
  adds,
  encounterPath,
  comparisonKeys,
  toggleComparison,
  inSheet,
  onViewArt,
  onAdd,
  onCustomise,
  onEdit,
  onComplete,
  onDuplicate,
  onDelete,
  onHide,
  onRestore,
  onCopied,
}: {
  campaignId: string
  item: CreatureListItem
  catalog: ReturnType<typeof useCreatureCatalog>
  favorite: boolean
  toggleFavorite: () => void
  /** `?encounter=`: the bestiary was opened from that fight. */
  encounterId: string | null
  /** That fight, when it still takes creatures (the comparison tray belongs to it). */
  encounter?: EncounterSummary
  /** Where the one-tap add goes: the fight in the address, the one in progress or the last opened. */
  target: { id: string; name: string } | null
  adds: ReturnType<typeof useEncounterAdd>
  encounterPath: (id: string) => string
  comparisonKeys: readonly string[]
  toggleComparison: (key: string) => void
  inSheet: boolean
  /** The image viewer is open (it owns Escape over the phone sheet). */
  onViewArt: (open: boolean) => void
  /** Opens the add dialog: another encounter, a new one, or the table options. */
  onAdd: (target: HTMLElement) => void
  onCustomise: (target: HTMLElement) => void
  onEdit: (target: HTMLElement) => void
  onComplete: (target: HTMLElement) => void
  onDuplicate: (target: HTMLElement) => void
  onDelete: (target: HTMLElement) => void
  /** RYT-094: hides a pack creature (and its campaign version) in this campaign. */
  onHide: (target: HTMLElement) => void
  /** RYT-089: deletes the campaign version, the official creature is listed again. */
  onRestore: (target: HTMLElement) => void
  onCopied: () => void
}) {
  const { t } = useTranslation()
  const origins = usePackOrigins()
  const block = catalog.blockFor(item)
  const template = item.source === 'homebrew' ? catalog.templateById.get(item.id) : undefined
  const row = item.source === 'srd' ? catalog.rows.get(item.id) : undefined
  const headingId = `creature-${item.key.replace(/[^a-z0-9]/gi, '-')}`
  const based = item.srdId ? catalog.srdName(item.srdId) : null
  const badges = item.version ? <VersionNote onRestore={onRestore} /> : null
  // Menu items unmount with the menu: overlays they open return focus to the ⋯ button.
  const more = useRef<HTMLButtonElement>(null)
  const fromMenu = () => more.current ?? document.body
  const [artNotice, setArtNotice] = useState<ArtNotice | null>(null)
  const art = useCreatureArt({
    campaignId,
    name: item.name,
    side: item.side ?? 'enemy',
    type: item.type,
    target: template
      ? { templateId: template.id, revision: template.revision }
      : { srdId: item.id },
    imagePath: item.imagePath ?? null,
    packPath: item.packPath ?? null,
    art: itemArt(item),
    credit: catalog.artCredit(item.artId),
    notice: artNotice,
    onNotice: setArtNotice,
    onViewing: onViewArt,
    returnTo: more,
  })
  const line = adds.line?.key === item.key ? adds.line : null
  const edit =
    item.source === 'srd' ? (
      // RYT-089: editing an official creature keeps the change in this campaign.
      <Menu.Item
        leftSection={<Pencil size={16} aria-hidden="true" />}
        disabled={!block}
        onClick={() => onCustomise(fromMenu())}
      >
        {t('bestiary.edit')}
      </Menu.Item>
    ) : (
      <Menu.Item
        leftSection={<Pencil size={16} aria-hidden="true" />}
        onClick={() => onEdit(fromMenu())}
      >
        {t('bestiary.edit')}
      </Menu.Item>
    )
  const actions = (
    <div
      className={inSheet ? 'bst-actions is-sticky' : 'bst-actions is-pinned'}
      data-encounter={target ? true : undefined}
    >
      <AddStatus
        line={line}
        error={adds.error}
        trigger={adds.trigger}
        onDismissError={adds.clear}
        onUndo={() => {
          // The Undo button goes with the line it undid: focus returns to the add button.
          const from = document.activeElement
          void adds.undo().then(() => focusAddButton(from, { leaving: null }))
        }}
        encounterPath={encounterPath}
      />
      <div className="bst-bar">
        {target ? (
          <AddStepper
            // Another creature or encounter starts at one again.
            key={`${target.id}:${item.key}`}
            encounterName={target.name}
            pending={adds.pending}
            onAdd={(count) => adds.add({ item, block, row, count, encounter: target })}
          />
        ) : (
          !encounterId && (
            <Button
              className="bst-action-primary"
              data-bst-add
              leftSection={<Swords size={16} aria-hidden="true" />}
              onClick={(e) => onAdd(e.currentTarget)}
            >
              {t('bestiary.addToEncounter')}
            </Button>
          )
        )}
        <Menu position="top-end" withinPortal zIndex={420}>
          <Menu.Target>
            <ActionIcon
              ref={more}
              variant="subtle"
              size={44}
              data-bst-more
              aria-label={t('bestiary.more', { name: item.name })}
            >
              <Ellipsis size={20} aria-hidden="true" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            {target && !encounterId && (
              <Menu.Item
                leftSection={<Swords size={16} aria-hidden="true" />}
                onClick={() => onAdd(fromMenu())}
              >
                {t('bestiary.add.another')}
              </Menu.Item>
            )}
            {!encounterId && edit}
            {!encounterId && (
              <Menu.Item
                leftSection={
                  <Bookmark
                    size={16}
                    aria-hidden="true"
                    fill={favorite ? 'currentColor' : 'none'}
                  />
                }
                onClick={toggleFavorite}
              >
                {t(favorite ? 'bestiary.favorite.remove' : 'bestiary.favorite.add', {
                  name: item.name,
                })}
              </Menu.Item>
            )}
            {encounter && (
              <BestiaryCompareItem item={item} keys={comparisonKeys} onToggle={toggleComparison} />
            )}
            {encounterId && target && (
              <Menu.Item
                leftSection={<SlidersHorizontal size={16} aria-hidden="true" />}
                onClick={() => onAdd(fromMenu())}
              >
                {t('bestiary.context.addOptions')}
              </Menu.Item>
            )}
            {item.source === 'homebrew' && !block && (
              <Menu.Item
                leftSection={<FilePenLine size={16} aria-hidden="true" />}
                onClick={() => onComplete(fromMenu())}
              >
                {t('bestiary.complete')}
              </Menu.Item>
            )}
            {(block || template) && (
              <Menu.Item
                leftSection={<CopyPlus size={16} aria-hidden="true" />}
                onClick={() => onDuplicate(fromMenu())}
              >
                {t('bestiary.variant')}
              </Menu.Item>
            )}
            {block && (
              <Menu.Item
                leftSection={<Copy size={16} aria-hidden="true" />}
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(statBlockToText(block, catalog.language))
                    .then(onCopied, () => undefined)
                }}
              >
                {t('bestiary.copyText')}
              </Menu.Item>
            )}
            {art.menuItems}
            {!encounterId && item.packId && (item.source === 'srd' || item.version) && (
              <Menu.Item
                leftSection={<EyeOff size={16} aria-hidden="true" />}
                onClick={() => onHide(fromMenu())}
              >
                {t('bestiary.packs.hide')}
              </Menu.Item>
            )}
            {!encounterId && item.source === 'homebrew' && !item.version && (
              <Menu.Item
                className="bst-menu-danger"
                leftSection={<Trash2 size={16} aria-hidden="true" />}
                onClick={() => onDelete(fromMenu())}
              >
                {t('bestiary.delete')}
              </Menu.Item>
            )}
          </Menu.Dropdown>
        </Menu>
      </div>
    </div>
  )
  const footnote = [
    based ? t('bestiary.basedOn', { name: based }) : null,
    row
      ? creatureSource(
          t,
          entryOrigin(origins, 'creature', item.id),
          row.pages[catalog.language],
          origins.title?.[catalog.language] ?? '',
        )
      : template?.notes
        ? t('bestiary.notesLine', { notes: template.notes })
        : null,
  ]
    .filter(Boolean)
    .join(' · ')
  if (!block) {
    if (item.source === 'srd' && catalog.bodiesPending)
      return (
        <Group gap="sm" p="md" role="status">
          <Loader size="sm" />
          <Text>{t('bestiary.loading')}</Text>
        </Group>
      )
    // A quick creature: the core numbers only.
    return (
      <Stack gap="md" className="bst-detail-inner">
        {/* First in the tab order; on phones it sticks to the bottom of the sheet (CSS order). */}
        {actions}
        <div className="bst-detail-frame">
          <Stack gap="md" className="bst-quick">
            <header className="sb-head">
              {art.thumb}
              <div className="sb-title">
                <div className="sb-name-row">
                  <Title order={inSheet ? 2 : 3} id={headingId} className="sb-name">
                    {item.name}
                  </Title>
                  {favorite && <FavouriteMark />}
                </div>
                <p className="sb-meta">
                  {[
                    item.type ? t(`bestiary.type.${item.type}`) : null,
                    item.cr !== null ? t('bestiary.crShort', { cr: item.cr }) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
                {badges}
              </div>
            </header>
            {art.extras}
            <dl className="sb-core">
              <div>
                <dt>{t('bestiary.ac')}</dt>
                <dd>{item.ac}</dd>
              </div>
              <div>
                <dt>{t('bestiary.hp')}</dt>
                <dd>{item.hp}</dd>
              </div>
              <div>
                <dt>{t('bestiary.initiative')}</dt>
                <dd>{signed(item.initiative)}</dd>
              </div>
            </dl>
            {template?.notes && <Text className="combat-notes">{template.notes}</Text>}
            <Alert variant="light" role="note" icon={<FilePenLine size={18} aria-hidden="true" />}>
              <Text size="sm">{t('bestiary.quickHint')}</Text>
              <Button mt="xs" variant="light" onClick={(e) => onComplete(e.currentTarget)}>
                {t('bestiary.complete')}
              </Button>
            </Alert>
          </Stack>
        </div>
      </Stack>
    )
  }
  return (
    <Stack gap="md" className="bst-detail-inner">
      {actions}
      <div className="bst-detail-frame">
        {art.extras}
        <StatBlockView
          block={block}
          level={inSheet ? 2 : 3}
          headingId={headingId}
          media={art.thumb}
          badges={badges}
          nameMark={favorite ? <FavouriteMark /> : null}
          playOrder
          footnote={footnote || undefined}
        />
      </div>
    </Stack>
  )
}
