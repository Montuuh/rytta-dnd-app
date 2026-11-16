import { useMemo, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Drawer, Loader, Stack, Text } from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { Check, PackagePlus, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { newRequestId } from '@/shared/lib/request-id'
import { usePhone } from '@/shared/ui/use-viewport'
import { basicCatalogueQuery, useBasicImport } from '../api'
import type { BasicItem } from '../domain/basic-items'
import { importBatches, importGroups, toImportItem } from '../domain/catalogue'
import type { ItemCategory } from '../domain/item'
import { ItemIcon } from './item-icon'
import { categoryIcons } from './item-visuals'
import './catalogue.css'

type Run = 'import' | 'update'
type Tally = { created: number; updated: number; skipped: number }

/**
 * RYT-104 DM import of the basic catalogue (SRD 5.2.1 equipment and Rytta backpacks) as real
 * campaign items. Categories show how many are already in the storeroom; the RPC skips keys the
 * campaign has, so a repeat never duplicates an item. "Update" sends every imported key again
 * with `update_existing`: names, descriptions, weights and properties follow the catalogue while
 * the server keeps each item's price, image and template flag.
 */
export function BasicImport({
  campaignId,
  imported,
  onClose,
  onDone,
}: {
  campaignId: string
  /** Catalogue keys the campaign already holds (archived ones too). */
  imported: ReadonlySet<string>
  onClose: () => void
  onDone: (message: string) => void
}) {
  const { t, i18n } = useTranslation()
  const phone = usePhone()
  const language = i18n.language.startsWith('en') ? 'en' : 'es'
  const catalogue = useQuery(basicCatalogueQuery())
  const importer = useBasicImport(campaignId)
  const groups = useMemo(
    () => (catalogue.data ? importGroups(catalogue.data.items, imported) : []),
    [catalogue.data, imported],
  )
  const refreshable = useMemo(
    () => (catalogue.data ? catalogue.data.items.filter((item) => imported.has(item.key)) : []),
    [catalogue.data, imported],
  )
  const open = groups.filter((group) => group.done < group.total)
  const [chosen, setChosen] = useState<Set<ItemCategory> | null>(null)
  const selected = chosen ?? new Set(open.map((group) => group.category))
  const [failed, setFailed] = useState<{ run: Run; cents: boolean } | null>(null)
  const [busy, setBusy] = useState<Run | null>(null)
  // One idempotency key per exact payload, kept across retries: a payload that changed (another
  // language, other categories) gets a new key instead of replaying a different request.
  const requests = useRef(new Map<string, string>())
  const requestFor = (payload: unknown) => {
    const key = JSON.stringify(payload)
    let id = requests.current.get(key)
    if (!id) {
      id = newRequestId()
      requests.current.set(key, id)
    }
    return id
  }
  const batches = catalogue.data ? importBatches(catalogue.data.items, selected, imported) : []
  const count = batches.reduce((sum, batch) => sum + batch.length, 0)
  const toggle = (category: ItemCategory) =>
    setChosen(() => {
      const next = new Set(selected)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  const all = open.length > 0 && open.every((group) => selected.has(group.category))
  const some = open.some((group) => selected.has(group.category))
  const summary = (run: Run, tally: Tally) =>
    run === 'update'
      ? tally.updated
        ? t('items.import.updated', { count: tally.updated, unchanged: tally.skipped })
        : t('items.import.upToDate')
      : tally.skipped
        ? t('items.import.doneSkipped', { count: tally.created, skipped: tally.skipped })
        : t('items.import.done', { count: tally.created })
  const send = async (run: Run, chunks: BasicItem[][]) => {
    if (!catalogue.data || busy || chunks.length === 0) return
    setBusy(run)
    setFailed(null)
    const tally: Tally = { created: 0, updated: 0, skipped: 0 }
    try {
      for (const chunk of chunks) {
        const items = chunk.map((item) => toImportItem(item, language, catalogue.data.descriptions))
        const updateExisting = run === 'update'
        const result = await importer.mutateAsync({
          items,
          updateExisting,
          requestId: requestFor({ items, updateExisting }),
        })
        tally.created += result.created_count
        tally.updated += result.updated_count
        tally.skipped += result.skipped_count
      }
      onDone(summary(run, tally))
    } catch (failure) {
      setFailed({ run, cents: failure instanceof Error && failure.message === 'cents' })
    } finally {
      setBusy(null)
    }
  }
  const errorText = (cents: boolean) =>
    cents ? t('inventory.error.cents') : t('items.import.error')
  const updates: BasicItem[][] = []
  for (let start = 0; start < refreshable.length; start += 500)
    updates.push(refreshable.slice(start, start + 500))
  return (
    <Drawer
      opened
      returnFocus={false}
      position={phone ? 'bottom' : 'right'}
      size={phone ? '92%' : 480}
      title={t('items.import.title')}
      onClose={() => !busy && onClose()}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
      className="import-drawer"
    >
      <Stack gap="md">
        <Text size="sm" c="dimmed">
          {t('items.import.lede')}
        </Text>
        {catalogue.isPending && <Text role="status">{t('common.loading')}</Text>}
        {catalogue.isError && (
          <Alert color="red" role="alert">
            {t('query.error')}{' '}
            <Button variant="subtle" onClick={() => void catalogue.refetch()}>
              {t('common.retry')}
            </Button>
          </Alert>
        )}
        {catalogue.data && open.length === 0 && (
          <Text role="status">{t('items.import.allDone')}</Text>
        )}
        {catalogue.data && open.length > 0 && (
          <fieldset className="plain-fieldset">
            <legend className="import-legend">{t('items.import.categories')}</legend>
            <Checkbox
              className="import-all"
              label={t('items.import.everything')}
              checked={all}
              indeterminate={some && !all}
              disabled={Boolean(busy)}
              onChange={() =>
                setChosen(all ? new Set() : new Set(open.map((group) => group.category)))
              }
            />
            <div className="import-grid">
              {groups.map((group) => {
                const complete = group.done === group.total
                const on = !complete && selected.has(group.category)
                return (
                  <label
                    key={group.category}
                    className="import-tile"
                    data-checked={on || undefined}
                    data-complete={complete || undefined}
                  >
                    <input
                      type="checkbox"
                      className="forge-radio"
                      checked={on}
                      disabled={complete || Boolean(busy)}
                      onChange={() => toggle(group.category)}
                    />
                    <ItemIcon icon={categoryIcons[group.category]} size={22} />
                    <span className="import-tile-copy">
                      <span className="import-tile-name">
                        {t(`inventory.category.${group.category}`)}
                      </span>
                      <span className="import-tile-count">
                        {complete
                          ? t('items.import.complete')
                          : group.done
                            ? t('items.import.partial', {
                                count: group.total - group.done,
                                done: group.done,
                              })
                            : t('items.import.count', { count: group.total })}
                      </span>
                    </span>
                    <span className="import-tile-check" aria-hidden="true">
                      {(on || complete) && <Check size={14} strokeWidth={3} />}
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        )}
        {catalogue.data && refreshable.length > 0 && (
          <section className="import-update" aria-labelledby="import-update-title">
            <Text fw={600} size="sm" id="import-update-title">
              {t('items.import.updateTitle')}
            </Text>
            <Text size="sm" c="dimmed">
              {t('items.import.updateHint')}
            </Text>
            {failed?.run === 'update' && (
              <Alert color="red" role="alert">
                {errorText(failed.cents)}
              </Alert>
            )}
            <Button
              variant="default"
              aria-busy={busy === 'update'}
              aria-disabled={Boolean(busy) || undefined}
              leftSection={
                busy === 'update' ? (
                  <Loader size={16} />
                ) : (
                  <RefreshCw size={16} aria-hidden="true" />
                )
              }
              onClick={() => void send('update', updates)}
            >
              {failed?.run === 'update'
                ? t('common.retry')
                : t('items.import.update', { count: refreshable.length })}
            </Button>
          </section>
        )}
        {catalogue.data && open.length > 0 && (
          <div className="pick-dock">
            {failed?.run === 'import' && (
              <Alert color="red" role="alert" mb="xs">
                {errorText(failed.cents)}
              </Alert>
            )}
            <Button
              size="lg"
              fullWidth
              aria-busy={busy === 'import'}
              aria-disabled={Boolean(busy) || count === 0 || undefined}
              disabled={count === 0 && !busy}
              leftSection={
                busy === 'import' ? (
                  <Loader size={16} />
                ) : (
                  <PackagePlus size={18} aria-hidden="true" />
                )
              }
              onClick={() => void send('import', batches)}
            >
              {failed?.run === 'import'
                ? t('common.retry')
                : count
                  ? t('items.import.submit', { count })
                  : t('items.import.pickFirst')}
            </Button>
          </div>
        )}
        <Text size="xs" c="dimmed" className="import-credit">
          {t('items.import.credit')}
        </Text>
      </Stack>
    </Drawer>
  )
}
