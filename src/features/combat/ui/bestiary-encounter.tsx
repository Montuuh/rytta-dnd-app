import { ActionIcon, Button, Menu, Stack, Text, Title } from '@mantine/core'
import { Check, GitCompareArrows, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { CreatureListItem } from '@/features/bestiary'

const comparisonLimit = 3

export function BestiaryComparisonToggle({
  item,
  keys,
  onToggle,
}: {
  item: CreatureListItem
  keys: readonly string[]
  onToggle: (key: string) => void
}) {
  const { t } = useTranslation()
  const selected = keys.includes(item.key)
  const disabled = !selected && keys.length >= comparisonLimit
  const Icon = selected ? Check : GitCompareArrows
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

/** The same toggle as an entry of the stat block's `···` menu. */
export function BestiaryCompareItem({
  item,
  keys,
  onToggle,
}: {
  item: CreatureListItem
  keys: readonly string[]
  onToggle: (key: string) => void
}) {
  const { t } = useTranslation()
  const selected = keys.includes(item.key)
  const Icon = selected ? Check : GitCompareArrows
  return (
    <Menu.Item
      disabled={!selected && keys.length >= comparisonLimit}
      leftSection={<Icon size={16} aria-hidden="true" />}
      onClick={() => onToggle(item.key)}
    >
      {t(selected ? 'bestiary.compare.remove' : 'bestiary.compare.toggle', { name: item.name })}
    </Menu.Item>
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
