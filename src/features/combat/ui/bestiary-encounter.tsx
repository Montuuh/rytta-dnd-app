import { useRef, useState, type MouseEvent } from 'react'
import { ActionIcon, Button, Group, Stack, Text, Title } from '@mantine/core'
import { Check, GitCompareArrows, Plus, Users, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CreatureListItem, StatBlock } from '@/features/bestiary'
import type { EncounterSummary } from '../domain/combat'
import { NumberDial } from './bestiary-widgets'
import { npcEntryFor, useSpellLabel } from './creatures'
import { useRunner } from './helpers'
import { ErrorAlert } from './parts'

const comparisonLimit = 3

export function BestiaryComparisonToggle({
  item,
  keys,
  onToggle,
  labeled = false,
}: {
  item: CreatureListItem
  keys: readonly string[]
  onToggle: (key: string) => void
  labeled?: boolean
}) {
  const { t } = useTranslation()
  const selected = keys.includes(item.key)
  const disabled = !selected && keys.length >= comparisonLimit
  const Icon = selected ? Check : GitCompareArrows
  if (labeled) {
    return (
      <Button
        variant="subtle"
        aria-pressed={selected}
        aria-label={t('bestiary.compare.toggle', { name: item.name })}
        leftSection={<Icon size={16} aria-hidden="true" />}
        onClick={() => onToggle(item.key)}
        disabled={disabled}
      >
        {t('bestiary.compare.action')}
      </Button>
    )
  }
  return (
    <ActionIcon
      variant={selected ? 'light' : 'subtle'}
      size={44}
      aria-pressed={selected}
      aria-label={t('bestiary.compare.toggle', { name: item.name })}
      onClick={() => onToggle(item.key)}
      disabled={disabled}
    >
      <Icon size={18} aria-hidden="true" />
    </ActionIcon>
  )
}

export function BestiaryComparison({
  items,
  onRead,
  onRemove,
}: {
  items: CreatureListItem[]
  onRead: (key: string, target: HTMLElement) => void
  onRemove: (key: string) => void
}) {
  const { t } = useTranslation()
  return (
    <section className="bst-comparison" aria-labelledby="bestiary-comparison">
      <Title order={3} size="h4" id="bestiary-comparison">
        {t('bestiary.compare.title', { count: items.length, max: comparisonLimit })}
      </Title>
      <ul className="bst-comparison-list">
        {items.map((item) => (
          <li key={item.key}>
            <Stack gap={2} miw={0} className="bst-comparison-stats">
              <Button variant="subtle" onClick={(event) => onRead(item.key, event.currentTarget)}>
                {item.name}
              </Button>
              <Text size="sm" c="dimmed">
                {item.cr === null
                  ? t('bestiary.group.noCr')
                  : t('bestiary.crShort', { cr: item.cr })}
                {' · '}
                {t(`combat.side.${item.side ?? 'enemy'}`)}
                {item.type && ` · ${t(`bestiary.type.${item.type}`)}`}
              </Text>
              <Text size="sm">{t('bestiary.rowNumbers', { ac: item.ac, hp: item.hp })}</Text>
            </Stack>
            <ActionIcon
              size={44}
              variant="subtle"
              aria-label={t('bestiary.compare.remove', { name: item.name })}
              onClick={(event) => {
                const listItem = event.currentTarget.closest('li')
                const nextItem = listItem?.nextElementSibling ?? listItem?.previousElementSibling
                const next = nextItem?.querySelector<HTMLButtonElement>('button')
                onRemove(item.key)
                requestAnimationFrame(() =>
                  (next ?? document.getElementById('bestiary-search'))?.focus(),
                )
              }}
            >
              <X size={18} aria-hidden="true" />
            </ActionIcon>
          </li>
        ))}
      </ul>
    </section>
  )
}

export function EncounterCreatureAdd({
  campaignId,
  encounter,
  item,
  block,
}: {
  campaignId: string
  encounter: EncounterSummary
  item: CreatureListItem
  block: StatBlock | null
}) {
  const { t } = useTranslation()
  const [count, setCount] = useState<number | string>(1)
  const [added, setAdded] = useState<number | null>(null)
  const { run, pending, error, trigger, clear } = useRunner(campaignId)
  const submitting = useRef(false)
  const intent = useRef<{ count: number; requestId: string } | null>(null)
  const spellLabel = useSpellLabel()
  const valid = typeof count === 'number' && Number.isInteger(count) && count >= 1 && count <= 20
  const add = async (event: MouseEvent<HTMLButtonElement>) => {
    if (!valid || pending || submitting.current) return
    submitting.current = true
    setAdded(null)
    const button = event.currentTarget
    const entry = npcEntryFor(
      item,
      block,
      {
        count,
        side: item.side ?? 'enemy',
        hpMode: 'average',
        alias: '',
        hidden: false,
        share: true,
      },
      spellLabel,
    )
    try {
      const requestId =
        intent.current?.count === count ? intent.current.requestId : crypto.randomUUID()
      intent.current = { count, requestId }
      if (await run({ kind: 'add', encounterId: encounter.id, entries: [entry], requestId })) {
        intent.current = null
        setAdded(count)
        setCount(1)
      }
    } finally {
      submitting.current = false
      requestAnimationFrame(() => {
        if (document.activeElement === document.body) button.focus()
      })
    }
  }
  return (
    <div className="bst-encounter-add">
      {error && (
        <ErrorAlert
          sticky={false}
          trigger={trigger}
          onDismiss={(alert) => {
            if (alert?.contains(document.activeElement)) trigger?.focus()
            clear()
          }}
        >
          {t(`combat.error.${error}`)}
        </ErrorAlert>
      )}
      {added !== null && (
        <Text size="sm" role="status" mb={4}>
          {t('bestiary.add.done', { count: added, name: item.name, encounter: encounter.name })}
        </Text>
      )}
      <Group gap="xs" align="flex-end">
        <NumberDial
          label={t('combat.add.count')}
          icon={Users}
          min={1}
          max={20}
          value={count}
          onChange={setCount}
        />
        <Button
          leftSection={<Plus size={16} aria-hidden="true" />}
          onClick={(event) => void add(event)}
          disabled={!valid || pending}
          loading={pending}
        >
          {t('bestiary.context.add', { count: valid ? count : 1 })}
        </Button>
      </Group>
    </div>
  )
}
