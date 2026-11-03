import { useId, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Textarea,
  VisuallyHidden,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Camera, ImagePlus, Pencil, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { QueryFeedback } from '@/features/campaigns'
import { templatesQuery, useCreatureImageUpload } from '../api'
import type { CombatantTemplate, TemplateInput } from '../domain/combat'
import { useRunner } from './helpers'
import { RunnerError } from './parts'
import { toSquareWebp } from './square-image'
import { Token } from './token'

const signed = (n: number) => (n >= 0 ? `+${n}` : String(n))

export function Bestiary({ campaignId }: { campaignId: string }) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const query = useQuery(templatesQuery(state.user!.id, campaignId))
  const { run, pending, error, trigger, clear } = useRunner(campaignId)
  const [editing, setEditing] = useState<CombatantTemplate | 'new' | null>(null)
  const [deleting, setDeleting] = useState<CombatantTemplate | null>(null)
  const [saved, setSaved] = useState(false)
  const opener = useRef<HTMLElement | null>(null)
  const restore = () => requestAnimationFrame(() => opener.current?.focus())
  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-start">
        <Text c="dimmed" maw="60ch">
          {t('combat.bestiary.intro')}
        </Text>
        <Button
          leftSection={<Plus size={16} aria-hidden="true" />}
          onClick={(event) => {
            opener.current = event.currentTarget
            setEditing('new')
          }}
        >
          {t('combat.bestiary.new')}
        </Button>
      </Group>
      <RunnerError error={error} trigger={trigger} onClose={clear} />
      {saved && (
        <Alert
          className="combat-alert"
          role="status"
          withCloseButton
          closeButtonLabel={t('action.cancel')}
          onClose={() => setSaved(false)}
        >
          {t('combat.bestiary.saved')}
        </Alert>
      )}
      <QueryFeedback
        pending={query.isPending}
        error={query.isError}
        retry={() => void query.refetch()}
      />
      {query.data && query.data.length === 0 && (
        <Text c="dimmed">{t('combat.bestiary.empty')}</Text>
      )}
      {query.data && query.data.length > 0 && (
        <ul className="combat-cards">
          {query.data.map((template) => (
            <li key={template.id} className="combat-card is-creature">
              <CreatureImage campaignId={campaignId} template={template} />
              <div className="combat-card-text">
                <Text fw={700}>{template.name}</Text>
                <Text size="sm" c="dimmed">
                  {t(`combat.side.${template.side}`)} ·{' '}
                  {t('combat.bestiary.stats', {
                    hp: template.max_hp,
                    ac: template.armor_class,
                    bonus: signed(template.initiative_bonus),
                  })}
                </Text>
                {template.notes && (
                  <Text size="sm" mt={4} className="combat-notes">
                    {template.notes}
                  </Text>
                )}
              </div>
              <Group gap={4} wrap="nowrap">
                <ActionIcon
                  variant="subtle"
                  size={44}
                  aria-label={t('combat.bestiary.edit', { name: template.name })}
                  onClick={(event) => {
                    opener.current = event.currentTarget
                    setEditing(template)
                  }}
                >
                  <Pencil size={18} aria-hidden="true" />
                </ActionIcon>
                <ActionIcon
                  variant="subtle"
                  color="red"
                  size={44}
                  aria-label={t('combat.bestiary.delete', { name: template.name })}
                  onClick={(event) => {
                    opener.current = event.currentTarget
                    setDeleting(template)
                  }}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </ActionIcon>
              </Group>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <TemplateDialog
          template={editing === 'new' ? null : editing}
          pending={pending}
          close={() => {
            setEditing(null)
            restore()
          }}
          save={async (data) => {
            const ok = await run({
              kind: 'saveTemplate',
              templateId: editing === 'new' ? null : editing.id,
              revision: editing === 'new' ? null : editing.revision,
              data,
            })
            if (ok) {
              setEditing(null)
              setSaved(true)
              restore()
            }
          }}
        />
      )}
      <Modal
        opened={deleting !== null}
        onClose={() => {
          setDeleting(null)
          restore()
        }}
        title={deleting ? t('combat.bestiary.deleteTitle', { name: deleting.name }) : ''}
        closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
      >
        <Text>{t('combat.bestiary.deleteBody')}</Text>
        <Group justify="flex-end" mt="md">
          <Button
            variant="subtle"
            onClick={() => {
              setDeleting(null)
              restore()
            }}
          >
            {t('action.cancel')}
          </Button>
          <Button
            color="red"
            loading={pending}
            onClick={async () => {
              if (deleting && (await run({ kind: 'deleteTemplate', templateId: deleting.id }))) {
                setDeleting(null)
                restore()
              }
            }}
          >
            {deleting ? t('combat.bestiary.delete', { name: deleting.name }) : ''}
          </Button>
        </Group>
      </Modal>
    </Stack>
  )
}

/**
 * The creature's token is its own upload control (RYT-043): tapping it (or Enter/Space on its focus)
 * opens the file picker; a camera seal on the rim says so. The image is cropped to a 512px WebP square,
 * stored privately and attached with the template's revision. Progress, success and failure are
 * announced; a failure stays next to the token until the next attempt.
 */
function CreatureImage({
  campaignId,
  template,
}: {
  campaignId: string
  template: CombatantTemplate
}) {
  const { t } = useTranslation()
  const inputId = useId()
  const errorId = useId()
  const upload = useCreatureImageUpload(campaignId)
  const [unreadable, setUnreadable] = useState(false)
  const [done, setDone] = useState(false)
  const failed = unreadable || upload.isError
  const has = Boolean(template.image_path)
  const action = t(has ? 'combat.image.change' : 'combat.image.add', { name: template.name })
  return (
    <div className="combat-creature-image">
      <input
        id={inputId}
        type="file"
        accept="image/webp,image/png,image/jpeg"
        className="visually-hidden combat-image-input"
        disabled={upload.isPending}
        // One accessible name, on the control itself (RYT-043 F5); the label is the visual target.
        aria-label={action}
        aria-describedby={failed ? errorId : undefined}
        onChange={async (event) => {
          const file = event.currentTarget.files?.[0]
          event.currentTarget.value = ''
          if (!file) return
          setUnreadable(false)
          setDone(false)
          upload.reset()
          let image: Blob
          try {
            image = await toSquareWebp(file)
          } catch {
            setUnreadable(true)
            return
          }
          upload.mutate(
            { templateId: template.id, revision: template.revision, image },
            { onSuccess: () => setDone(true) },
          )
        }}
      />
      <label
        htmlFor={inputId}
        className="combat-image-picker"
        data-pending={upload.isPending || undefined}
        title={action}
      >
        <Token
          name={template.name}
          side={template.side}
          imageKind="creature"
          path={template.image_path}
          size={64}
        >
          <span className="combat-image-seal" aria-hidden="true">
            {upload.isPending ? (
              <Loader size={14} color="currentColor" />
            ) : has ? (
              <Camera size={16} strokeWidth={2.25} />
            ) : (
              <ImagePlus size={16} strokeWidth={2.25} />
            )}
          </span>
        </Token>
      </label>
      <VisuallyHidden role="status">
        {upload.isPending
          ? t('combat.image.saving')
          : done
            ? t('combat.image.saved', { name: template.name })
            : ''}
      </VisuallyHidden>
      {failed && (
        <Text id={errorId} role="alert" size="sm" className="combat-image-error">
          {t(unreadable ? 'combat.image.unreadable' : 'combat.image.failed')}
        </Text>
      )}
    </div>
  )
}

function TemplateDialog({
  template,
  pending,
  close,
  save,
}: {
  template: CombatantTemplate | null
  pending: boolean
  close: () => void
  save: (data: TemplateInput) => void
}) {
  const { t } = useTranslation()
  const [name, setName] = useState(template?.name ?? '')
  const [side, setSide] = useState<'enemy' | 'ally'>(template?.side ?? 'enemy')
  const [maxHp, setMaxHp] = useState<number | string>(template?.max_hp ?? 7)
  const [ac, setAc] = useState<number | string>(template?.armor_class ?? 12)
  const [bonus, setBonus] = useState<number | string>(template?.initiative_bonus ?? 0)
  const [legendary, setLegendary] = useState<number | string>(template?.legendary_max ?? 0)
  const [notes, setNotes] = useState(template?.notes ?? '')
  const valid =
    name.trim().length > 0 && [maxHp, ac, bonus, legendary].every((n) => typeof n === 'number')
  return (
    <Modal
      opened
      onClose={close}
      title={
        template ? t('combat.bestiary.edit', { name: template.name }) : t('combat.bestiary.new')
      }
      closeButtonProps={{ 'aria-label': t('action.cancel'), size: 44 }}
    >
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (!valid || pending) return
          save({
            name: name.trim(),
            side,
            max_hp: maxHp as number,
            armor_class: ac as number,
            initiative_bonus: bonus as number,
            legendary_max: legendary as number,
            notes,
          })
        }}
      >
        <Stack gap="sm">
          <TextInput
            data-autofocus
            required
            label={t('combat.add.name')}
            value={name}
            maxLength={80}
            onChange={(event) => setName(event.currentTarget.value)}
          />
          <div>
            <Text size="sm" fw={500} mb={4} id="template-side">
              {t('combat.add.side')}
            </Text>
            <SegmentedControl
              fullWidth
              aria-labelledby="template-side"
              value={side}
              onChange={(value) => setSide(value as 'enemy' | 'ally')}
              data={[
                { value: 'enemy', label: t('combat.side.enemy') },
                { value: 'ally', label: t('combat.side.ally') },
              ]}
            />
          </div>
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
          <Textarea
            label={t('combat.bestiary.notes')}
            value={notes}
            maxLength={2000}
            autosize
            minRows={3}
            onChange={(event) => setNotes(event.currentTarget.value)}
          />
          <Group justify="flex-end">
            <Button variant="subtle" onClick={close}>
              {t('action.cancel')}
            </Button>
            <Button type="submit" disabled={!valid || pending} loading={pending}>
              {t('combat.bestiary.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  )
}
