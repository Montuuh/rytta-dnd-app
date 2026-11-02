import { useRef, useState } from 'react'
import {
  Badge,
  Button,
  CloseButton,
  Group,
  Loader,
  Modal,
  Paper,
  Stack,
  Tabs,
  Text,
  Title,
} from '@mantine/core'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Check, EyeOff, Lock, Plus, Users } from 'lucide-react'
import { useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { QueryFeedback, useCampaign } from '@/features/campaigns'
import { shopAdminQuery, useShopAction } from '../api'
import {
  ShopError,
  type AdminShop,
  type ShopAction,
  type ShopActionResult,
  type ShopAdmin,
  type ShopDraft,
  draftOf,
} from '../domain/shops'
import { CreateShopDialog, RenameShopDialog } from './editors'
import { Ledger } from './ledger'
import { PriceModifiers } from './price-modifiers'
import { ShopControls } from './shop-controls'
import { AddItemsDrawer, StockList } from './stock-list'

type Dialog =
  | { kind: 'create' }
  | { kind: 'rename'; shop: AdminShop }
  | { kind: 'add'; shop: AdminShop }
  | { kind: 'archive'; target: 'shop' | 'listing'; id: string; name: string }
  | null

export function ShopAdminPanel({ playersSeeShops }: { playersSeeShops: boolean }) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const campaign = useCampaign()
  const admin = useQuery(shopAdminQuery(state.user!.id, campaign.id))
  const action = useShopAction(campaign.id)
  const [params, setParams] = useSearchParams()
  const [dialog, setDialogState] = useState<Dialog>(null)
  const [status, setStatus] = useState<SaveStatus | null>(null)
  const hideTimer = useRef(0)
  // One save pill for every DM change, fixed above the bottom bar so it is always in view.
  const report = (next: SaveStatus | null) => {
    window.clearTimeout(hideTimer.current)
    setStatus(next)
    if (next?.kind === 'saved') hideTimer.current = window.setTimeout(() => setStatus(null), 5000)
  }
  const reportError = (error: unknown) =>
    report({
      kind: 'error',
      text: t(`commerce.error.${error instanceof ShopError ? error.code : 'unavailable'}`),
    })
  const setNotice = (text: string | null) => report(text ? { kind: 'saved', text } : null)
  const [adding, setAdding] = useState(false)
  const opener = useRef<HTMLElement | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const toHeading = useRef(false)
  // Dialogs return focus to the control that opened them, or to the heading when that
  // control is gone (an archived row), so focus never drops to the body.
  const setDialog = (next: Dialog) => {
    if (next) opener.current = document.activeElement as HTMLElement | null
    setDialogState(next)
    if (!next)
      requestAnimationFrame(() => {
        const target =
          toHeading.current || !opener.current?.isConnected ? heading.current : opener.current
        toHeading.current = false
        target?.focus()
      })
  }
  const tab = params.get('tab') ?? 'shops'
  const setParam = (key: string, value: string) =>
    setParams(
      (prior) => {
        const next = new URLSearchParams(prior)
        next.set(key, value)
        return next
      },
      { replace: true },
    )
  const perform = (
    next: ShopAction,
    message: string,
    onDone?: (result: ShopActionResult) => void,
  ) => {
    report({ kind: 'saving', text: t('admin.save.saving') })
    action.mutate(next, {
      onSuccess: (result) => {
        setNotice(message)
        if (dialog) setDialog(null)
        onDone?.(result)
      },
      onError: reportError,
    })
  }
  /** Promise-based save for auto-saving controls; reports progress in the pill. */
  const saveAsync = async (next: ShopAction, message: string) => {
    report({ kind: 'saving', text: t('admin.save.saving') })
    try {
      const result = await action.mutateAsync(next)
      setNotice(message)
      return result
    } catch (error) {
      reportError(error)
      throw error
    }
  }
  const key = () => crypto.randomUUID()
  const data = admin.data
  const saveShop = (shop: AdminShop, draft: ShopDraft, message: string) =>
    perform(
      { kind: 'saveShop', shopId: shop.id, revision: shop.revision, draft, requestId: key() },
      message,
    )

  return (
    <Stack gap="lg" className="shop-admin">
      <div>
        <Title order={1} ref={heading} tabIndex={-1}>
          {t('admin.title')}
        </Title>
        <Text c="dimmed" mt="sm">
          {t('admin.intro')}
        </Text>
      </div>
      {!playersSeeShops && (
        <Text size="sm" c="dimmed">
          {t('admin.hiddenFromPlayers')}
        </Text>
      )}
      <QueryFeedback
        pending={admin.isPending}
        error={admin.isError}
        retry={() => void admin.refetch()}
      />
      <SavePill status={status} onClose={() => report(null)} />
      {data && (
        <Tabs
          className="commerce-tabs"
          value={tab}
          onChange={(value) => setParam('tab', value ?? 'shops')}
          keepMounted={false}
        >
          <Tabs.List>
            <Tabs.Tab value="shops">{t('admin.tab.shops')}</Tabs.Tab>
            <Tabs.Tab
              value="ledger"
              rightSection={
                data.pending_orders > 0 ? (
                  <Badge
                    size="sm"
                    circle
                    aria-label={t('admin.pendingCount', { count: data.pending_orders })}
                  >
                    {data.pending_orders}
                  </Badge>
                ) : null
              }
            >
              {t('admin.tab.ledger')}
            </Tabs.Tab>
          </Tabs.List>
          <Tabs.Panel value="shops" pt="md">
            <ShopsTab
              data={data}
              selectedId={params.get('shop')}
              busy={action.isPending || adding}
              onSelect={(id) => setParam('shop', id)}
              onCreate={() => setDialog({ kind: 'create' })}
              onRename={(shop) => setDialog({ kind: 'rename', shop })}
              onArchiveShop={(shop) =>
                setDialog({ kind: 'archive', target: 'shop', id: shop.id, name: shop.name })
              }
              onAddItems={(shop) => setDialog({ kind: 'add', shop })}
              saveAsync={saveAsync}
              onAction={perform}
              onRemoveListing={(id, name) =>
                setDialog({ kind: 'archive', target: 'listing', id, name })
              }
            />
          </Tabs.Panel>
          <Tabs.Panel value="ledger" pt="md">
            <Ledger
              data={data}
              busy={action.isPending}
              onAction={(next) =>
                perform(
                  next,
                  t(
                    `admin.notice.order.${next.kind as 'respond' | 'revert' | 'cancel' | 'answer'}`,
                  ),
                  (result) =>
                    result.order &&
                    setNotice(
                      t(`order.notice.${result.order.status}`, { value: result.order.total }),
                    ),
                )
              }
            />
          </Tabs.Panel>
        </Tabs>
      )}
      {dialog?.kind === 'create' && (
        <CreateShopDialog
          busy={action.isPending}
          onClose={() => setDialog(null)}
          onCreate={(name, visibility) =>
            perform(
              {
                kind: 'saveShop',
                shopId: null,
                revision: null,
                draft: {
                  name,
                  description: '',
                  visibility,
                  mode: 'auto',
                  resale_percent: 50,
                  is_open: true,
                  access: [],
                },
                requestId: key(),
              },
              t('admin.notice.shopCreated', { name }),
              (result) => result.id && setParam('shop', result.id),
            )
          }
        />
      )}
      {dialog?.kind === 'rename' && (
        <RenameShopDialog
          name={dialog.shop.name}
          description={dialog.shop.description}
          busy={action.isPending}
          onClose={() => setDialog(null)}
          onSave={(name, description) =>
            saveShop(
              dialog.shop,
              { ...draftOf(dialog.shop), name, description },
              t('admin.notice.shopSaved', { name }),
            )
          }
        />
      )}
      {data && dialog?.kind === 'add' && (
        <AddItemsDrawer
          opened
          shop={dialog.shop}
          items={data.items}
          forgeHref={`/campaign/${campaign.id}/inventory`}
          busy={adding}
          onClose={() => setDialog(null)}
          onAdd={async (items) => {
            // One idempotent request per item; stop at the first failure and report it.
            setAdding(true)
            setNotice(null)
            try {
              for (const item of items)
                await action.mutateAsync({
                  kind: 'saveListing',
                  shopId: dialog.shop.id,
                  listingId: null,
                  revision: null,
                  draft: {
                    definition_id: item.id,
                    price: item.value_gp ?? 0,
                    stock: null,
                    // Without a DM value the item would sell for 0 gp: it enters hidden.
                    visibility: item.value_gp === null ? 'hidden' : 'shop',
                    access: [],
                  },
                  requestId: key(),
                })
              const hidden = items.filter((i) => i.value_gp === null).length
              setNotice(
                hidden > 0
                  ? t('admin.notice.itemsAddedHidden', { count: items.length, hidden })
                  : t('admin.notice.itemsAdded', { count: items.length }),
              )
              setDialog(null)
            } catch (error) {
              reportError(error)
            } finally {
              setAdding(false)
            }
          }}
        />
      )}
      {dialog?.kind === 'archive' && (
        <ConfirmArchive
          name={dialog.name}
          target={dialog.target}
          busy={action.isPending}
          onClose={() => setDialog(null)}
          onConfirm={() => {
            // The archived row leaves; focus the heading instead of a neighbour's button.
            toHeading.current = true
            return dialog.target === 'shop'
              ? perform(
                  { kind: 'archiveShop', shopId: dialog.id },
                  t('admin.notice.shopArchived', { name: dialog.name }),
                )
              : perform(
                  { kind: 'archiveListing', listingId: dialog.id },
                  t('admin.notice.listingRemoved', { name: dialog.name }),
                )
          }}
        />
      )}
    </Stack>
  )
}

