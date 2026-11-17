import type { ReactNode } from 'react'
import { ArtPlate } from '@/shared/ui/art'
import './empty-panel.css'

/**
 * An empty state that is the whole panel: a painted plate, one sentence saying what is missing
 * and the one real next action for the viewer. Small inline "nothing here" lines stay plain text.
 */
export function EmptyPanel({
  art,
  title,
  children,
  action,
}: {
  art: 'shop' | 'satchel' | 'campaigns'
  title?: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="empty-panel">
      <ArtPlate name={`empty/${art}`} size={112} className="empty-panel-art" />
      <div className="empty-panel-body">
        {title && <p className="empty-panel-title">{title}</p>}
        <p className="empty-panel-text">{children}</p>
        {action && <div className="empty-panel-action">{action}</div>}
      </div>
    </div>
  )
}
