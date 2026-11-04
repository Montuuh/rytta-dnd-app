import { useEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Dices, Minus, Plus, Sigma } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
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
import type { CombatantTemplate } from '../domain/combat'
import { creatureFormula, npcEntryFor, useSpellLabel, type AddOptions } from './creatures'
import { useRunner } from './helpers'
import { RunnerError } from './parts'

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
  onClose,
}: {
  campaignId: string
  item: CreatureListItem
  block: StatBlock | null
  row?: MonsterRow
  template?: CombatantTemplate
  onClose: () => void
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const phone = usePhone()
  const encounters = useQuery(encountersQuery(state.user!.id, campaignId))
  const { run, pending, error, trigger, clear } = useRunner(campaignId)
  const spellLabel = useSpellLabel()
  const open = (encounters.data ?? []).filter((e) => e.status !== 'ended')
  const [encounterId, setEncounterId] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [count, setCount] = useState<number | string>(1)
  const [hpMode, setHpMode] = useState<'average' | 'roll'>('average')
  const [alias, setAlias] = useState('')
  const [side, setSide] = useState<'enemy' | 'ally'>(template?.side ?? 'enemy')
  const [hidden, setHidden] = useState(false)
  const [share, setShare] = useState(true)
  const [done, setDone] = useState<{ id: string; name: string; count: number } | null>(null)
  const chosen = encounterId ?? open.find((e) => e.status !== 'draft')?.id ?? open[0]?.id ?? null
  const formula = creatureFormula(block) ?? template?.hp_formula ?? undefined
  const dice = formula ? parseDice(formula) : null
  const trackers = block ? trackersOf(block, spellLabel) : []
  const total = typeof count === 'number' ? count : 1
  const loading = encounters.isPending
  const failed = encounters.isError && !encounters.data
  const creating = !loading && !failed && open.length === 0
  const valid =
    !loading &&
    !failed &&
    typeof count === 'number' &&
    (creating ? newName.trim().length > 0 : !!chosen)
  // The success state replaces the form: focus moves to its main action.
  const openLink = useRef<HTMLAnchorElement>(null)
  const countRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (done) requestAnimationFrame(() => openLink.current?.focus())
  }, [done])
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
    if (await run({ kind: 'add', encounterId: target!, entries: [entry] }))
      setDone({ id: target!, name: targetName, count: total })
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
      {done ? (
        <Stack gap="md">
          <Alert className="combat-alert" role="status">
            {t('bestiary.add.done', { count: done.count, name: item.name, encounter: done.name })}
          </Alert>
          <Group justify="flex-end" className="bst-dialog-actions">
            <Button variant="subtle" onClick={onClose}>
              {t('bestiary.add.keepBrowsing')}
            </Button>
            <Button
              ref={openLink}
              component={Link}
              to={`/campaign/${campaignId}/combat/${done.id}?view=console`}
            >
              {t('bestiary.add.openEncounter')}
            </Button>
          </Group>
        </Stack>
      ) : (
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
            <div className="bst-grid">
              <NumberInput
                // The first field that is there from the start (encounters may still be loading).
                data-autofocus
                ref={countRef}
                hideControls
                label={t('combat.add.count')}
                min={1}
                max={20}
                allowDecimal={false}
                value={count}
                onChange={setCount}
                classNames={{ input: 'bst-count-input' }}
                leftSectionWidth={48}
                rightSectionWidth={48}
                leftSection={
                  <ActionIcon
                    variant="subtle"
                    size={44}
                    disabled={total <= 1}
                    aria-label={t('bestiary.add.fewer')}
                    onClick={() => setCount(Math.max(1, total - 1))}
                  >
                    <Minus size={18} aria-hidden="true" />
                  </ActionIcon>
                }
                rightSection={
                  <ActionIcon
                    variant="subtle"
                    size={44}
                    disabled={total >= 20}
                    aria-label={t('bestiary.add.more')}
                    onClick={() => setCount(Math.min(20, total + 1))}
                  >
                    <Plus size={18} aria-hidden="true" />
                  </ActionIcon>
                }
                leftSectionPointerEvents="all"
                rightSectionPointerEvents="all"
              />
              <TextInput
                label={t('bestiary.add.alias')}
                description={t('bestiary.add.aliasHelp')}
                value={alias}
                maxLength={60}
                onChange={(event) => setAlias(event.currentTarget.value)}
              />
            </div>
            <div>
              <Text size="sm" fw={500} mb={4} id="bestiary-hp-mode">
                {t('bestiary.add.hp')}
              </Text>
              <SegmentedControl
                className="bst-seg-wrap"
                fullWidth
                aria-labelledby="bestiary-hp-mode"
                value={dice ? hpMode : 'average'}
                onChange={(value) => setHpMode(value as 'average' | 'roll')}
                data={[
                  {
                    value: 'average',
                    label: (
                      <span className="bst-seg">
                        <Sigma size={16} aria-hidden="true" />
                        {t('bestiary.add.average', { hp: dice ? averageDice(dice) : item.hp })}
                      </span>
                    ),
                  },
                  {
                    value: 'roll',
                    disabled: !dice,
                    label: (
                      <span className="bst-seg">
                        <Dices size={16} aria-hidden="true" />
                        {dice
                          ? t('bestiary.add.roll', { dice: diceText(dice) })
                          : t('bestiary.add.noDice')}
                      </span>
                    ),
                  },
                ]}
              />
              {hpMode === 'roll' && dice && (
                <Text size="sm" c="dimmed" mt={4}>
                  {t('bestiary.add.rollHelp')}
                </Text>
              )}
            </div>
            <div>
              <Text size="sm" fw={500} mb={4} id="bestiary-side">
                {t('combat.add.side')}
              </Text>
              <SegmentedControl
                fullWidth
                aria-labelledby="bestiary-side"
                value={side}
                onChange={(value) => setSide(value as 'enemy' | 'ally')}
                data={[
                  { value: 'enemy', label: t('combat.side.enemy') },
                  { value: 'ally', label: t('combat.side.ally') },
                ]}
              />
            </div>
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
            {trackers.length > 0 && (
              <Text size="sm" c="dimmed">
                {t('bestiary.add.trackers', {
                  count: trackers.length,
                  list: trackers.map((tr) => tr.label).join(', '),
                })}
              </Text>
            )}
            <Group justify="flex-end" className="bst-dialog-actions">
              <Button variant="subtle" onClick={onClose}>
                {t('action.cancel')}
              </Button>
              <Button type="submit" disabled={!valid || pending} loading={pending}>
                {t('bestiary.add.submit', { count: total })}
              </Button>
            </Group>
          </Stack>
        </form>
      )}
    </Modal>
  )
}
