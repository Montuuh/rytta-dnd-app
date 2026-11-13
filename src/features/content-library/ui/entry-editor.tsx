import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  Alert,
  Button,
  Checkbox,
  Group,
  Loader,
  Modal,
  NumberInput,
  Select,
  Tabs,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Trash2, Undo2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router'
import {
  creatureTypes,
  monsterBodiesQuery,
  monsterIndexQuery,
  statBlockSchema,
  type BestiaryLanguage,
  type CreatureSize,
} from '@/features/bestiary'
import { blankDraft, CreatureEditor, draftFromBlock } from '@/features/combat'
import { featureClasses, spellClasses, spellSchools } from '@/features/glossary'
import { draftQuery, useLibraryAction } from '../api'
import {
  bodyOf,
  bodySummary,
  bodyText,
  indexOf,
  listText,
  textList,
  withBody,
  withIndex,
  withNames,
} from '../domain/forms'
import {
  entryName,
  entryProblem,
  formFamily,
  keyFromName,
  libraryErrorCode,
  packTitle,
  type ContentLanguage,
  type ContentPack,
  type Draft,
  type EntryInput,
} from '../domain/library'
import { tableCount } from '../domain/text'
import type { Guard } from './library-page'
import { keepEdits, keptEdits } from './unsaved'

const languages: ContentLanguage[] = ['es', 'en']

/** RYT-093: one entry, new or existing, with a form for its kind and the whole data as JSON. */
export function EntryEditor({
  pack,
  kind,
  entryId,
  language,
  userId,
  guard,
  onDirtyChange,
  onCreated,
  onGone,
}: {
  pack: ContentPack
  kind: string
  entryId: string
  language: ContentLanguage
  userId: string
  guard: Guard
  onDirtyChange: (dirty: boolean) => void
  onCreated: (id: string) => void
  onGone: () => void
}) {
  const { t } = useTranslation()
  const isNew = entryId === 'new'
  const draft = useQuery({ ...draftQuery(userId, entryId), enabled: !isNew })
  const back = (
    <Link to={`/library/${pack.id}/${kind}`} onClick={guard.link} className="lib-back">
      <ArrowLeft size={18} aria-hidden="true" />
      {packTitle(pack, language)}
    </Link>
  )
  if (!isNew && draft.isPending)
    return (
      <div className="lib-editor-inner">
        {back}
        <Loader size="sm" aria-label={t('library.form')} />
      </div>
    )
  if (!isNew && draft.isError) {
    const code = libraryErrorCode(draft.error.message)
    return (
      <div className="lib-editor-inner">
        {back}
        <Alert color="red" role="alert" title={t(`library.error.${code}`)}>
          <Button
            variant="light"
            color="red"
            onClick={() => void (code === 'unavailable' ? onGone() : draft.refetch())}
          >
            {t('library.retry')}
          </Button>
        </Alert>
      </div>
    )
  }
  const current = isNew ? null : (draft.data ?? null)
  return (
    <EntryForm
      key={current ? current.id : 'new'}
      back={back}
      pack={pack}
      kind={kind}
      draft={current}
      language={language}
      userId={userId}
      onDirtyChange={onDirtyChange}
      onCreated={onCreated}
      onGone={onGone}
    />
  )
}

const fromDraft = (draft: Draft): EntryInput => ({
  kind: draft.kind,
  key: draft.key,
  name_en: draft.name_en,
  name_es: draft.name_es,
  data: draft.data,
})
// Key order is not data: the server's JSON comes back with its keys in another order.
const sorted = (value: unknown): unknown =>
  Array.isArray(value)
    ? value.map(sorted)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.entries(value)
            .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
            .map(([key, item]) => [key, sorted(item)]),
        )
      : value
const same = (a: unknown, b: unknown) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b))

