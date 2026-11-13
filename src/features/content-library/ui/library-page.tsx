import { useCallback, useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react'
import {
  Alert,
  Button,
  Group,
  Loader,
  Modal,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, FileUp, Library, PencilLine, Plus, Search, UploadCloud } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Link, NavLink, useLocation, useNavigate, useParams } from 'react-router'
import { useAuth } from '@/features/auth'
import { PageHead } from '@/shared/ui/page-head'
import { usePhone } from '@/shared/ui/use-viewport'
import { draftsQuery, libraryQuery } from '../api'
import {
  entryName,
  knownKinds,
  libraryErrorCode,
  missingLanguage,
  packTitle,
  sortRows,
  type ContentLanguage,
  type ContentPack,
} from '../domain/library'
import { srdSlug } from '../domain/srd'
import { ImportDialog, PackDialog, PublishDialog, SrdDialog } from './dialogs'
import { EntryEditor } from './entry-editor'
import { entryMeta, kindLabel, packLine } from './labels'
import { hasKeptEdits, keepEdits } from './unsaved'
import './library.css'

type Dialog =
  | { kind: 'pack'; pack: ContentPack | null }
  | { kind: 'import'; pack: ContentPack }
  | { kind: 'srd' }
  | { kind: 'publish'; pack: ContentPack }
  | null

/** Library links and navigation that ask before an unsaved entry is left. */
export type Guard = {
  /** onClick of library links: asks first when the open entry has unsaved changes. */
  link: (event: MouseEvent<HTMLAnchorElement>) => void
  go: (to: string) => void
}

/**
 * RYT-093 content library manager: packs, the entries of one kind and the entry editor, in three
 * columns on a laptop, two on a tablet and one screen at a time on a phone (the route decides).
 */
