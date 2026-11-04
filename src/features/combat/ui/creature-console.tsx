import { useEffect, useRef, useState } from 'react'
import {
  Accordion,
  Button,
  Group,
  Paper,
  Stack,
  Text,
  TextInput,
  Title,
  VisuallyHidden,
} from '@mantine/core'
import { BatteryCharging, BatteryLow, Eye, Tag } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { StatBlockView } from '@/features/bestiary'
import { useCampaign } from '@/features/campaigns'
import type { Combatant, Tracker } from '../domain/combat'
import { useCreatureCatalog } from './creatures'
import type { Run } from './helpers'

/**
 * DM console extras for a creature (ADR 028): the name the table sees (and revealing the real
 * one), its recharge and daily-use trackers, and its stat block from the bestiary.
 */
export function CreatureConsole({
  combatant,
  run,
  pending,
  live,
}: {
  combatant: Combatant
  run: Run
  pending: boolean
  live: boolean
}) {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const catalog = useCreatureCatalog(campaign.id)
  const item = combatant.template_id
    ? catalog.items.find((i) => i.key === `hb:${combatant.template_id}`)
    : combatant.srd_id
      ? catalog.items.find((i) => i.key === `srd:${combatant.srd_id}`)
      : undefined
  const block = catalog.blockFor(item)
  const trackers = combatant.trackers ?? []
  return (
    <Stack gap="md">
      <Alias combatant={combatant} run={run} pending={pending} />
      {trackers.length > 0 && (
        <section className="combat-panel-plain" aria-labelledby={`trackers-${combatant.id}`}>
          <Title order={4} className="combat-panel-title" id={`trackers-${combatant.id}`}>
            {t('combat.creature.trackers')}
          </Title>
          <Text size="sm" c="dimmed" mb={6}>
            {t('combat.creature.trackersHelp')}
          </Text>
          <ul className="combat-trackers">
            {trackers.map((tracker) => (
              <TrackerControl
                key={tracker.key}
                tracker={tracker}
                busy={pending}
                locked={!live}
                set={(value) =>
                  void run({ kind: 'tracker', combatantId: combatant.id, key: tracker.key, value })
                }
              />
            ))}
          </ul>
        </section>
      )}
      {block && (
        <Accordion variant="contained" className="combat-statblock-accordion">
          <Accordion.Item value="block">
            <Accordion.Control>
              {t('combat.creature.statBlock', { name: block.name })}
            </Accordion.Control>
            <Accordion.Panel>
              <div className="combat-statblock">
                <StatBlockView block={block} level={4} hideName />
              </div>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}
    </Stack>
  )
}

function Alias({ combatant, run, pending }: { combatant: Combatant; run: Run; pending: boolean }) {
  const { t } = useTranslation()
  const [value, setValue] = useState('')
  const alias = combatant.public_name
  const inputId = `alias-${combatant.id}`
  const revealId = `alias-reveal-${combatant.id}`
  // Setting or revealing the alias swaps the controls: keep the keyboard on the new one.
  const swapped = useRef<string | null>(null)
  useEffect(() => {
    if (swapped.current === null || swapped.current === (alias ?? '')) return
    swapped.current = null
    requestAnimationFrame(() => document.getElementById(alias ? revealId : inputId)?.focus())
  }, [alias, inputId, revealId])
  if (alias)
    return (
      <Paper className="combat-panel" p="sm">
        <Group justify="space-between" wrap="wrap" gap="xs">
          <Text size="sm" className="combat-alias">
            <Tag size={16} aria-hidden="true" /> {t('combat.creature.aliasShown', { alias })}
          </Text>
          <Button
            id={revealId}
            variant="light"
            leftSection={<Eye size={16} aria-hidden="true" />}
            disabled={pending}
            onClick={() => {
              swapped.current = alias
              void run({ kind: 'update', combatantId: combatant.id, patch: { public_name: null } })
            }}
          >
            {t('combat.creature.reveal', { name: combatant.name })}
          </Button>
        </Group>
      </Paper>
    )
  return (
    <form
      className="combat-alias-form"
      onSubmit={async (event) => {
        event.preventDefault()
        const next = value.trim()
        if (!next) return
        swapped.current = ''
        if (await run({ kind: 'update', combatantId: combatant.id, patch: { public_name: next } }))
          setValue('')
      }}
    >
      <Group align="flex-end" gap="xs" wrap="nowrap">
        <TextInput
          id={inputId}
          style={{ flex: 1 }}
          label={t('combat.creature.alias')}
          description={t('combat.creature.aliasHelp')}
          value={value}
          maxLength={80}
          onChange={(e) => setValue(e.currentTarget.value)}
        />
        <Button type="submit" variant="default" disabled={pending || !value.trim()}>
          {t('combat.creature.aliasSet')}
        </Button>
      </Group>
    </form>
  )
}

function TrackerControl({
  tracker,
  busy,
  locked,
  set: write,
}: {
  tracker: Tracker
  /** A write is running: the control keeps focus (aria-disabled) and ignores taps. */
  busy: boolean
  /** The fight is over: really disabled. */
  locked: boolean
  set: (value: number) => void
}) {
  const { t } = useTranslation()
  const set = (value: number) => {
    if (!busy) write(value)
  }
  if (tracker.kind === 'recharge')
    return (
      <li className="combat-tracker" data-spent={tracker.spent || undefined}>
        <span className="combat-tracker-label" id={`tracker-${tracker.key}`}>
          {tracker.label}
        </span>
        {/* The visible state is the name (WCAG 2.5.3); the ability and the effect describe it. */}
        <VisuallyHidden id={`tracker-hint-${tracker.key}`}>
          {t(tracker.spent ? 'combat.creature.markReady' : 'combat.creature.markSpent', {
            label: tracker.label,
          })}
        </VisuallyHidden>
        <Button
          variant={tracker.spent ? 'default' : 'light'}
          disabled={locked}
          data-disabled={busy || undefined}
          aria-disabled={busy || undefined}
          aria-describedby={`tracker-${tracker.key} tracker-hint-${tracker.key}`}
          leftSection={
            tracker.spent ? (
              <BatteryLow size={16} aria-hidden="true" />
            ) : (
              <BatteryCharging size={16} aria-hidden="true" />
            )
          }
          onClick={() => set(tracker.spent ? 0 : 1)}
        >
          {t(tracker.spent ? 'combat.creature.spent' : 'combat.creature.ready', {
            min: tracker.min,
          })}
        </Button>
      </li>
    )
  return (
    <li className="combat-tracker">
      <span className="combat-tracker-label" id={`use-${tracker.key}`}>
        {tracker.label}
      </span>
      <div className="combat-uses" role="group" aria-labelledby={`use-${tracker.key}`}>
        {Array.from({ length: tracker.max }, (_, i) => {
          const spent = i < tracker.used
          return (
            <button
              key={i}
              type="button"
              className="combat-use"
              disabled={locked}
              aria-disabled={busy || undefined}
              aria-pressed={spent}
              aria-label={t('combat.creature.use', {
                number: i + 1,
                max: tracker.max,
                state: t(spent ? 'combat.creature.useSpent' : 'combat.creature.useFree'),
              })}
              // Tapping a use spends up to it; tapping the last spent one gives it back.
              onClick={() => set(spent && i === tracker.used - 1 ? i : i + 1)}
            >
              {spent ? '✕' : i + 1}
            </button>
          )
        })}
      </div>
      <Text size="sm" c="dimmed">
        {t('combat.creature.usesLeft', { left: tracker.max - tracker.used, max: tracker.max })}
      </Text>
    </li>
  )
}
