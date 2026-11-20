import { useEffect, useRef, useState } from 'react'
import { Button, Checkbox, Group, Select, Stack, Text, UnstyledButton } from '@mantine/core'
import { Check, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GlossaryTerm, useSrdLibrary } from '@/features/glossary'
import { maxTrackers, syncProgressionReport } from '../../domain/progression'
import { actionsFor, resourceSpec, spendAction, type ResourceAction } from '../../domain/resources'
import { slotsFor } from '../../domain/rules'
import type { Build, Tracker, Vitals } from '../../domain/sheet'
import { choiceKeys, traitChoices, type ChoiceKey } from '../../domain/srd'
import {
  createdSlots,
  metamagicCost,
  metamagicKeys,
  metamagicKnown,
  sorceryPointsKey,
  spendSlot,
  type MetamagicKey,
} from '../../domain/sorcery'
import { useTrackerLabel } from '../resource-names'
import { FontOfMagic } from './font-of-magic'
import { Pips } from './pips'
import type { PanelProps } from './panel-types'
import { Counter } from './widgets'

const resourceName = (key: string) => `panel.resource.${key}` as 'panel.resource.monk-focus'
const actionName = (key: string) => `panel.action.${key}` as 'panel.action.monk-flurry-of-blows'
const choiceName = (choice: ChoiceKey, option: string) =>
  `srd.choice.${choice}.${option}` as 'srd.choice.giantAncestry.fire'
/** The trait option a tracker depends on, shown under its name. */
const trackerChoice: Record<string, ChoiceKey> = {
  'goliath-giant-ancestry': 'giantAncestry',
  'dragonborn-breath-weapon': 'draconicAncestry',
}

/** Class, species and feat resources with the options they pay for, once-per-turn marks, the
 * player's own resources, spell slots and hit point dice (RYT-071, RYT-102). */
