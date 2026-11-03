import type { AuditEvent } from './campaign'

export type AuditEventFamily = 'resources' | 'vitals' | 'sheet' | 'character'
export function auditFamily(event: AuditEvent): AuditEventFamily {
  if (event.kind.startsWith('character_resources') || event.kind === 'resources_updated')
    return 'resources'
  if (event.kind.startsWith('character_vitals')) return 'vitals'
  if (event.kind.startsWith('character_sheets')) return 'sheet'
  return 'character'
}

/** True only when a characters:UPDATE row flipped RYT-031 party live sharing. */
export const sharingChanged = (event: AuditEvent) =>
  event.kind === 'characters:UPDATE' &&
  typeof event.after_value.shares_live === 'boolean' &&
  typeof event.before_value?.shares_live === 'boolean' &&
  event.before_value.shares_live !== event.after_value.shares_live
