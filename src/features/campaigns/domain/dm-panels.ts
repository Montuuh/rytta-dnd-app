/**
 * RYT-179: the DM command centre's panels and their groups. The campaign index is the home
 * ("Summary"); every panel lives at `members?panel=` and `members` alone opens Members.
 */
export const dmPanelGroups = [
  { key: 'table', panels: ['bestiary', 'items'] },
  { key: 'party', panels: ['members', 'level'] },
  { key: 'settings', panels: ['modules', 'dice', 'content', 'audit'] },
] as const

export type DmPanelGroup = (typeof dmPanelGroups)[number]['key']
export type DmPanel = (typeof dmPanelGroups)[number]['panels'][number]
/** Where the DM is in the command centre: the home or one panel. */
export type DmPlace = DmPanel | 'home'

export const dmPanels: readonly DmPanel[] = dmPanelGroups.flatMap((group) => group.panels)

/** The panel a `?panel=` value names; anything else (missing, retired, unknown) is Members. */
export function parseDmPanel(value: string | null): DmPanel {
  return dmPanels.find((panel) => panel === value) ?? 'members'
}

/** The address of the home or a panel, with an optional one-time action (`?do=`). */
export function dmPlaceHref(campaignId: string, place: DmPlace, action?: string) {
  const base = `/campaign/${campaignId}`
  if (place === 'home') return base
  const params = new URLSearchParams()
  if (place !== 'members') params.set('panel', place)
  if (action) params.set('do', action)
  const query = params.toString()
  return `${base}/members${query ? `?${query}` : ''}`
}
