import { useRef, useState, type ReactNode } from 'react'
import { Button, Group, Text, UnstyledButton } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Maximize2, RefreshCw, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { newRequestId } from '@/shared/lib/request-id'
import { artUrl } from '@/shared/ui/art-url'
import { ViewerButton } from '@/shared/ui/image-viewer'
import { shopAdminQuery, useShopPicture } from '../api'
import { attachShopImage, discardShopUpload, uploadShopImage } from '../data/repository'
import { findShopType } from '../domain/shop-types'
import { ShopError, type AdminShop } from '../domain/shops'
import { toShopImage } from './shop-image-encode'
import './shops.css'

const DEFAULT_SHOP_ART = 'generalStore'

/**
 * RYT-107: the shop image as a header banner (fixed aspect, cover). The picture is its own
 * button that opens the shared viewer; `overlay` (the shop's name and state) sits on a scrim
 * beside it, never inside it. Without a readable image it renders `fallback` instead.
 */
export function ShopBanner({
  path,
  kind,
  name,
  overlay,
  after,
  fallback,
}: {
  path: string | null | undefined
  /** The shop type: without an uploaded picture its painted interior is the banner. */
  kind?: string | null
  name: string
  overlay: ReactNode
  /** Under the banner, on the card: the description and notes. */
  after?: ReactNode
  fallback: ReactNode
}) {
  const { t } = useTranslation()
  const picture = useShopPicture(path)
  const [broken, setBroken] = useState<string | null>(null)
  const src = picture.src && broken !== picture.src ? picture.src : null
  // A shop without a (known) type gets the neutral general-store interior.
  const painted = kind && findShopType(kind) ? kind : DEFAULT_SHOP_ART
  if (!src && !picture.pending && !painted) return <>{fallback}</>
  return (
    <div className="shop-banner-card">
      <div className="shop-banner">
        {!src && !picture.pending && painted ? (
          <span className="shop-banner-open is-painted" aria-hidden="true">
            <img src={artUrl(`shops/${painted}`)} alt="" decoding="async" />
          </span>
        ) : src ? (
          <ViewerButton
            src={src}
            title={name}
            alt={t('viewer.alt', { name })}
            label={t('viewer.open', { name })}
            className="shop-banner-open"
          >
            <img src={src} alt="" onError={() => setBroken(src)} />
            <span className="shop-banner-view" aria-hidden="true">
              <Maximize2 size={14} aria-hidden="true" />
              {t('shop.banner.view')}
            </span>
          </ViewerButton>
        ) : (
          <span className="shop-banner-open is-loading" aria-hidden="true" />
        )}
        <div className="shop-banner-overlay">{overlay}</div>
      </div>
      {after && <div className="shop-banner-after">{after}</div>}
    </div>
  )
}

/** A small, decorative picture of the shop for lists: its image, else its type's glyph. */
export function ShopThumb({ path, kind }: { path?: string | null; kind?: string | null }) {
  const picture = useShopPicture(path)
  const type = kind ? findShopType(kind) : undefined
  return (
    <span className="shop-thumb" aria-hidden="true">
      {picture.src ? (
        <img src={picture.src} alt="" />
      ) : (
        <img
          src={artUrl(`shops/${type?.key ?? DEFAULT_SHOP_ART}`)}
          alt=""
          loading="lazy"
          decoding="async"
        />
      )}
    </span>
  )
}

type Status = 'saving' | 'saved' | 'removed' | null

/**
 * The DM's image control in the shop panel: a drop zone around the native file input, then the
 * banner preview with Change and Remove (which asks first). Uploads are immutable objects; an
 * upload that could not be attached is kept for a retry and discarded when replaced.
 */