function EntryForm({
  back,
  pack,
  kind,
  draft,
  language,
  userId,
  onDirtyChange,
  onCreated,
  onGone,
}: {
  back: ReactNode
  pack: ContentPack
  kind: string
  draft: Draft | null
  language: ContentLanguage
  userId: string
  onDirtyChange: (dirty: boolean) => void
  onCreated: (id: string) => void
  onGone: () => void
}) {
  const { t } = useTranslation()
  const action = useLibraryAction()
  const [baseline, setBaseline] = useState<EntryInput>(() =>
    draft ? fromDraft(draft) : { kind, key: '', name_en: '', name_es: '', data: {} },
  )
  const editsKey = { userId, packId: pack.id, kind, entryId: draft?.id ?? 'new' }
  // Edits kept from an earlier visit come back with the revision they started from: when the
  // entry changed since, the conflict banner offers both ways out instead of losing them.
  const [kept] = useState(() => keptEdits(editsKey))
  // The server revision the form's edits start from; saves are checked against it.
  const [baseRevision, setBaseRevision] = useState(kept?.revision ?? draft?.revision ?? 0)
  const [entry, setEntry] = useState<EntryInput>(kept?.entry ?? baseline)
  // Edits kept from an earlier visit: offered back, with a way to drop them.
  const [restored, setRestored] = useState(() => !same(entry, baseline))
  const [synced, setSynced] = useState(draft?.revision ?? 0)
  // After discarding or deleting, the next server revision replaces the form.
  const [follow, setFollow] = useState(false)
  const [keyTouched, setKeyTouched] = useState(false)
  const [tab, setTab] = useState<string>('form')
  const [json, setJson] = useState('')
  const [jsonError, setJsonError] = useState<string | null>(null)
  // Fields that keep their own text (paragraph breaks) start again when the data changes elsewhere.
  const [generation, setGeneration] = useState(0)
  const [status, setStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [confirm, setConfirm] = useState<'deleteEntry' | 'revertEntry' | null>(null)
  // Where focus goes once a delete or a discard reaches the form (the button pressed is gone).
  const focusNext = useRef<'heading' | 'restore' | 'conflict' | null>(null)
  const keepMineRef = useRef<HTMLButtonElement>(null)
  // The last failure's code: a stale stat block save joins the form instead of failing in place.
  const lastCode = useRef<string | null>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const restoreRef = useRef<HTMLButtonElement>(null)
  const dirty = !same(entry, baseline)
  // A newer revision from the server: an untouched form (or one just discarded) takes it. Edits
  // keep their base revision, so saving them over a newer save is refused. Revisions only grow:
  // an older one is a late response from before the last save.
  if (draft && draft.revision > synced) {
    setSynced(draft.revision)
    if (!dirty || follow) {
      const next = fromDraft(draft)
      setBaseline(next)
      setBaseRevision(draft.revision)
      if (!same(next, entry)) {
        setEntry(next)
        if (!same(next.data, entry.data)) setGeneration((value) => value + 1)
      }
      setFollow(false)
    }
  }
  useEffect(() => {
    onDirtyChange(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange(false), [onDirtyChange])
  const { packId, entryId } = editsKey
  useEffect(() => {
    const key = { userId, packId, kind, entryId }
    keepEdits(key, dirty ? { entry, revision: baseRevision } : null)
  }, [userId, packId, kind, entryId, dirty, entry, baseRevision])
  // Opening an entry moves focus to its name, without scrolling the panes.
  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true })
  }, [])
  useEffect(() => {
    if (focusNext.current === 'restore' && draft?.state === 'deleted') restoreRef.current?.focus()
    else if (focusNext.current === 'heading' && draft?.state !== 'deleted')
      headingRef.current?.focus()
    else return
    focusNext.current = null
  }, [draft?.state])

  const problem = entryProblem(entry)
  const pending = action.isPending
  const deleted = draft?.state === 'deleted'
  // Deleted elsewhere while focus was in the (now disabled) fields: the way back takes it.
  useEffect(() => {
    if (!deleted) return
    if (!document.activeElement || document.activeElement === document.body)
      restoreRef.current?.focus()
  }, [deleted])
  const conflict = !!draft && dirty && !deleted && draft.revision !== baseRevision
  // A save refused as stale leads to the banner and its two ways out, once it shows.
  useEffect(() => {
    if (focusNext.current !== 'conflict' || !conflict) return
    focusNext.current = null
    keepMineRef.current?.focus()
  }, [conflict])
  const takeServer = () => {
    if (!draft) return
    focusNext.current = null
    const next = fromDraft(draft)
    setBaseline(next)
    setEntry(next)
    setBaseRevision(draft.revision)
    setGeneration((value) => value + 1)
    setRestored(false)
    setStatus(null)
    headingRef.current?.focus()
  }
  const update = (next: EntryInput) => {
    setEntry(next)
    setStatus(null)
  }
  const fail = (error: unknown, saving = false) => {
    const code = libraryErrorCode(error instanceof Error ? error.message : '')
    lastCode.current = code
    const stale = saving && code === 'stale'
    // A stale save is explained by the conflict banner, which also offers the ways out.
    const text = t(stale ? 'library.notSaved' : `library.error.${code}`)
    setStatus({ tone: 'error', text })
    if (stale && conflict) keepMineRef.current?.focus()
    else if (stale) focusNext.current = 'conflict'
    return text
  }

  /** Null once stored, otherwise the reason it was not. `over` saves on top of that revision. */
  const save = async (next: EntryInput = entry, over?: number): Promise<string | null> => {
    if (pending) return t('library.saving')
    const reason = entryProblem(next)
    if (reason) {
      const text = t(`library.problem.${reason}`)
      setStatus({ tone: 'error', text })
      return text
    }
    if (draft && same(next, baseline)) return null
    setStatus({ tone: 'ok', text: t('library.saving') })
    try {
      const result = await action.mutateAsync({
        kind: 'saveEntry',
        packId: pack.id,
        entryId: draft?.id ?? null,
        revision: draft ? (over ?? baseRevision) : null,
        input: next,
      })
      setBaseline(next)
      if (result.revision) {
        setBaseRevision(result.revision)
        setSynced(result.revision)
      }
      setRestored(false)
      if (!draft) onCreated(result.id)
      else setStatus({ tone: 'ok', text: t('library.saved') })
      return null
    } catch (error) {
      return fail(error, true)
    }
  }
  // A stat block reaches the form only once stored: after a failed save, discarding it in the
  // stat block editor leaves the form as it was.
  const storeBlock = async (next: EntryInput, openedOn: number) => {
    lastCode.current = null
    // Checked against the revision the stat block editor opened on: another editor's save since
    // then is never replaced silently, even when the form has followed it.
    const failure = await save(next, openedOn)
    // Refused because the entry changed meanwhile: the block joins the form on its old base, so
    // the conflict banner offers both ways out. Any other failure stays in the stat block editor.
    if (!failure || lastCode.current === 'stale') {
      setEntry(next)
      if (failure) setBaseRevision(openedOn)
      return null
    }
    setStatus(null)
    return failure
  }
  const keepMine = async () => {
    if (!draft) return
    focusNext.current = null
    const failure = await save(entry, draft.revision)
    if (!failure) headingRef.current?.focus()
  }
  const change = async (kind: 'deleteEntry' | 'revertEntry') => {
    if (!draft || pending) return
    lastCode.current = null
    try {
      const result = await action.mutateAsync({ kind, entryId: draft.id, revision: draft.revision })
      setConfirm(null)
      setStatus(null)
      if ('deleted' in result && result.deleted) return onGone()
      // Restoring an entry someone else deleted while it had edits here keeps them: they come
      // back under the conflict banner instead of being replaced by the restored version.
      const keep = kind === 'revertEntry' && draft.state === 'deleted' && dirty
      if (keep) focusNext.current = 'conflict'
      else {
        setFollow(true)
        focusNext.current = kind === 'deleteEntry' ? 'restore' : 'heading'
      }
    } catch (error) {
      setConfirm(null)
      fail(error)
      if (lastCode.current === 'stale') setStatus({ tone: 'error', text: t('library.notDone') })
    }
  }
  const openJson = () => {
    setJson(JSON.stringify(entry.data, null, 2))
    setJsonError(null)
  }
  const editJson = (text: string) => {
    setJson(text)
    try {
      const parsed: unknown = JSON.parse(text)
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        setJsonError(t('library.jsonNotObject'))
        return
      }
      setJsonError(null)
      update({ ...entry, data: parsed as Record<string, unknown> })
      setGeneration((value) => value + 1)
    } catch (error) {
      setJsonError(
        t('library.jsonInvalid', { message: error instanceof Error ? error.message : '' }),
      )
    }
  }

  const name = entryName(entry, language) || t('library.newEntry')
  const family = formFamily(entry.kind)
  // A deleted entry says so in its banner.
  const state =
    draft && draft.state !== 'published' && draft.state !== 'deleted'
      ? t(`library.state.${draft.state}`)
      : null
  return (
    <form
      className="lib-editor-inner"
      aria-labelledby="lib-entry-title"
      onSubmit={(event) => {
        event.preventDefault()
        // The creature editor is a portal: its own submit bubbles here through React.
        if (event.target === event.currentTarget) void save()
      }}
    >
      {back}
      <div className="lib-entry-head">
        <div>
          <h2 id="lib-entry-title" className="lib-pack-title" ref={headingRef} tabIndex={-1}>
            {name}
          </h2>
          <Text size="sm" c="dimmed">
            {[entry.key || null, state].filter(Boolean).join(' · ')}
          </Text>
        </div>
        {/* Away from Save, so the save bar fits one row in the narrow editor column. */}
        {draft && !deleted && (
          <Group gap={4} wrap="wrap" justify="flex-end">
            {draft.state === 'changed' && (
              <Button
                variant="subtle"
                color="red"
                leftSection={<Undo2 size={18} aria-hidden="true" />}
                onClick={() => setConfirm('revertEntry')}
              >
                {t('library.revert')}
              </Button>
            )}
            <Button
              variant="subtle"
              color="red"
              leftSection={<Trash2 size={18} aria-hidden="true" />}
              onClick={() => setConfirm('deleteEntry')}
            >
              {t('library.delete')}
            </Button>
          </Group>
        )}
      </div>
      {conflict && (
        <div className="lib-banner">
          <span>{t('library.conflict')}</span>
          <Group gap="xs" wrap="wrap">
            <Button ref={keepMineRef} variant="light" onClick={() => void keepMine()}>
              {t('library.keepMine')}
            </Button>
            <Button variant="subtle" color="red" onClick={takeServer}>
              {t('library.takeServer')}
            </Button>
          </Group>
        </div>
      )}
      {restored && dirty && !deleted && !conflict && (
        <div className="lib-banner">
          <span>{t('library.restored')}</span>
          <Button
            variant="light"
            onClick={() => {
              setEntry(baseline)
              setGeneration((value) => value + 1)
              setRestored(false)
              setStatus(null)
              headingRef.current?.focus()
            }}
          >
            {t('library.dropRestored')}
          </Button>
        </div>
      )}
      {deleted && (
        <div className="lib-banner">
          <span>{t('library.deletedNote')}</span>
          <Button
            ref={restoreRef}
            data-restore
            variant="light"
            onClick={() => void change('revertEntry')}
          >
            {t('library.restore')}
          </Button>
        </div>
      )}
      <Tabs
        value={tab}
        onChange={(value) => {
          if (value === 'json') openJson()
          setTab(value ?? 'form')
        }}
        keepMounted={false}
      >
        <Tabs.List>
          <Tabs.Tab value="form">{t('library.form')}</Tabs.Tab>
          <Tabs.Tab value="json">{t('library.json')}</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="form" pt="md">
          <fieldset className="lib-fields" disabled={deleted}>
            <NameFields
              entry={entry}
              isNew={!draft}
              onChange={(next) => {
                const named = withNames(entry, next)
                if (!draft && !keyTouched) named.key = keyFromName(named.name_en || named.name_es)
                update(named)
              }}
              onKey={(key) => {
                setKeyTouched(true)
                update({ ...entry, key })
              }}
            />
            {family === 'creature' ? (
              <CreatureFields entry={entry} revision={baseRevision} onStore={storeBlock} />
            ) : (
              <TextFields entry={entry} generation={generation} onChange={update} />
            )}
          </fieldset>
        </Tabs.Panel>
        <Tabs.Panel value="json" pt="md">
          <Textarea
            label={t('library.json')}
            value={json}
            onChange={(event) => editJson(event.currentTarget.value)}
            error={jsonError}
            readOnly={deleted}
            autosize
            minRows={16}
            maxRows={40}
            spellCheck={false}
            classNames={{ input: 'lib-json' }}
          />
        </Tabs.Panel>
      </Tabs>
      <div className="lib-savebar" hidden={deleted && !status}>
        <Text
          size="sm"
          role="status"
          className={status?.tone === 'error' ? 'lib-status-error' : undefined}
        >
          {status?.text ?? (dirty ? t('library.unsaved') : '')}
        </Text>
        {!deleted && (
          <Group gap="xs" wrap="wrap" justify="flex-end">
            {/* Never disabled: a disabled button would drop keyboard focus after saving. */}
            <Button type="submit" aria-disabled={jsonError || problem ? true : undefined}>
              {t('library.save')}
            </Button>
          </Group>
        )}
      </div>
      <Modal
        opened={confirm !== null}
        onClose={() => setConfirm(null)}
        title={t(confirm === 'revertEntry' ? 'library.revertTitle' : 'library.deleteEntryTitle', {
          name,
        })}
        closeButtonProps={{ 'aria-label': t('library.cancel'), size: 44 }}
      >
        <Text>
          {confirm === 'revertEntry'
            ? t('library.revertBody')
            : t(draft?.published ? 'library.deleteEntryPublished' : 'library.deleteEntryNew')}
        </Text>
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" data-autofocus onClick={() => setConfirm(null)}>
            {t('library.cancel')}
          </Button>
          <Button color="red" variant="light" onClick={() => confirm && void change(confirm)}>
            {t(confirm === 'revertEntry' ? 'library.revert' : 'library.delete')}
          </Button>
        </Group>
      </Modal>
    </form>
  )
}

