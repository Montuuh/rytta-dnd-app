import { Button, Stack, Text } from '@mantine/core'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Coins, HeartPulse, ScrollText, Sparkles, UserRound } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { QueryFeedback } from '@/features/campaigns'
import { relativeTime } from '@/shared/lib/relative-time'
import { historyQuery } from '../../api'
import {
  describeHistory,
  familyOf,
  type HistoryFamily,
  type HistoryLine,
} from '../../domain/history'
import { isBackgroundKey, isClassKey, isSpeciesKey } from '../../domain/rules'
import type { Build, HistoryItem } from '../../domain/sheet'
import { abilityKeys, conditionKeys } from '../../domain/srd'

const icons: Record<HistoryFamily, typeof HeartPulse> = {
  hp: HeartPulse,
  play: Sparkles,
  sheet: ScrollText,
  identity: UserRound,
  resources: Coins,
}

/** RYT-070: read-only change history for the DM and the assigned Player. */
export function HistoryBlock({
  campaignId,
  characterId,
  build,
}: {
  campaignId: string
  characterId: string
  build: Build
}) {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const query = useInfiniteQuery(historyQuery(state.user!.id, campaignId, characterId))
  const items = query.data?.pages.flat() ?? []
  const text = useHistoryText(build)
  return (
    <Stack gap="md">
      <Text size="sm" c="dimmed">
        {t('panel.historyHint')}
      </Text>
      <QueryFeedback
        pending={query.isPending}
        error={query.isError}
        retry={() => void query.refetch()}
      />
      {query.data && items.length === 0 && (
        <Text size="sm" c="dimmed">
          {t('panel.historyEmpty')}
        </Text>
      )}
      <ol className="history-list">
        {items.map((item) => {
          const lines = describeHistory(item)
          if (lines.length === 0) return null
          const Icon = icons[familyOf(item)]
          const at = new Date(item.at)
          return (
            <li key={item.id} className="history-item">
              <span className="history-glyph" aria-hidden="true">
                <Icon size={16} />
              </span>
              <div className="history-body">
                <div className="history-head">
                  <Text fw={600} size="sm" className="user-copy">
                    {text.actor(item)}
                  </Text>
                  <Text
                    size="sm"
                    c="dimmed"
                    component="time"
                    dateTime={item.at}
                    title={at.toLocaleString(i18n.language)}
                  >
                    {relativeTime(at.getTime(), query.dataUpdatedAt, i18n.language) ??
                      t('common.justNow')}
                  </Text>
                </div>
                <ul className="history-lines">
                  {lines.map((line, index) => (
                    <li key={index} className="user-copy">
                      {text.line(line)}
                    </li>
                  ))}
                </ul>
              </div>
            </li>
          )
        })}
      </ol>
      {query.hasNextPage && (
        <Button
          variant="subtle"
          loading={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t('panel.historyMore')}
        </Button>
      )}
    </Stack>
  )
}

function useHistoryText(build: Build) {
  const { t, i18n } = useTranslation()
  const number = (value: number | null) =>
    value === null ? '—' : value.toLocaleString(i18n.language)
  const fieldLabel = (field: string) =>
    field.startsWith('trackerMax:')
      ? t('panel.history.trackerMax', { name: field.slice(11) })
      : t(`panel.field.${field}` as 'panel.field.level', { defaultValue: field })
  const value = (field: string, raw: string) => {
    if (!raw) return t('panel.history.none')
    if (field === 'classKey' && isClassKey(raw)) return t(`srd.class.${raw}`)
    if (field === 'speciesKey' && isSpeciesKey(raw)) return t(`srd.species.${raw}`)
    if (field === 'backgroundKey' && isBackgroundKey(raw)) return t(`srd.background.${raw}`)
    if (field === 'classKey' && raw === 'custom') return t('panel.history.homebrew')
    return raw
  }
  const listName = (field: string, name: string) => {
    if (field === 'conditions' && (conditionKeys as readonly string[]).includes(name))
      return t(`srd.condition.${name as 'poisoned'}`)
    if (field === 'saves' && (abilityKeys as readonly string[]).includes(name))
      return t(`srd.ability.${name as 'str'}`)
    return name
  }
  const proficiency = (level: string | null) =>
    t(
      level === 'expertise'
        ? 'sheet.expertise'
        : level === 'proficient'
          ? 'sheet.proficient'
          : 'panel.notProficient',
    )
  return {
    actor: (item: HistoryItem) =>
      item.actor === 'self'
        ? t('panel.history.self')
        : item.actor === 'dm'
          ? (item.actor_name ?? t('panel.history.dm'))
          : item.actor === 'player'
            ? (item.actor_name ?? t('panel.history.player'))
            : t('panel.history.system'),
    line: (line: HistoryLine): string => {
      switch (line.key) {
        case 'created':
          return t('panel.history.created')
        case 'completed':
          return t('panel.history.completed')
        case 'number':
          return t('panel.history.change', {
            field: fieldLabel(line.field),
            before: number(line.before),
            after: number(line.after),
          })
        case 'text':
          return t('panel.history.change', {
            field: fieldLabel(line.field),
            before: value(line.field, line.before),
            after: value(line.field, line.after),
          })
        case 'toggle':
          return t(line.on ? 'panel.history.on' : 'panel.history.off', {
            field: fieldLabel(line.field),
          })
        case 'added':
          return t('panel.history.added', {
            field: fieldLabel(line.field),
            name: listName(line.field, line.name),
          })
        case 'removed':
          return t('panel.history.removed', {
            field: fieldLabel(line.field),
            name: listName(line.field, line.name),
          })
        case 'edited':
          return t('panel.history.edited', { field: fieldLabel(line.field) })
        case 'slot':
          return t('panel.history.slot', {
            level: line.level,
            before: line.before,
            after: line.after,
          })
        case 'tracker':
          return t('panel.history.tracker', {
            name:
              build.trackers.find((tracker) => tracker.id === line.id)?.name ??
              t('panel.history.resource'),
            before: line.before,
            after: line.after,
          })
        case 'ability':
          return t('panel.history.change', {
            field: t(`srd.ability.${line.ability as 'str'}`),
            before: line.before,
            after: line.after,
          })
        case 'skill':
          return t('panel.history.change', {
            field: t(`srd.skill.${line.skill as 'stealth'}`),
            before: proficiency(line.before),
            after: proficiency(line.after),
          })
      }
    },
  }
}
