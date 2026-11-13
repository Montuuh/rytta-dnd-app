import { useState } from 'react'
import { Package } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import { ViewerButton } from '@/shared/ui/image-viewer'
import { itemImageQuery } from '../api'
import { itemIcons } from './icons'
import './item-icon.css'

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
}: {
  icon: string
  size?: number
  imagePath?: string | null
  /** Only outside another control, and with the item's name. */
  viewable?: boolean
  name?: string
  frame?: string
}) {
  const { t } = useTranslation()
  const { state } = useAuth()
  const query = useQuery(itemImageQuery(state.user?.id, imagePath))
  const [failed, setFailed] = useState<string | null>(null)
  const Icon = itemIcons[icon] ?? Package
  const src = query.data && failed !== query.data ? query.data : null
  const picture = src ? (
    <img
      src={src}
      alt=""
      width={size}
      height={size}
      style={{ objectFit: 'contain' }}
      onError={() => setFailed(src)}
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
    <span className={frame} aria-hidden="true">
      {picture}
    </span>
  ) : (
    picture
  )
}
