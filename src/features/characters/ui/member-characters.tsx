import { useState } from 'react'
import { Alert, Button, Group, Modal, NativeSelect, Stack, Text } from '@mantine/core'
import { Link } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useBackToClose } from '@/shared/ui/use-back-to-close'
import { useActivateCharacter, useCharacterAction } from '../api'
import { rosterOf, unassignedOf, type RosterEntry } from '../domain/roster'

export type MemberCharacterChoice = {
  user_id: string
  display_name: string
  mode: 'assign' | 'switch'
}

export function MemberCharacters({
  campaignId,
  userId,
  roster,
  choose,
}: {
  campaignId: string
  userId: string
  roster: RosterEntry[]
  choose: (mode: MemberCharacterChoice['mode']) => void
}) {
  const { t } = useTranslation()
  const own = rosterOf(roster, userId)
  const reserves = own.entries.filter((entry) => !entry.is_active)
  return (
    <div className="member-characters">
      {own.active ? (
        <Link className="member-sheet" to={`/campaign/${campaignId}/party/${own.active.id}`}>
          {t('roster.sheetOf', { name: own.active.name })}
        </Link>
      ) : (
        <Text size="sm">{t('dm.noActiveCharacter')}</Text>
      )}
      {reserves.length > 0 && (
        <Text size="sm" className="user-copy">
          {t('roster.reserve')} · {reserves.map((entry) => entry.name).join(', ')}
        </Text>
      )}
      {own.archived.length > 0 && (
        <details>
          <summary>
            {t('roster.archived')} ({own.archived.length})
          </summary>
          <Text size="sm" className="user-copy">
            {own.archived.map((entry) => entry.name).join(', ')}
          </Text>
        </details>
      )}
      <Group gap="xs">
        {reserves.some((entry) => !entry.absent) && (
          <Button variant="subtle" size="compact-sm" onClick={() => choose('switch')}>
            {t('dm.switchActive')}
          </Button>
        )}
        {own.free > 0 && (!own.active || unassignedOf(roster).length > 0) && (
          <Button variant="subtle" size="compact-sm" onClick={() => choose('assign')}>
            {t('dm.linkCharacter')}
          </Button>
        )}
      </Group>
    </div>
  )
}

export function MemberCharacterDialog({
  campaignId,
  choice,
  roster,
  close,
}: {
  campaignId: string
  choice: MemberCharacterChoice
  roster: RosterEntry[]
  close: () => void
}) {
  const { t } = useTranslation()
  const [selected, setSelected] = useState('')
  const assign = useCharacterAction(campaignId)
  const activate = useActivateCharacter(campaignId)
  const own = rosterOf(roster, choice.user_id)
  const assigning = choice.mode === 'assign'
  const options = assigning
    ? own.free
      ? unassignedOf(roster).filter((entry) => !entry.absent)
      : []
    : own.entries.filter((entry) => !entry.is_active && !entry.absent)
  const pending = assign.isPending || activate.isPending
  const cancel = () => {
    if (!pending) close()
  }
  useBackToClose(true, cancel)
  const label = t(assigning ? 'dm.linkCharacter' : 'dm.switchActive')
  const apply = () => {
    if (pending || !options.some((entry) => entry.id === selected)) return
    if (assigning)
      assign.mutate(
        { kind: 'assign', characterId: selected, userId: choice.user_id },
        { onSuccess: close },
      )
    else activate.mutate(selected, { onSuccess: close })
  }
  return (
    <Modal
      opened
      onClose={cancel}
      title={label}
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <Stack>
        <Text fw={600} className="user-copy">
          {choice.display_name}
        </Text>
        {options.length ? (
          <NativeSelect
            data-autofocus
            label={t('roster.choose')}
            value={selected}
            onChange={(event) => setSelected(event.currentTarget.value)}
            data={[
              { value: '', label: t('dm.selectCharacter') },
              ...options.map(({ id, name }) => ({ value: id, label: name })),
            ]}
          />
        ) : (
          <>
            <Text>{t(assigning ? 'dm.noFreeCharacter' : 'roster.noCharacters')}</Text>
            <Button component={Link} to={`/campaign/${campaignId}/party`} variant="light">
              {t('module.party')}
            </Button>
          </>
        )}
        {(assign.isError || activate.isError) && (
          <Alert role="alert" color="red">
            {t('characters.unavailable')}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="subtle" disabled={pending} onClick={cancel}>
            {t('action.cancel')}
          </Button>
          {options.length > 0 && (
            <Button
              loading={pending}
              disabled={!options.some((entry) => entry.id === selected)}
              onClick={apply}
            >
              {label}
            </Button>
          )}
        </Group>
      </Stack>
    </Modal>
  )
}
