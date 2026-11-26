import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Button,
  Collapse,
  Drawer,
  Group,
  Loader,
  Paper,
  Stack,
  Text,
  Title,
} from '@mantine/core'
import { ChevronDown, Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router'
import { useAuth } from '@/features/auth'
import { StaleLine, useCampaign } from '@/features/campaigns'
import { PageHead } from '@/shared/ui/page-head'
import { RefreshControl } from '@/shared/ui/refresh-control'
import { Modal } from '@/shared/ui/overlays'
import { useBackToClose } from '@/shared/ui/use-back-to-close'
import { useLeaveGuard } from '@/shared/ui/use-leave-guard'
import { usePhone } from '@/shared/ui/use-viewport'
import { useQuests } from '../api'
import {
  doneCount,
  groupByStatus,
  playerView,
  questIsNew,
  type Quest,
  type QuestStatus,
} from '../domain/quest'
import { keepUnsaved } from '../domain/unsaved'
import { QuestEditor } from './quest-editor'
import { QuestReader } from './quest-reader'
import './quests.css'

const NEW = 'new'

/** RYT-006: the quest journal. Players read published quests; the DM writes and advances them. */
export function QuestsPage() {
  const { t } = useTranslation()
  const campaign = useCampaign()
  const dmView = campaign.role === 'dm'
  const open = dmView || (campaign.player_modules ?? []).includes('quests')
  if (!open)
    return (
      <Stack>
        <PageHead title={t('module.quests')} />
        <Paper p="xl">
          <Text>{t('quests.hiddenModule')}</Text>
        </Paper>
      </Stack>
    )
  return <Journal dmView={dmView} />
}

function Journal({ dmView }: { dmView: boolean }) {
  const { t } = useTranslation()
  const phone = usePhone()
  const account = useAuth().state.user?.id ?? ''
  const query = useQuests()
  const [params, setParams] = useSearchParams()
  const selected = params.get('quest')
  // A new quest keeps its id from the first keystroke, so saving it does not remount the editor.
  const [newId, setNewId] = useState(() => crypto.randomUUID())
  // The DM previewing as a Player sees exactly what a Player would.
  const list = query.data ? (dmView ? query.data : playerView(query.data)) : undefined
  const dm = list?.dm ?? false
  const select = (id: string | null) => {
    const next = new URLSearchParams(params)
    if (id) next.set('quest', id)
    else next.delete('quest')
    setParams(next, { replace: true })
  }
  const quest = list?.quests.find((item) => item.id === selected) ?? null
  const creating = dm && selected === NEW
  const editing = creating || (dm && quest !== null)
  // The editor reports unsaved changes and its own open dialog, so leaving it never loses work
  // and Escape closes only the topmost layer.
  const [editor, setEditor] = useState({ dirty: false, dialog: false })
  /** Where the DM was going when they had unsaved changes: a quest, none, or another page. */
  const [leaving, setLeaving] = useState<{ to: string | null; route?: string } | null>(null)
  const navigate = useNavigate()
  const dirty = editing && editor.dirty
  const go = (id: string | null) => {
    if (id === selected) return
    // Deferred: the key press that asked to close must not also reach the new dialog.
    if (dirty) window.setTimeout(() => setLeaving({ to: id }))
    else select(id)
  }
  // Other destinations (navigation, links) and reloading ask too.
  useLeaveGuard(dirty, (route) => setLeaving({ to: selected, route }))
  const detail =
    creating || (quest && dm) ? (
      <QuestEditor
        key={creating ? newId : quest!.id}
        id={creating ? newId : quest!.id}
        quest={creating ? null : quest}
        onSaved={(id) => select(id)}
        onDeleted={() => select(null)}
        onStateChange={setEditor}
      />
    ) : quest ? (
      <QuestReader key={quest.id} quest={quest} />
    ) : null

  const sheetOpen = phone && detail !== null
  // Back spends the sheet's history entry; when it only asked about unsaved changes and the DM
  // keeps editing, the sheet takes a fresh entry so the next Back asks again.
  const [backArmed, setBackArmed] = useState(true)
  useBackToClose(sheetOpen && backArmed, () => {
    setBackArmed(false)
    go(null)
  })
  if (!sheetOpen && !backArmed) setBackArmed(true)
  // The Escape that closes this dialog must not reach the sheet as well: key presses older than
  // this moment are ignored by the sheet.
  const keptAt = useRef(0)
  const keepEditing = () => {
    keptAt.current = performance.now()
    setLeaving(null)
    setBackArmed(true)
  }
  // Escape closes the sheet wherever focus is (after a tap in the list it may still be on the
  // page), but never while one of its dialogs is open: that dialog takes Escape.
  const topLayer = sheetOpen && !editor.dialog && leaving === null
  useEffect(() => {
    if (!topLayer) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || event.timeStamp <= keptAt.current) return
      event.preventDefault()
      go(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })
  return (
    <Stack gap="lg">
      <PageHead
        title={t('module.quests')}
        actions={
          dm ? (
            <Button
              // With a quest open its own Publish or Save is the primary action.
              variant={selected ? 'default' : 'filled'}
              leftSection={<Plus size={18} aria-hidden="true" />}
              onClick={() => {
                if (!(editing && editor.dirty)) setNewId(crypto.randomUUID())
                go(NEW)
              }}
            >
              {t('quests.new')}
            </Button>
          ) : undefined
        }
        refresh={
          <RefreshControl
            onRefresh={() => void query.refetch()}
            fetching={query.isFetching}
            updatedAt={query.dataUpdatedAt}
          />
        }
      />
      <StaleLine queries={[query]} />
      {query.isPending ? (
        <Loader aria-label={t('common.loading')} />
      ) : !list ? (
        <Alert color="red" role="alert">
          <Stack gap="xs" align="flex-start">
            <Text size="sm">{t('quests.error')}</Text>
            <Button size="sm" variant="default" onClick={() => void query.refetch()}>
              {t('common.retry')}
            </Button>
          </Stack>
        </Alert>
      ) : (
        <div className="quests-layout" data-detail={detail && !phone ? true : undefined}>
          <QuestList quests={list.quests} dm={dm} selected={selected} onSelect={(id) => go(id)} />
          {!phone &&
            (detail ?? (
              <Paper p="lg" className="quest-panel quest-placeholder">
                <Text c="dimmed">{t(dm ? 'quests.pickDm' : 'quests.pick')}</Text>
              </Paper>
            ))}
        </div>
      )}
      {phone && (
        <Drawer
          opened={sheetOpen}
          onClose={() => go(null)}
          closeOnEscape={false}
          closeOnClickOutside={!editor.dialog && leaving === null}
          position="bottom"
          size="auto"
          // The reader names the quest in its own heading; the editor needs the sheet's title.
          title={editing ? (creating ? t('quests.new') : (quest?.title ?? '')) : undefined}
          aria-label={editing ? undefined : (quest?.title ?? '')}
          closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
          classNames={{
            title: 'quest-sheet-title user-copy',
            body: 'quest-sheet-body',
            content: 'quest-sheet',
          }}
        >
          {detail}
        </Drawer>
      )}
      <Modal
        opened={leaving !== null}
        onClose={keepEditing}
        title={t('quests.discardTitle')}
        closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
        centered
      >
        <Stack gap="md">
          <Text>{t('quests.discardBody')}</Text>
          <Group justify="flex-end" gap="sm">
            <Button variant="default" onClick={keepEditing} data-autofocus>
              {t('quests.keepEditing')}
            </Button>
            <Button
              color="red"
              onClick={() => {
                const to = leaving?.to ?? null
                const route = leaving?.route
                setLeaving(null)
                setEditor({ dirty: false, dialog: false })
                keepUnsaved(account, creating ? newId : (quest?.id ?? ''), null)
                if (route) {
                  void navigate(route)
                  return
                }
                if (to === NEW) setNewId(crypto.randomUUID())
                select(to)
              }}
            >
              {t('quests.discard')}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </Stack>
  )
}

const openStatuses: QuestStatus[] = ['active', 'rumour']

function QuestList({
  quests,
  dm,
  selected,
  onSelect,
}: {
  quests: Quest[]
  dm: boolean
  selected: string | null
  onSelect: (id: string) => void
}) {
  const { t } = useTranslation()
  const groups = groupByStatus(quests)
  const closed = [...groups.completed, ...groups.failed]
  const [showClosed, setShowClosed] = useState(() => closed.some((quest) => quest.id === selected))
  if (quests.length === 0)
    return (
      <Paper p="lg" className="quest-panel">
        <Text c="dimmed">{t(dm ? 'quests.emptyDm' : 'quests.emptyPlayer')}</Text>
      </Paper>
    )
  return (
    <nav aria-label={t('quests.list')} className="quest-journal">
      {openStatuses.map((status) =>
        groups[status].length > 0 ? (
          <section key={status} aria-labelledby={`quests-${status}`}>
            <Title order={2} id={`quests-${status}`} className="quest-section">
              <span>{t(`quests.status.${status}`)}</span>
              <span className="quest-section-count">{groups[status].length}</span>
            </Title>
            <ul className="quest-entries">
              {groups[status].map((quest) => (
                <QuestEntry
                  key={quest.id}
                  quest={quest}
                  dm={dm}
                  selected={quest.id === selected}
                  onSelect={() => onSelect(quest.id)}
                />
              ))}
            </ul>
          </section>
        ) : null,
      )}
      {closed.length > 0 && (
        <section>
          <button
            type="button"
            className="quest-closed-toggle"
            aria-expanded={showClosed}
            aria-controls="quests-closed"
            onClick={() => setShowClosed((value) => !value)}
          >
            <span>{t('quests.closed', { count: closed.length })}</span>
            <ChevronDown size={18} aria-hidden="true" data-open={showClosed || undefined} />
          </button>
          <Collapse expanded={showClosed} id="quests-closed">
            <ul className="quest-entries">
              {closed.map((quest) => (
                <QuestEntry
                  key={quest.id}
                  quest={quest}
                  dm={dm}
                  selected={quest.id === selected}
                  onSelect={() => onSelect(quest.id)}
                  showStatus
                />
              ))}
            </ul>
          </Collapse>
        </section>
      )}
    </nav>
  )
}

function QuestEntry({
  quest,
  dm,
  selected,
  onSelect,
  showStatus,
}: {
  quest: Quest
  dm: boolean
  selected: boolean
  onSelect: () => void
  showStatus?: boolean
}) {
  const { t } = useTranslation()
  const fresh = questIsNew(quest, dm)
  const total = quest.objectives.length
  const done = doneCount(quest)
  return (
    <li>
      <button
        type="button"
        className="quest-entry"
        data-new={fresh || undefined}
        data-draft={(dm && !quest.published) || undefined}
        aria-current={selected || undefined}
        onClick={onSelect}
      >
        <span className="quest-entry-title user-copy">{quest.title}</span>
        <span className="quest-entry-meta">
          {total > 0 && (
            <>
              <span className="quest-ticks" aria-hidden="true">
                {quest.objectives.map((objective) => (
                  <i key={objective.id} data-done={objective.done || undefined} />
                ))}
              </span>
              <span>{t('quests.progress', { done, total })}</span>
            </>
          )}
          {showStatus && <span>{t(`quests.statusOne.${quest.status}`)}</span>}
          {dm && !quest.published && <span className="quest-draft">{t('quests.draft')}</span>}
          {fresh && <span className="quest-new">{t('quests.changed')}</span>}
        </span>
      </button>
    </li>
  )
}
