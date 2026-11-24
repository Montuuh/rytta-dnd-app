import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Collapse,
  Group,
  Loader,
  Stack,
  Switch,
  Text,
  TextInput,
  Title,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, Eye, EyeOff, Search } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { Modal } from '@/shared/ui/overlays'
import {
  campaignContentQuery,
  contentChangesQuery,
  contentEntriesQuery,
  useContentAction,
} from '../api'
import {
  hasUpdate,
  startsFromSrd,
  liveCategories,
  nameOf,
  titleOf,
  type ContentCategory,
  type ContentChange,
  type ContentPack,
  type PackCategory,
} from '../domain/content'
import './content.css'

type Target = { pack: ContentPack; category: PackCategory }

const switchId = (target: Target) => `content-${target.pack.id}-${target.category.category}`

const actionMessage = (code: string) =>
  code === 'stale'
    ? 'campaignContent.stale'
    : code === 'forbidden'
      ? 'campaignContent.forbidden'
      : code === 'invalid'
        ? 'campaignContent.invalid'
        : 'campaignContent.actionError'

/** RYT-162: the DM chooses the packs this campaign uses, per category, at a pinned version. */
export function CampaignContentPanel({ campaignId }: { campaignId: string }) {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const content = useQuery(campaignContentQuery(state.user!.id, campaignId))
  const action = useContentAction(campaignId)
  // A dialog is mounted while it is used: it closes, then unmounts and hands focus back.
  const [browsing, setBrowsing] = useState<{ target: Target; open: boolean } | null>(null)
  const [reviewing, setReviewing] = useState<{ target: Target; open: boolean } | null>(null)
  const [turningOff, setTurningOff] = useState<Target | null>(null)
  const [updated, setUpdated] = useState<string | null>(null)
  // The button that opened a dialog gets focus back when it closes.
  const opener = useRef<HTMLElement | null>(null)
  const remember = () => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
  }
  // When the opener is gone (an update removes its Review button), the pack's switch takes focus.
  const giveFocusBack = (fallback: string) => {
    const target = opener.current?.isConnected ? opener.current : document.getElementById(fallback)
    target?.focus()
  }

  if (content.isPending) return <Loader aria-label={t('common.loading')} />
  if (content.isError)
    return (
      <Alert color="red" role="alert">
        <Stack gap="xs" align="flex-start">
          <Text size="sm">{t('campaignContent.error')}</Text>
          <Button size="sm" variant="default" onClick={() => void content.refetch()}>
            {t('common.retry')}
          </Button>
        </Stack>
      </Alert>
    )

  // Turning a pack off keeps its version and hidden entries, except the SRD creatures: the
  // bestiary then forgets its removals and the campaign's versions, so that asks first.
  const toggle = (target: Target, enabled: boolean) => {
    setUpdated(null)
    if (!enabled && target.pack.srd && target.category.category === 'creatures')
      setTurningOff(target)
    else
      action.mutate({
        kind: 'enable',
        packId: target.pack.id,
        category: target.category.category,
        enabled,
      })
  }

  return (
    <section aria-labelledby="campaign-content-title" className="content-panel">
      <Title order={2} id="campaign-content-title" size="h3">
        {t('campaignContent.title')}
      </Title>
      {action.isError && (
        <Alert color="red" role="alert" mt="sm">
          {t(actionMessage(action.error.message))}
        </Alert>
      )}
      <div role="status" aria-live="polite" className="content-notice">
        {updated !== null && <Text size="sm">{updated}</Text>}
      </div>
      {liveCategories.map((category) => {
        const offered = content.data.flatMap((pack) =>
          pack.categories
            .filter((entry) => entry.category === category)
            .map((entry) => ({ pack, category: entry })),
        )
        return (
          <section
            key={category}
            aria-labelledby={`content-${category}`}
            className="content-section"
          >
            <Title order={3} id={`content-${category}`} className="content-section-title">
              {t(`campaignContent.category.${category}`)}
            </Title>
            {offered.length === 0 ? (
              <Text c="dimmed" size="sm">
                {t('campaignContent.none')}
              </Text>
            ) : (
              <ul className="content-packs">
                {offered.map((target) => (
                  <PackRow
                    key={target.pack.id}
                    target={target}
                    language={i18n.language}
                    busy={action.isPending}
                    onToggle={(enabled) => toggle(target, enabled)}
                    onBrowse={() => {
                      remember()
                      setBrowsing({ target, open: true })
                    }}
                    onReview={() => {
                      remember()
                      setUpdated(null)
                      setReviewing({ target, open: true })
                    }}
                  />
                ))}
              </ul>
            )}
          </section>
        )
      })}
      {browsing && (
        <EntriesDialog
          key={`${browsing.target.pack.id}:${browsing.target.category.category}`}
          campaignId={campaignId}
          target={browsing.target}
          opened={browsing.open}
          onClose={() => setBrowsing({ ...browsing, open: false })}
          onClosed={() => {
            // Unmounted once closed: one dialog at a time, and a fresh search next time.
            setBrowsing(null)
            giveFocusBack(switchId(browsing.target))
          }}
        />
      )}
      {reviewing && (
        <ReviewDialog
          key={`${reviewing.target.pack.id}:${reviewing.target.category.category}`}
          campaignId={campaignId}
          target={reviewing.target}
          opened={reviewing.open}
          onClose={() => setReviewing({ ...reviewing, open: false })}
          onClosed={() => {
            setReviewing(null)
            giveFocusBack(switchId(reviewing.target))
          }}
          onUpdated={(version) => {
            setReviewing({ ...reviewing, open: false })
            setUpdated(
              t('campaignContent.updated', {
                pack: titleOf(reviewing.target.pack, i18n.language),
                version,
              }),
            )
          }}
        />
      )}
      <Modal
        opened={turningOff !== null}
        onClose={() => setTurningOff(null)}
        title={
          turningOff &&
          t('campaignContent.offTitle', {
            pack: titleOf(turningOff.pack, i18n.language),
            category: t(`campaignContent.category.${turningOff.category.category}`).toLowerCase(),
          })
        }
        closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
        centered
      >
        <Stack gap="md">
          <Text>{t('campaignContent.offBody')}</Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={() => setTurningOff(null)} data-autofocus>
              {t('common.cancel')}
            </Button>
            <Button
              color="red"
              variant="light"
              onClick={() => {
                const target = turningOff!
                setTurningOff(null)
                action.mutate({
                  kind: 'enable',
                  packId: target.pack.id,
                  category: target.category.category,
                  enabled: false,
                })
              }}
            >
              {t('campaignContent.offConfirm')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </section>
  )
}

