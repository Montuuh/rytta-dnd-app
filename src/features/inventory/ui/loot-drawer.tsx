import { useRef, useState } from 'react'
import {
  ActionIcon,
  Alert,
  Button,
  Checkbox,
  Group,
  Select,
  Stack,
  Text,
  TextInput,
  Title,
  UnstyledButton,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Check, Gift, Trash2, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { newRequestId } from '@/shared/lib/request-id'
import { localizedName } from '@/shared/lib/translations'
import { Drawer } from '@/shared/ui/overlays'
import { usePhone } from '@/shared/ui/use-viewport'
import { lootBatchesQuery, rosterQuery, useDeleteLootBatch, useDistributeLoot } from '../api'
import type { LootAllocation, LootRequest } from '../data/repository'
import type { ItemDefinition } from '../domain/item'
import { ItemIcon } from './item-icon'
import { Stepper } from './stepper'

type DraftLine = { key: string; itemId: string; quantity: number; recipients: string[] }
const newLine = (itemId: string, quantity = 1): DraftLine => ({
  key: newRequestId(),
  itemId,
  quantity,
  recipients: [],
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

type Review = { request: LootRequest; names: Map<string, string> }

export function LootDrawer({
  campaignId,
  items,
  initial,
  onClose,
}: {
  campaignId: string
  items: ItemDefinition[]
  initial?: ItemDefinition
  onClose: () => void
}) {
  const { state } = useAuth()
  const { t, i18n } = useTranslation()
  const phone = usePhone()
  const roster = useQuery(rosterQuery(state.user!.id, campaignId))
  const grant = useDistributeLoot(campaignId)
  const [lines, setLines] = useState<DraftLine[]>(() => (initial ? [newLine(initial.id)] : []))
  const [loadingBatch, setLoadingBatch] = useState(false)
  const [saveBatch, setSaveBatch] = useState(false)
  const [batchName, setBatchName] = useState('')
  const [review, setReview] = useState<Review | null>(null)
  const [receipt, setReceipt] = useState<LootAllocation[] | null>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const reviewTrigger = useRef<HTMLButtonElement>(null)
  const sending = useRef(false)
  const names = new Map(items.map((item) => [item.id, localizedName(item, i18n.language)]))
  for (const ch of roster.data ?? []) names.set(ch.id, ch.name)
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
  const change = (key: string, patch: Partial<DraftLine>) =>
    setLines((prev) => prev.map((line) => (line.key === key ? { ...line, ...patch } : line)))
  const startReview = () => {
    if (!valid) return
    grant.reset()
    setReview({
      request: {
        allocations,
        name: saveBatch ? batchName.trim() : null,
        requestId: newRequestId(),
      },
      names,
    })
    requestAnimationFrame(() => titleRef.current?.focus())
  }
  const back = () => {
    setReview(null)
    grant.reset()
    requestAnimationFrame(() => reviewTrigger.current?.focus())
  }
  const confirm = async () => {
    if (!review || sending.current || receipt) return
    sending.current = true
    try {
      const result = await grant.mutateAsync(review.request)
      setReceipt(result.allocations)
      requestAnimationFrame(() => titleRef.current?.focus())
    } catch {
      /* The review keeps the exact payload and request ID for a retry. */
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
  const close = () => {
    if (sending.current) return
    if (loadingBatch) setLoadingBatch(false)
    else if (review && !receipt && !grant.isError) back()
    else onClose()
  }
  return (
    <Drawer
      opened
      onClose={close}
      returnFocus={false}
      position={phone ? 'bottom' : 'right'}
      size={phone ? '88%' : 490}
      title={t(initial ? 'catalogue.give' : 'loot.open')}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
    >
      {loadingBatch ? (
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
      ) : review ? (
        <Stack>
          <Title order={3} ref={titleRef} tabIndex={-1}>
            {t(receipt ? 'loot.delivered' : 'loot.review')}
          </Title>
          {[...new Set((receipt ?? review.request.allocations).map((a) => a.character_id))].map(
            (id) => (
              <section key={id}>
                <Group gap="xs">
                  {receipt && <Check size={18} aria-hidden />}
                  <Text fw={700}>{review.names.get(id)}</Text>
                </Group>
                <ul>
                  {(receipt ?? review.request.allocations)
                    .filter((a) => a.character_id === id)
                    .map((a) => (
                      <li key={a.definition_id}>
                        {review.names.get(a.definition_id)} × {a.quantity}
                      </li>
                    ))}
                </ul>
              </section>
            ),
          )}
          {review.request.name && (
            <Text>
              {t(receipt ? 'loot.savedAs' : 'loot.saveAs', { name: review.request.name })}
            </Text>
          )}
          {grant.isError && (
            <Alert role="alert" color="red">
              {definiteError ?? t('loot.retry')}
            </Alert>
          )}
          {receipt ? (
            <Button onClick={onClose}>{t('common.close')}</Button>
          ) : (
            <Group>
              {(!grant.isError || definiteError) && (
                <Button variant="default" disabled={grant.isPending} onClick={back}>
                  {t('loot.edit')}
                </Button>
              )}
              {!definiteError && (
                <Button loading={grant.isPending} onClick={() => void confirm()}>
                  {t(grant.isError ? 'common.retry' : 'loot.confirm')}
                </Button>
              )}
            </Group>
          )}
        </Stack>
      ) : (
        <Stack>
          {lines.length === 0 && (
            <Button variant="subtle" onClick={() => setLoadingBatch(true)}>
              {t('loot.load')}
            </Button>
          )}
          {roster.isError && (
            <Alert role="alert">
              {t('query.error')}{' '}
              <Button variant="subtle" onClick={() => void roster.refetch()}>
                {t('common.retry')}
              </Button>
            </Alert>
          )}
          {roster.isPending && <Text role="status">{t('common.loading')}</Text>}
          {roster.data?.length === 0 && <Text>{t('inventory.noCharacters')}</Text>}
          {lines.map((line) => {
            const item = items.find((d) => d.id === line.itemId)
            return (
              <fieldset className="loot-line" key={line.key}>
                <legend>{names.get(line.itemId) ?? t('loot.missingItem')}</legend>
                <Group justify="space-between">
                  {item && (
                    <ItemIcon
                      icon={item.icon}
                      imagePath={item.image_path}
                      category={item.category}
                      viewable
                      name={names.get(item.id)}
                      size={24}
                      frame={`store-glyph rarity-${item.rarity}`}
                    />
                  )}
                  <ActionIcon
                    variant="subtle"
                    size={44}
                    aria-label={t('loot.remove', {
                      name: names.get(line.itemId) ?? t('loot.missingItem'),
                    })}
                    onClick={() => setLines(lines.filter((entry) => entry.key !== line.key))}
                  >
                    <X size={18} />
                  </ActionIcon>
                </Group>
                <Stepper
                  label={t('inventory.card.amount')}
                  value={line.quantity}
                  min={1}
                  max={1000}
                  required
                  onChange={(quantity) => change(line.key, { quantity: quantity ?? 1 })}
                />
                <Text fw={600} mt="sm">
                  {t('loot.recipients')}
                </Text>
                <div className="loot-recipients">
                  {(roster.data ?? []).map((ch) => (
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
                      {line.recipients.includes(ch.id) && <Check size={16} aria-hidden />}
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
              </fieldset>
            )
          })}
          {lines.length < 100 && (
            <Select
              searchable
              label={t('loot.add')}
              value={null}
              data={items.map((item) => ({ value: item.id, label: names.get(item.id)! }))}
              limit={40}
              nothingFoundMessage={t('store.noResults')}
              comboboxProps={{ withinPortal: false }}
              onChange={(id) => id && setLines([...lines, newLine(id)])}
            />
          )}
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
          <Button
            ref={reviewTrigger}
            disabled={!valid}
            leftSection={<Gift size={18} />}
            onClick={startReview}
          >
            {t('loot.review')}
          </Button>
        </Stack>
      )}
    </Drawer>
  )
}
