import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Group,
  SegmentedControl,
  Stack,
  Text,
  TextInput,
  Textarea,
  Title,
} from '@mantine/core'
import { Check, Eye, EyeOff, Lock, Plus, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { useCampaign } from '@/features/campaigns'
import { Modal } from '@/shared/ui/overlays'
import { useDeleteQuest, useSaveQuest } from '../api'
import {
  draftOf,
  emptyDraft,
  questLimits,
  questStatuses,
  type Quest,
  type QuestDraft,
} from '../domain/quest'
import { keepUnsaved, unsavedDraft } from '../domain/unsaved'

const same = (a: QuestDraft, b: QuestDraft) => JSON.stringify(a) === JSON.stringify(b)

/** The DM edits a quest where it is read: status, texts, objectives revealed one by one, a note. */
export function QuestEditor({
  id,
  quest,
  onSaved,
  onDeleted,
  onStateChange,
}: {
  id: string
  quest: Quest | null
  onSaved: (id: string) => void
  onDeleted: () => void
  /** Unsaved changes and an open dialog, so the page can guard leaving and Escape. */
  onStateChange: (state: { dirty: boolean; dialog: boolean }) => void
}) {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const account = useAuth().state.user?.id ?? ''
  const save = useSaveQuest(campaign.id)
  const remove = useDeleteQuest(campaign.id)
  const [base, setBase] = useState<QuestDraft>(() => (quest ? draftOf(quest) : emptyDraft()))
  const [draft, setDraft] = useState<QuestDraft>(() => unsavedDraft(account, id) ?? base)
  const [notice, setNotice] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const dirty = !same(draft, base)
  const form = useRef<HTMLFormElement>(null)
  const title = useRef<HTMLInputElement>(null)
  // Reported before paint, so a key press right after typing already finds the page guarded.
  useLayoutEffect(() => {
    onStateChange({ dirty, dialog: confirming })
  }, [dirty, confirming, onStateChange])
  useEffect(() => {
    keepUnsaved(account, id, dirty ? draft : null)
  }, [account, id, dirty, draft])
  useEffect(() => () => onStateChange({ dirty: false, dialog: false }), [onStateChange])
  // A new quest starts at its title, also in the tablet panel where no overlay autofocuses.
  useEffect(() => {
    if (!quest) title.current?.focus()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  const valid = draft.title.trim() !== '' && draft.objectives.every((o) => o.body.trim() !== '')
  const published = quest?.published ?? false

  const update = (patch: Partial<QuestDraft>) => {
    setNotice(null)
    setDraft((current) => ({ ...current, ...patch }))
  }
  const updateObjective = (index: number, patch: Partial<QuestDraft['objectives'][number]>) =>
    update({
      objectives: draft.objectives.map((objective, at) =>
        at === index ? { ...objective, ...patch } : objective,
      ),
    })

  const submit = (publish: boolean) => {
    const next: QuestDraft = {
      ...draft,
      title: draft.title.trim(),
      summary: draft.summary.trim(),
      note: draft.note.trim(),
      published: publish,
      objectives: draft.objectives.map((objective) => ({
        ...objective,
        body: objective.body.trim(),
      })),
    }
    save.mutate(
      { id, revision: quest?.revision ?? null, draft: next },
      {
        onSuccess: (saved) => {
          const clean = draftOf(saved)
          setBase(clean)
          setDraft(clean)
          setNotice(t(publish && !published ? 'quests.published' : 'quests.saved'))
          if (!quest) onSaved(saved.id)
          // The pressed button turns disabled or changes: keep focus in the editor.
          form.current?.focus({ preventScroll: true })
        },
      },
    )
  }

  const saveError = save.error?.message
  const label = (body: string) => body.trim() || t('quests.objective.untitled')

  return (
    <form
      ref={form}
      tabIndex={-1}
      className="quest-panel quest-editor"
      aria-label={quest ? quest.title : t('quests.new')}
      onSubmit={(event) => {
        event.preventDefault()
        if (valid && (dirty || !quest)) submit(published)
      }}
    >
      <Stack gap="md">
        <div>
          <Text component="span" size="sm" fw={600} id={`${id}-status`}>
            {t('quests.field.status')}
          </Text>
          <SegmentedControl
            fullWidth
            mt={6}
            aria-labelledby={`${id}-status`}
            className="quest-status ink-seg"
            value={draft.status}
            onChange={(value) => update({ status: value as QuestDraft['status'] })}
            data={questStatuses.map((status) => ({
              value: status,
              label: t(`quests.statusOne.${status}`),
            }))}
          />
        </div>
        <TextInput
          label={t('quests.field.title')}
          value={draft.title}
          maxLength={questLimits.title}
          required
          onChange={(event) => update({ title: event.currentTarget.value })}
          ref={title}
        />
        <Textarea
          label={t('quests.field.summary')}
          value={draft.summary}
          maxLength={questLimits.summary}
          autosize
          minRows={3}
          maxRows={10}
          onChange={(event) => update({ summary: event.currentTarget.value })}
        />

        <section aria-labelledby={`${id}-objectives`}>
          <Title order={3} id={`${id}-objectives`} className="quest-subhead">
            {t('quests.objectives')}
          </Title>
          <ul className="quest-objectives is-editing">
            {draft.objectives.map((objective, index) => (
              <li key={objective.id} data-done={objective.done || undefined}>
                <button
                  type="button"
                  role="checkbox"
                  className="quest-check"
                  aria-checked={objective.done}
                  aria-label={t('quests.objective.done', { body: label(objective.body) })}
                  onClick={() => updateObjective(index, { done: !objective.done })}
                >
                  <span className="quest-check-box" aria-hidden="true">
                    {objective.done && <Check size={14} strokeWidth={3} />}
                  </span>
                </button>
                <TextInput
                  className="quest-objective-input"
                  aria-label={t('quests.objective.label', { number: index + 1 })}
                  value={objective.body}
                  maxLength={questLimits.objective}
                  onChange={(event) => updateObjective(index, { body: event.currentTarget.value })}
                />
                <button
                  type="button"
                  className="quest-eye"
                  aria-pressed={objective.visible}
                  aria-label={t(
                    objective.visible ? 'quests.objective.hide' : 'quests.objective.show',
                    { body: label(objective.body) },
                  )}
                  onClick={() => updateObjective(index, { visible: !objective.visible })}
                >
                  {objective.visible ? (
                    <Eye size={18} aria-hidden="true" />
                  ) : (
                    <EyeOff size={18} aria-hidden="true" />
                  )}
                  <span aria-hidden="true">
                    {t(objective.visible ? 'quests.objective.visible' : 'quests.objective.hidden')}
                  </span>
                </button>
                <ActionIcon
                  variant="subtle"
                  color="gray"
                  size={44}
                  aria-label={t('quests.objective.remove', { body: label(objective.body) })}
                  onClick={() =>
                    update({ objectives: draft.objectives.filter((_, at) => at !== index) })
                  }
                >
                  <X size={18} aria-hidden="true" />
                </ActionIcon>
              </li>
            ))}
          </ul>
          {draft.objectives.length < questLimits.objectives ? (
            <Button
              variant="subtle"
              mt={4}
              leftSection={<Plus size={18} aria-hidden="true" />}
              onClick={() =>
                update({
                  objectives: [
                    ...draft.objectives,
                    { id: crypto.randomUUID(), body: '', visible: false, done: false },
                  ],
                })
              }
            >
              {t('quests.objective.add')}
            </Button>
          ) : (
            <Text size="sm" c="dimmed" mt={4}>
              {t('quests.objective.limit', { count: questLimits.objectives })}
            </Text>
          )}
        </section>

        <div className="quest-secret">
          <Textarea
            label={
              <span className="quest-secret-label">
                <Lock size={14} aria-hidden="true" />
                {t('quests.field.note')}
              </span>
            }
            description={t('quests.field.noteHint')}
            value={draft.note}
            maxLength={questLimits.note}
            autosize
            minRows={2}
            maxRows={8}
            onChange={(event) => update({ note: event.currentTarget.value })}
          />
        </div>

        {saveError && (
          <Alert color="red" role="alert">
            {t(
              saveError === 'stale'
                ? 'quests.errorSave.stale'
                : saveError === 'quota'
                  ? 'quests.errorSave.quota'
                  : saveError === 'invalid'
                    ? 'quests.errorSave.invalid'
                    : 'quests.errorSave.other',
            )}
          </Alert>
        )}
        <div role="status" aria-live="polite" className="quest-notice">
          {notice && !dirty && <Text size="sm">{notice}</Text>}
          {dirty && quest && (
            <Text size="sm" c="dimmed">
              {t('quests.unsaved')}
            </Text>
          )}
        </div>

        <Group gap="sm" className="quest-actions">
          {published ? (
            <>
              <Button type="submit" loading={save.isPending} disabled={!dirty || !valid}>
                {t('quests.save')}
              </Button>
              <Button
                variant="default"
                disabled={!valid || save.isPending}
                onClick={() => submit(false)}
              >
                {t('quests.unpublish')}
              </Button>
            </>
          ) : (
            <>
              <Button loading={save.isPending} disabled={!valid} onClick={() => submit(true)}>
                {t('quests.publish')}
              </Button>
              <Button
                type="submit"
                variant="default"
                disabled={!valid || save.isPending || (!!quest && !dirty)}
              >
                {t('quests.saveDraft')}
              </Button>
            </>
          )}
          {dirty && quest && (
            <Button variant="subtle" onClick={() => setDraft(base)}>
              {t('quests.discard')}
            </Button>
          )}
          {quest && (
            <Button
              variant="subtle"
              color="red"
              className="quest-delete"
              leftSection={<Trash2 size={18} aria-hidden="true" />}
              onClick={() => setConfirming(true)}
            >
              {t('quests.delete')}
            </Button>
          )}
        </Group>
      </Stack>
      {quest && (
        <Modal
          opened={confirming}
          onClose={() => !remove.isPending && setConfirming(false)}
          title={t('quests.deleteTitle', { title: quest.title })}
          closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
          centered
        >
          <Stack gap="md">
            <Text>{t('quests.deleteBody')}</Text>
            {remove.isError && (
              <Alert color="red" role="alert">
                {t('quests.errorDelete')}
              </Alert>
            )}
            <Group justify="flex-end" gap="sm">
              <Button
                variant="default"
                onClick={() => setConfirming(false)}
                disabled={remove.isPending}
              >
                {t('common.cancel')}
              </Button>
              <Button
                color="red"
                loading={remove.isPending}
                onClick={() =>
                  remove.mutate(
                    { id: quest.id, revision: quest.revision ?? 0 },
                    {
                      onSuccess: () => {
                        setConfirming(false)
                        onDeleted()
                      },
                    },
                  )
                }
              >
                {t('quests.deleteConfirm')}
              </Button>
            </Group>
          </Stack>
        </Modal>
      )}
    </form>
  )
}
