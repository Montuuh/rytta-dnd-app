import type { GlossaryCategory } from '../domain/catalog'
import { categoryIcons } from './icon-maps'

export function CategoryIcon({
  category,
  size = 16,
}: {
  category: GlossaryCategory
  size?: number
}) {
  const Icon = categoryIcons[category]
  return <Icon size={size} aria-hidden="true" />
}
