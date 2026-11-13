import { useState, type ReactNode } from 'react'
import {
  Alert,
  Button,
  FileInput,
  Group,
  Loader,
  Modal,
  Progress,
  Radio,
  Select,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { useQueries, useQuery } from '@tanstack/react-query'
import { FileJson } from 'lucide-react'
import type { TFunction } from 'i18next'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { monsterBodiesQuery, monsterIndexQuery } from '@/features/bestiary'
import { glossaryBodiesQuery, glossaryIndexQuery } from '@/features/glossary'
import { usePhone } from '@/shared/ui/use-viewport'
import { changesQuery, useImportEntries, useLibraryAction, type ImportProgress } from '../api'
import { parseContentFile, type ParsedFile } from '../domain/import-file'
import {
  entryName,
  keyFromName,
  libraryErrorCode,
  packTitle,
  sortRows,
  type ContentLanguage,
  type ContentPack,
  type ImportReport,
  type PackInput,
} from '../domain/library'
import { srdEntries, srdPack, type BundledSrd } from '../domain/srd'
import { kindLabel } from './labels'

const errorText = (t: TFunction, error: unknown) =>
  t(`library.error.${libraryErrorCode(error instanceof Error ? error.message : '')}`)

function Dialog({
  title,
  onClose,
  busy,
  children,
}: {
  title: string
  onClose: () => void
  busy?: boolean
  children: ReactNode
}) {
  const { t } = useTranslation()
  const phone = usePhone()
  return (
    <Modal
      opened
      onClose={() => !busy && onClose()}
      title={title}
      fullScreen={phone}
      size="lg"
      closeOnEscape={!busy}
      closeOnClickOutside={!busy}
      closeButtonProps={{ 'aria-label': t('library.cancel'), size: 44, disabled: busy }}
    >
      {children}
    </Modal>
  )
}

const blankPack: PackInput = {
  slug: '',
  title_en: '',
  title_es: '',
  description_en: '',
  description_es: '',
  edition: '',
  license: '',
  attribution: '',
  visibility: 'private',
}

export function PackDialog({
  pack,
  onClose,
  onSaved,
  onDeleted,
}: {
  pack: ContentPack | null
  onClose: () => void
  onSaved: (id: string) => void
  onDeleted: () => void
}) {
  const { t, i18n } = useTranslation()
  const language: ContentLanguage = i18n.language.startsWith('en') ? 'en' : 'es'
  const action = useLibraryAction()
  const [input, setInput] = useState<PackInput>(
    pack
      ? {
          slug: pack.slug,
          title_en: pack.title_en,
          title_es: pack.title_es,
          description_en: pack.description_en,
          description_es: pack.description_es,
          edition: pack.edition ?? '',
          license: pack.license,
          attribution: pack.attribution,
          visibility: pack.visibility,
        }
      : blankPack,
  )
  const [slugTouched, setSlugTouched] = useState(!!pack)
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const published = !!pack && pack.version > 0
  const set = (patch: Partial<PackInput>) => {
    setError(null)
    setInput((current) => {
      const next = { ...current, ...patch }
      if (!slugTouched && ('title_es' in patch || 'title_en' in patch))
        next.slug = keyFromName(next.title_en || next.title_es).slice(0, 60)
      return next
    })
  }
  const valid = !!input.slug && (!!input.title_es.trim() || !!input.title_en.trim())
  const save = async () => {
    try {
      // A published pack changes who can read it only through its own, deliberate call.
      const result = await action.mutateAsync({
        kind: 'savePack',
        packId: pack?.id ?? null,
        revision: pack?.revision ?? null,
        input: published ? { ...input, visibility: pack.visibility } : input,
      })
      if (published && input.visibility !== pack.visibility)
        await action.mutateAsync({
          kind: 'visibility',
          packId: pack.id,
          revision: result.revision ?? pack.revision!,
          visibility: input.visibility,
        })
      onSaved(result.id)
    } catch (caught) {
      setError(errorText(t, caught))
    }
  }
  const remove = async () => {
    if (!pack) return
    try {
      await action.mutateAsync({ kind: 'deletePack', packId: pack.id, revision: pack.revision! })
      onDeleted()
    } catch (caught) {
      setConfirming(false)
      setError(errorText(t, caught))
    }
  }
  const title = pack
    ? t('library.packEdit', { title: packTitle(pack, language) })
    : t('library.packNew')
  if (confirming && pack)
    return (
      <Dialog
        title={t('library.deletePackTitle', { title: packTitle(pack, language) })}
        onClose={() => setConfirming(false)}
      >
        <Text>{t('library.deletePackBody')}</Text>
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" data-autofocus onClick={() => setConfirming(false)}>
            {t('library.cancel')}
          </Button>
          <Button
            color="red"
            variant="light"
            loading={action.isPending}
            onClick={() => void remove()}
          >
            {t('library.deletePack')}
          </Button>
        </Group>
      </Dialog>
    )
  return (
    <Dialog title={title} onClose={onClose} busy={action.isPending}>
      <form
        onSubmit={(event) => {
          event.preventDefault()
          if (valid) void save()
        }}
      >
        <Stack gap="sm">
          <div className="lib-pair">
            <TextInput
              data-autofocus
              label={t('library.titleEs')}
              value={input.title_es}
              maxLength={120}
              onChange={(event) => set({ title_es: event.currentTarget.value })}
            />
            <TextInput
              label={t('library.titleEn')}
              value={input.title_en}
              maxLength={120}
              onChange={(event) => set({ title_en: event.currentTarget.value })}
            />
          </div>
          <TextInput
            label={t('library.slug')}
            description={t('library.slugHelp')}
            value={input.slug}
            maxLength={60}
            disabled={published}
            onChange={(event) => {
              setSlugTouched(true)
              set({ slug: event.currentTarget.value.toLowerCase() })
            }}
          />
          <div className="lib-pair">
            <Textarea
              label={t('library.descriptionEs')}
              value={input.description_es}
              maxLength={2000}
              autosize
              minRows={2}
              onChange={(event) => set({ description_es: event.currentTarget.value })}
            />
            <Textarea
              label={t('library.descriptionEn')}
              value={input.description_en}
              maxLength={2000}
              autosize
              minRows={2}
              onChange={(event) => set({ description_en: event.currentTarget.value })}
            />
          </div>
          <div className="lib-pair">
            <Select
              label={t('library.edition')}
              data={[
                { value: '', label: t('library.edition.none') },
                { value: '2024', label: '2024 (5.5e)' },
                { value: '2014', label: '2014 (5e)' },
              ]}
              value={input.edition}
              allowDeselect={false}
              onChange={(value) => set({ edition: (value ?? '') as PackInput['edition'] })}
            />
            <TextInput
              label={t('library.license')}
              value={input.license}
              maxLength={120}
              onChange={(event) => set({ license: event.currentTarget.value })}
            />
          </div>
          <Textarea
            label={t('library.attribution')}
            value={input.attribution}
            maxLength={2000}
            autosize
            minRows={2}
            onChange={(event) => set({ attribution: event.currentTarget.value })}
          />
          <Radio.Group
            label={t('library.visibility')}
            value={input.visibility}
            onChange={(value) => set({ visibility: value as PackInput['visibility'] })}
          >
            <Stack gap="xs" mt="xs">
              <Radio
                value="public"
                label={t('library.public')}
                description={t('library.publicHelp')}
              />
              <Radio
                value="private"
                label={t('library.private')}
                description={t('library.privateHelp')}
              />
            </Stack>
          </Radio.Group>
          {error && (
            <Alert color="red" role="alert">
              {error}
            </Alert>
          )}
          <Group justify="space-between" mt="sm">
            {pack && !published ? (
              <Button variant="subtle" color="red" onClick={() => setConfirming(true)}>
                {t('library.deletePack')}
              </Button>
            ) : (
              <span />
            )}
            <Group gap="xs">
              <Button variant="subtle" onClick={onClose} disabled={action.isPending}>
                {t('library.cancel')}
              </Button>
              <Button type="submit" disabled={!valid} loading={action.isPending}>
                {t('library.save')}
              </Button>
            </Group>
          </Group>
        </Stack>
      </form>
    </Dialog>
  )
}

function ProgressLine({ label, progress }: { label: string; progress: ImportProgress }) {
  return (
    <Stack gap={4} role="status">
      <Text size="sm">{label}</Text>
      <Progress
        value={progress.total ? (progress.done / progress.total) * 100 : 0}
        aria-label={label}
        transitionDuration={150}
      />
    </Stack>
  )
}

function ReportLines({ report, counts = true }: { report: ImportReport; counts?: boolean }) {
  const { t } = useTranslation()
  return (
    <Stack gap={4}>
      {counts && <Text fw={600}>{t('library.importReport', report)}</Text>}
      {report.refused > 0 && (
        <Text className="lib-status-error">
          {t('library.importRefused', { count: report.refused })}
        </Text>
      )}
      {report.problems.length > 0 && (
        <ul className="lib-problems">
          {report.problems.slice(0, 12).map((problem) => (
            <li key={`${problem.position}:${problem.key}`}>
              {t(problem.position ? 'library.problem.at' : 'library.problem.keyed', {
                position: problem.position,
                // "Entrada 3 (key)" by position; the keyed form quotes the bare key.
                key: problem.position ? (problem.key ? ` (${problem.key})` : '') : problem.key,
                reason: t(`library.problem.${problem.reason}` as 'library.problem.key', {
                  defaultValue: problem.reason,
                }),
              })}
            </li>
          ))}
        </ul>
      )}
    </Stack>
  )
}

export function ImportDialog({
  pack,
  language,
  onClose,
  onDone,
}: {
  pack: ContentPack
  language: ContentLanguage
  onClose: () => void
  onDone: (message: string) => void
}) {
  const { t } = useTranslation()
  const run = useImportEntries()
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [report, setReport] = useState<ImportReport | null>(null)
  const [progress, setProgress] = useState<{ label: string; value: ImportProgress } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const busy = progress !== null
  const ready = parsed ? parsed.groups.reduce((sum, group) => sum + group.entries.length, 0) : 0
  const pick = async (next: File | null) => {
    setFile(next)
    setParsed(null)
    setReport(null)
    setError(null)
    setFileError(null)
    if (!next) return
    const result = parseContentFile(await next.text())
    if (typeof result === 'string') setFileError(t(`library.file.${result}`))
    else setParsed(result)
  }
  const go = async (dryRun: boolean) => {
    if (!parsed) return
    setError(null)
    try {
      const result = await run(pack.id, parsed.groups, dryRun, (value) =>
        setProgress({ label: t(dryRun ? 'library.checking' : 'library.importing', value), value }),
      )
      setProgress(null)
      if (dryRun) setReport(result)
      else
        onDone(result.added + result.updated ? t('library.importDone') : t('library.importNothing'))
    } catch (caught) {
      setProgress(null)
      setError(errorText(t, caught))
    }
  }
  const writes = report ? report.added + report.updated : 0
  return (
    <Dialog
      title={t('library.importTitle', { pack: packTitle(pack, language) })}
      onClose={onClose}
      busy={busy}
    >
      <Stack gap="md">
        <FileInput
          data-autofocus
          label={t('library.importFile')}
          accept="application/json,.json"
          value={file}
          onChange={(value) => void pick(value)}
          leftSection={<FileJson size={18} aria-hidden="true" />}
          error={fileError}
          disabled={busy}
        />
        {parsed && (
          <Stack gap={4}>
            {!report && <Text>{t('library.importLocal', { count: ready })}</Text>}
            <Text size="sm" c="dimmed">
              {parsed.groups
                .map((group) => `${kindLabel(t, group.kind)} · ${group.entries.length}`)
                .join(' · ')}
            </Text>
            {parsed.problems.length > 0 && !report && (
              <ReportLines
                counts={false}
                report={{
                  added: 0,
                  updated: 0,
                  unchanged: 0,
                  refused: parsed.problems.length,
                  problems: parsed.problems,
                  dry_run: true,
                }}
              />
            )}
          </Stack>
        )}
        {report && parsed && (
          <ReportLines
            report={{
              ...report,
              // Entries refused here never reached the server: the report counts both.
              refused: report.refused + parsed.problems.length,
              problems: [
                ...parsed.problems,
                ...report.problems.map((p) => ({ ...p, position: 0 })),
              ],
            }}
          />
        )}
        {progress && <ProgressLine label={progress.label} progress={progress.value} />}
        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="subtle" onClick={onClose} disabled={busy}>
            {t('library.cancel')}
          </Button>
          {!report ? (
            <Button disabled={!ready || busy} loading={busy} onClick={() => void go(true)}>
              {t('library.importCheck')}
            </Button>
          ) : (
            <Button disabled={!writes || busy} loading={busy} onClick={() => void go(false)}>
              {t('library.importRun', { count: writes })}
            </Button>
          )}
        </Group>
      </Stack>
    </Dialog>
  )
}

export function SrdDialog({
  language,
  existing,
  onClose,
  onDone,
}: {
  language: ContentLanguage
  existing: ContentPack | null
  onClose: () => void
  onDone: (packId: string, message: string) => void
}) {
  const { t } = useTranslation()
  const action = useLibraryAction()
  const run = useImportEntries()
  const sources = useQueries({
    queries: [
      monsterIndexQuery(),
      monsterBodiesQuery('en'),
      monsterBodiesQuery('es'),
      glossaryIndexQuery(),
      glossaryBodiesQuery('en'),
      glossaryBodiesQuery('es'),
    ],
  })
  const [progress, setProgress] = useState<ImportProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loaded = sources.every((source) => source.data)
  // Packed on each render (a few while uploading); the bundled sources never change.
  const data = sources.map((source) => source.data)
  const groups = loaded
    ? srdEntries({
        monsters: data[0],
        bodies: { en: data[1], es: data[2] },
        glossary: data[3],
        glossaryBodies: { en: data[4], es: data[5] },
      } as unknown as BundledSrd)
    : null
  const count = groups?.reduce((sum, group) => sum + group.entries.length, 0) ?? 0
  const title = packTitle(srdPack, language)
  const upload = async () => {
    if (!groups) return
    setError(null)
    try {
      const packId =
        existing?.id ??
        (
          await action.mutateAsync({
            kind: 'savePack',
            packId: null,
            revision: null,
            input: srdPack,
          })
        ).id
      await run(packId, groups, false, setProgress)
      onDone(packId, t('library.srdDone', { version: (existing?.version ?? 0) + 1 }))
    } catch (caught) {
      setProgress(null)
      setError(errorText(t, caught))
    }
  }
  const busy = progress !== null || action.isPending
  return (
    <Dialog title={t('library.srdTitle')} onClose={onClose} busy={busy}>
      <Stack gap="md">
        {!loaded ? (
          <Loader size="sm" aria-label={t('library.srdTitle')} />
        ) : (
          <Text>{t('library.srdBody', { title, count })}</Text>
        )}
        {progress && <ProgressLine label={t('library.importing', progress)} progress={progress} />}
        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="subtle" data-autofocus onClick={onClose} disabled={busy}>
            {t('library.cancel')}
          </Button>
          <Button disabled={!loaded || busy} loading={busy} onClick={() => void upload()}>
            {t('library.srdRun', { count })}
          </Button>
        </Group>
      </Stack>
    </Dialog>
  )
}

export function PublishDialog({
  pack,
  language,
  onClose,
  onDone,
}: {
  pack: ContentPack
  language: ContentLanguage
  onClose: () => void
  onDone: (message: string) => void
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const action = useLibraryAction()
  const changes = useQuery(changesQuery(state.user?.id ?? '', pack.id))
  const [error, setError] = useState<string | null>(null)
  const rows = sortRows(changes.data ?? [], '', language)
  const count = (value: string) => rows.filter((row) => row.state === value).length
  const version = pack.version + 1
  // The change list stops at 1000 rows; past that, the pack's own count is exact.
  const truncated = rows.length >= 1000
  const publish = async () => {
    try {
      const result = await action.mutateAsync({
        kind: 'publish',
        packId: pack.id,
        version: pack.version,
      })
      onDone(t('library.published', { version: 'version' in result ? result.version : version }))
    } catch (caught) {
      setError(errorText(t, caught))
    }
  }
  return (
    <Dialog
      title={t('library.publishTitle', { version, pack: packTitle(pack, language) })}
      onClose={onClose}
      busy={action.isPending}
    >
      <Stack gap="md">
        {changes.isPending ? (
          <Loader size="sm" aria-label={t('library.publishRun')} />
        ) : (
          <>
            <Text fw={600}>
              {!truncated
                ? t('library.publishSummary', {
                    added: count('new'),
                    changed: count('changed'),
                    removed: count('deleted'),
                  })
                : t('library.pending', { count: pack.pending ?? rows.length })}
            </Text>
            {(truncated ? (['all'] as const) : (['new', 'changed', 'deleted'] as const)).map(
              (group) => {
                const items = group === 'all' ? rows : rows.filter((row) => row.state === group)
                if (!items.length) return null
                return (
                  <Stack gap={4} key={group}>
                    {group !== 'all' && (
                      <Text fw={600} size="sm">
                        {t(`library.group.${group}`)}
                      </Text>
                    )}
                    <ul className="lib-problems">
                      {items.slice(0, 12).map((row) => (
                        <li key={row.id}>
                          {entryName(row, language)} · {kindLabel(t, row.kind)}
                        </li>
                      ))}
                    </ul>
                    {items.length > 12 && (
                      <Text size="sm" c="dimmed">
                        {t('library.publishMore', {
                          count:
                            (group === 'all' ? (pack.pending ?? items.length) : items.length) - 12,
                        })}
                      </Text>
                    )}
                  </Stack>
                )
              },
            )}
          </>
        )}
        {pack.visibility === 'public' && <Text size="sm">{t('library.publishPublic')}</Text>}
        {error && (
          <Alert color="red" role="alert">
            {error}
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="subtle" data-autofocus onClick={onClose} disabled={action.isPending}>
            {t('library.cancel')}
          </Button>
          <Button
            disabled={changes.isPending || rows.length === 0}
            loading={action.isPending}
            onClick={() => void publish()}
          >
            {t('library.publishRun')}
          </Button>
        </Group>
      </Stack>
    </Dialog>
  )
}
