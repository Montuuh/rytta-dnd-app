import { useEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Button,
  Chip,
  Group,
  Menu,
  Modal,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core'
import {
  Brain,
  Crown,
  Dice5,
  Ellipsis,
  Heart,
  Minus,
  Pencil,
  Plus,
  Sparkles,
  Swords,
  UserMinus,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { GlossaryTerm, glossaryIds } from '@/features/glossary'
import {
  combatConditions,
  isLive,
  type CombatCondition,
  type Combatant,
  type Effect,
  type EncounterStatus,
  type HpMode,
} from '../domain/combat'
import { AmountDialog } from './amount-dialog'
import { sideLabel, useReturnFocus, type Run } from './helpers'
import { HpMeter, Pips, SideIcon, StateBadge } from './parts'
import { CombatantToken } from './token'

type Props = {
  encounterId: string
  status: EncounterStatus
  combatant: Combatant
  combatants: Combatant[]
  effects: Effect[]
  dm: boolean
  activeId: string | null
  run: Run
  pending: boolean
  /** Opens the initiative dialog (DM for anyone, a Player for its own character). */
  onInitiative?: () => void
  /** DM: asks to remove this combatant from the encounter (the caller confirms). */
  onRemove?: () => void
}

/** Everything about one combatant. Writes appear only when the viewer can act on it. */
export function CombatantDetail(props: Props) {
  const { combatant, dm, status } = props
  const { t } = useTranslation()
  const [hpMode, setHpMode] = useState<HpMode | null>(null)
  const live = isLive(status)
  const canAct = combatant.can_act && live && combatant.kind !== 'lair'
  const dying = combatant.kind === 'character' && combatant.hp?.current === 0 && !combatant.defeated
  return (
    <Stack gap="md" className="combat-detail">
      <Group justify="space-between" align="flex-start" wrap="nowrap">
        <div className="combat-detail-head">
          <CombatantToken combatant={combatant} size={72} showActive={false} described />
          <div>
            <Group gap={8} wrap="nowrap">
              <SideIcon combatant={combatant} size={22} />
              <Title order={3} className="combat-detail-name">
                {combatant.name}
              </Title>
            </Group>
            <Text size="sm" c="dimmed">
              {sideLabel(t, combatant)}
              {combatant.initiative !== undefined &&
                ` · ${t('combat.initiative.label')} ${combatant.initiative}`}
              {combatant.armor_class !== undefined &&
                ` · ${t('combat.ac', { value: combatant.armor_class })}`}
            </Text>
          </div>
        </div>
        <Group gap="xs" wrap="nowrap">
          <StateBadge combatant={combatant} />
          {props.onInitiative && (combatant.can_act || dm) && (
            <Button
              size="sm"
              variant="default"
              leftSection={<Dice5 size={16} aria-hidden="true" />}
              onClick={props.onInitiative}
              aria-label={t('combat.initiative.edit', { name: combatant.name })}
            >
              {combatant.initiative ?? t('combat.initiative.short')}
            </Button>
          )}
        </Group>
      </Group>

      {combatant.kind !== 'lair' && (
        <section aria-label={t('combat.hp.label')}>
          <HpMeter combatant={combatant} />
          {canAct && (
            <Group gap="xs" mt="sm" grow>
              <Button
                variant="default"
                className="combat-btn-damage"
                leftSection={<Swords size={16} aria-hidden="true" />}
                onClick={() => setHpMode('damage')}
              >
                {t('sheet.damage')}
              </Button>
              <Button
                variant="default"
                className="combat-btn-heal"
                leftSection={<Heart size={16} aria-hidden="true" />}
                onClick={() => setHpMode('heal')}
              >
                {t('sheet.heal')}
              </Button>
              <Button variant="default" onClick={() => setHpMode('temp')}>
                {t('sheet.setTemp')}
              </Button>
            </Group>
          )}
        </section>
      )}

      {combatant.kind === 'character' && combatant.death_saves && (dying || combatant.defeated) && (
        <DeathSaves {...props} canAct={canAct && dying} />
      )}

      {combatant.kind !== 'lair' && combatant.conditions !== undefined && (
        <Conditions {...props} canAct={canAct} />
      )}

      {combatant.kind !== 'lair' && (combatant.conditions !== undefined || canAct) && (
        <Concentration {...props} canAct={canAct} />
      )}

      {combatant.kind !== 'lair' && <Effects {...props} canAct={canAct} />}

      {!canAct && !dm && combatant.kind === 'character' && !combatant.is_own && (
        <Text size="sm" c="dimmed">
          {t('combat.detail.readOnly', { name: combatant.name })}
        </Text>
      )}

      {dm && <DmControls {...props} />}

      {/* The end of the fight closes an open damage dialog (RYT-042 R2-2). */}
      {hpMode && live && (
        <AmountDialog
          targets={[combatant]}
          initialMode={hpMode}
          pending={props.pending}
          close={() => setHpMode(null)}
          apply={async (mode, hits) => {
            if (await props.run({ kind: 'hp', encounterId: props.encounterId, mode, hits }))
              setHpMode(null)
          }}
        />
      )}
    </Stack>
  )
}

function DeathSaves({ combatant, run, pending, canAct }: Props & { canAct: boolean }) {
  const { t } = useTranslation()
  const saves = combatant.death_saves!
  return (
    <Paper className="combat-panel" p="sm">
      <Title order={4} className="combat-panel-title">
        {t('combat.death.title')}
      </Title>
      <Group gap="lg" my="xs">
        <Stack gap={2}>
          <Pips
            filled={saves.successes}
            total={3}
            label={t('combat.death.successes', { count: saves.successes })}
          />
          <Text size="xs">{t('combat.death.successes', { count: saves.successes })}</Text>
        </Stack>
        <Stack gap={2}>
          <span className="combat-pips-fail">
            <Pips
              filled={saves.failures}
              total={3}
              label={t('combat.death.failures', { count: saves.failures })}
            />
          </span>
          <Text size="xs">{t('combat.death.failures', { count: saves.failures })}</Text>
        </Stack>
      </Group>
      {canAct && (
        <>
          <div className="combat-grid-2">
            {(['success', 'failure', 'nat20', 'nat1'] as const).map((outcome) => (
              <Button
                key={outcome}
                variant="default"
                className={
                  outcome === 'success' || outcome === 'nat20'
                    ? 'combat-btn-heal'
                    : 'combat-btn-damage'
                }
                disabled={pending}
                onClick={() => void run({ kind: 'deathSave', combatantId: combatant.id, outcome })}
              >
                {t(`combat.death.${outcome}`)}
              </Button>
            ))}
          </div>
          <Text size="xs" c="dimmed" mt="xs">
            {t('combat.death.hint')}
          </Text>
        </>
      )}
    </Paper>
  )
}

function Conditions({ combatant, run, pending, canAct }: Props & { canAct: boolean }) {
  const { t } = useTranslation()
  const active = combatant.conditions ?? []
  // The full SRD picker is long on phones: show active conditions, expand to edit.
  const [editing, setEditing] = useState(false)
  const titleId = `conditions-${combatant.id}`
  return (
    <section className="combat-panel-plain" aria-labelledby={titleId}>
      <Group justify="space-between">
        <Title order={4} className="combat-panel-title" id={titleId}>
          <GlossaryTerm id="rule.condition">{t('combat.conditions')}</GlossaryTerm>
        </Title>
        {canAct && (
          <Button
            size="sm"
            variant="subtle"
            aria-expanded={editing}
            aria-controls={`${titleId}-picker`}
            onClick={() => setEditing(!editing)}
          >
            {t(editing ? 'combat.conditionsDone' : 'combat.conditionsEdit')}
          </Button>
        )}
      </Group>
      {canAct && editing ? (
        <div
          role="group"
          aria-labelledby={titleId}
          className="combat-chips"
          id={`${titleId}-picker`}
        >
          {combatConditions.map((key) => (
            <Chip
              key={key}
              size="sm"
              checked={active.includes(key)}
              disabled={pending}
              onChange={(checked) =>
                void run({
                  kind: 'condition',
                  combatantId: combatant.id,
                  condition: key as CombatCondition,
                  enabled: checked,
                })
              }
            >
              {t(`srd.condition.${key}`)}
            </Chip>
          ))}
        </div>
      ) : active.length ? (
        <Group gap={6} mt={6}>
          {active.map((key) => (
            <Text key={key} component="span" className="combat-tag">
              <GlossaryTerm id={glossaryIds.condition(key)}>
                {t(`srd.condition.${key}`)}
              </GlossaryTerm>
            </Text>
          ))}
        </Group>
      ) : (
        <Text size="sm" c="dimmed">
          {t('combat.conditionsNone')}
        </Text>
      )}
    </section>
  )
}

function Concentration({ combatant, run, pending, canAct }: Props & { canAct: boolean }) {
  const { t } = useTranslation()
  const [spell, setSpell] = useState('')
  if (!canAct && !combatant.concentration) return null
  return (
    <section className="combat-panel-plain" aria-labelledby={`conc-${combatant.id}`}>
      <Title order={4} className="combat-panel-title" id={`conc-${combatant.id}`}>
        <Brain size={16} aria-hidden="true" />{' '}
        <GlossaryTerm id="rule.concentration">{t('combat.concentration.label')}</GlossaryTerm>
      </Title>
      {combatant.concentration ? (
        <Group justify="space-between" mt={6}>
          <Text size="sm">{t('combat.concentration.on', { spell: combatant.concentration })}</Text>
          {canAct && (
            <Button
              variant="default"
              size="sm"
              disabled={pending}
              onClick={() =>
                void run({ kind: 'concentration', combatantId: combatant.id, spell: null })
              }
            >
              {t('combat.concentration.end')}
            </Button>
          )}
        </Group>
      ) : (
        <form
          className="combat-inline-form"
          onSubmit={async (event) => {
            event.preventDefault()
            const value = spell.trim()
            if (!value) return
            if (await run({ kind: 'concentration', combatantId: combatant.id, spell: value }))
              setSpell('')
          }}
        >
          <TextInput
            label={t('combat.concentration.spell')}
            placeholder={t('combat.concentration.placeholder')}
            value={spell}
            maxLength={80}
            onChange={(event) => setSpell(event.currentTarget.value)}
          />
          <Button type="submit" variant="light" disabled={pending || !spell.trim()}>
            {t('combat.concentration.start')}
          </Button>
        </form>
      )}
    </section>
  )
}

function Effects({
  combatant,
  combatants,
  effects,
  encounterId,
  run,
  pending,
  dm,
  canAct,
}: Props & { canAct: boolean }) {
  const { t } = useTranslation()
  const mine = effects.filter((effect) => effect.target_combatant === combatant.id)
  const [adding, setAdding] = useState(false)
  if (!canAct && mine.length === 0) return null
  return (
    <section className="combat-panel-plain" aria-labelledby={`fx-${combatant.id}`}>
      <Group justify="space-between">
        <Title order={4} className="combat-panel-title" id={`fx-${combatant.id}`}>
          <Sparkles size={16} aria-hidden="true" /> {t('combat.effects.title')}
        </Title>
        {canAct && (
          <Button size="sm" variant="subtle" onClick={() => setAdding(true)}>
            {t('combat.effects.add')}
          </Button>
        )}
      </Group>
      {mine.length === 0 ? (
        <Text size="sm" c="dimmed">
          {t('combat.effects.none')}
        </Text>
      ) : (
        <ul className="combat-effects">
          {mine.map((effect) => (
            <li key={effect.id}>
              <div>
                <Text size="sm" fw={600}>
                  {effect.label}
                  {effect.condition && (
                    <>
                      {' · '}
                      <GlossaryTerm id={glossaryIds.condition(effect.condition)}>
                        {t(`srd.condition.${effect.condition}`)}
                      </GlossaryTerm>
                    </>
                  )}
                </Text>
                <Text size="xs" c="dimmed">
                  {effect.remaining_rounds
                    ? t('combat.effects.remaining', { count: effect.remaining_rounds })
                    : t('combat.effects.untilRemoved')}
                  {!effect.visible && ` · ${t('combat.effects.secret')}`}
                </Text>
              </div>
              {effect.can_remove && (
                <ActionIcon
                  variant="subtle"
                  size={44}
                  disabled={pending}
                  aria-label={t('combat.effects.remove', { label: effect.label })}
                  onClick={() => void run({ kind: 'removeEffect', effectId: effect.id })}
                >
                  <X size={18} aria-hidden="true" />
                </ActionIcon>
              )}
            </li>
          ))}
        </ul>
      )}
      {adding && (
        <EffectDialog
          target={combatant}
          combatants={combatants}
          dm={dm}
          pending={pending}
          close={() => setAdding(false)}
          save={async (effect) => {
            if (await run({ kind: 'effect', encounterId, effect })) setAdding(false)
          }}
        />
      )}
    </section>
  )
}

function EffectDialog({
  target,
  combatants,
  dm,
  pending,
  close,
  save,
}: {
  target: Combatant
  combatants: Combatant[]
  dm: boolean
  pending: boolean
  close: () => void
  save: (effect: {
    target_combatant: string
    source_combatant: string | null
    label: string
    condition: CombatCondition | null
    rounds: number | null
    ticks_on: 'start' | 'end'
    visible: boolean
  }) => void
}) {
  const { t } = useTranslation()
  useReturnFocus()
  const [label, setLabel] = useState('')
  const [condition, setCondition] = useState<string | null>(null)
  const [rounds, setRounds] = useState<number | string>(1)
  const [ticks, setTicks] = useState<'start' | 'end'>('end')
  const [source, setSource] = useState<string | null>(null)
  const [visible, setVisible] = useState(true)
  const roundsValue = typeof rounds === 'number' ? rounds : null
  const valid =
    label.trim().length > 0 &&
    (roundsValue === null ||
      (Number.isInteger(roundsValue) && roundsValue >= 1 && roundsValue <= 100))
  return (
    <Modal
      opened
      onClose={close}
      title={`${t('combat.effects.add')}: ${target.name}`}
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!valid || pending) return
          save({
            target_combatant: target.id,
            source_combatant: source,
            label: label.trim(),
            condition: (condition as CombatCondition | null) ?? null,
            rounds: roundsValue,
            ticks_on: ticks,
            visible: dm ? visible : true,
          })
        }}
      >
        <Stack gap="sm">
          <TextInput
            data-autofocus
            required
            label={t('combat.effects.label')}
            placeholder={t('combat.effects.labelPlaceholder')}
            value={label}
            maxLength={60}
            onChange={(event) => setLabel(event.currentTarget.value)}
          />
          <Select
            label={t('combat.effects.condition')}
            value={condition}
            onChange={setCondition}
            clearable
            placeholder={t('combat.effects.noCondition')}
            data={combatConditions.map((key) => ({
              value: key,
              label: t(`srd.condition.${key}`),
            }))}
          />
          <NumberInput
            label={t('combat.effects.rounds')}
            description={t('combat.effects.roundsHint')}
            min={1}
            max={100}
            allowDecimal={false}
            value={rounds}
            onChange={setRounds}
          />
          <div>
            <Text size="sm" fw={500} mb={4} id="fx-ticks">
              {t('combat.effects.ticks')}
            </Text>
            <SegmentedControl
              fullWidth
              orientation="vertical"
              className="combat-segmented-wrap"
              aria-labelledby="fx-ticks"
              value={ticks}
              onChange={(value) => setTicks(value as 'start' | 'end')}
              data={[
                { value: 'start', label: t('combat.effects.tickStart') },
                { value: 'end', label: t('combat.effects.tickEnd') },
              ]}
            />
          </div>
          <Select
            label={t('combat.effects.source')}
            value={source}
            onChange={setSource}
            clearable
            placeholder={t('combat.effects.sourceSelf')}
            data={combatants
              .filter((c) => c.id !== target.id && c.kind !== 'lair')
              .map((c) => ({ value: c.id, label: c.name }))}
          />
          {dm && (
            <Switch
              className="combat-switch"
              size="md"
              label={t('combat.effects.visible')}
              checked={visible}
              onChange={(event) => setVisible(event.currentTarget.checked)}
            />
          )}
          <Group justify="flex-end">
            <Button variant="subtle" onClick={close}>
              {t('action.cancel')}
            </Button>
            <Button type="submit" disabled={!valid || pending} loading={pending}>
              {t('combat.effects.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}

function DmControls({ combatant, run, pending, status, activeId, encounterId, onRemove }: Props) {
  const { t } = useTranslation()
  const [notes, setNotes] = useState(combatant.dm_notes ?? '')
  // Closing the drawer (Escape included) flushes an unsaved note instead of dropping it.
  const sent = useRef<string | null>(null)
  const latest = useRef({ notes, saved: combatant.dm_notes ?? '', run, id: combatant.id })
  useEffect(() => {
    latest.current = { notes, saved: combatant.dm_notes ?? '', run, id: combatant.id }
  })
  const saveNotes = (text: string) => {
    if (text === (combatant.dm_notes ?? '') || text === sent.current) return
    sent.current = text
    void run({ kind: 'update', combatantId: combatant.id, patch: { dm_notes: text } })
  }
  useEffect(
    () => () => {
      const { notes: text, saved, run: save, id } = latest.current
      if (text !== saved && text !== sent.current)
        void save({ kind: 'update', combatantId: id, patch: { dm_notes: text } })
    },
    [],
  )
  const [editing, setEditing] = useState(false)
  const npc = combatant.kind === 'npc'
  const legendary = combatant.legendary
  return (
    <Paper className="combat-panel combat-dm" p="sm">
      <Group justify="space-between" wrap="nowrap">
        <Title order={4} className="combat-panel-title">
          {t('combat.dm.title')}
        </Title>
        {(npc || onRemove) && (
          <Menu position="bottom-end">
            <Menu.Target>
              <ActionIcon
                data-return-focus={`detail-menu-${combatant.id}`}
                variant="subtle"
                size={44}
                aria-label={t('combat.dm.menu', { name: combatant.name })}
              >
                <Ellipsis size={20} aria-hidden="true" />
              </ActionIcon>
            </Menu.Target>
            <Menu.Dropdown className="combat-menu">
              {npc && (
                <Menu.Item
                  leftSection={<Pencil size={16} aria-hidden="true" />}
                  onClick={() => setEditing(true)}
                >
                  {t('combat.dm.edit')}
                </Menu.Item>
              )}
              {npc && onRemove && <Menu.Divider />}
              {onRemove && (
                <Menu.Item
                  color="red"
                  leftSection={<UserMinus size={16} aria-hidden="true" />}
                  onClick={onRemove}
                >
                  {t('combat.row.remove')}
                </Menu.Item>
              )}
            </Menu.Dropdown>
          </Menu>
        )}
      </Group>
      <Stack gap="sm" mt="xs">
        {status === 'active' &&
          !combatant.is_active &&
          !combatant.hidden &&
          !combatant.defeated && (
            <Button
              variant="light"
              disabled={pending}
              onClick={() =>
                void run({
                  kind: 'jump',
                  encounterId,
                  target: combatant.id,
                  expected: activeId,
                })
              }
            >
              {t('combat.turn.jump', { name: combatant.name })}
            </Button>
          )}
        {legendary && legendary.max > 0 && (
          <Group justify="space-between">
            <Group gap={6}>
              <Crown size={16} aria-hidden="true" />
              <Text size="sm">
                {t('combat.legendary')}: {t('combat.legendary.count', legendary)}
              </Text>
            </Group>
            <Group gap={4}>
              <ActionIcon
                variant="default"
                size={44}
                aria-label={t('combat.legendary.restore')}
                disabled={pending || legendary.used === 0}
                onClick={() =>
                  void run({
                    kind: 'update',
                    combatantId: combatant.id,
                    patch: { legendary_used: legendary.used - 1 },
                  })
                }
              >
                <Minus size={16} aria-hidden="true" />
              </ActionIcon>
              <ActionIcon
                variant="default"
                size={44}
                aria-label={t('combat.legendary.use')}
                disabled={pending || legendary.used >= legendary.max}
                onClick={() =>
                  void run({
                    kind: 'update',
                    combatantId: combatant.id,
                    patch: { legendary_used: legendary.used + 1 },
                  })
                }
              >
                <Plus size={16} aria-hidden="true" />
              </ActionIcon>
            </Group>
          </Group>
        )}
        <Switch
          className="combat-switch"
          size="md"
          label={t('combat.dm.hidden')}
          checked={combatant.hidden === true}
          disabled={pending}
          onChange={(event) =>
            void run({
              kind: 'update',
              combatantId: combatant.id,
              patch: { hidden: event.currentTarget.checked },
            })
          }
        />
        {npc && (
          <Switch
            className="combat-switch"
            size="md"
            label={t('combat.dm.hpRevealed')}
            checked={combatant.hp_revealed === true}
            disabled={pending}
            onChange={(event) =>
              void run({
                kind: 'update',
                combatantId: combatant.id,
                patch: { hp_revealed: event.currentTarget.checked },
              })
            }
          />
        )}
        {combatant.kind !== 'lair' && (
          <Switch
            className="combat-switch"
            size="md"
            label={t('combat.dm.defeated')}
            checked={combatant.defeated}
            disabled={pending}
            onChange={(event) =>
              void run({
                kind: 'update',
                combatantId: combatant.id,
                patch: { defeated: event.currentTarget.checked },
              })
            }
          />
        )}
        <Textarea
          label={t('combat.dm.notes')}
          value={notes}
          maxLength={2000}
          autosize
          minRows={2}
          onChange={(event) => setNotes(event.currentTarget.value)}
          // Leaving the field saves, so closing the drawer never drops a note silently.
          onBlur={() => saveNotes(notes)}
        />
        <Group justify="flex-end">
          <Button
            variant="default"
            disabled={pending || notes === (combatant.dm_notes ?? '')}
            onClick={() => saveNotes(notes)}
          >
            {t('combat.dm.saveNotes')}
          </Button>
        </Group>
      </Stack>
      {editing && (
        <StatsDialog
          combatant={combatant}
          pending={pending}
          close={() => setEditing(false)}
          save={async (patch) => {
            if (await run({ kind: 'update', combatantId: combatant.id, patch })) setEditing(false)
          }}
        />
      )}
    </Paper>
  )
}

function StatsDialog({
  combatant,
  pending,
  close,
  save,
}: {
  combatant: Combatant
  pending: boolean
  close: () => void
  save: (patch: {
    name: string
    max_hp: number
    current_hp: number
    armor_class: number
    initiative_bonus: number
  }) => void
}) {
  const { t } = useTranslation()
  useReturnFocus()
  const [name, setName] = useState(combatant.name)
  const [maxHp, setMaxHp] = useState<number | string>(combatant.hp?.max ?? 1)
  const [current, setCurrent] = useState<number | string>(combatant.hp?.current ?? 1)
  const [ac, setAc] = useState<number | string>(combatant.armor_class ?? 10)
  const [bonus, setBonus] = useState<number | string>(combatant.initiative_bonus ?? 0)
  const nums = [maxHp, current, ac, bonus]
  const valid = name.trim().length > 0 && nums.every((n) => typeof n === 'number')
  return (
    <Modal
      opened
      onClose={close}
      title={t('combat.dm.edit')}
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!valid) return
          save({
            name: name.trim(),
            max_hp: maxHp as number,
            current_hp: Math.min(current as number, maxHp as number),
            armor_class: ac as number,
            initiative_bonus: bonus as number,
          })
        }}
      >
        <Stack gap="sm">
          <TextInput
            data-autofocus
            label={t('combat.add.name')}
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <div className="combat-grid-2">
            <NumberInput
              label={t('combat.add.maxHp')}
              min={1}
              max={99999}
              allowDecimal={false}
              value={maxHp}
              onChange={setMaxHp}
            />
            <NumberInput
              label={t('combat.hp.label')}
              min={0}
              max={99999}
              allowDecimal={false}
              value={current}
              onChange={setCurrent}
            />
            <NumberInput
              label={t('combat.add.ac')}
              min={0}
              max={99}
              allowDecimal={false}
              value={ac}
              onChange={setAc}
            />
            <NumberInput
              label={t('combat.add.bonus')}
              min={-20}
              max={30}
              allowDecimal={false}
              value={bonus}
              onChange={setBonus}
            />
          </div>
          <Group justify="flex-end">
            <Button variant="subtle" onClick={close}>
              {t('action.cancel')}
            </Button>
            <Button type="submit" disabled={!valid || pending} loading={pending}>
              {t('combat.dm.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
