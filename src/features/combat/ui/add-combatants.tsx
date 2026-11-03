import { useState } from 'react'
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
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Castle, UserPlus, Users } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { charactersQuery } from '@/features/characters'
import { templatesQuery } from '../api'
import type { Combatant, CombatantTemplate, NpcEntry } from '../domain/combat'
import type { Run } from './helpers'

/** DM panel: the party in one tap, creatures in batches (custom or from the bestiary), a lair. */
export function AddCombatants({
  campaignId,
  encounterId,
  combatants,
  run,
  pending,
}: {
  campaignId: string
  encounterId: string
  combatants: Combatant[]
  run: Run
  pending: boolean
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const userId = state.user!.id
  const characters = useQuery(charactersQuery(userId, campaignId))
  const templates = useQuery(templatesQuery(userId, campaignId))
  const present = new Set(combatants.map((c) => c.character_id).filter(Boolean))
  const missing = (characters.data ?? []).filter((c) => !present.has(c.id))
  const assignedMissing = missing.filter((c) => c.user_id)
  const [notice, setNotice] = useState<number | null>(null)
  const added = async (count: number, ok: boolean) => {
    if (ok) setNotice(count)
    return ok
  }
  const hasLair = combatants.some((c) => c.kind === 'lair')
  return (
    <Stack gap="md" className="combat-add">
      <Title order={3} className="combat-section-title">
        {t('combat.add.title')}
      </Title>
      {notice !== null && (
        <Alert
          role="status"
          withCloseButton
          closeButtonLabel={t('action.cancel')}
          onClose={() => setNotice(null)}
        >
          {t('combat.add.added', { count: notice })}
        </Alert>
      )}
      <Paper className="combat-panel" p="sm">
        <Title order={4} className="combat-panel-title">
          {t('combat.add.characters')}
        </Title>
        {missing.length === 0 ? (
          <Text size="sm" c="dimmed" mt={6}>
            {t('combat.add.partyDone')}
          </Text>
        ) : (
          <Stack gap="xs" mt={6}>
            {assignedMissing.length > 0 && (
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
            <Group gap="xs">
              {missing.map((character) => (
                <Button
                  key={character.id}
                  variant="default"
                  leftSection={<UserPlus size={16} aria-hidden="true" />}
                  disabled={pending}
                  onClick={async () =>
                    void added(
                      1,
                      await run({
                        kind: 'add',
                        encounterId,
                        entries: [{ kind: 'character', character_id: character.id }],
                      }),
                    )
                  }
                >
                  {t('combat.add.character', { name: character.name })}
                </Button>
              ))}
            </Group>
          </Stack>
        )}
      </Paper>
      <CreatureForm
        templates={templates.data ?? []}
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

function CreatureForm({
  templates,
  pending,
  submit,
}: {
  templates: CombatantTemplate[]
  pending: boolean
  submit: (entry: NpcEntry) => Promise<boolean>
}) {
  const { t } = useTranslation()
  const [templateId, setTemplateId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [count, setCount] = useState<number | string>(1)
  const [maxHp, setMaxHp] = useState<number | string>(7)
  const [ac, setAc] = useState<number | string>(12)
  const [bonus, setBonus] = useState<number | string>(0)
  const [legendary, setLegendary] = useState<number | string>(0)
  const [side, setSide] = useState<'enemy' | 'ally'>('enemy')
  const [hidden, setHidden] = useState(false)
  const [share, setShare] = useState(true)
  const pick = (id: string | null) => {
    setTemplateId(id)
    const template = templates.find((item) => item.id === id)
    if (!template) return
    setName(template.name)
    setMaxHp(template.max_hp)
    setAc(template.armor_class)
    setBonus(template.initiative_bonus)
    setLegendary(template.legendary_max)
    setSide(template.side)
  }
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
          const ok = await submit({
            kind: 'npc',
            template_id: templateId ?? undefined,
            name: name.trim(),
            count: total,
            max_hp: maxHp as number,
            armor_class: ac as number,
            initiative_bonus: bonus as number,
            legendary_max: legendary as number,
            side,
            hidden,
            share_initiative: total > 1 && share,
          })
          if (ok) setHidden(false)
        }}
      >
        <Stack gap="sm" mt={6}>
          {templates.length > 0 && (
            <Select
              label={t('combat.add.template')}
              value={templateId}
              onChange={pick}
              clearable
              placeholder={t('combat.add.templateNone')}
              data={templates.map((template) => ({ value: template.id, label: template.name }))}
            />
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
            size="md"
            label={t('combat.add.hidden')}
            checked={hidden}
            onChange={(event) => setHidden(event.currentTarget.checked)}
          />
          {total > 1 && (
            <Switch
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