export function LibraryPage() {
  const { t, i18n } = useTranslation()
  const language: ContentLanguage = i18n.language.startsWith('en') ? 'en' : 'es'
  const { state } = useAuth()
  const userId = state.user?.id ?? ''
  const params = useParams()
  const navigate = useNavigate()
  const phone = usePhone()
  const library = useQuery(libraryQuery(userId))
  const [dialog, setDialog] = useState<Dialog>(null)
  const location = useLocation()
  // A notice belongs to the screen it was raised on: it shows there and goes once that screen is
  // left (`seen` waits for a notice raised just before navigating to its screen).
  const [notice, setNotice] = useState<{ text: string; at: string; seen: boolean } | null>(null)
  if (notice && !notice.seen && notice.at === location.pathname)
    setNotice({ ...notice, seen: true })
  if (notice?.seen && notice.at !== location.pathname) setNotice(null)
  const [leaving, setLeaving] = useState<string | null>(null)
  const dirty = useRef(false)
  const returnFocus = useRef<HTMLElement | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const listScroll = useRef(0)
  const previousDepth = useRef<string | null>(null)
  const lastEntry = useRef<string | null>(null)
  const lastPack = useRef<string | null>(null)
  // The pack heading takes focus once it renders (it may still be loading after an upload).
  const entriesFocus = useRef(false)
  const entriesTitle = useCallback((node: HTMLHeadingElement | null) => {
    if (!node || !entriesFocus.current) return
    entriesFocus.current = false
    node.focus()
  }, [])
  const focusEntries = () => {
    entriesFocus.current = true
    requestAnimationFrame(() => {
      const node = document.getElementById('lib-entries-title')
      if (node instanceof HTMLHeadingElement) entriesTitle(node)
    })
  }

  const openDialog = (next: Dialog) => {
    returnFocus.current = document.activeElement as HTMLElement | null
    setDialog(next)
  }
  // Closed dialogs give focus back to what opened them, or to the page heading.
  const closeDialog = () => {
    setDialog(null)
    const target = returnFocus.current
    requestAnimationFrame(() => {
      if (target?.isConnected) target.focus()
      else titleRef.current?.focus()
    })
  }
  const go = useCallback(
    (to: string) => {
      if (dirty.current) setLeaving(to)
      else void navigate(to)
    },
    [navigate],
  )
  const guard: Guard = {
    link: (event) => {
      const to = (event.currentTarget.getAttribute('href') ?? '').replace(/^#/, '')
      // The open screen itself: nothing to leave.
      if (to === location.pathname) return event.preventDefault()
      if (!dirty.current) return
      event.preventDefault()
      setLeaving(to)
    },
    go,
  }
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current) event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [])

  const packs = library.data?.packs ?? []
  const pack = packs.find((p) => p.id === params.packId) ?? null
  const depth = !pack ? 'packs' : params.entryId ? 'editor' : 'entries'
  // Phones show one pane: the editor starts at the top, and the list comes back where it was,
  // with focus on the entry just left.
  useEffect(() => {
    if (!phone) return
    const keep = () => {
      if (previousDepth.current === 'entries') listScroll.current = window.scrollY
    }
    window.addEventListener('scroll', keep, { passive: true })
    return () => window.removeEventListener('scroll', keep)
  }, [phone])
  useLayoutEffect(() => {
    if (!phone) return
    if (depth === 'entries' && previousDepth.current === 'editor') {
      window.scrollTo(0, listScroll.current)
      const row = document.querySelector<HTMLElement>(`[data-entry="${lastEntry.current}"]`)
      ;(row ?? document.getElementById('lib-entries-title'))?.focus({ preventScroll: true })
    } else if (depth !== previousDepth.current && previousDepth.current !== null) {
      window.scrollTo(0, 0)
      // The pane that held the pressed link is hidden: focus the screen that replaced it.
      const target =
        depth === 'packs'
          ? (document.querySelector<HTMLElement>(`[data-pack="${lastPack.current}"]`) ??
            document.getElementById('lib-packs-title'))
          : depth === 'entries'
            ? document.getElementById('lib-entries-title')
            : null
      target?.focus({ preventScroll: true })
    }
    if (params.packId) lastPack.current = params.packId
    if (params.entryId) lastEntry.current = params.entryId
    previousDepth.current = depth
  }, [depth, phone, params.packId, params.entryId])

  if (library.isPending)
    return (
      <div className="lib-page lib-center" role="status">
        <Loader aria-label={t('library.title')} />
      </div>
    )
  if (library.isError) {
    const code = libraryErrorCode(library.error.message)
    return (
      <div className="lib-page">
        <PageHead title={t('library.title')} />
        <Alert color="red" title={t(`library.error.${code}`)} role="alert">
          <Button variant="light" color="red" onClick={() => void library.refetch()}>
            {t('library.retry')}
          </Button>
        </Alert>
      </div>
    )
  }
  if (!library.data.editor)
    return (
      <div className="lib-page">
        <PageHead title={t('library.title')} />
        <div className="lib-empty">
          <Library size={32} aria-hidden="true" />
          <Title order={2}>{t('library.forbiddenTitle')}</Title>
          <Button component={Link} to="/" variant="light">
            {t('library.backHome')}
          </Button>
        </div>
      </div>
    )

  const hasSrd = packs.some((p) => p.slug === srdSlug)
  const kind = pack ? (params.kind ?? defaultKind(pack)) : null
  const uploadButton = !hasSrd && (
    <Button
      variant="light"
      leftSection={<UploadCloud size={18} aria-hidden="true" />}
      onClick={() => openDialog({ kind: 'srd' })}
    >
      {t('library.uploadSrd')}
    </Button>
  )
  const newPackButton = (
    <Button
      variant="light"
      leftSection={<Plus size={18} aria-hidden="true" />}
      onClick={() => openDialog({ kind: 'pack', pack: null })}
    >
      {t('library.newPack')}
    </Button>
  )
  // On a phone, the inner screens keep the space for the pane: no lede, actions or visible title.
  const compact = phone && depth !== 'packs'

  return (
    <div className="lib-page">
      <PageHead
        title={t('library.title')}
        titleClassName={compact ? 'visually-hidden' : undefined}
        headingRef={titleRef}
        description={compact ? undefined : t('library.lede')}
        compactOnPhone
        actions={
          compact || packs.length === 0 ? undefined : (
            <Group gap="xs" wrap="wrap">
              {uploadButton}
              {newPackButton}
            </Group>
          )
        }
      />
      {notice?.at === location.pathname && (
        <Alert
          role="status"
          className="lib-notice"
          withCloseButton
          closeButtonLabel={t('library.dismiss')}
          onClose={() => {
            setNotice(null)
            const heading = document.getElementById('lib-entries-title')
            if (heading instanceof HTMLHeadingElement && heading.offsetParent) heading.focus()
            else titleRef.current?.focus()
          }}
        >
          {notice.text}
        </Alert>
      )}
      {packs.length === 0 ? (
        <div className="lib-empty">
          <Library size={32} aria-hidden="true" />
          <Title order={2}>{t('library.emptyTitle')}</Title>
          <Text>{t('library.emptyBody')}</Text>
          <Group gap="xs" justify="center">
            {uploadButton}
            {newPackButton}
          </Group>
        </div>
      ) : (
        <div className={`lib-grid lib-depth-${depth}`}>
          <nav className="lib-pane lib-packs" aria-labelledby="lib-packs-title">
            <h2 id="lib-packs-title" className="lib-pane-title" tabIndex={-1}>
              {t('library.packs')}
            </h2>
            <ul className="lib-list">
              {packs.map((item) => {
                const to = `/library/${item.id}/${defaultKind(item)}`
                return (
                  <li key={item.id}>
                    <NavLink
                      to={to}
                      onClick={guard.link}
                      data-pack={item.id}
                      className={`lib-row${item.id === pack?.id ? ' is-current' : ''}`}
                      aria-current={item.id === pack?.id ? 'page' : undefined}
                    >
                      <span className="lib-row-name">{packTitle(item, language)}</span>
                      <span className="lib-row-meta">{packLine(t, item)}</span>
                      {!!item.pending && (
                        <span className="lib-row-state">
                          {t('library.pending', { count: item.pending })}
                        </span>
                      )}
                    </NavLink>
                  </li>
                )
              })}
            </ul>
          </nav>
          <section className="lib-pane lib-entries" aria-labelledby="lib-entries-title">
            {pack && kind ? (
              <EntryPane
                key={`${pack.id}:${kind}`}
                pack={pack}
                kind={kind}
                language={language}
                userId={userId}
                entryId={params.entryId}
                guard={guard}
                onEdit={() => openDialog({ kind: 'pack', pack })}
                onImport={() => openDialog({ kind: 'import', pack })}
                onPublish={() => openDialog({ kind: 'publish', pack })}
                titleRef={entriesTitle}
              />
            ) : (
              <Text className="lib-prompt" id="lib-entries-title">
                {t('library.choosePack')}
              </Text>
            )}
          </section>
          <section className="lib-pane lib-editor" aria-label={t('library.form')}>
            {pack && kind && params.entryId ? (
              <EntryEditor
                key={`${pack.id}:${kind}:${params.entryId}`}
                pack={pack}
                kind={kind}
                entryId={params.entryId}
                language={language}
                userId={userId}
                guard={guard}
                onDirtyChange={(value) => {
                  dirty.current = value
                }}
                onCreated={(id) => {
                  dirty.current = false
                  void navigate(`/library/${pack.id}/${kind}/${id}`, { replace: true })
                }}
                onGone={() => {
                  dirty.current = false
                  void navigate(`/library/${pack.id}/${kind}`, { replace: true })
                  focusEntries()
                }}
              />
            ) : (
              <Text className="lib-prompt">{pack ? t('library.chooseEntry') : ''}</Text>
            )}
          </section>
        </div>
      )}
      <Modal
        opened={leaving !== null}
        onClose={() => setLeaving(null)}
        title={t('library.leaveTitle')}
        closeButtonProps={{ 'aria-label': t('library.cancel'), size: 44 }}
      >
        <Text>{t('library.leaveBody')}</Text>
        <Group justify="flex-end" mt="md">
          <Button variant="subtle" data-autofocus onClick={() => setLeaving(null)}>
            {t('library.keepEditing')}
          </Button>
          <Button
            color="red"
            variant="light"
            onClick={() => {
              const to = leaving
              if (pack && kind && params.entryId)
                keepEdits({ userId, packId: pack.id, kind, entryId: params.entryId }, null)
              dirty.current = false
              setLeaving(null)
              if (to) void navigate(to)
            }}
          >
            {t('library.discard')}
          </Button>
        </Group>
      </Modal>
      {dialog?.kind === 'pack' && (
        <PackDialog
          pack={dialog.pack}
          onClose={closeDialog}
          onSaved={(id) => {
            closeDialog()
            if (!dialog.pack) go(`/library/${id}`)
          }}
          onDeleted={() => {
            setDialog(null)
            go('/library')
            requestAnimationFrame(() => titleRef.current?.focus())
          }}
        />
      )}
      {dialog?.kind === 'import' && (
        <ImportDialog
          pack={dialog.pack}
          language={language}
          onClose={closeDialog}
          onDone={(message) => {
            closeDialog()
            setNotice({ text: message, at: location.pathname, seen: true })
          }}
        />
      )}
      {dialog?.kind === 'srd' && (
        <SrdDialog
          language={language}
          existing={packs.find((p) => p.slug === srdSlug) ?? null}
          onClose={closeDialog}
          onDone={(id, message) => {
            setDialog(null)
            setNotice({ text: message, at: `/library/${id}/creature`, seen: false })
            go(`/library/${id}/creature`)
            focusEntries()
          }}
        />
      )}
      {dialog?.kind === 'publish' && (
        <PublishDialog
          pack={dialog.pack}
          language={language}
          onClose={closeDialog}
          onDone={(message) => {
            // The publish banner that opened it is gone: focus the pack.
            setDialog(null)
            setNotice({ text: message, at: location.pathname, seen: true })
            focusEntries()
          }}
        />
      )}
    </div>
  )
}