function ShopsTab({
  data,
  selectedId,
  busy,
  onSelect,
  onCreate,
  onRename,
  onArchiveShop,
  onAddItems,
  saveAsync,
  onAction,
  onRemoveListing,
}: {
  data: ShopAdmin
  selectedId: string | null
  busy: boolean
  onSelect: (id: string) => void
  onCreate: () => void
  onRename: (shop: AdminShop) => void
  onArchiveShop: (shop: AdminShop) => void
  onAddItems: (shop: AdminShop) => void
  saveAsync: (action: ShopAction, message: string) => Promise<unknown>
  onAction: (action: ShopAction, message: string, onDone?: () => void) => void
  onRemoveListing: (listingId: string, name: string) => void
}) {
  const { t } = useTranslation()
  const shop = data.shops.find((s) => s.id === selectedId) ?? data.shops[0] ?? null
  if (!shop)
    return (
      <Paper p="xl" className="empty-state">
        <Stack gap="sm" align="start">
          <Title order={2} size="h3">
            {t('admin.empty.shopsTitle')}
          </Title>
          <Text c="dimmed">{t('admin.empty.shopsHelp')}</Text>
          <Button leftSection={<Plus size={16} aria-hidden="true" />} onClick={onCreate}>
            {t('admin.shop.new')}
          </Button>
        </Stack>
      </Paper>
    )
  return (
    <div className="admin-shops">
      <nav className="admin-shop-list" aria-label={t('shop.list')}>
        {data.shops.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`admin-shop-item ${s.id === shop.id ? 'is-active' : ''}`}
            aria-current={s.id === shop.id ? 'true' : undefined}
            onClick={() => onSelect(s.id)}
          >
            <span className="user-copy admin-shop-name">{s.name}</span>
            <span className="admin-shop-meta">
              {s.visibility === 'hidden' ? (
                <EyeOff size={14} aria-hidden="true" />
              ) : s.visibility === 'selected' ? (
                <Users size={14} aria-hidden="true" />
              ) : null}
              {s.visibility === 'selected'
                ? t('admin.visibility.onlyFor', {
                    names:
                      s.access
                        .map((id) => data.characters.find((c) => c.id === id)?.name)
                        .filter(Boolean)
                        .join(', ') || '—',
                  })
                : t(`admin.visibility.shop.${s.visibility}`)}
              {!s.is_open && (
                <>
                  <Lock size={14} aria-hidden="true" />
                  {t('shop.closed')}
                </>
              )}
            </span>
          </button>
        ))}
        <Button
          variant="light"
          leftSection={<Plus size={16} aria-hidden="true" />}
          onClick={onCreate}
        >
          {t('admin.shop.new')}
        </Button>
      </nav>
      <section className="admin-shop-detail" aria-labelledby={`shop-${shop.id}`}>
        <ShopControls
          key={shop.id}
          shop={shop}
          characters={data.characters}
          saveDraft={(draft, revision) =>
            saveAsync(
              {
                kind: 'saveShop',
                shopId: shop.id,
                revision,
                draft,
                requestId: crypto.randomUUID(),
              },
              t('admin.notice.shopSettings', { name: draft.name }),
            )
          }
          onRename={() => onRename(shop)}
          onArchive={() => onArchiveShop(shop)}
        />
        <StockList
          shop={shop}
          data={data}
          busy={busy}
          onAdd={() => onAddItems(shop)}
          onSave={(listing, draft, name, done) =>
            onAction(
              {
                kind: 'saveListing',
                shopId: shop.id,
                listingId: listing.id,
                revision: listing.revision,
                draft,
                requestId: crypto.randomUUID(),
              },
              t('admin.notice.listingSaved', { name }),
              done,
            )
          }
          onRemove={(listing, name) => onRemoveListing(listing.id, name)}
        />
        <PriceModifiers
          shop={shop}
          characters={data.characters}
          save={(characterId, name, percent) =>
            saveAsync(
              { kind: 'modifier', shopId: shop.id, characterId, percent },
              t('admin.notice.modifierSaved', { name }),
            )
          }
        />
      </section>
    </div>
  )
}

