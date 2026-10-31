import { Package } from 'lucide-react'
import { itemIcons } from './icons'

export function ItemIcon({ icon, size = 28 }: { icon: string; size?: number }) {
  const Icon = itemIcons[icon] ?? Package
  return <Icon size={size} aria-hidden="true" strokeWidth={1.6} />
}
