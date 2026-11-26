import { useEffect, useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Group,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Plus, Search, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { newRequestId } from '@/shared/lib/request-id'
import { rankSearch } from '@/shared/lib/search-rank'
import { localizedName } from '@/shared/lib/translations'
import { Drawer } from '@/shared/ui/overlays'
import { usePhone } from '@/shared/ui/use-viewport'
import { lootBatchesQuery, rosterQuery, useDeleteLootBatch, useDistributeLoot } from '../api'
import type { LootAllocation } from '../data/repository'
import type { ItemDefinition } from '../domain/item'
import { ItemIcon } from './item-icon'
import { NoCharacters } from './no-characters'
import { Stepper } from './stepper'
import './loot-drawer.css'

type DraftLine = { key: string; itemId: string; quantity: number; recipients: string[] }
const newLine = (itemId: string, quantity = 1, recipients: string[] = []): DraftLine => ({
  key: newRequestId(),
  itemId,
  quantity,
  recipients,
})
function fromBatch(allocations: LootAllocation[]) {
  const lines: DraftLine[] = []
  for (const allocation of allocations) {
    let line = lines.find(
      (entry) =>
        entry.itemId === allocation.definition_id && entry.quantity === allocation.quantity,
    )
    if (!line) {
      line = newLine(allocation.definition_id, allocation.quantity)
      lines.push(line)
    }
    line.recipients.push(allocation.character_id)
  }
  return lines
}

function BatchPicker({
  campaignId,
  onPick,
}: {
  campaignId: string
  onPick: (allocations: LootAllocation[]) => void
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const remove = useDeleteLootBatch(campaignId)
  const [deleting, setDeleting] = useState<{ id: string; name: string; requestId: string } | null>(
    null,
  )
  const [cursors, setCursors] = useState<(string | null)[]>([null])
  const batches = useQuery(lootBatchesQuery(state.user!.id, campaignId, cursors.at(-1) ?? null))
  if (deleting)
    return (
      <Stack>
        <Title order={3}>{t('loot.delete', { name: deleting.name })}</Title>
        <Text>{t('loot.deleteHint')}</Text>
        {remove.isError && <Alert role="alert">{t('query.error')}</Alert>}
        <Group>
          <Button variant="default" disabled={remove.isPending} onClick={() => setDeleting(null)}>
            {t('common.cancel')}
          </Button>
          <Button
            color="var(--danger)"
            loading={remove.isPending}
            onClick={() =>
              remove.mutate(deleting, {
                onSuccess: () => {
                  setDeleting(null)
                  setCursors([null])
                },
              })
            }
          >
            {t('store.delete')}
          </Button>
        </Group>
      </Stack>
    )
  return (
    <Stack gap="xs">
      <Title order={3}>{t('loot.saved')}</Title>
      {batches.isPending && <Text role="status">{t('common.loading')}</Text>}
      {batches.isError && (
        <Alert role="alert">
          {t('query.error')}{' '}
          <Button variant="subtle" onClick={() => void batches.refetch()}>
            {t('common.retry')}
          </Button>
        </Alert>
      )}
      {batches.data?.length === 0 && <Text>{t('loot.noBatches')}</Text>}
      {batches.data?.map((batch) => (
        <Group key={batch.id} wrap="nowrap" gap="xs">
          <Button
            variant="default"
            className="loot-batch-name"
            onClick={() => onPick(batch.allocations)}
          >
            {batch.name}
          </Button>
          <ActionIcon
            variant="subtle"
            size={44}
            aria-label={t('loot.delete', { name: batch.name })}
            onClick={() => {
              remove.reset()
              setDeleting({ id: batch.id, name: batch.name, requestId: newRequestId() })
            }}
          >
            <Trash2 size={18} />
          </ActionIcon>
        </Group>
      ))}
      <Group>
        {cursors.length > 1 && (
          <Button variant="subtle" onClick={() => setCursors(cursors.slice(0, -1))}>
            {t('loot.previous')}
          </Button>
        )}
        {batches.data?.length === 20 && (
          <Button
            variant="subtle"
            onClick={() => setCursors([...cursors, batches.data!.at(-1)!.name])}
          >
            {t('loot.next')}
          </Button>
        )}
      </Group>
    </Stack>
  )
}

/** The picker: a search field and every item in alphabetical order, in 48px rows. */
function ItemPicker({
  items,
  onPick,
  onBack,
  onBatch,
}: {
  items: ItemDefinition[]
  onPick: (item: ItemDefinition) => void
  onBack: () => void
  /** A saved batch instead, offered while the distribution has no line yet. */
  onBatch?: () => void
}) {
  const { t, i18n } = useTranslation()
  const [query, setQuery] = useState('')
  const field = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const frame = requestAnimationFrame(() => field.current?.focus())
    return () => cancelAnimationFrame(frame)
  }, [])
  const nameOf = (item: ItemDefinition) => localizedName(item, i18n.language)
  const sorted = [...items].sort((a, b) => nameOf(a).localeCompare(nameOf(b), i18n.language))
  const found = rankSearch(sorted, query, (item) => [item.name, nameOf(item)])
  return (
    <Stack gap="sm">
      <TextInput
        ref={field}
        data-autofocus
        type="search"
        aria-label={t('loot.pickSearch')}
        placeholder={t('loot.pickSearch')}
        leftSection={<Search size={16} aria-hidden="true" />}
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' || event.nativeEvent.isComposing || !found[0]) return
          event.preventDefault()
          onPick(found[0])
        }}
        classNames={{ input: 'loot-pick-search' }}
      />
      {found.length === 0 ? (
        <Text c="dimmed" role="status">
          {t('store.noMatch')}
        </Text>
      ) : (
        <ul className="loot-pick-list" aria-label={t('loot.pickList')}>
          {found.map((item) => (
            <li key={item.id}>
              <UnstyledButton className="loot-pick-row" onClick={() => onPick(item)}>
                <span className={`store-glyph rarity-${item.rarity}`} aria-hidden="true">
                  <ItemIcon icon={item.icon} imagePath={item.image_path} size={20} />
                </span>
                <span className="loot-pick-name user-copy">{nameOf(item)}</span>
                <span className="loot-pick-kind">{t(`inventory.category.${item.category}`)}</span>
              </UnstyledButton>
            </li>
          ))}
        </ul>
      )}
      {onBatch && (
        <UnstyledButton className="quiet-link loot-load" onClick={onBatch}>
          {t('loot.load')}
        </UnstyledButton>
      )}
      <Button variant="subtle" onClick={onBack}>
        {t('common.back')}
      </Button>
    </Stack>
  )
}