function PackRow({
  target,
  language,
  busy,
  onToggle,
  onBrowse,
  onReview,
}: {
  target: Target
  language: string
  busy: boolean
  onToggle: (enabled: boolean) => void
  onBrowse: () => void
  onReview: () => void
}) {
  const { t } = useTranslation()
  const { pack, category } = target
  const title = titleOf(pack, language)
  const categoryName = t(`campaignContent.category.${category.category}`).toLowerCase()
  const update = hasUpdate(pack, category)
  const state = !category.enabled
    ? t('campaignContent.metaOff', { count: category.entries })
    : category.hidden > 0
      ? t('campaignContent.metaHidden', {
          version: category.pinned_version ?? pack.version ?? 0,
          count: category.entries,
          hidden: t('campaignContent.hiddenCount', { count: category.hidden }),
        })
      : t('campaignContent.meta', {
          version: category.pinned_version ?? pack.version ?? 0,
          count: category.entries,
        })
  const meta = startsFromSrd(pack, title) ? `${t('campaignContent.basedOnSrd')} · ${state}` : state
  return (
    <li className="content-pack" data-enabled={category.enabled || undefined}>
      <Switch
        id={switchId(target)}
        className="content-switch"
        checked={category.enabled}
        disabled={busy}
        onChange={(event) => onToggle(event.currentTarget.checked)}
        label={<span className="user-copy content-pack-title">{title}</span>}
        description={meta}
        aria-label={t('campaignContent.use', { pack: title, category: categoryName })}
      />
      {category.enabled && (
        <div className="content-pack-actions">
          {update && (
            <span className="content-update">
              {t('campaignContent.update', { version: pack.version ?? 0 })}
            </span>
          )}
          {update && (
            <Button
              variant="default"
              size="sm"
              onClick={onReview}
              aria-label={t('campaignContent.reviewPack', { pack: title, category: categoryName })}
            >
              {t('campaignContent.review')}
            </Button>
          )}
          {pack.offered && (
            <Button
              variant="subtle"
              size="sm"
              onClick={onBrowse}
              aria-label={t('campaignContent.browsePack', { pack: title, category: categoryName })}
            >
              {t('campaignContent.browse')}
            </Button>
          )}
        </div>
      )}
    </li>
  )
}

