import { useState } from 'react'
import {
  Anchor,
  Button,
  Checkbox,
  Group,
  NativeSelect,
  Stack,
  Text,
  Textarea,
  TextInput,
  Title,
} from '@mantine/core'
import type { UseQueryResult } from '@tanstack/react-query'
import { BookOpen, Copy, NotebookPen } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, useNavigate } from 'react-router'
import { Modal } from '@/shared/ui/overlays'
import { isCombatErrorCode, type Combatant } from '../domain/combat'
import { encounterBalance, type BalanceCreature, type BalanceMember } from '../domain/difficulty'
import type { EncounterPlan, EncounterPlanInput } from '../domain/session'
import { useDuplicateEncounterPlan, useSaveEncounterPlan } from '../session-api'

type PrepProps = {
  campaignId: string
  encounterId: string
  encounterName: string
  revision: number
  plan: UseQueryResult<EncounterPlan, Error>
  combatants: Combatant[]
  available: (BalanceMember & { assigned: boolean })[]
  creatures: BalanceCreature[]
  pending: boolean
}
export function EncounterPreparation(props: PrepProps) {
  const { t } = useTranslation()
  const { plan, campaignId, encounterId, encounterName } = props
  const [mode, setMode] = useState<'edit' | 'duplicate' | null>(null)
  const [saved, setSaved] = useState(false)
  const scene = plan.data?.scenes.find((item) => item.id === plan.data.sceneId)
  const save = useSaveEncounterPlan(campaignId)
  const duplicate = useDuplicateEncounterPlan(campaignId)
  const navigate = useNavigate()
  const busy = save.isPending || duplicate.isPending
  const close = () => {
    if (!busy) setMode(null)
  }
  const open = (which: 'edit' | 'duplicate') => {
    save.reset()
    duplicate.reset()
    setSaved(false)
    setMode(which)
  }
  const error = (save.error ?? duplicate.error)?.message
  return (
    <section className="bld bld-preparation" aria-label={t('builder.plan.title')}>
      <Title order={2} className="combat-section-title">
        {t('builder.plan.title')}
      </Title>
      {scene && (
        <Anchor
          component={Link}
          className="bld-link"
          to={`/campaign/${campaignId}/tabletop/${scene.id}`}
        >
          {scene.name}
        </Anchor>
      )}
      {plan.data?.reward && (
        <Text className="bld-reward">
          <strong>{t('builder.plan.reward')}</strong> {plan.data.reward}
        </Text>
      )}
      {plan.isError && (
        <Group>
          <Text role="alert">{t('builder.plan.loadError')}</Text>
          <Button variant="default" onClick={() => void plan.refetch()}>
            {t('common.retry')}
          </Button>
        </Group>
      )}
      <Group gap="sm">
        <Button
          variant="light"
          leftSection={<NotebookPen size={17} aria-hidden="true" />}
          disabled={!plan.data || props.pending}
          onClick={() => open('edit')}
        >
          {t('builder.plan.edit')}
        </Button>
        <Button
          variant="subtle"
          leftSection={<Copy size={16} aria-hidden="true" />}
          onClick={() => open('duplicate')}
        >
          {t('builder.plan.duplicate')}
        </Button>
        <Anchor
          component={Link}
          className="bld-link"
          to={`/campaign/${campaignId}/members?panel=bestiary&encounter=${encounterId}`}
        >
          <BookOpen size={16} aria-hidden="true" />
          {t('builder.plan.bestiary')}
        </Anchor>
      </Group>
      {saved && (
        <Text size="sm" role="status">
          {t('builder.plan.saved')}
        </Text>
      )}
      <Modal
        opened={mode !== null}
        onClose={close}
        title={t(mode === 'duplicate' ? 'builder.plan.duplicate' : 'builder.plan.edit')}
        centered
        closeOnEscape={!busy}
        closeOnClickOutside={!busy}
        closeButtonProps={{ 'aria-label': t('common.close'), disabled: busy }}
      >
        {error && (
          <Text role="alert" c="red" mb="sm">
            {t(`combat.error.${isCombatErrorCode(error) ? error : 'unavailable'}`)}
          </Text>
        )}
        {mode === 'edit' && plan.data && (
          <PreparationForm
            {...props}
            initial={plan.data}
            busy={busy}
            stale={error === 'stale'}
            onClose={close}
            onSave={async (input) => {
              try {
                await save.mutateAsync(input)
                setSaved(true)
                setMode(null)
              } catch {
                /* The dialog renders the mutation error. */
              }
            }}
          />
        )}
        {mode === 'duplicate' && (
          <DuplicateForm
            initialName={t('builder.plan.copyName', { name: encounterName }).slice(0, 80)}
            busy={busy}
            onClose={close}
            onSave={async (name) => {
              try {
                const id = await duplicate.mutateAsync({ encounterId, name })
                setMode(null)
                void navigate(`/campaign/${campaignId}/combat/${id}`)
              } catch {
                /* Keep the proposed name for retry. */
              }
            }}
          />
        )}
      </Modal>
    </section>
  )
}
type PreparationFormProps = PrepProps & {
  initial: EncounterPlan
  busy: boolean
  stale: boolean
  onClose: () => void
  onSave: (input: EncounterPlanInput) => Promise<void>
}
function PreparationForm({
  initial,
  combatants,
  available,
  creatures,
  revision,
  encounterId,
  busy,
  stale,
  onClose,
  onSave,
}: PreparationFormProps) {
  const { t } = useTranslation()
  const [baseline] = useState(revision)
  const [sceneId, setScene] = useState(initial.sceneId ?? '')
  const [reward, setReward] = useState(initial.reward)
  const roster = combatants.flatMap((c) =>
    c.character_id ? [{ id: c.character_id, name: c.name, level: null }] : [],
  )
  const choices = [...available, ...roster.filter((c) => !available.some((a) => a.id === c.id))]
  const assumed = roster.length === 0 && !initial.attendanceSet
  const [selected, setSelected] = useState(
    () => new Set((assumed ? available.filter((c) => c.assigned) : roster).map((c) => c.id)),
  )
  const [attendanceChanged, setAttendanceChanged] = useState(false)
  const measured = encounterBalance(
    choices.filter((member) => selected.has(member.id)),
    creatures,
  )
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!busy && !stale)
          void onSave({
            encounterId,
            revision: baseline,
            sceneId: sceneId || null,
            reward,
            attendees: attendanceChanged || assumed ? [...selected] : null,
          })
      }}
    >
      <Stack gap="md">
        <NativeSelect
          label={t('builder.plan.scene')}
          value={sceneId}
          onChange={(event) => setScene(event.currentTarget.value)}
          data={[
            { value: '', label: t('builder.plan.noScene') },
            ...initial.scenes.map((scene) => ({ value: scene.id, label: scene.name })),
          ]}
        />
        <Textarea
          label={t('builder.plan.reward')}
          autosize
          minRows={2}
          maxRows={5}
          maxLength={2000}
          value={reward}
          onChange={(event) => setReward(event.currentTarget.value)}
        />
        <fieldset className="bld-attendees">
          <legend>{t('builder.plan.attendees')}</legend>
          {choices.map((member) => (
            <Checkbox
              key={member.id}
              label={member.name}
              checked={selected.has(member.id)}
              onChange={(event) => {
                const next = new Set(selected)
                if (event.currentTarget.checked) next.add(member.id)
                else next.delete(member.id)
                setAttendanceChanged(true)
                setSelected(next)
              }}
            />
          ))}
          {choices.length === 0 && <Text size="sm">{t('builder.plan.noCharacters')}</Text>}
        </fieldset>
        {(selected.size > 0 || attendanceChanged || initial.attendanceSet) && (
          <Text role="status" size="sm">
            {selected.size === 0
              ? t('builder.plan.noAttendees')
              : t('builder.plan.preview', {
                  band: t(
                    measured.band === 'none' && measured.enemies > 0
                      ? 'builder.title.unrated'
                      : `builder.title.${measured.band}`,
                  ),
                  xp: measured.xp,
                  high: measured.budget.high,
                })}
          </Text>
        )}
        <Group justify="flex-end">
          <Button variant="default" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" loading={busy} disabled={stale}>
            {t('common.save')}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
function DuplicateForm({
  initialName,
  busy,
  onSave,
  onClose,
}: {
  initialName: string
  busy: boolean
  onSave: (name: string) => Promise<void>
  onClose: () => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(initialName)
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        if (!busy && name.trim()) void onSave(name.trim())
      }}
    >
      <Stack>
        <TextInput
          label={t('combat.create.label')}
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.currentTarget.value)}
          data-autofocus
        />
        <Group justify="flex-end">
          <Button variant="default" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button type="submit" disabled={!name.trim()} loading={busy}>
            {t('builder.plan.duplicate')}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
