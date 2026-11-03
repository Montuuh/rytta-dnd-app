import {
  ActionIcon,
  Alert,
  Button,
  Drawer,
  Group,
  Select,
  Stack,
  TextInput,
  Textarea,
  Tooltip,
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { usePhone } from '@/shared/ui/use-viewport'
import { Plus, Trash2, TriangleAlert, X } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHomebrewAction, useLatestHomebrew } from '../api'
import type { Catalog } from '../domain/catalog'
import {
  emptyDraft,
  GlossaryError,
  homebrewCategories,
  homebrewLimits,
  parseAliases,
  type HomebrewCategory,
  type HomebrewDraft,
  type HomebrewEntry,
} from '../domain/homebrew'

type FormValues = {
  category: HomebrewCategory
  name: string
  aliases: string
  summary: string
  body: string
  facts: { label: string; value: string }[]
  srd_ref: string | null
}

export type EditorTarget = { entry: HomebrewEntry | null; srdRef: string | null }

const toFormValues = (entry: HomebrewEntry | HomebrewDraft): FormValues => ({
  category: entry.category,
  name: entry.name,
  aliases: entry.aliases.join(', '),
  summary: entry.summary,
  body: entry.body,
  facts: entry.facts.map((f) => ({ ...f })),
  srd_ref: entry.srd_ref,
})

/** Create or edit a campaign homebrew entry. Every member with access can edit any entry. */
export function HomebrewEditor({
  target,
  campaignId,
  catalog,
  onClose,
  onSaved,
  onDelete,
}: {
  target: EditorTarget | null
  campaignId: string
  catalog: Catalog
  onClose: () => void
  onSaved: (entry: HomebrewEntry) => void
  /** Offered while editing an existing entry. */
  onDelete: (entry: HomebrewEntry) => void
}) {
  const wide = !usePhone()
  const { t } = useTranslation()
  return (
    <Drawer
      opened={target !== null}
      onClose={onClose}
      // The manager returns focus to the control that opened the editor.
      returnFocus={false}
      // Above the reference sheet (400), which can be open underneath.
      zIndex={410}
      position="right"
      size={wide ? 520 : '100%'}
      classNames={{ content: 'gl-editor-drawer' }}
      title={
        <span className="gl-editor-title">
          {t(target?.entry ? 'glossary.hb.edit' : 'glossary.hb.new')}
        </span>
      }
      closeButtonProps={{ 'aria-label': t('glossary.hb.close'), size: 44 }}
    >
      {target && (
        <EditorForm
          key={target.entry?.id ?? `new-${target.srdRef ?? ''}`}
          target={target}
          campaignId={campaignId}
          catalog={catalog}
          onClose={onClose}
          onSaved={onSaved}
          onDelete={onDelete}
        />
      )}
    </Drawer>
  )
}

