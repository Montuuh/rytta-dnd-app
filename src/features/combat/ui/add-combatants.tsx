import { useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Group,
  NumberInput,
  Paper,
  SegmentedControl,
  Select,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Castle, UserPlus, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { charactersQuery } from '@/features/characters'
import { averageDice, diceText, parseDice, type CreatureListItem } from '@/features/bestiary'
import type { Combatant, EncounterStatus, NpcEntry } from '../domain/combat'
import {
  creatureFilter,
  creatureFormula,
  npcEntryFor,
  useCreatureCatalog,
  useSpellLabel,
} from './creatures'
import { InitiativeDialog } from './amount-dialog'
import type { Run } from './helpers'
import { OfficialElsewhere } from './official-bestiary'
import { JoinPreview } from './roster'

/** DM panel: the party in one tap, creatures in batches (custom or from the bestiary), a lair.
 * Once the fight runs, a character joins with its initiative total and a preview of its place. */
export function AddCombatants({
  campaignId,
  encounterId,
  combatants,
  status,
  round,
  run,
  pending,
}: {
  campaignId: string
  encounterId: string
  combatants: Combatant[]
  status: EncounterStatus
  round: number
  run: Run
  pending: boolean
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const userId = state.user!.id
  const characters = useQuery(charactersQuery(userId, campaignId))
  const present = new Set(combatants.map((c) => c.character_id).filter(Boolean))
  const missing = (characters.data ?? []).filter((c) => !present.has(c.id))
  const assignedMissing = missing.filter((c) => c.user_id)
  const running = status === 'active'
  const [joining, setJoining] = useState<{ id: string; name: string } | null>(null)
  const [notice, setNotice] = useState<number | null>(null)
  const added = async (count: number, ok: boolean) => {
    if (ok) setNotice(count)
    return ok
  }
  /** The added character leaves the list: keep the keyboard on the next one (or the title). */
  const keepPlace = (id: string) => {
    const index = missing.findIndex((c) => c.id === id)
    const next = missing[index + 1] ?? missing[index - 1]
    requestAnimationFrame(() =>
      (
        (next && document.getElementById(`bench-${next.id}`)) ||
        document.getElementById('combat-add-characters')
      )?.focus(),
    )
  }
  const addNow = async (character: { id: string }) => {
    if (
      await added(
        1,
        await run({
          kind: 'add',
          encounterId,
          entries: [{ kind: 'character', character_id: character.id }],
        }),
      )
    )
      keepPlace(character.id)
  }
  const hasLair = combatants.some((c) => c.kind === 'lair')
  return (
    <Stack gap="md" className="combat-add">
      <Title order={3} className="combat-section-title">
        {t('combat.add.title')}
      </Title>
      {notice !== null && (
        <Alert
          className="combat-alert"
          role="status"
          withCloseButton
          closeButtonLabel={t('action.cancel')}
          onClose={() => setNotice(null)}
        >
          {t('combat.add.added', { count: notice })}
        </Alert>
      )}
      <Paper className="combat-panel" p="sm">
        <Title order={4} className="combat-panel-title" id="combat-add-characters" tabIndex={-1}>
          {t('combat.add.characters')}
        </Title>
        {missing.length === 0 ? (
          <Text size="sm" c="dimmed" mt={6}>
            {t('combat.add.partyDone')}
          </Text>
        ) : (
          <Stack gap="xs" mt={6}>
            {!running && assignedMissing.length > 0 && (
              <Button
                leftSection={<Users size={16} aria-hidden="true" />}
                disabled={pending}
                onClick={async () =>
                  void added(
                    assignedMissing.length,
                    await run({
                      kind: 'add',
                      encounterId,
                      entries: assignedMissing.map((c) => ({
                        kind: 'character' as const,
                        character_id: c.id,
                      })),
                    }),
                  )
                }
              >
                {t('combat.add.party')}
              </Button>
            )}
            <ul className="combat-bench" aria-labelledby="combat-add-characters">
              {missing.map((character) => (
                <li key={character.id}>
                  <UnstyledButton
                    id={`bench-${character.id}`}
                    className="combat-bench-row"
                    disabled={pending}
                    aria-label={t('combat.add.character', { name: character.name })}
                    onClick={() =>
                      running
                        ? setJoining({ id: character.id, name: character.name })
                        : void addNow(character)
                    }
                  >
                    <span className="combat-bench-name">{character.name}</span>
                    <span className="combat-bench-add" aria-hidden="true">
                      <UserPlus size={18} />
                    </span>
                  </UnstyledButton>
                </li>
              ))}
            </ul>
          </Stack>
        )}
      </Paper>
      {joining && (
        <InitiativeDialog
          name={joining.name}
          bonus={null}
          dm
          pending={pending}
          title={t('combat.join.title', { name: joining.name })}
          submitLabel={t('combat.join.submit')}
          hideHint
          close={() => setJoining(null)}
          preview={(total) => (
            <JoinPreview combatants={combatants} name={joining.name} total={total} round={round} />
          )}
          save={async (total) => {
            const ok = await run({
              kind: 'add',
              encounterId,
              entries: [{ kind: 'character', character_id: joining.id, initiative: total }],
            })
            if (await added(1, ok)) {
              setJoining(null)
              keepPlace(joining.id)
            }
          }}
        />
      )}
      <CreatureForm
        campaignId={campaignId}
        pending={pending}
        submit={async (entry) =>
          added(entry.count ?? 1, await run({ kind: 'add', encounterId, entries: [entry] }))
        }
      />
      {!hasLair && (
        <Button
          variant="subtle"
          leftSection={<Castle size={16} aria-hidden="true" />}
          disabled={pending}
          onClick={async () =>
            void added(1, await run({ kind: 'add', encounterId, entries: [{ kind: 'lair' }] }))
          }
        >
          {t('combat.add.lair')}
        </Button>
      )}
    </Stack>
  )
}

/** One creature (or a batch): from the bestiary (SRD or campaign, ADR 028) or typed in. */
function CreatureForm({
  campaignId,
  pending,
  submit,
}: {
  campaignId: string
  pending: boolean
  submit: (entry: NpcEntry) => Promise<boolean>
}) {
  const { t } = useTranslation()
  const catalog = useCreatureCatalog(campaignId)
  const noOfficial = catalog.official?.downloaded === false
  const spellLabel = useSpellLabel()
  const [picked, setPicked] = useState<CreatureListItem | null>(null)
  const [alias, setAlias] = useState('')
  const [hpMode, setHpMode] = useState<'average' | 'roll'>('average')
  const [name, setName] = useState('')
  const [count, setCount] = useState<number | string>(1)
  const [maxHp, setMaxHp] = useState<number | string>(7)
  const [ac, setAc] = useState<number | string>(12)
  const [bonus, setBonus] = useState<number | string>(0)
  const [legendary, setLegendary] = useState<number | string>(0)
  const [side, setSide] = useState<'enemy' | 'ally'>('enemy')
  const [hidden, setHidden] = useState(false)
  const [share, setShare] = useState(true)
  const pick = (key: string | null) => {
    const item = catalog.items.find((i) => i.key === key) ?? null
    setPicked(item)
    setHpMode('average')
    if (!item) return
    setName(item.name.slice(0, 70))
    setMaxHp(item.hp)
    setAc(item.ac)
    setBonus(item.initiative)
    setLegendary(item.legendary)
    setSide(
      item.source === 'homebrew' ? (catalog.templateById.get(item.id)?.side ?? 'enemy') : 'enemy',
    )
  }
  const block = catalog.blockFor(picked)
  const formula =
    creatureFormula(block) ?? (picked && catalog.templateById.get(picked.id)?.hp_formula)
  const dice = formula ? parseDice(formula) : null
  const filter = useMemo(
    () =>
      creatureFilter(new Map(catalog.items.map((i) => [i.key, `${i.name} ${i.altName ?? ''}`]))),
    [catalog.items],
  )
  const numbers = [count, maxHp, ac, bonus, legendary]
  const valid = name.trim().length > 0 && numbers.every((n) => typeof n === 'number')
  const total = typeof count === 'number' ? count : 1
  return (
    <Paper className="combat-panel" p="sm">
      <Title order={4} className="combat-panel-title">
        {t('combat.add.creature')}
      </Title>
      <form
        onSubmit={async (event) => {
          event.preventDefault()
          if (!valid || pending) return
          const base: NpcEntry = picked
            ? npcEntryFor(
                picked,
                block,
                { count: total, hpMode, alias, hidden, share, side },
                spellLabel,
                picked.source === 'srd' ? catalog.rows.get(picked.id) : undefined,
              )
            : { kind: 'npc' }
          if (base.hp_mode === 'roll' && !dice) delete base.hp_mode
          const ok = await submit({
            ...base,
            name: name.trim(),
            count: total,
            max_hp: maxHp as number,
            armor_class: ac as number,
            initiative_bonus: bonus as number,
            legendary_max: legendary as number,
            side,
            hidden,
            share_initiative: total > 1 && share,
            ...(alias.trim() ? { public_name: alias.trim().slice(0, 70) } : {}),
          })
          if (ok) {
            setHidden(false)
            setAlias('')
          }
        }}
      >
        <Stack gap="sm" mt={6}>
          <Select
            label={t('combat.add.template')}
            description={t(noOfficial ? 'combat.add.templateHelpOwn' : 'combat.add.templateHelp')}
            value={picked?.key ?? null}
            onChange={pick}
            clearable
            searchable
            filter={filter}
            limit={60}
            nothingFoundMessage={t('bestiary.noMatch')}
            placeholder={t('combat.add.templateNone')}
            data={[
              {
                group: t('bestiary.source.homebrew'),
                items: catalog.items
                  .filter((i) => i.source === 'homebrew' && !i.version)
                  .map((i) => ({ value: i.key, label: i.name })),
              },
              {
                group: t('bestiary.source.srd'),
                // RYT-089: a campaign version stays among the official creatures, marked.
                items: catalog.items
                  .filter((i) => i.source === 'srd' || i.version)
                  .map((i) => ({
                    value: i.key,
                    label: [
                      i.name,
                      i.cr ? t('bestiary.crShort', { cr: i.cr }) : null,
                      i.version ? t('bestiary.badge.version') : null,
                    ]
                      .filter(Boolean)
                      .join(' · '),
                  })),
              },
            ].filter((g) => g.items.length > 0)}
          />
          {noOfficial && (
            <OfficialElsewhere campaignId={campaignId} total={catalog.officialCount} />
          )}
          <TextInput
            required
            label={t('combat.add.name')}
            value={name}
            maxLength={70}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <div className="combat-grid-3">
            <NumberInput
              label={t('combat.add.count')}
              min={1}
              max={20}
              allowDecimal={false}
              value={count}
              onChange={setCount}
            />
            <NumberInput
              label={t('combat.add.maxHp')}
              min={1}
              max={99999}
              allowDecimal={false}
              value={maxHp}
              onChange={setMaxHp}
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
            <NumberInput
              label={t('combat.add.legendary')}
              min={0}
              max={9}
              allowDecimal={false}
              value={legendary}
              onChange={setLegendary}
            />
          </div>
          <TextInput
            label={t('bestiary.add.alias')}
            description={t('bestiary.add.aliasHelp')}
            value={alias}
            maxLength={60}
            onChange={(event) => setAlias(event.currentTarget.value)}
          />
          {dice && (
            <div>
              <Text size="sm" fw={500} mb={4} id="creature-hp-mode">
                {t('bestiary.add.hp')}
              </Text>
              <SegmentedControl
                fullWidth
                aria-labelledby="creature-hp-mode"
                value={hpMode}
                onChange={(value) => setHpMode(value as 'average' | 'roll')}
                data={[
                  { value: 'average', label: t('bestiary.add.average', { hp: averageDice(dice) }) },
                  { value: 'roll', label: t('bestiary.add.roll', { dice: diceText(dice) }) },
                ]}
              />
            </div>
          )}
          <div>
            <Text size="sm" fw={500} mb={4} id="creature-side">
              {t('combat.add.side')}
            </Text>
            <SegmentedControl
              fullWidth
              aria-labelledby="creature-side"
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
          <Group justify="flex-end">
            <Button type="submit" disabled={!valid || pending} loading={pending}>
              {t('combat.add.submit')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Paper>
  )
}