/** The kind a pack opens on: creatures when it has them, else its largest kind. */
function defaultKind(pack: ContentPack): string {
  const counts = pack.drafts ?? pack.kinds
  if (counts.creature) return 'creature'
  const [largest] = Object.entries(counts).sort((a, b) => b[1] - a[1])
  return largest?.[0] ?? 'creature'
}

function EntryPane({
  pack,
  kind,
  language,
  userId,
  entryId,
  guard,
  onEdit,
  onImport,
  onPublish,
  titleRef,
}: {
  pack: ContentPack
  kind: string
  language: ContentLanguage
  userId: string
  entryId: string | undefined
  guard: Guard
  onEdit: () => void
  onImport: () => void
  onPublish: () => void
  titleRef: (node: HTMLHeadingElement | null) => void
}) {
  const { t } = useTranslation()
  const [query, setQuery] = useState('')
  const drafts = useQuery(draftsQuery(userId, pack.id, kind))
  const counts = pack.drafts ?? pack.kinds
  const kinds = [...new Set([...Object.keys(counts), ...knownKinds, kind])].map((value) => ({
    value,
    label: counts[value] ? `${kindLabel(t, value)} · ${counts[value]}` : kindLabel(t, value),
  }))
  const rows = sortRows(drafts.data ?? [], query, language)
  const title = packTitle(pack, language)
  return (
    <Stack gap="sm" className="lib-entries-inner">
      <Link to="/library" onClick={guard.link} className="lib-back">
        <ArrowLeft size={18} aria-hidden="true" />
        {t('library.backToPacks')}
      </Link>
      <div className="lib-pack-head">
        <div>
          <h2 id="lib-entries-title" className="lib-pack-title" tabIndex={-1} ref={titleRef}>
            {title}
          </h2>
          <Text size="sm" c="dimmed" className="lib-pack-line">
            {packLine(t, pack)}
          </Text>
        </div>
        <Group gap={4} wrap="wrap">
          <Button
            variant="subtle"
            leftSection={<PencilLine size={18} aria-hidden="true" />}
            onClick={onEdit}
          >
            {t('library.editPack')}
          </Button>
          <Button
            variant="subtle"
            leftSection={<FileUp size={18} aria-hidden="true" />}
            onClick={onImport}
          >
            {t('library.import')}
          </Button>
        </Group>
      </div>
      {!!pack.pending && (
        <div className="lib-banner">
          <span>{t('library.pending', { count: pack.pending })}</span>
          <Button onClick={onPublish}>{t('library.publish', { version: pack.version + 1 })}</Button>
        </div>
      )}
      <Select
        label={t('library.kindLabel')}
        data={kinds}
        value={kind}
        allowDeselect={false}
        searchable
        onChange={(value) => value && guard.go(`/library/${pack.id}/${value}`)}
      />
      <TextInput
        type="search"
        aria-label={t('library.search', { pack: title })}
        placeholder={t('library.searchShort')}
        leftSection={<Search size={16} aria-hidden="true" />}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
      />
      <Button
        variant="light"
        leftSection={<Plus size={18} aria-hidden="true" />}
        onClick={() => guard.go(`/library/${pack.id}/${kind}/new`)}
      >
        {t('library.newEntry')}
      </Button>
      {drafts.isPending ? (
        <Loader size="sm" aria-label={kindLabel(t, kind)} />
      ) : drafts.isError ? (
        <Alert
          color="red"
          role="alert"
          title={t(`library.error.${libraryErrorCode(drafts.error.message)}`)}
        >
          <Button variant="light" color="red" onClick={() => void drafts.refetch()}>
            {t('library.retry')}
          </Button>
        </Alert>
      ) : rows.length === 0 ? (
        <Text className="lib-prompt">
          {query.trim() ? t('library.noMatches', { query: query.trim() }) : t('library.noEntries')}
        </Text>
      ) : (
        <ul className="lib-list lib-entry-list">
          {rows.map((row) => {
            const missing = missingLanguage(row)
            // Before the first version every entry is new: the banner says it once.
            const state =
              row.state === 'published' || (row.state === 'new' && pack.version === 0)
                ? null
                : t(`library.state.${row.state}`)
            const to = `/library/${pack.id}/${kind}/${row.id}`
            return (
              <li key={row.id}>
                <NavLink
                  to={to}
                  onClick={guard.link}
                  data-entry={row.id}
                  className={`lib-row${row.id === entryId ? ' is-current' : ''}${row.state === 'deleted' ? ' is-deleted' : ''}`}
                  aria-current={row.id === entryId ? 'page' : undefined}
                >
                  <span className="lib-row-name">{entryName(row, language)}</span>
                  <span className="lib-row-meta">
                    {[
                      entryMeta(t, row),
                      state,
                      missing ? t(`library.missing.${missing}`) : null,
                      hasKeptEdits({ userId, packId: pack.id, kind, entryId: row.id })
                        ? t('library.unsavedRow')
                        : null,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </span>
                </NavLink>
              </li>
            )
          })}
        </ul>
      )}
    </Stack>
  )
}
