import { useState } from 'react'
import { Package } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { ViewerButton } from '@/shared/ui/image-viewer'
import { artUrl } from '@/shared/ui/art-url'
import { packImageOptions } from '@/shared/api/pack-images'
import { usePackImagePath } from '@/shared/ui/pack-images-context'
import { itemImageQuery } from '../api'
import type { ItemCategory } from '../domain/item'
import { itemIcons } from './icons'
import './item-icon.css'

const PAINTED_FROM = 40

/**
 * An item's picture, or its icon without one. RYT-098: a viewable picture (with the item's `name`)
 * is its own button that opens the viewer; the icon fallback never is. `frame` wraps either in the
 * caller's frame class, which becomes the button itself when the picture opens the viewer.
 */
export function ItemIcon({
  icon,
  size = 28,
  imagePath,
  viewable = false,
  name,
  frame,
  category,
  basicKey,
}: {
  icon: string
  size?: number
  imagePath?: string | null
  /** Only outside another control, and with the item's name. */
  viewable?: boolean
  name?: string
  frame?: string
  /** Without a picture, a tile of 40px or more shows this category's painting; smaller keeps the glyph. */
  category?: ItemCategory
  /** RYT-172: the pack item it came from; its pack picture shows when the DM uploaded none. */
  basicKey?: string | null
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const query = useQuery(itemImageQuery(state.user?.id, imagePath))
  // Order (owner choice P5 A): the campaign's upload, the pack's picture, the category painting.
  const packPath = usePackImagePath('item', !imagePath && size >= PAINTED_FROM ? basicKey : null)
  const pack = useQuery(packImageOptions(state.user?.id, packPath))
  const [failed, setFailed] = useState<string | null>(null)
  const Icon = itemIcons[icon] ?? Package
  const found = query.data ?? pack.data
  const src = found && failed !== found ? found : null
  // Wait for a real picture to load before falling back, so the painting never flashes first.
  const painted =
    !src &&
    category &&
    size >= PAINTED_FROM &&
    !(imagePath && query.isPending) &&
    !(packPath && pack.isPending)
  const picture = src ? (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ objectFit: 'contain' }}
      onError={() => setFailed(src)}
    />
  ) : painted ? (
    <img
      src={artUrl(`items/thumbs/${category}`)}
      alt=""
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className="item-art"
    />
  ) : (
    <Icon size={size} aria-hidden="true" strokeWidth={1.6} />
  )
  if (viewable && name && src)
    return (
      <ViewerButton
        src={src}
        title={name}
        alt={t('viewer.alt', { name })}
        label={t('viewer.open', { name })}
        className={frame ? `item-image-open ${frame}` : 'item-image-open'}
      >
        {picture}
      </ViewerButton>
    )
  return frame ? (
    <span className={painted ? `${frame} has-art` : frame} aria-hidden="true">
      {picture}
    </span>
  ) : (
    picture
  )
}