export function ShopImageField({ campaignId, shop }: { campaignId: string; shop: AdminShop }) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const cache = useQueryClient()
  const picture = useShopPicture(shop.image_path)
  const [status, setStatus] = useState<Status>(null)
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [canRetry, setCanRetry] = useState(false)
  const pending = useRef<{ path: string | null; requestId: string; revision: number } | null>(null)
  const removeRef = useRef<HTMLButtonElement>(null)
  const busy = status === 'saving'
  const refresh = () =>
    cache.invalidateQueries({ queryKey: ['private', state.user?.id, 'campaign', campaignId] })
  const attach = async (path: string | null) => {
    // A retry after the row moved on needs a new request id for its new revision.
    if (
      !pending.current ||
      pending.current.path !== path ||
      pending.current.revision !== shop.revision
    )
      pending.current = { path, requestId: newRequestId(), revision: shop.revision }
    await attachShopImage(campaignId, shop.id, shop.revision, path, pending.current.requestId)
    pending.current = null
  }
  const discardIfDetached = async (stale: string) => {
    try {
      const admin = await cache.fetchQuery({
        ...shopAdminQuery(state.user!.id, campaignId),
        staleTime: 0,
      })
      const current = admin.shops.find((entry) => entry.id === shop.id)
      if (current && current.image_path !== stale) await discardShopUpload(stale)
    } catch {
      // Keep the object: an orphan upload is harmless, a deleted attached image is not.
    }
  }
  const fail = (failure: unknown) => {
    setStatus(null)
    setCanRetry(pending.current !== null)
    setError(
      failure instanceof ShopError
        ? t(`commerce.error.${failure.code}`)
        : failure instanceof Error && failure.message === 'invalid'
          ? t('admin.image.invalid')
          : failure instanceof Error && failure.message === 'storageQuota'
            ? t('common.storageQuota')
            : t('commerce.error.unavailable'),
    )
    void refresh()
  }
  const pick = async (file: File | null) => {
    if (!file || busy) return
    setError(null)
    setConfirming(false)
    setStatus('saving')
    try {
      const stale = pending.current?.path
      const image = await toShopImage(file)
      const path = await uploadShopImage(campaignId, shop.id, image)
      pending.current = null
      await attach(path)
      await refresh()
      setStatus('saved')
      // An earlier upload whose attach failed is replaced by this one. Its response may have been
      // lost after the server attached it, so only delete it once a fresh read shows another path.
      if (stale) void discardIfDetached(stale)
    } catch (failure) {
      fail(failure)
    }
  }
  const retry = async () => {
    if (!pending.current || busy) return
    const path = pending.current.path
    setError(null)
    setStatus('saving')
    try {
      await attach(path)
      await refresh()
      setStatus(path === null ? 'removed' : 'saved')
    } catch (failure) {
      fail(failure)
    }
  }
  const remove = async () => {
    setConfirming(false)
    setError(null)
    setStatus('saving')
    try {
      await attach(null)
      await refresh()
      setStatus('removed')
    } catch (failure) {
      fail(failure)
    }
  }
  const input = (
    <input
      type="file"
      className="shop-file"
      accept="image/jpeg,image/png,image/webp"
      disabled={busy}
      aria-describedby={`shop-image-help-${shop.id}`}
      onChange={(event) => {
        const next = event.currentTarget.files?.[0] ?? null
        event.currentTarget.value = ''
        void pick(next)
      }}
    />
  )
  const hasImage = Boolean(shop.image_path)
  return (
    <fieldset className="plain-fieldset">
      <legend>
        <Text fw={600} size="sm" mb={6}>
          {t('admin.image.legend')}
        </Text>
      </legend>
      <div
        className="shop-drop"
        data-dragging={dragging || undefined}
        onDragOver={(event) => {
          event.preventDefault()
          if (!busy) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          void pick(event.dataTransfer.files[0] ?? null)
        }}
      >
        {hasImage && picture.src ? (
          <ViewerButton
            src={picture.src}
            title={shop.name}
            alt={t('viewer.alt', { name: shop.name })}
            label={t('viewer.open', { name: shop.name })}
            className="shop-drop-preview"
          >
            <img src={picture.src} alt="" />
          </ViewerButton>
        ) : hasImage ? (
          <span className="shop-drop-preview is-loading" aria-hidden="true" />
        ) : null}
        {hasImage ? (
          <Group gap="xs" wrap="wrap">
            <label className="shop-drop-change" data-busy={busy || undefined}>
              {input}
              <ImagePlus size={16} aria-hidden="true" />
              <span>{dragging ? t('admin.image.dropActive') : t('admin.image.change')}</span>
            </label>
            {confirming ? (
              <Group
                gap={4}
                role="group"
                aria-label={t('admin.image.removeQuestion')}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.stopPropagation()
                    setConfirming(false)
                    requestAnimationFrame(() => removeRef.current?.focus())
                  }
                }}
              >
                <Text size="sm" fw={600} px={4}>
                  {t('admin.image.removeQuestion')}
                </Text>
                <Button variant="light" color="red" onClick={() => void remove()} data-autofocus>
                  {t('admin.image.removeYes')}
                </Button>
                <Button
                  variant="subtle"
                  onClick={() => {
                    setConfirming(false)
                    requestAnimationFrame(() => removeRef.current?.focus())
                  }}
                >
                  {t('admin.image.removeNo')}
                </Button>
              </Group>
            ) : (
              <UnstyledButton
                ref={removeRef}
                className="shop-drop-remove"
                disabled={busy}
                onClick={() => setConfirming(true)}
              >
                <Trash2 size={16} aria-hidden="true" />
                <span>{t('admin.image.remove')}</span>
              </UnstyledButton>
            )}
          </Group>
        ) : (
          <label className="shop-drop-target">
            {input}
            <span className="shop-drop-icon" aria-hidden="true">
              <ImagePlus size={26} />
            </span>
            <span className="shop-drop-copy">
              <span className="shop-drop-title">
                {dragging ? t('admin.image.dropActive') : t('admin.image.add')}
              </span>
              <span className="shop-drop-help" id={`shop-image-help-${shop.id}`}>
                {t('admin.image.help')}
              </span>
            </span>
          </label>
        )}
        {hasImage && (
          <span className="visually-hidden" id={`shop-image-help-${shop.id}`}>
            {t('admin.image.help')}
          </span>
        )}
      </div>
      <Text size="sm" role="status" aria-live="polite" mt={4} className="shop-drop-status">
        {status ? t(`admin.image.status.${status}`) : ''}
      </Text>
      {error && (
        <div role="alert" className="shop-drop-error">
          <Text size="sm">{error}</Text>
          {canRetry && (
            <Button
              variant="light"
              size="sm"
              leftSection={<RefreshCw size={16} aria-hidden="true" />}
              onClick={() => void retry()}
            >
              {t('common.retry')}
            </Button>
          )}
        </div>
      )}
    </fieldset>
  )
}
