import { ActionIcon, Button, Menu, Tooltip } from '@mantine/core'
import { usePhone } from '@/shared/ui/use-viewport'
import { Ellipsis, Pencil, Plus, Trash2 } from 'lucide-react'
import { useRef } from 'react'
import { useTranslation } from 'react-i18next'
import type { HomebrewEntry } from '../domain/homebrew'
import { useGlossary } from './glossary-context'

export type EntryActionsTarget =
  | { homebrew: HomebrewEntry }
  /** An SRD entry: the only action is to add a house rule to it. */
  | { srd: { id: string; name: string } }

/**
 * What the viewer can do with one entry. Homebrew shows edit and delete as labelled icon
 * buttons (they fold into one menu on phones); an SRD entry shows a labelled button to add a house rule.
 * Renders nothing when the viewer cannot write, so Players without the module and the demo
 * never see a control.
 */
export function EntryActions({ target }: { target: EntryActionsTarget }) {
  const { t } = useTranslation()
  const manage = useGlossary()?.manage
  const phone = usePhone()
  const menuTrigger = useRef<HTMLButtonElement>(null)
  if (!manage) return null

  if ('srd' in target) {
    const { id, name } = target.srd
    return (
      <div className="gl-actions">
        <Button
          className="gl-add-house"
          variant="subtle"
          leftSection={<Plus size={16} aria-hidden="true" />}
          aria-label={t('glossary.hb.addHouseRuleTo', { name })}
          onClick={(event) => manage.create(id, event.currentTarget)}
        >
          {t('glossary.hb.addHouseRuleShort')}
        </Button>
      </div>
    )
  }

  const entry = target.homebrew
  if (phone)
    return (
      <div className="gl-actions">
        <Menu position="bottom-end" withinPortal zIndex={500}>
          <Menu.Target>
            <ActionIcon
              ref={menuTrigger}
              variant="subtle"
              size={44}
              aria-label={t('glossary.hb.actions', { name: entry.name })}
            >
              <Ellipsis size={20} aria-hidden="true" />
            </ActionIcon>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Item
              leftSection={<Pencil size={16} aria-hidden="true" />}
              onClick={() => manage.edit(entry, menuTrigger.current)}
            >
              {t('glossary.hb.edit')}
            </Menu.Item>
            <Menu.Item
              color="red"
              leftSection={<Trash2 size={16} aria-hidden="true" />}
              onClick={() => manage.remove(entry, menuTrigger.current)}
            >
              {t('glossary.hb.delete')}
            </Menu.Item>
          </Menu.Dropdown>
        </Menu>
      </div>
    )

  return (
    <div
      className="gl-actions"
      role="group"
      aria-label={t('glossary.hb.actions', { name: entry.name })}
    >
      <Tooltip
        label={t('glossary.hb.edit')}
        events={{ hover: true, focus: true, touch: false }}
        zIndex={500}
      >
        <ActionIcon
          variant="subtle"
          size={44}
          aria-label={t('glossary.hb.editNamed', { name: entry.name })}
          onClick={(event) => manage.edit(entry, event.currentTarget)}
        >
          <Pencil size={20} aria-hidden="true" />
        </ActionIcon>
      </Tooltip>
      <Tooltip
        label={t('glossary.hb.delete')}
        events={{ hover: true, focus: true, touch: false }}
        zIndex={500}
      >
        <ActionIcon
          variant="subtle"
          color="red"
          size={44}
          aria-label={t('glossary.hb.deleteNamed', { name: entry.name })}
          onClick={(event) => manage.remove(entry, event.currentTarget)}
        >
          <Trash2 size={20} aria-hidden="true" />
        </ActionIcon>
      </Tooltip>
    </div>
  )
}
