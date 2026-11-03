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
} from '@mantine/core'
import { useForm } from '@mantine/form'
import { useMediaQuery } from '@mantine/hooks'
import { Plus, X } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useHomebrewAction } from '../api'
import type { Catalog } from '../domain/catalog'
import {
  emptyDraft,
  GlossaryError,
  homebrewCategories,
  homebrewLimits,
  parseAliases,
  type HomebrewCategory,
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

/** Create or edit a campaign homebrew entry. Every member with access can edit any entry. */
export function HomebrewEditor({
  target,
  campaignId,
  catalog,
  onClose,
  onSaved,
  returnFocus = true,
}: {
  target: EditorTarget | null
  campaignId: string
  catalog: Catalog
  onClose: () => void
  onSaved: (entry: HomebrewEntry) => void
  /** False after a save: the page moves focus to the saved headword instead. */
  returnFocus?: boolean
}) {
  const wide = useMediaQuery('(min-width: 48em)', false)
  const { t } = useTranslation()
  return (
    <Drawer
      opened={target !== null}
      onClose={onClose}
      returnFocus={returnFocus}
      position="right"
      size={wide ? 520 : '100%'}
      title={
        <span className="gl-editor-title">
          {t(target?.entry ? 'glossary.hb.edit' : 'glossary.hb.new')}
        </span>
      }
      closeButtonProps={{ 'aria-label': t('glossary.hb.cancel'), size: 44 }}
    >
      {target && (
        <EditorForm
          key={target.entry?.id ?? `new-${target.srdRef ?? ''}`}
          target={target}
          campaignId={campaignId}
          catalog={catalog}
          onClose={onClose}
          onSaved={onSaved}
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
}: {
  target: EditorTarget
  campaignId: string
  catalog: Catalog
  onClose: () => void
  onSaved: (entry: HomebrewEntry) => void
}) {
  const { t } = useTranslation()
  const action = useHomebrewAction(campaignId)
  const [entryId] = useState(() => target.entry?.id ?? crypto.randomUUID())
  const start = target.entry ?? { ...emptyDraft(target.srdRef), facts: [] }
  const form = useForm<FormValues>({
    initialValues: {
      category: start.category,
      name: start.name,
      aliases: start.aliases.join(', '),
      summary: start.summary,
      body: start.body,
      facts: start.facts.map((f) => ({ ...f })),
      srd_ref: start.srd_ref,
    },
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
  const submit = form.onSubmit(
    (values) => {
      action.mutate(
        {
          kind: 'save',
          entryId,
          revision: target.entry?.revision ?? null,
          draft: {
            category: values.category,
            name: values.name.trim(),
            aliases: parseAliases(values.aliases).slice(0, homebrewLimits.aliases),
            summary: values.summary.trim(),
            body: values.body.trim(),
            facts: values.facts
              .map((f) => ({ label: f.label.trim(), value: f.value.trim() }))
              .filter((f) => f.label && f.value),
            srd_ref: values.srd_ref,
          },
        },
        {
          onSuccess: (saved) => {
            if (!saved) return
            onSaved(saved)
          },
        },
      )
    },
    // A missing name moves focus to the field that explains it.
    () => document.getElementById(nameId)?.focus(),
  )

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="md">
        {error && (
          <Alert color="red" role="alert">
            {t(`glossary.hb.error.${error}`)}
          </Alert>
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
          clearable
          limit={40}
          nothingFoundMessage={t('glossary.noResultsHint')}
          {...form.getInputProps('srd_ref')}
        />
        <Group justify="flex-end" gap="sm" mt="sm">
          <Button variant="subtle" onClick={onClose}>
            {t('glossary.hb.cancel')}
          </Button>
          <Button type="submit" loading={action.isPending}>
            {t('glossary.hb.save')}
          </Button>
        </Group>
      </Stack>
    </form>
  )
}
