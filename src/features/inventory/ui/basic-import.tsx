import { useMemo, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Loader, NativeSelect, Stack, Text } from '@mantine/core'
import { Link } from 'react-router'
import { Drawer } from '@/shared/ui/overlays'
import { Check, Library, PackagePlus, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { newRequestId } from '@/shared/lib/request-id'
import { usePhone } from '@/shared/ui/use-viewport'
import { useBasicImport, useCampaignItemCatalogue } from '../api'
import type { BasicItem } from '../domain/basic-items'
import { importBatches, importGroups, toImportItem } from '../domain/catalogue'
import type { ItemCategory, ItemDefinition } from '../domain/item'
import { itemDifferences, itemPackTitle, type ItemDifference } from '../domain/pack-items'
import { ItemIcon } from './item-icon'
import { categoryIcons } from './item-visuals'
import './catalogue.css'

type Run = 'import' | 'update'
type Tally = { created: number; updated: number; skipped: number }
const allSources = 'all'

/**
 * RYT-104 DM import of catalogue items as real campaign items; since RYT-166 the catalogue is the
 * items of the packs the campaign enabled in Content, without hidden ones, filtered by pack.
 * Categories show how many are already in the storeroom; the RPC skips keys the campaign has, so a
 * repeat never duplicates an item. "Update" lists the imported items that differ from their pack
 * and sends the ones the DM keeps ticked with `update_existing`: names, descriptions, weights and
 * properties follow the pack while the server keeps each item's price, image and template flag.
 */
export function BasicImport({
  campaignId,
  definitions,
  onClose,
  onDone,
}: {
  campaignId: string
  /** Every storeroom item, archived ones too. */
  definitions: readonly ItemDefinition[]
  onClose: () => void
  onDone: (message: string) => void
}) {
  const { t, i18n } = useTranslation()
  const phone = usePhone()
  const language = i18n.language.startsWith('en') ? 'en' : 'es'
  const catalogue = useCampaignItemCatalogue(campaignId)
  const importer = useBasicImport(campaignId)
  const [source, setSource] = useState(allSources)
  const packs = catalogue.data?.packs ?? []
  const sourceId = packs.some((pack) => pack.id === source) ? source : allSources
  const items = useMemo(
    () =>
      (catalogue.data?.items ?? []).filter(
        (item) => sourceId === allSources || catalogue.data?.sources[item.key]?.packId === sourceId,
      ),
    [catalogue.data, sourceId],
  )
  const byKey = useMemo(
    () =>
      new Map(
        definitions.flatMap((definition) =>
          definition.basic_key ? [[definition.basic_key, definition] as const] : [],
        ),
      ),
    [definitions],
  )
  const imported = useMemo(() => new Set(byKey.keys()), [byKey])
  const groups = useMemo(() => importGroups(items, imported), [items, imported])
  // Imported items that differ from their pack (archived ones are left alone).
  const changes = useMemo(() => {
    if (!catalogue.data) return []
    const descriptions = catalogue.data.descriptions
    return items.flatMap((item) => {
      const definition = byKey.get(item.key)
      if (!definition || definition.archived) return []
      const differences = itemDifferences(item, descriptions, definition)
      return differences.length ? [{ item, definition, differences }] : []
    })
  }, [catalogue.data, items, byKey])
  const [unticked, setUnticked] = useState<Set<string>>(() => new Set())
  const ticked = changes.filter((change) => !unticked.has(change.item.key))
  const open = groups.filter((group) => group.done < group.total)
  // RYT-184: nothing is ticked on opening; the DM picks what to bring in.
  const [chosen, setChosen] = useState<Set<ItemCategory>>(() => new Set())
  const selected = chosen
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
  const batches = importBatches(items, selected, imported)
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
        const payload = chunk.map((item) =>
          toImportItem(item, language, catalogue.data.descriptions),
        )
        const updateExisting = run === 'update'
        const result = await importer.mutateAsync({
          items: payload,
          updateExisting,
          requestId: requestFor({ items: payload, updateExisting }),
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
  const tickedItems = ticked.map((change) => change.item)
  for (let start = 0; start < tickedItems.length; start += 500)
    updates.push(tickedItems.slice(start, start + 500))
  const differenceText = (differences: ItemDifference[]) =>
    differences.map((difference) => t(`items.import.difference.${difference}`)).join(' · ')
  const noPacks = catalogue.data && packs.length === 0
  // RYT-187: the SRD credit shows only when the chosen source includes the SRD's items.
  const hasSrd = packs.some((pack) => pack.srd && (sourceId === allSources || pack.id === sourceId))
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
        {catalogue.isPending && <Text role="status">{t('common.loading')}</Text>}
        {catalogue.isError && (
          <Alert color="red" role="alert">
            {t('query.error')}{' '}
            <Button variant="subtle" onClick={() => void catalogue.refetch()}>
              {t('common.retry')}
            </Button>
          </Alert>
        )}
        {noPacks && (
          <Stack gap="xs" align="flex-start" role="status">
            <Text>{t('items.import.noPacks')}</Text>
            <Button
              component={Link}
              to={`/campaign/${campaignId}/members?panel=content`}
              variant="light"
              leftSection={<Library size={16} aria-hidden="true" />}
            >
              {t('items.import.choosePacks')}
            </Button>
          </Stack>
        )}
        {packs.length > 1 && (
          <NativeSelect
            label={t('items.import.source')}
            value={sourceId}
            disabled={Boolean(busy)}
            onChange={(event) => {
              setSource(event.currentTarget.value)
              setChosen(new Set())
              setFailed(null)
            }}
            data={[
              { value: allSources, label: t('items.import.allSources') },
              ...packs.map((pack) => ({ value: pack.id, label: itemPackTitle(pack, language) })),
            ]}
          />
        )}
        {catalogue.data && !noPacks && open.length === 0 && (
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
        {catalogue.data && changes.length > 0 && (
          <section className="import-update" aria-labelledby="import-update-title">
            <Text fw={600} size="sm" id="import-update-title">
              {t('items.import.updateTitle')}
            </Text>
            <Text size="sm" c="dimmed">
              {t('items.import.updateHint')}
            </Text>
            <ul className="import-changes">
              {changes.map(({ item, differences }) => (
                <li key={item.key}>
                  <Checkbox
                    checked={!unticked.has(item.key)}
                    disabled={Boolean(busy)}
                    onChange={() =>
                      setUnticked((current) => {
                        const next = new Set(current)
                        if (next.has(item.key)) next.delete(item.key)
                        else next.add(item.key)
                        return next
                      })
                    }
                    label={<span className="user-copy">{item.name[language]}</span>}
                    description={differenceText(differences)}
                  />
                </li>
              ))}
            </ul>
            {failed?.run === 'update' && (
              <Alert color="red" role="alert">
                {errorText(failed.cents)}
              </Alert>
            )}
            <Button
              variant="default"
              aria-busy={busy === 'update'}
              aria-disabled={Boolean(busy) || ticked.length === 0 || undefined}
              disabled={ticked.length === 0 && !busy}
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
                : t('items.import.update', { count: ticked.length })}
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
        {hasSrd && (
          <Text size="xs" c="dimmed" className="import-credit">
            {t('items.import.credit')}
          </Text>
        )}
      </Stack>
    </Drawer>
  )
}