function ConfirmArchive({
  name,
  target,
  busy,
  onClose,
  onConfirm,
}: {
  name: string
  target: 'shop' | 'listing'
  busy: boolean
  onClose: () => void
  onConfirm: () => void
}) {
  const { t } = useTranslation()
  return (
    <Modal
      opened
      onClose={onClose}
      title={t(target === 'shop' ? 'admin.archive.shopTitle' : 'admin.archive.listingTitle', {
        name,
      })}
      closeButtonProps={{ 'aria-label': t('common.close'), size: 44 }}
    >
      <Stack>
        <Text>{t(target === 'shop' ? 'admin.archive.shopHelp' : 'admin.archive.listingHelp')}</Text>
        <Group justify="end">
          <Button variant="subtle" onClick={onClose} data-autofocus>
            {t('common.cancel')}
          </Button>
          <Button color="red" loading={busy} onClick={onConfirm}>
            {t(target === 'shop' ? 'admin.shop.archive' : 'admin.archive.listingConfirm')}
          </Button>
        </Group>
      </Stack>
    </Modal>
  )
}

type SaveStatus = { kind: 'saving' | 'saved' | 'error'; text: string }

function SavePill({ status, onClose }: { status: SaveStatus | null; onClose: () => void }) {
  const { t } = useTranslation()
  return (
    <div className="save-pill-region" aria-live="polite">
      {status && (
        <div
          className={`save-pill save-pill-${status.kind}`}
          role={status.kind === 'error' ? 'alert' : 'status'}
        >
          {status.kind === 'saving' ? (
            <Loader size="xs" aria-hidden="true" />
          ) : status.kind === 'saved' ? (
            <Check size={16} aria-hidden="true" />
          ) : (
            <AlertTriangle size={16} aria-hidden="true" />
          )}
          <span>{status.text}</span>
          {status.kind !== 'saving' && (
            <CloseButton size={44} aria-label={t('common.close')} onClick={onClose} />
          )}
        </div>
      )}
    </div>
  )
}
