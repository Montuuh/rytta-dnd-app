import { useState } from 'react'
import { Package } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { itemImageQuery } from '../api'
import { itemIcons } from './icons'

export function ItemIcon({
  icon,
  size = 28,
  imagePath,
}: {
  icon: string
  size?: number
  imagePath?: string | null
}) {
  const { state } = useAuth()
  const query = useQuery(itemImageQuery(state.user?.id, imagePath))
  const [failed, setFailed] = useState<string | null>(null)
  const Icon = itemIcons[icon] ?? Package
  return query.data && failed !== query.data ? (
    <img
      src={query.data}
      alt=""
      width={size}
      height={size}
      style={{ objectFit: 'contain' }}
      onError={() => setFailed(query.data!)}
    />
  ) : (
    <Icon size={size} aria-hidden="true" strokeWidth={1.6} />
  )
}