/**
 * The loot view: one line per item (who gets it, how many each) and one fixed action that
 * delivers through the existing operation, closes the view and leaves the result to the page.
 * Saved batches stay as quiet controls. `initial` starts the view with that item in it.
 */
export function LootDrawer({
  campaignId,
  items,
  initial,
  onDelivered,
  onClose,
}: {
  campaignId: string
  items: ItemDefinition[]
  initial?: ItemDefinition
  /** What was delivered, as one sentence for the page's status line. */
  onDelivered?: (text: string) => void
  onClose: () => void
}) {
  const { state } = useAuth()
  const { t, i18n } = useTranslation()
  const phone = usePhone()
  const roster = useQuery(rosterQuery(state.user!.id, campaignId))
  const grant = useDistributeLoot(campaignId)
  const [lines, setLines] = useState<DraftLine[]>(() => (initial ? [newLine(initial.id)] : []))
  const [loadingBatch, setLoadingBatch] = useState(false)
  // Without an item to start from the picker is the first thing the view shows.
  const [picking, setPicking] = useState(!initial)
  const [seeded, setSeeded] = useState(false)
  const [saveBatch, setSaveBatch] = useState(false)
  const [batchName, setBatchName] = useState('')
  const addButton = useRef<HTMLButtonElement>(null)
  const failure = useRef<HTMLDivElement>(null)
  // The pressed button went busy and dropped focus: the failure is where the keyboard is, and
  // Retry is the next stop.
  const failedAt = grant.isError ? grant.submittedAt : 0
  useEffect(() => {
    if (failedAt) failure.current?.focus()
  }, [failedAt])
  const request = useRef({ key: '', id: '' })
  const sending = useRef(false)
  const names = new Map(items.map((item) => [item.id, localizedName(item, i18n.language)]))
  for (const ch of roster.data ?? []) names.set(ch.id, ch.name)
  const characters = roster.data ?? []
  // With exactly one character there is nobody to choose: each new line starts with them.
  const sole = characters.length === 1 ? characters[0]!.id : null
  if (!seeded && roster.data) {
    setSeeded(true)
    if (roster.data.length === 1)
      setLines((prev) =>
        prev.map((line) =>
          line.recipients.length ? line : { ...line, recipients: [roster.data[0]!.id] },
        ),
      )
  }
  const allocations = lines.flatMap((line) =>
    line.recipients.map((character_id) => ({
      character_id,
      definition_id: line.itemId,
      quantity: line.quantity,
      revision: items.find((item) => item.id === line.itemId)?.revision ?? -1,
    })),
  )
  const duplicates =
    new Set(allocations.map((a) => a.character_id + a.definition_id)).size < allocations.length
  const missing = lines.some(
    (line) => !names.has(line.itemId) || line.recipients.some((id) => !names.has(id)),
  )
  const valid =
    allocations.length > 0 &&
    allocations.length <= 100 &&
    lines.every((line) => line.recipients.length) &&
    !duplicates &&
    !missing &&
    (!saveBatch || Boolean(batchName.trim()))
  const units = allocations.reduce((sum, a) => sum + a.quantity, 0)
  // Why the action waits, said above it: the first item with nobody to receive it, or the batch name.
  const unserved = lines.find((line) => line.recipients.length === 0)
  const reason = !lines.length
    ? null
    : unserved
      ? t('loot.needsRecipient', { name: names.get(unserved.itemId) ?? t('loot.missingItem') })
      : saveBatch && !batchName.trim()
        ? t('loot.needsName')
        : null
  // "Arin: 1 Poción · Bea: 1 Poción, 1 Anillo": what each character gets, in roster order.
  const summary = characters
    .map((ch) => ({
      name: ch.name,
      what: allocations
        .filter((a) => a.character_id === ch.id)
        .map((a) => `${a.quantity} ${names.get(a.definition_id) ?? ''}`),
    }))
    .filter((entry) => entry.what.length > 0)
    .map((entry) => `${entry.name}: ${entry.what.join(', ')}`)
  const edited = () => {
    if (grant.isError) grant.reset()
  }
  const change = (key: string, patch: Partial<DraftLine>) => {
    edited()
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  }
  const deliver = async () => {
    if (!valid || sending.current) return
    const draft = { allocations, name: saveBatch ? batchName.trim() : null }
    // A retry after a failure repeats the same request, so nothing is delivered twice.
    const key = JSON.stringify(draft)
    if (request.current.key !== key) request.current = { key, id: newRequestId() }
    sending.current = true
    try {
      await grant.mutateAsync({ ...draft, requestId: request.current.id })
      onDelivered?.(t('loot.deliveredLine', { summary: summary.join(' · ') }))
      onClose()
    } catch {
      /* The view stays open with the reason; Retry sends the same request. */
    } finally {
      sending.current = false
    }
  }
  const knownErrors: Record<string, string> = {
    batchLimit: t('loot.full'),
    batchName: t('loot.nameConflict'),
    stale: t('loot.changed'),
    gone: t('loot.changed'),
    forbidden: t('inventory.error.forbidden'),
  }
  const definiteError = grant.error && knownErrors[grant.error.message]
  const leavePicker = () => {
    setPicking(false)
    requestAnimationFrame(() => addButton.current?.focus())
  }
  const close = () => {
    if (sending.current) return
    // An empty picker is where the view started: Escape closes the view rather than showing it empty.
    if (picking && lines.length > 0) leavePicker()
    else if (loadingBatch) setLoadingBatch(false)
    else onClose()
  }
  return (
    <Drawer
      opened
      onClose={close}
      returnFocus={false}
      position={phone ? 'bottom' : 'right'}
      size={phone ? '88%' : 490}
      title={t('loot.open')}
      closeOnEscape={!grant.isPending}
      closeOnClickOutside={!grant.isPending}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
      classNames={{ content: 'loot-drawer', body: 'loot-drawer-body' }}
    >
      {roster.data?.length === 0 ? (
        <NoCharacters campaignId={campaignId} />
      ) : loadingBatch ? (
        <Stack>
          <BatchPicker
            campaignId={campaignId}
            onPick={(saved) => {
              setLines(fromBatch(saved))
              setLoadingBatch(false)
            }}
          />
          <Button variant="subtle" onClick={() => setLoadingBatch(false)}>
            {t('common.back')}
          </Button>
        </Stack>
      ) : picking ? (
        <ItemPicker
          items={items}
          onPick={(item) => {
            edited()
            setLines((prev) => [...prev, newLine(item.id, 1, sole ? [sole] : [])])
            leavePicker()
          }}
          onBack={leavePicker}
          onBatch={
            lines.length === 0
              ? () => {
                  setPicking(false)
                  setLoadingBatch(true)
                }
              : undefined
          }
        />
      ) : (
        <div className="loot-view">
          {roster.isError && (
            <Alert role="alert">
              {t('query.error')}{' '}
              <Button variant="subtle" onClick={() => void roster.refetch()}>
                {t('common.retry')}
              </Button>
            </Alert>
          )}
          {roster.isPending && <Text role="status">{t('common.loading')}</Text>}
          {lines.map((line) => {
            const item = items.find((d) => d.id === line.itemId)
            const label = names.get(line.itemId) ?? t('loot.missingItem')
            const all =
              characters.length > 0 && characters.every((ch) => line.recipients.includes(ch.id))
            return (
              <fieldset className="loot-line" key={line.key}>
                <legend className="visually-hidden">{label}</legend>
                <div className="loot-line-head">
                  {item && (
                    <ItemIcon
                      icon={item.icon}
                      imagePath={item.image_path}
                      category={item.category}
                      basicKey={item.basic_key}
                      viewable
                      name={label}
                      size={24}
                      frame={`store-glyph rarity-${item.rarity}`}
                    />
                  )}
                  <span className="loot-line-name user-copy" aria-hidden="true">
                    {label}
                  </span>
                  <ActionIcon
                    variant="subtle"
                    size={44}
                    aria-label={t('loot.remove', { name: label })}
                    onClick={() => {
                      edited()
                      setLines(lines.filter((entry) => entry.key !== line.key))
                    }}
                  >
                    <X size={18} aria-hidden="true" />
                  </ActionIcon>
                </div>
                <div className="loot-recipients" role="group" aria-label={t('loot.recipients')}>
                  {characters.length > 1 && (
                    <UnstyledButton
                      className="loot-recipient loot-all"
                      aria-pressed={all}
                      onClick={() =>
                        change(line.key, {
                          recipients: all ? [] : characters.map((ch) => ch.id),
                        })
                      }
                    >
                      {t('loot.all')}
                    </UnstyledButton>
                  )}
                  {characters.map((ch) => (
                    <UnstyledButton
                      className="loot-recipient"
                      key={ch.id}
                      aria-pressed={line.recipients.includes(ch.id)}
                      onClick={() =>
                        change(line.key, {
                          recipients: line.recipients.includes(ch.id)
                            ? line.recipients.filter((id) => id !== ch.id)
                            : [...line.recipients, ch.id],
                        })
                      }
                    >
                      {ch.name}
                    </UnstyledButton>
                  ))}
                  {line.recipients
                    .filter((id) => roster.data && !names.has(id))
                    .map((id) => (
                      <Button
                        key={id}
                        variant="default"
                        onClick={() =>
                          change(line.key, {
                            recipients: line.recipients.filter((ch) => ch !== id),
                          })
                        }
                      >
                        {t('loot.removeMissing')}
                      </Button>
                    ))}
                </div>
                <Stepper
                  label={t('loot.quantityEach')}
                  value={line.quantity}
                  min={1}
                  max={1000}
                  required
                  onChange={(quantity) => change(line.key, { quantity: quantity ?? 1 })}
                />
              </fieldset>
            )
          })}
          {lines.length < 100 && (
            <Button
              ref={addButton}
              variant={lines.length ? 'default' : 'outline'}
              leftSection={<Plus size={18} aria-hidden="true" />}
              onClick={() => setPicking(true)}
            >
              {t('loot.add')}
            </Button>
          )}
          {lines.length === 0 && (
            <UnstyledButton className="quiet-link loot-load" onClick={() => setLoadingBatch(true)}>
              {t('loot.load')}
            </UnstyledButton>
          )}
          {summary.length > 0 && <p className="loot-summary">{summary.join(' · ')}</p>}
          {!!lines.length && (
            <Checkbox
              label={t('loot.save')}
              checked={saveBatch}
              onChange={(event) => setSaveBatch(event.currentTarget.checked)}
            />
          )}
          {saveBatch && (
            <TextInput
              label={t('loot.name')}
              maxLength={80}
              value={batchName}
              onChange={(event) => setBatchName(event.currentTarget.value)}
            />
          )}
          {(duplicates || missing || allocations.length > 100) && (
            <Alert role="alert">
              {t(duplicates ? 'loot.duplicate' : missing ? 'loot.changed' : 'loot.tooMany')}
            </Alert>
          )}
          {grant.isError && (
            <Alert ref={failure} tabIndex={-1} role="alert" color="red">
              {definiteError ?? t('loot.retry')}
            </Alert>
          )}
          <div className="loot-dock">
            {reason && <p className="loot-reason">{reason}</p>}
            <Button
              size="md"
              fullWidth
              loading={grant.isPending}
              disabled={!valid || Boolean(definiteError)}
              onClick={() => void deliver()}
            >
              {grant.isError && !definiteError
                ? t('common.retry')
                : t('loot.deliver', { count: units })}
            </Button>
          </div>
        </div>
      )}
    </Drawer>
  )
}