function EntriesDialog({
  campaignId,
  target,
  opened,
  onClose,
  onClosed,
}: {
  campaignId: string
  target: Target
  opened: boolean
  onClose: () => void
  onClosed: () => void
}) {
  const { t, i18n } = useTranslation()
  const action = useContentAction(campaignId)
  const [draft, setDraft] = useState('')
  const [search, setSearch] = useState('')
  const [pages, setPages] = useState(1)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(draft.trim())
      setPages(1)
    }, 250)
    return () => window.clearTimeout(timer)
  }, [draft])
  const category: ContentCategory = target.category.category
  const queries = Array.from({ length: pages }, (_, page) => page)
  const title = t('campaignContent.entriesTitle', {
    category: t(`campaignContent.category.${category}`),
    pack: titleOf(target.pack, i18n.language),
  })
  return (
    <Modal
      opened={opened}
      returnFocus={false}
      onExitTransitionEnd={onClosed}
      onClose={onClose}
      title={title}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
      size="lg"
    >
      <Stack gap="sm">
        <TextInput
          label={t('campaignContent.search')}
          leftSection={<Search size={16} aria-hidden="true" />}
          value={draft}
          onChange={(event) => setDraft(event.currentTarget.value)}
          maxLength={80}
          data-autofocus
        />
        {action.isError && (
          <Alert color="red" role="alert">
            {t(actionMessage(action.error.message))}
          </Alert>
        )}
        {opened &&
          queries.map((page) => (
            <EntriesPage
              key={`${search}-${page}`}
              campaignId={campaignId}
              target={target}
              search={search}
              page={page}
              last={page === pages - 1}
              onMore={() => setPages((value) => value + 1)}
              onHide={(entry, hidden) =>
                action.mutate({
                  kind: 'hide',
                  packId: target.pack.id,
                  entryKind: entry.kind,
                  key: entry.key,
                  hidden,
                })
              }
              busy={action.isPending}
            />
          ))}
      </Stack>
    </Modal>
  )
}

function EntriesPage({
  campaignId,
  target,
  search,
  page,
  last,
  onMore,
  onHide,
  busy,
}: {
  campaignId: string
  target: Target
  search: string
  page: number
  last: boolean
  onMore: () => void
  onHide: (entry: { kind: string; key: string }, hidden: boolean) => void
  busy: boolean
}) {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const entries = useQuery(
    contentEntriesQuery(
      state.user!.id,
      campaignId,
      target.pack.id,
      target.category.category,
      search,
      page,
    ),
  )
  if (entries.isPending) return <Loader size="sm" aria-label={t('common.loading')} />
  if (entries.isError)
    return (
      <Alert color="red" role="alert">
        <Stack gap="xs" align="flex-start">
          <Text size="sm">{t('campaignContent.error')}</Text>
          <Button size="sm" variant="default" onClick={() => void entries.refetch()}>
            {t('common.retry')}
          </Button>
        </Stack>
      </Alert>
    )
  const { total, entries: rows } = entries.data
  const shown = page * 100 + rows.length
  return (
    <>
      {page === 0 && (
        <Text size="sm" c="dimmed" role="status">
          {total === 0
            ? t('campaignContent.noMatch')
            : t('campaignContent.found', { count: total })}
        </Text>
      )}
      <ul className="content-entries">
        {rows.map((entry) => {
          const name = nameOf(entry, i18n.language)
          return (
            <li key={`${entry.kind}:${entry.key}`} data-hidden={entry.hidden || undefined}>
              <span className="content-entry-name user-copy">{name}</span>
              {entry.hidden && (
                <span className="content-entry-state">{t('campaignContent.hidden')}</span>
              )}
              <button
                type="button"
                className="content-eye"
                aria-pressed={entry.hidden}
                aria-label={t('campaignContent.hide', { name })}
                disabled={busy}
                onClick={() => onHide(entry, !entry.hidden)}
              >
                {entry.hidden ? (
                  <EyeOff size={18} aria-hidden="true" />
                ) : (
                  <Eye size={18} aria-hidden="true" />
                )}
              </button>
            </li>
          )
        })}
      </ul>
      {last && shown < total && (
        <Button variant="subtle" onClick={onMore}>
          {t('campaignContent.more')}
        </Button>
      )}
    </>
  )
}