function NameFields({
  entry,
  isNew,
  onChange,
  onKey,
}: {
  entry: EntryInput
  isNew: boolean
  onChange: (names: { name_en?: string; name_es?: string }) => void
  onKey: (key: string) => void
}) {
  const { t } = useTranslation()
  return (
    <>
      <div className="lib-pair">
        <TextInput
          label={t('library.nameEs')}
          value={entry.name_es}
          maxLength={120}
          onChange={(event) => onChange({ name_es: event.currentTarget.value })}
        />
        <TextInput
          label={t('library.nameEn')}
          value={entry.name_en}
          maxLength={120}
          onChange={(event) => onChange({ name_en: event.currentTarget.value })}
        />
      </div>
      {isNew && (
        <TextInput
          label={t('library.key')}
          description={t('library.keyHelp')}
          value={entry.key}
          maxLength={80}
          error={entry.key && entryProblem(entry) === 'key' ? t('library.problem.key') : undefined}
          onChange={(event) => onKey(event.currentTarget.value.toLowerCase())}
        />
      )}
    </>
  )
}

/** Summary and text per language, plus the listing fields of spells and class features. */
function TextFields({
  entry,
  generation,
  onChange,
}: {
  entry: EntryInput
  /** Changes when the data changed outside these fields (server, JSON tab, discard). */
  generation: number
  onChange: (next: EntryInput) => void
}) {
  const { t } = useTranslation()
  const index = indexOf(entry.data)
  const setIndex = (patch: Record<string, unknown>) =>
    onChange({ ...entry, data: withIndex(entry.data, patch) })
  const label = (prefix: string, value: string) =>
    t(`${prefix}.${value}` as 'srd.class.druid', { defaultValue: value })
  return (
    <>
      {entry.kind === 'spell' && (
        <div className="lib-grid-fields">
          <NumberInput
            hideControls
            label={t('library.level')}
            min={0}
            max={9}
            value={typeof index.lv === 'number' ? index.lv : ''}
            onChange={(value) => setIndex({ lv: typeof value === 'number' ? value : undefined })}
          />
          <Select
            label={t('library.school')}
            data={spellSchools.map((value) => {
              const name = label('glossary.school', value)
              return { value, label: name.charAt(0).toUpperCase() + name.slice(1) }
            })}
            value={typeof index.sc === 'string' ? index.sc : null}
            onChange={(value) => setIndex({ sc: value ?? undefined })}
          />
          <Checkbox.Group
            label={t('library.classes')}
            className="lib-classes"
            value={Array.isArray(index.cl) ? (index.cl as string[]) : []}
            onChange={(value) => setIndex({ cl: value })}
          >
            <div className="lib-class-grid">
              {spellClasses.map((value) => (
                <Checkbox key={value} value={value} label={label('srd.class', value)} />
              ))}
            </div>
          </Checkbox.Group>
          <div className="lib-checks">
            <Checkbox
              label={t('library.concentration')}
              checked={index.co === 1}
              onChange={(event) => setIndex({ co: event.currentTarget.checked ? 1 : undefined })}
            />
            <Checkbox
              label={t('library.ritual')}
              checked={index.ri === 1}
              onChange={(event) => setIndex({ ri: event.currentTarget.checked ? 1 : undefined })}
            />
          </div>
        </div>
      )}
      {entry.kind === 'feature' && (
        <div className="lib-grid-fields">
          <Select
            label={t('library.class')}
            data={featureClasses.map((value) => ({ value, label: label('srd.class', value) }))}
            value={typeof index.fc === 'string' ? index.fc : null}
            onChange={(value) => setIndex({ fc: value ?? undefined })}
          />
          <TextInput
            label={t('library.subclass')}
            value={typeof index.sb === 'string' ? index.sb : ''}
            onChange={(event) => setIndex({ sb: event.currentTarget.value.trim() || undefined })}
          />
          <NumberInput
            hideControls
            label={t('library.level')}
            min={1}
            max={20}
            value={typeof index.lv === 'number' ? index.lv : ''}
            onChange={(value) => setIndex({ lv: typeof value === 'number' ? value : undefined })}
          />
        </div>
      )}
      <div className="lib-langs">
        {languages.map((lang) => (
          <LanguageText
            key={lang}
            entry={entry}
            generation={generation}
            language={lang}
            help={lang === languages[0]}
            onChange={onChange}
          />
        ))}
      </div>
    </>
  )
}