export function ResourcesBlock(
  props: PanelProps & { onPersonalise: () => void; onFontOfMagic?: (open: boolean) => void },
) {
  const { t } = useTranslation()
  const trackerLabel = useTrackerLabel()
  const { build, level, vitals, canEdit, editing, locked, commit, change, onPersonalise } = props
  const library = useSrdLibrary()
  const slots = slotsFor(build.casterKind, level)
  const hitDiceLeft = level - Math.min(level, vitals.hit_dice_spent)
  const pools = build.trackers.filter((tracker) => !tracker.per)
  const marks = build.trackers.filter((tracker) => tracker.per === 'turn')
  const setUses = (tracker_uses: Vitals['tracker_uses']) => commit({ ...vitals, tracker_uses })
  // A sheet saved before its class, species or feat resources existed gets them in one tap.
  const report =
    canEdit && !editing && library
      ? syncProgressionReport(build, level, library.features, {
          resource: (key) => t(resourceName(key)),
        })
      : null
  // Only what fits is offered; what does not fit in the sheet's resources is named.
  const missing = report
    ? report.build.trackers.filter(
        (tracker) => !build.trackers.some((item) => item.id === tracker.id),
      ).length
    : 0
  const leftOut = report?.leftOut ?? 0
  const choices = choiceKeys.filter((key) => traitChoices[key].species === build.speciesKey)
  const usedMarks = marks.filter((tracker) => (vitals.tracker_uses[tracker.id] ?? 0) > 0)
  // The button that was pressed disappears with its own success, so focus moves on deliberately:
  // to the first tracker that "Add them" brought, or to the first mark after "New turn".
  const landing = useRef<{ tracker?: string; marks?: boolean }>({})
  const markList = useRef<HTMLUListElement>(null)
  useEffect(() => {
    const id = landing.current.tracker
    if (id && build.trackers.some((tracker) => tracker.id === id)) {
      landing.current = {}
      document.querySelector<HTMLElement>(`[data-tracker-name="${CSS.escape(id)}"]`)?.focus()
    }
  }, [build.trackers])
  useEffect(() => {
    if (landing.current.marks && usedMarks.length === 0) {
      landing.current = {}
      markList.current?.querySelector<HTMLElement>('.turn-mark')?.focus()
    }
  }, [usedMarks.length])
  return (
    <Stack gap="lg">
      {missing > 0 && (
        <div className="resource-missing" role="status">
          <Text size="sm">{t('panel.missingResources', { count: missing })}</Text>
          <Button
            variant="light"
            size="sm"
            className="resource-missing-add"
            leftSection={<Plus size={16} aria-hidden="true" />}
            aria-disabled={props.pending || undefined}
            onClick={() => {
              if (props.pending || !report) return
              const added = report.build.trackers.filter(
                (tracker) => !build.trackers.some((item) => item.id === tracker.id),
              )
              // Pools show before marks, so the first pool leads when there is one.
              landing.current = { tracker: (added.find((tracker) => !tracker.per) ?? added[0])?.id }
              change((draft) => draft)
            }}
          >
            {t('panel.addMissing', { count: missing })}
          </Button>
        </div>
      )}
      {leftOut > 0 && (
        <Text size="sm" c="dimmed" role="status" className="resource-full">
          {t('panel.resourcesFull', { count: leftOut, max: maxTrackers })}
        </Text>
      )}
      {choices.length > 0 && (
        <section aria-labelledby="panel-choices" className="resource-choices">
          <Text size="sm" c="dimmed" fw={600} id="panel-choices">
            {t('panel.choicesTitle')}
          </Text>
          {choices.map((key) => (
            <Select
              key={key}
              label={t(`srd.trait.${key}`)}
              placeholder={t('panel.choose')}
              data={traitChoices[key].options.map((option) => ({
                value: option,
                label: t(choiceName(key, option)),
              }))}
              value={build.choices?.[key] ?? null}
              disabled={!canEdit || props.pending}
              allowDeselect={false}
              comboboxProps={{ withinPortal: true }}
              onChange={(value) =>
                value &&
                change(
                  (draft) => ({
                    ...draft,
                    build: { ...draft.build, choices: { ...draft.build.choices, [key]: value } },
                  }),
                  'sheet.saved',
                )
              }
            />
          ))}
        </section>
      )}
      {build.classKey === 'sorcerer' && metamagicKnown(level) > 0 && (
        <Metamagic
          build={build}
          level={level}
          canEdit={canEdit && !props.pending}
          change={change}
        />
      )}
      {build.trackers.length === 0 && missing === 0 && (
        <Text size="sm" c="dimmed">
          {t('sheet.noTrackers')}
        </Text>
      )}
      {pools.map((tracker) => (
        <TrackerRow
          key={tracker.id}
          tracker={tracker}
          build={build}
          level={level}
          vitals={vitals}
          canEdit={canEdit}
          setUses={setUses}
          commit={commit}
          onFontOfMagic={props.onFontOfMagic}
        />
      ))}
      {marks.length > 0 && (
        <section aria-labelledby="panel-turn" className="turn-marks">
          <Group justify="space-between" gap="xs" wrap="nowrap" className="turn-marks-head">
            <Text size="sm" c="dimmed" fw={600} id="panel-turn">
              {t('panel.perTurnTitle')}
            </Text>
            {canEdit && usedMarks.length > 0 && (
              <Button
                variant="subtle"
                size="compact-sm"
                className="turn-marks-clear"
                aria-label={t('panel.newTurnLabel')}
                onClick={() => {
                  landing.current = { marks: true }
                  setUses(
                    Object.fromEntries(
                      Object.entries(vitals.tracker_uses).filter(
                        ([id]) => !usedMarks.some((tracker) => tracker.id === id),
                      ),
                    ),
                  )
                }}
              >
                {t('panel.newTurn')}
              </Button>
            )}
          </Group>
          <ul className="turn-mark-list" ref={markList}>
            {marks.map((tracker) => {
              const used = (vitals.tracker_uses[tracker.id] ?? 0) > 0
              const spec = resourceSpec(tracker.key)
              return (
                <li key={tracker.id} className="turn-mark-row">
                  <UnstyledButton
                    className="turn-mark"
                    data-tracker-name={tracker.id}
                    aria-pressed={used}
                    aria-label={t('panel.turnMark', { name: trackerLabel(tracker) })}
                    disabled={!canEdit}
                    onClick={() => setUses({ ...vitals.tracker_uses, [tracker.id]: used ? 0 : 1 })}
                  >
                    {/* An open box while it is still there to use; ticked once it is spent. */}
                    <span className="turn-mark-box" aria-hidden="true">
                      {used && <Check size={14} strokeWidth={3} />}
                    </span>
                  </UnstyledButton>
                  <Text
                    size="sm"
                    className="user-copy turn-mark-name"
                    data-used={used || undefined}
                  >
                    {spec ? (
                      <GlossaryTerm id={spec.feature}>{trackerLabel(tracker)}</GlossaryTerm>
                    ) : (
                      trackerLabel(tracker)
                    )}
                  </Text>
                  {spec?.die && (
                    <Text size="sm" c="dimmed" className="resource-die">
                      {spec.die(level)}
                    </Text>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}
      {slots.some((count) => count > 0) && (
        <section aria-labelledby="panel-slots">
          <Text fw={600} id="panel-slots">
            {t('sheet.slots')}
          </Text>
          <Stack gap={0}>
            {slots.map((max, index) => {
              if (max === 0) return null
              const slotLevel = index + 1
              const used = Math.min(max, vitals.slots_used[index] ?? 0)
              const created = createdSlots(vitals.tracker_uses)[index]!
              return (
                <Group key={slotLevel} gap="xs" wrap="nowrap">
                  <Text size="sm" w={64}>
                    {t('sheet.slotLevel', { level: slotLevel })}
                  </Text>
                  <Pips
                    max={max}
                    used={used}
                    disabled={!canEdit}
                    spendLabel={t('sheet.useSlot', { level: slotLevel })}
                    restoreLabel={t('sheet.restoreSlot', { level: slotLevel })}
                    countLabel={
                      created > 0
                        ? t('font.slotCount', { left: max - used, max, created })
                        : `${max - used}/${max}`
                    }
                    extra={created}
                    extraLabel={t('font.useCreated', { level: slotLevel })}
                    onSpendExtra={() => {
                      const next = spendSlot(build, level, vitals, slotLevel)
                      if (next) commit(next)
                    }}
                    onChange={(next) => {
                      const slots_used = [...vitals.slots_used]
                      slots_used[index] = next
                      commit({ ...vitals, slots_used })
                    }}
                  />
                </Group>
              )
            })}
          </Stack>
        </section>
      )}
      <section aria-labelledby="panel-hit-dice">
        <Text fw={600} id="panel-hit-dice">
          <GlossaryTerm id="rule.hit-point-dice">{t('sheet.hitDice')}</GlossaryTerm>
        </Text>
        <Pips
          max={level}
          used={level - hitDiceLeft}
          // Hit dice are spent in a short rest, where the roll heals: tapping a pip out of a rest
          // would spend a die and heal nothing, so this row only shows them.
          disabled
          spendLabel={t('sheet.spendHitDieLabel')}
          restoreLabel={t('sheet.recoverHitDieLabel')}
          countLabel={`${hitDiceLeft}/${level}`}
          glyph={`d${build.hitDie}`}
          onChange={() => undefined}
        />
        <Text size="sm" c="dimmed">
          {t(locked ? 'panel.hitDiceLocked' : 'panel.hitDiceRest')}
        </Text>
      </section>
      {canEdit && (
        <Button
          variant="subtle"
          className="panel-link"
          leftSection={<Plus size={16} aria-hidden="true" />}
          onClick={onPersonalise}
        >
          {t('panel.manageResources')}
        </Button>
      )}
    </Stack>
  )
}

function TrackerRow({
  tracker,
  build,
  level,
  vitals,
  canEdit,
  setUses,
  commit,
  onFontOfMagic,
}: {
  tracker: Tracker
  build: Build
  level: number
  vitals: Vitals
  canEdit: boolean
  setUses: (uses: Vitals['tracker_uses']) => void
  commit: (values: Vitals) => void
  onFontOfMagic?: (open: boolean) => void
}) {
  const { t } = useTranslation()
  const trackerLabel = useTrackerLabel()
  const used = Math.min(tracker.max, vitals.tracker_uses[tracker.id] ?? 0)
  const spec = resourceSpec(tracker.key)
  const options = actionsFor(build, level, tracker.key)
  const choice = tracker.key ? trackerChoice[tracker.key] : undefined
  const picked = choice ? build.choices?.[choice] : undefined
  const pickedLabel =
    choice && picked && (traitChoices[choice].options as readonly string[]).includes(picked)
      ? t(choiceName(choice, picked))
      : null
  const set = (next: number) => setUses({ ...vitals.tracker_uses, [tracker.id]: next })
  // A refused option names why for a moment and outlines the resource it needs.
  const [refused, setRefused] = useState<{ cost: number; at: number } | null>(null)
  useEffect(() => {
    if (!refused) return
    const timer = window.setTimeout(() => setRefused(null), 3200)
    return () => window.clearTimeout(timer)
  }, [refused])
  return (
    <section className="resource-row" aria-label={trackerLabel(tracker)}>
      <Group justify="space-between" gap="xs" wrap="nowrap">
        <Text
          fw={600}
          className="user-copy resource-name"
          tabIndex={-1}
          data-tracker-name={tracker.id}
        >
          {spec ? (
            <GlossaryTerm id={spec.feature}>{trackerLabel(tracker)}</GlossaryTerm>
          ) : (
            trackerLabel(tracker)
          )}
          {spec?.die && (
            <Text span size="sm" c="dimmed" fw={500} className="resource-die">
              {' '}
              {spec.die(level)}
            </Text>
          )}
        </Text>
        <Text size="sm" c="dimmed">
          {t(`sheet.reset.${tracker.reset}`)}
        </Text>
      </Group>
      {pickedLabel && (
        <Text size="sm" c="dimmed" className="resource-choice">
          {pickedLabel}
        </Text>
      )}
      <div
        className="resource-meter"
        data-refused={refused ? refused.at : undefined}
        key={refused?.at}
      >
        {(tracker.display ?? 'pips') === 'counter' || tracker.max > 20 ? (
          <Counter
            name={trackerLabel(tracker)}
            max={tracker.max}
            used={used}
            disabled={!canEdit}
            onChange={set}
          />
        ) : (
          <Pips
            max={tracker.max}
            used={used}
            disabled={!canEdit}
            spendLabel={t('sheet.useOne', { name: trackerLabel(tracker) })}
            restoreLabel={t('sheet.restoreOne', { name: trackerLabel(tracker) })}
            countLabel={t('sheet.usesLeft', { left: tracker.max - used, max: tracker.max })}
            onChange={set}
          />
        )}
      </div>
      {options.length > 0 && (
        <ul
          className="resource-options"
          aria-label={t('panel.optionsOf', { name: trackerLabel(tracker) })}
        >
          {options.map((option) => (
            <OptionRow
              key={option.key}
              option={option}
              tracker={tracker}
              build={build}
              vitals={vitals}
              canEdit={canEdit}
              setUses={setUses}
              onRefused={() => setRefused({ cost: option.cost, at: Date.now() })}
            />
          ))}
        </ul>
      )}
      {tracker.key === sorceryPointsKey && (
        <FontOfMagic
          build={build}
          level={level}
          vitals={vitals}
          canEdit={canEdit}
          commit={commit}
          onOpenChange={onFontOfMagic}
        />
      )}
      <Text size="sm" role="status" className="resource-refused">
        {refused
          ? t('panel.optionShort', {
              cost: refused.cost,
              resource: trackerLabel(tracker),
              left: tracker.max - used,
            })
          : ''}
      </Text>
    </section>
  )
}

/** An option paid from the tracker above it: its rules text, its cost and one tap to pay it. */
function OptionRow({
  option,
  tracker,
  build,
  vitals,
  canEdit,
  setUses,
  onRefused,
}: {
  option: ResourceAction
  tracker: Tracker
  build: Build
  vitals: Vitals
  canEdit: boolean
  setUses: (uses: Vitals['tracker_uses']) => void
  onRefused: () => void
}) {
  const { t } = useTranslation()
  const trackerLabel = useTrackerLabel()
  const name = t(actionName(option.key))
  const next = spendAction(option, build.trackers, vitals.tracker_uses)
  const left = tracker.max - Math.min(tracker.max, vitals.tracker_uses[tracker.id] ?? 0)
  const blocked = !canEdit || next === null
  return (
    <li className="resource-option">
      <Text size="sm" className="resource-option-name">
        <GlossaryTerm id={option.feature}>{name}</GlossaryTerm>
      </Text>
      <UnstyledButton
        className="resource-spend"
        aria-disabled={blocked || undefined}
        aria-label={
          next === null && canEdit
            ? t('panel.optionShort', { cost: option.cost, resource: trackerLabel(tracker), left })
            : t('panel.useOption', { name, cost: option.cost, resource: trackerLabel(tracker) })
        }
        onClick={() => {
          if (!blocked && next) setUses(next)
          else if (canEdit) onRefused()
        }}
      >
        <span aria-hidden="true">−{option.cost}</span>
      </UnstyledButton>
    </li>
  )
}

/** RYT-110: the Metamagic options the Sorcerer knows; each becomes an option paid from Sorcery
 * Points. The count follows the level; changing one is allowed at any time. */
function Metamagic({
  build,
  level,
  canEdit,
  change,
}: Pick<PanelProps, 'build' | 'level' | 'change'> & { canEdit: boolean }) {
  const { t } = useTranslation()
  const known = metamagicKnown(level)
  const picked = (build.metamagic ?? []).filter((key): key is MetamagicKey =>
    (metamagicKeys as readonly string[]).includes(key),
  )
  const full = picked.length >= known
  // Once every known option is chosen, only those are listed; "Change" opens the full list.
  const [changing, setChanging] = useState(false)
  const shown =
    full && !changing ? metamagicKeys.filter((key) => picked.includes(key)) : metamagicKeys
  const toggle = (key: MetamagicKey, on: boolean) =>
    change(
      (draft) => ({
        ...draft,
        build: {
          ...draft.build,
          metamagic: on
            ? [...(draft.build.metamagic ?? []), key]
            : (draft.build.metamagic ?? []).filter((item) => item !== key),
        },
      }),
      'sheet.saved',
    )
  return (
    <section aria-labelledby="panel-metamagic" className="resource-choices metamagic">
      <Text size="sm" c="dimmed" fw={600} id="panel-metamagic">
        <GlossaryTerm id="feature.sorcerer-metamagic">{t('metamagic.title')}</GlossaryTerm>
        {' · '}
        {t('metamagic.count', { picked: picked.length, known })}
      </Text>
      <Stack gap={4}>
        {shown.map((key) => {
          const on = picked.includes(key)
          return (
            <Checkbox
              key={key}
              className="metamagic-option"
              checked={on}
              disabled={!canEdit || (!on && full)}
              onChange={(event) => toggle(key, event.currentTarget.checked)}
              label={t('metamagic.option', {
                name: t(actionName(`sorcerer-metamagic-${key}`)),
                cost: metamagicCost[key],
              })}
              description={t(`metamagic.hint.${key}`)}
            />
          )
        })}
      </Stack>
      {full && canEdit && (
        <Button
          variant="subtle"
          size="compact-md"
          mih={44}
          className="panel-link"
          aria-expanded={changing}
          onClick={() => setChanging((open) => !open)}
        >
          {t(changing ? 'metamagic.done' : 'metamagic.change')}
        </Button>
      )}
    </section>
  )
}
