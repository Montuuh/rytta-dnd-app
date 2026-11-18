import { useEffect, useId, useRef, useState } from 'react'
import { Alert, Button, Loader, Text } from '@mantine/core'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import type { CampaignRoll } from '@/features/campaigns'
import { relativeTime } from '@/shared/lib/relative-time'
import { Drawer } from '@/shared/ui/overlays'
import { usePhone } from '@/shared/ui/use-viewport'
import { rollsQuery, rollsScope } from '../api'
import { subscribeRolls } from '../data/repository'
import { formulaOf, mathsText, rollMaths } from '../domain/roll'
import { rollerOf } from '../domain/rolls'
import { useHeldRolls } from './held-rolls'
import { useRollName } from './roll-name'
import { useDiceMode } from './use-dice-mode'
import './dice.css'

const previewCount = 3

function RollEntry({
  roll,
  who,
  own,
  now,
}: {
  roll: CampaignRoll
  who: string
  own: boolean
  now: number
}) {
  const { t, i18n } = useTranslation()
  const rollName = useRollName()
  const name = rollName(roll.kind, roll.label)
  const maths = rollMaths(roll.expression, roll.dice)
  const when = relativeTime(Date.parse(roll.created_at), now, i18n.language) ?? t('common.justNow')
  return (
    <li className="roll-entry" data-own={own || undefined}>
      <span className="roll-entry-total">
        <span className="visually-hidden">{t('roll.totalWord')} </span>
        {roll.total}
      </span>
      <div className="roll-entry-body">
        <p className="roll-entry-name">
          <span className="user-copy">{name}</span>
          <span className="roll-entry-who">
            {' · '}
            {own ? t('roll.you', { name: who }) : who}
          </span>
        </p>
        <p className="roll-entry-maths">
          {maths ? mathsText(maths) : formulaOf(roll.expression)}
          {' · '}
          {t(`roll.source.${roll.source}`)}
          {' · '}
          {when}
        </p>
      </div>
    </li>
  )
}

/**
 * RYT-133: the newest rolls this account may read. Which rolls those are is decided by the
 * database from the DM's visibility setting; nothing is filtered here. Realtime refetches on every
 * roll; polling is the fallback. With physical dice the strip stays out of the way until someone
 * records a roll.
 */
export function RecentRolls({
  campaignId,
  names,
}: {
  campaignId: string
  /** Character names by id, for the rolls of characters the viewer can see. */
  names: ReadonlyMap<string, string>
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const userId = state.user!.id
  const titleId = useId()
  const phone = usePhone()
  const cache = useQueryClient()
  const { behaviour } = useDiceMode(campaignId)
  const query = useQuery(rollsQuery(userId, campaignId))
  const [all, setAll] = useState(false)
  const opener = useRef<HTMLButtonElement>(null)
  useEffect(
    () =>
      subscribeRolls(campaignId, () => {
        void cache.invalidateQueries({ queryKey: rollsScope(userId, campaignId) })
      }),
    [campaignId, userId, cache],
  )
  const held = useHeldRolls()
  const rolls = (query.data ?? []).filter((roll) => !held.has(roll.id))
  // With physical dice the strip appears once someone has recorded a roll, never before.
  if (behaviour === 'physical' && rolls.length === 0) return null
  const who = (roll: CampaignRoll) => {
    const roller = rollerOf(roll.character_id, names)
    return roller.kind === 'dm'
      ? t('roll.dm')
      : roller.kind === 'character'
        ? roller.name
        : t('roll.someone')
  }
  const list = (items: CampaignRoll[]) => (
    <ol className="roll-list">
      {items.map((roll) => (
        <RollEntry
          key={roll.id}
          roll={roll}
          who={who(roll)}
          own={roll.roller_id === userId}
          now={query.dataUpdatedAt}
        />
      ))}
    </ol>
  )
  return (
    <section className="roll-strip" aria-labelledby={titleId}>
      <div className="roll-strip-head">
        <h2 id={titleId} className="panel-section-title">
          {t('roll.recent')}
        </h2>
        {rolls.length > previewCount && (
          <Button ref={opener} variant="subtle" aria-haspopup="dialog" onClick={() => setAll(true)}>
            {t('roll.seeAll', { count: rolls.length })}
          </Button>
        )}
      </div>
      {query.isPending && (
        <Text size="sm" c="dimmed" role="status" className="roll-strip-state">
          <Loader size={14} aria-hidden="true" /> {t('roll.loading')}
        </Text>
      )}
      {query.isError && (
        <Alert color="red" role="alert" className="roll-strip-state">
          {t('roll.loadError')}{' '}
          <Button variant="subtle" onClick={() => void query.refetch()}>
            {t('common.retry')}
          </Button>
        </Alert>
      )}
      {!query.isPending && !query.isError && rolls.length === 0 && (
        <Text size="sm" c="dimmed" className="roll-strip-state">
          {t('roll.empty')}
        </Text>
      )}
      {rolls.length > 0 && list(rolls.slice(0, previewCount))}
      <Drawer
        opened={all}
        onClose={() => setAll(false)}
        position={phone ? 'bottom' : 'right'}
        size={phone ? 'auto' : 'md'}
        title={<span className="block-sheet-title">{t('roll.recent')}</span>}
        className="block-sheet roll-drawer"
        styles={phone ? { content: { maxHeight: '88dvh' } } : undefined}
        closeButtonProps={{ 'aria-label': t('panel.close'), size: 44 }}
        onExitTransitionEnd={() => opener.current?.focus()}
      >
        {list(rolls)}
      </Drawer>
    </section>
  )
}