function LanguageText({
  entry,
  generation,
  language,
  help,
  onChange,
}: {
  entry: EntryInput
  generation: number
  language: ContentLanguage
  /** The writing help shows once, under the first language. */
  help: boolean
  onChange: (next: EntryInput) => void
}) {
  const { t } = useTranslation()
  const es = language === 'es'
  // The text keeps its own paragraph breaks while typing; the blocks follow it.
  const [text, setText] = useState(() => bodyText(entry.data, language))
  // Data changed elsewhere: the text starts again from it, in place, so no field loses focus.
  const [shown, setShown] = useState(generation)
  if (shown !== generation) {
    setShown(generation)
    setText(bodyText(entry.data, language))
  }
  const index = indexOf(entry.data)
  const aliasField = es ? 'sa' : 'ea'
  const tables = tableCount(bodyOf(entry.data, language)?.blocks)
  return (
    <fieldset className="lib-lang">
      <legend>{t(`library.language.${language}`)}</legend>
      {('en' in index || 'es' in index || entry.kind !== 'creature') && (
        <TextInput
          label={t(es ? 'library.aliasesEs' : 'library.aliasesEn')}
          description={t('library.aliasesHelp')}
          value={listText(index[aliasField])}
          onChange={(event) =>
            onChange({
              ...entry,
              data: withIndex(entry.data, { [aliasField]: textList(event.currentTarget.value) }),
            })
          }
        />
      )}
      <Textarea
        label={t(es ? 'library.summaryEs' : 'library.summaryEn')}
        value={bodySummary(entry.data, language)}
        maxLength={300}
        autosize
        minRows={2}
        onChange={(event) =>
          onChange({
            ...entry,
            data: withBody(entry.data, language, { summary: event.currentTarget.value }),
          })
        }
      />
      <Textarea
        label={t(es ? 'library.textEs' : 'library.textEn')}
        description={help ? t('library.textHelp') : undefined}
        value={text}
        autosize
        minRows={8}
        maxRows={30}
        onChange={(event) => {
          const value = event.currentTarget.value
          setText(value)
          onChange({ ...entry, data: withBody(entry.data, language, { text: value }) })
        }}
      />
      {tables > 0 && (
        <Text size="sm" c="dimmed">
          {t('library.tablesInJson', { count: tables })}
        </Text>
      )}
    </fieldset>
  )
}

