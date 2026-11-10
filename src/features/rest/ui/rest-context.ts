import { createContext, useContext } from 'react'
import type { RestState } from '../domain/rest'

export type RestPanelApi = {
  campaignId: string | null
  /** The campaign's rest request: undefined while loading, null when there is none. */
  state: RestState | null | undefined
  /** Opens the group rest panel; focus returns to `opener` (or the focused element) on close. */
  openPanel: (opener?: HTMLElement | null) => void
}

export const RestPanelContext = createContext<RestPanelApi>({
  campaignId: null,
  state: undefined,
  openPanel: () => undefined,
})

/** RYT-080: the rest panel and state, provided once per campaign by the app layout. */
export const useRestPanel = () => useContext(RestPanelContext)