function ReviewDialog({
  campaignId,
  target,
  opened,
  onClose,
  onClosed,
  onUpdated,
}: {
  campaignId: string
  target: Target
  opened: boolean
  onClose: () => void
  onClosed: () => void
  onUpdated: (version: number) => void
}) {
  const { t, i18n } = useTranslation()
  const { state } = useAuth()
  const changes = useQuery({
    ...contentChangesQuery(state.user!.id, campaignId, target.pack.id, target.category.category),
    enabled: opened,
  })
  const action = useContentAction(campaignId)
  const title = t('campaignContent.reviewTitle', {
    pack: titleOf(target.pack, i18n.language),
    version: target.pack.version ?? 0,
  })
  return (
    <Modal
      opened={opened}
      returnFocus={false}
      onExitTransitionEnd={onClosed}
      onClose={() => !action.isPending && onClose()}
      title={title}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
      size="lg"
    >
      {changes.isPending ? (
        <Loader size="sm" aria-label={t('common.loading')} />
      ) : changes.isError ? (
        <Alert color="red" role="alert">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">{t('campaignContent.error')}</Text>
            <Button size="sm" variant="default" onClick={() => void changes.refetch()}>
              {t('common.retry')}
            </Button>
          </Stack>
        </Alert>
      ) : (
        <Stack gap="md">
          <Text c="dimmed">
            {t('campaignContent.reviewLead', { pinned: changes.data.pinned_version })}
          </Text>
          {changes.data.changes.length === 0 ? (
            <Text>{t('campaignContent.noChanges')}</Text>
          ) : (
            (['new', 'changed', 'withdrawn'] as const).map((kind) => (
              <ChangeGroup
                key={kind}
                kind={kind}
                rows={changes.data.changes.filter((change) => change.change === kind)}
              />
            ))
          )}
          {action.isError && (
            <Alert color="red" role="alert">
              {t(actionMessage(action.error.message))}
            </Alert>
          )}
          <Group justify="flex-end">
            <Button
              loading={action.isPending}
              onClick={() =>
                action.mutate(
                  {
                    kind: 'update',
                    packId: target.pack.id,
                    category: target.category.category,
                    version: changes.data.version,
                  },
                  { onSuccess: () => onUpdated(changes.data.version) },
                )
              }
            >
              {t('campaignContent.updateTo', { version: changes.data.version })}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  )
}

function ChangeGroup({
  kind,
  rows,
}: {
  kind: 'new' | 'changed' | 'withdrawn'
  rows: ContentChange[]
}) {
  const { t, i18n } = useTranslation()
  // Withdrawn entries the campaign uses are the ones to look at: open by default.
  const flagged = rows.some((row) => row.campaign_version)
  const [open, setOpen] = useState(kind === 'withdrawn' || flagged)
  if (rows.length === 0) return null
  const id = `content-change-${kind}`
  return (
    <section className="content-change">
      <button
        type="button"
        className="content-change-toggle"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
      >
        <span>{t(`campaignContent.change.${kind}`)}</span>
        <span className="content-change-count">{rows.length}</span>
        <ChevronDown size={18} aria-hidden="true" data-open={open || undefined} />
      </button>
      <Collapse expanded={open} id={id}>
        <ul className="content-change-list">
          {rows.map((row) => (
            <li key={`${row.kind}:${row.key}`}>
              <span className="user-copy">{nameOf(row, i18n.language)}</span>
              {row.campaign_version && (
                <span className="content-flag">{t('campaignContent.yourVersion')}</span>
              )}
              {row.hidden && (
                <span className="content-entry-state">{t('campaignContent.wasHidden')}</span>
              )}
            </li>
          ))}
        </ul>
      </Collapse>
    </section>
  )
}