/** Listing numbers and the two stat blocks, written with the bestiary's creature editor. */
function CreatureFields({
  entry,
  revision,
  onStore,
}: {
  entry: EntryInput
  /** The revision the form's edits start from. */
  revision: number
  onStore: (next: EntryInput, openedOn: number) => Promise<string | null>
}) {
  const { t } = useTranslation()
  const [open, setOpen] = useState<BestiaryLanguage | null>(null)
  const openedOn = useRef(0)
  // The editor unmounts on close: give focus back to the button that opened it (found again by
  // its language, since a save that syncs the form re-creates the fields).
  const close = () => {
    const language = open
    setOpen(null)
    requestAnimationFrame(() => {
      // Unless the form already moved focus on purpose (to the conflict banner).
      if (document.activeElement && document.activeElement !== document.body) return
      const button = document.querySelector<HTMLElement>(`.lib-blocks [data-block="${language}"]`)
      // A deleted entry's fields are disabled: its way back takes focus instead.
      const target =
        button && !button.matches(':disabled')
          ? button
          : (document.querySelector<HTMLElement>('[data-restore]') ??
            document.getElementById('lib-entry-title'))
      target?.focus()
    })
  }
  const monsters = useQuery(monsterIndexQuery())
  const bodies = useQuery({ ...monsterBodiesQuery(open ?? 'es'), enabled: !!open })
  const index = indexOf(entry.data)
  const sizes = Array.isArray(index.size) ? (index.size as string[]) : []
  const blockOf = (language: BestiaryLanguage) => {
    const parsed = statBlockSchema.safeParse(bodyOf(entry.data, language))
    return parsed.success ? parsed.data : null
  }
  const editing = open ? blockOf(open) : null
  const name = (language: BestiaryLanguage) =>
    (language === 'es' ? entry.name_es : entry.name_en) || entry.name_es || entry.name_en
  return (
    <>
      {/* The listing numbers come from the stat block: they change when a block is saved. */}
      {typeof index.cr === 'string' && (
        <Text>
          {t('library.creatureNumbers', {
            cr: index.cr,
            type:
              typeof index.type === 'string'
                ? t(`bestiary.type.${index.type}` as 'bestiary.type.beast', {
                    defaultValue: index.type,
                  })
                : '—',
            ac: typeof index.ac === 'number' ? index.ac : '—',
            hp: typeof index.hp === 'number' ? index.hp : '—',
          })}
        </Text>
      )}
      <ul className="lib-blocks">
        {(['es', 'en'] as const).map((language) => {
          const block = blockOf(language)
          return (
            <li key={language} className="lib-block-row">
              <div>
                <Text fw={600}>
                  {t(language === 'es' ? 'library.statBlockEs' : 'library.statBlockEn')}
                </Text>
                <Text size="sm" c="dimmed">
                  {block ? `${block.name} · ${block.meta}` : t('library.noBlock')}
                </Text>
              </div>
              <Button
                variant="light"
                data-block={language}
                onClick={() => {
                  openedOn.current = revision
                  setOpen(language)
                }}
                disabled={!name(language)}
              >
                {t(block ? 'library.editBlock' : 'library.createBlock')}
              </Button>
            </li>
          )
        })}
      </ul>
      {open && monsters.data && bodies.data && (
        <CreatureEditor
          campaignId=""
          title={t('library.blockTitle', {
            name: name(open),
            language: t(`library.language.${open}`),
          })}
          initial={
            editing
              ? draftFromBlock(t, open, editing, {
                  name: name(open),
                  cr: typeof index.cr === 'string' ? index.cr : null,
                  type: (creatureTypes as readonly string[]).includes(String(index.type))
                    ? (index.type as (typeof creatureTypes)[number])
                    : null,
                  size: sizes[0] as CreatureSize | undefined,
                })
              : blankDraft(t, open, name(open))
          }
          template={null}
          language={open}
          baselines={monsters.data.baselines}
          traits={bodies.data.traits}
          onClose={close}
          onSaved={close}
          onSubmit={({ block, input }) => {
            const next = {
              ...entry,
              data: withIndex(
                { ...entry.data, [open]: block },
                {
                  ac: input.armor_class,
                  hp: input.max_hp,
                  init: input.initiative_bonus,
                  cr: input.challenge ?? index.cr,
                  type: input.creature_type ?? index.type,
                },
              ),
            }
            return onStore(next, openedOn.current)
          }}
        />
      )}
    </>
  )
}
