import { useId, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Collapse,
  Group,
  Loader,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core'
import { Modal } from '@/shared/ui/overlays'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Dices, Sigma, SlidersHorizontal, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import {
  averageDice,
  diceText,
  parseDice,
  trackersOf,
  type CreatureListItem,
  type MonsterRow,
  type StatBlock,
} from '@/features/bestiary'
import { usePhone } from '@/shared/ui/use-viewport'
import { encountersQuery } from '../api'
import type { CombatantTemplate, EncounterSummary } from '../domain/combat'
import { creatureFormula, npcEntryFor, useSpellLabel, type AddOptions } from './creatures'
import { useRunner } from './helpers'
import { RunnerError } from './parts'
import { NumberDial, SideToggle, TileGroup } from './bestiary-widgets'
import { typeGlyphs } from './bestiary-glyphs'
import { useTracedAdd } from './encounter-add'
import { Token } from './token'

/**
 * Adds a bestiary creature to an encounter (ADR 028): which fight, how many, average or rolled
 * hit points (rolled on the server, one roll per creature), the name the table sees, hidden and a
 * shared initiative roll. The stat block's recharges and daily uses become trackers.
 */
export function AddToEncounterDialog({
  campaignId,
  item,
  block,
  row,
  template,
  targetEncounter,
  onAdded,
  onClose,
}: {
  campaignId: string
  item: CreatureListItem
  block: StatBlock | null
  row?: MonsterRow
  template?: CombatantTemplate
  targetEncounter?: EncounterSummary
  /** The add landed: the stat block says so (and offers Undo) once the dialog closes. */
  onAdded: (added: {
    encounterId: string
    encounterName: string
    count: number
    ids: string[] | null
  }) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const phone = usePhone()
  const encounters = useQuery(encountersQuery(state.user!.id, campaignId))
  const { run, pending, error, trigger, clear } = useRunner(campaignId)
  const spellLabel = useSpellLabel()
  const tracedAdd = useTracedAdd(campaignId, run)
  const open = (encounters.data ?? []).filter((e) => e.status !== 'ended')
  const [encounterId, setEncounterId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [count, setCount] = useState<number | string>(1)
  const [hpMode, setHpMode] = useState<'average' | 'roll'>('average')
  const [alias, setAlias] = useState('')
  const [side, setSide] = useState<'enemy' | 'ally'>(template?.side ?? 'enemy')
  const [hidden, setHidden] = useState(false)
  const [share, setShare] = useState(true)
  const [optionsOpen, setOptionsOpen] = useState(false)
  const optionsId = useId()
  const chosen =
    targetEncounter?.id ??
    encounterId ??
    open.find((e) => e.status !== 'draft')?.id ??
    open[0]?.id ??
    null
  const formula = creatureFormula(block) ?? template?.hp_formula ?? undefined
  const dice = formula ? parseDice(formula) : null
  const trackers = block ? trackersOf(block, spellLabel) : []
  const total = typeof count === 'number' ? count : 1
  const loading = encounters.isPending
  const failed = encounters.isError && !encounters.data
  const creating = !targetEncounter && !loading && !failed && open.length === 0
  const targetLabel = creating ? newName.trim() : (open.find((e) => e.id === chosen)?.name ?? '')
  const valid =
    !loading &&
    !failed &&
    typeof count === 'number' &&
    (!targetEncounter || open.some((e) => e.id === targetEncounter.id)) &&
    (creating ? newName.trim().length > 0 : !!chosen)
  const countRef = useRef<HTMLInputElement>(null)
  const submit = async () => {
    if (!valid || pending) return
    let target = chosen
    let targetName = open.find((e) => e.id === chosen)?.name ?? ''
    if (creating) {
      const name = newName.trim()
      const created = await createEncounter(name)
      if (!created) return
      target = created
      targetName = name
    }
    const options: AddOptions = { count: total, hpMode, alias, hidden, share, side }
    const entry = npcEntryFor(item, block, options, spellLabel, row)
    if (!dice) delete entry.hp_formula
    const added = await tracedAdd(target!, [entry])
    if (added.ok)
      onAdded({ encounterId: target!, encounterName: targetName, count: total, ids: added.ids })
  }
  const createEncounter = async (name: string) => {
    const before = new Set((encounters.data ?? []).map((e) => e.id))
    if (!(await run({ kind: 'create', name }))) return null
    const fresh = await encounters.refetch()
    return (fresh.data ?? []).find((e) => !before.has(e.id))?.id ?? null
  }
  return (
    <Modal
      opened
      onClose={onClose}
      fullScreen={phone}
      zIndex={400}
      size="lg"
      title={t('bestiary.add.title', { name: item.name })}
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <Stack gap="md">
          <RunnerError error={error} trigger={trigger} onClose={clear} />
          {loading ? (
            <Group gap="sm" role="status" mih={60}>
              <Loader size="sm" />
              <Text size="sm">{t('bestiary.add.loading')}</Text>
            </Group>
          ) : failed ? (
            <Alert color="red" variant="light" role="alert">
              <Text size="sm">{t('bestiary.add.loadFailed')}</Text>
              <Button
                mt="xs"
                variant="light"
                onClick={() => {
                  // The button leaves while it loads: keep the keyboard in the form.
                  countRef.current?.focus()
                  void encounters.refetch()
                }}
              >
                {t('common.retry')}
              </Button>
            </Alert>
          ) : targetEncounter ? (
            <div>
              <Text size="sm" c="dimmed">
                {t('bestiary.add.encounter')}
              </Text>
              <Text fw={650} className="bst-context-name">
                {targetEncounter.name}
              </Text>
              {!valid && !open.some((e) => e.id === targetEncounter.id) && (
                <Alert role="status">{t('bestiary.context.unavailable')}</Alert>
              )}
            </div>
          ) : creating ? (
            <TextInput
              required
              label={t('bestiary.add.newEncounter')}
              description={t('bestiary.add.noEncounters')}
              placeholder={t('combat.create.placeholder')}
              value={newName}
              maxLength={80}
              onChange={(event) => setNewName(event.currentTarget.value)}
            />
          ) : (
            <Select
              label={t('bestiary.add.encounter')}
              value={chosen}
              allowDeselect={false}
              onChange={setEncounterId}
              comboboxProps={{ withinPortal: true, zIndex: 410 }}
              data={open.map((e) => ({
                value: e.id,
                label: `${e.name} · ${t(`combat.status.${e.status}`)}`,
              }))}
            />
          )}
          <div className="bst-add-count">
            <NumberDial
              // The first field that is there from the start (encounters may still be loading).
              autoFocus
              inputRef={countRef}
              label={t('combat.add.count')}
              icon={Users}
              min={1}
              max={20}
              value={count}
              onChange={setCount}
            />
            <div className="bst-stack" aria-hidden="true">
              {Array.from({ length: Math.min(total, 5) }, (_, i) => (
                <Token
                  key={i}
                  name={item.name}
                  side={side}
                  imageKind="creature"
                  path={item.imagePath ?? item.packPath ?? null}
                  size={36}
                  glyph={item.type ? typeGlyphs[item.type] : undefined}
                />
              ))}
              {total > 5 && (
                <span className="bst-stack-more">
                  {t('bestiary.add.stackMore', { count: total - 5 })}
                </span>
              )}
            </div>
          </div>
          <TileGroup
            legend={t('bestiary.add.hp')}
            className="bst-choice-tiles"
            value={dice ? hpMode : 'average'}
            onChange={setHpMode}
            options={[
              {
                value: 'average' as const,
                content: (
                  <span className="bst-choice">
                    <Sigma size={18} aria-hidden="true" />
                    <span>
                      <span className="bst-choice-title">
                        {t('bestiary.add.average', { hp: dice ? averageDice(dice) : item.hp })}
                      </span>
                      <span className="bst-choice-help">{t('bestiary.add.averageHelp')}</span>
                    </span>
                  </span>
                ),
              },
              {
                value: 'roll' as const,
                disabled: !dice,
                content: (
                  <span className="bst-choice">
                    <Dices size={18} aria-hidden="true" />
                    <span>
                      <span className="bst-choice-title">
                        {dice
                          ? t('bestiary.add.roll', { dice: diceText(dice) })
                          : t('bestiary.add.noDice')}
                      </span>
                      {dice && (
                        <span className="bst-choice-help">
                          {t('bestiary.add.rollRange', {
                            min: Math.max(1, dice.count + dice.bonus),
                            max: dice.count * dice.faces + dice.bonus,
                          })}
                        </span>
                      )}
                    </span>
                  </span>
                ),
              },
            ]}
          />
          {trackers.length > 0 && (
            <Text size="sm" c="dimmed">
              {t('bestiary.add.trackers', {
                count: trackers.length,
                list: trackers.map((tr) => tr.label).join(', '),
              })}
            </Text>
          )}
          <div className="bst-options">
            <button
              type="button"
              className="bst-options-toggle"
              aria-expanded={optionsOpen}
              aria-controls={optionsId}
              onClick={() => setOptionsOpen((v) => !v)}
            >
              <SlidersHorizontal size={18} aria-hidden="true" />
              <span>
                <span className="bst-options-title">{t('bestiary.add.tableOptions')}</span>
                <span className="bst-options-summary">
                  {t('bestiary.add.tableSummary', {
                    side: t(`combat.side.${side}`),
                    visibility: t(hidden ? 'bestiary.add.hiddenShort' : 'bestiary.add.visible'),
                    name: alias.trim() || t('bestiary.add.realName'),
                  })}
                </span>
              </span>
              <ChevronDown size={18} className="bst-options-chevron" aria-hidden="true" />
            </button>
            <Collapse expanded={optionsOpen} id={optionsId} transitionDuration={160}>
              <div className="bst-options-body">
                <TextInput
                  label={t('bestiary.add.alias')}
                  description={t('bestiary.add.aliasHelp')}
                  value={alias}
                  maxLength={60}
                  onChange={(event) => setAlias(event.currentTarget.value)}
                />
                <SideToggle
                  legend={t('combat.add.side')}
                  name={item.name}
                  value={side}
                  onChange={setSide}
                />
                <Switch
                  className="combat-switch"
                  size="md"
                  label={t('combat.add.hidden')}
                  checked={hidden}
                  onChange={(event) => setHidden(event.currentTarget.checked)}
                />
                {total > 1 && (
                  <Switch
                    className="combat-switch"
                    size="md"
                    label={t('combat.add.share')}
                    checked={share}
                    onChange={(event) => setShare(event.currentTarget.checked)}
                  />
                )}
              </div>
            </Collapse>
          </div>
          <Group justify="flex-end" className="bst-dialog-actions">
            <Button variant="subtle" onClick={onClose}>
              {t('action.cancel')}
            </Button>
            <Button type="submit" disabled={!valid || pending} loading={pending}>
              {targetLabel
                ? t('bestiary.add.submitTo', { count: total, encounter: targetLabel })
                : t('bestiary.add.submit', { count: total })}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