function EditorForm({
  target,
  campaignId,
  catalog,
  onClose,
  onSaved,
  onDelete,
}: {
  target: EditorTarget
  campaignId: string
  catalog: Catalog
  onClose: () => void
  onSaved: (entry: HomebrewEntry) => void
  onDelete: (entry: HomebrewEntry) => void
}) {
  const { t } = useTranslation()
  const action = useHomebrewAction(campaignId)
  const latestOf = useLatestHomebrew(campaignId)
  const [entryId] = useState(() => target.entry?.id ?? crypto.randomUUID())
  // The revision this form is based on. Resolving a conflict moves it to the server's current one.
  const [revision, setRevision] = useState(target.entry?.revision ?? null)
  const [conflict, setConflict] = useState<'busy' | 'gone' | 'offline' | null>(null)
  const start = target.entry ?? { ...emptyDraft(target.srdRef), facts: [] }
  const form = useForm<FormValues>({
    initialValues: toFormValues(start),
    validate: {
      name: (value) => (value.trim() ? null : t('glossary.hb.nameRequired')),
    },
  })
  const srdOptions = useMemo(
    () =>
      catalog.entries
        .filter((e) => e.source === 'srd')
        .map((e) => ({ value: e.id, label: `${e.name} (${t(`glossary.cat.${e.category}`)})` })),
    [catalog, t],
  )
  const error =
    action.error instanceof GlossaryError ? action.error.code : action.error ? 'unknown' : null

  const nameId = useId()
  const toDraft = (values: FormValues): HomebrewDraft => ({
    category: values.category,
    name: values.name.trim(),
    aliases: parseAliases(values.aliases).slice(0, homebrewLimits.aliases),
    summary: values.summary.trim(),
    body: values.body.trim(),
    facts: values.facts
      .map((f) => ({ label: f.label.trim(), value: f.value.trim() }))
      .filter((f) => f.label && f.value),
    srd_ref: values.srd_ref,
  })
  const save = (values: FormValues, baseRevision: number | null) => {
    setConflict(null)
    action.mutate(
      { kind: 'save', entryId, revision: baseRevision, draft: toDraft(values) },
      { onSuccess: (saved) => saved && onSaved(saved) },
    )
  }
  const submit = form.onSubmit(
    (values) => save(values, revision),
    // A missing name moves focus to the field that explains it.
    () => document.getElementById(nameId)?.focus(),
  )
  /** Conflict recovery: fetch what the table sees now, then load it or save over it. */
  const resolve = async (mode: 'load' | 'overwrite') => {
    setConflict('busy')
    try {
      const latest = await latestOf(entryId)
      if (!latest) return setConflict('gone')
      setRevision(latest.revision)
      setConflict(null)
      action.reset()
      if (mode === 'overwrite') return save(form.values, latest.revision)
      form.setValues(toFormValues(latest))
      form.resetDirty()
    } catch {
      setConflict('offline')
    }
  }
  const staleEdit = error === 'stale' && target.entry !== null

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="md">
        {staleEdit ? (
          <Alert
            color="red"
            role="alert"
            icon={<TriangleAlert size={18} aria-hidden="true" />}
            title={t('glossary.hb.conflict.title')}
          >
            {conflict === 'gone' ? (
              <p className="gl-conflict-text">{t('glossary.hb.conflict.gone')}</p>
            ) : (
              <>
                <p className="gl-conflict-text">
                  {conflict === 'offline'
                    ? t('glossary.hb.error.unavailable')
                    : t('glossary.hb.conflict.body')}
                </p>
                <Group gap="xs" mt="xs">
                  <Button
                    variant="default"
                    loading={conflict === 'busy'}
                    onClick={() => void resolve('load')}
                  >
                    {t('glossary.hb.conflict.load')}
                  </Button>
                  <Button
                    variant="light"
                    color="red"
                    disabled={conflict === 'busy'}
                    onClick={() => void resolve('overwrite')}
                  >
                    {t('glossary.hb.conflict.overwrite')}
                  </Button>
                </Group>
              </>
            )}
          </Alert>
        ) : (
          error && (
            <Alert color="red" role="alert">
              {t(`glossary.hb.error.${error === 'stale' ? 'unknown' : error}`)}
            </Alert>
          )
        )}
        <TextInput
          label={t('glossary.hb.name')}
          id={nameId}
          required
          maxLength={homebrewLimits.name}
          data-autofocus
          {...form.getInputProps('name')}
        />
        <Select
          label={t('glossary.hb.category')}
          data={homebrewCategories.map((c) => ({ value: c, label: t(`glossary.cat.${c}`) }))}
          allowDeselect={false}
          {...form.getInputProps('category')}
        />
        <TextInput
          label={t('glossary.hb.aliases')}
          description={t('glossary.hb.aliasesHint')}
          {...form.getInputProps('aliases')}
        />
        <Textarea
          label={t('glossary.hb.summary')}
          description={t('glossary.hb.summaryHint')}
          maxLength={homebrewLimits.summary}
          autosize
          minRows={2}
          {...form.getInputProps('summary')}
        />
        <Textarea
          label={t('glossary.hb.body')}
          description={t('glossary.hb.bodyHint')}
          maxLength={homebrewLimits.body}
          autosize
          minRows={5}
          maxRows={16}
          {...form.getInputProps('body')}
        />
        <fieldset className="gl-editor-facts">
          <legend>{t('glossary.hb.facts')}</legend>
          <Stack gap="xs">
            {form.values.facts.map((_, index) => (
              <Group key={index} gap="xs" align="end" wrap="nowrap">
                <TextInput
                  className="gl-fact-label-input"
                  label={t('glossary.hb.factLabel')}
                  maxLength={homebrewLimits.factLabel}
                  {...form.getInputProps(`facts.${index}.label`)}
                />
                <TextInput
                  className="gl-fact-value-input"
                  label={t('glossary.hb.factValue')}
                  maxLength={homebrewLimits.factValue}
                  {...form.getInputProps(`facts.${index}.value`)}
                />
                <ActionIcon
                  variant="subtle"
                  size={44}
                  aria-label={t('glossary.hb.removeFact', { n: index + 1 })}
                  onClick={() => form.removeListItem('facts', index)}
                >
                  <X size={18} aria-hidden="true" />
                </ActionIcon>
              </Group>
            ))}
            {form.values.facts.length < homebrewLimits.facts && (
              <Button
                variant="subtle"
                leftSection={<Plus size={16} aria-hidden="true" />}
                w="fit-content"
                onClick={() => form.insertListItem('facts', { label: '', value: '' })}
              >
                {t('glossary.hb.addFact')}
              </Button>
            )}
          </Stack>
        </fieldset>
        <Select
          label={t('glossary.hb.attach')}
          description={t('glossary.hb.attachHint')}
          placeholder={t('glossary.hb.attachPlaceholder')}
          data={srdOptions}
          searchable
          limit={40}
          nothingFoundMessage={t('glossary.noResultsHint')}
          {...form.getInputProps('srd_ref')}
        />
        <div className="gl-editor-footer">
          {target.entry && (
            <Tooltip label={t('glossary.hb.delete')} zIndex={500}>
              <ActionIcon
                variant="subtle"
                color="red"
                size={44}
                aria-label={t('glossary.hb.delete')}
                onClick={() => onDelete(target.entry!)}
              >
                <Trash2 size={20} aria-hidden="true" />
              </ActionIcon>
            </Tooltip>
          )}
          <Group gap="sm" ml="auto" wrap="nowrap">
            <Button variant="default" onClick={onClose}>
              {t('glossary.hb.cancel')}
            </Button>
            <Button type="submit" loading={action.isPending}>
              {t(target.entry ? 'glossary.hb.saveChanges' : 'glossary.hb.save')}
            </Button>
          </Group>
        </div>
      </Stack>
    </form>
  )
}
