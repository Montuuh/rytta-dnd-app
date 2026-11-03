import { createContext, useContext } from 'react'
import type { Catalog } from '../domain/catalog'
import type { HomebrewEntry } from '../domain/homebrew'
import type { Linker } from '../domain/linker'
import type { EntryBodies, GlossaryLanguage } from '../domain/types'

/** Homebrew writes, offered to every glossary surface (page, reference sheet, house rules). */
export type HomebrewManage = {
  /**
   * Each action takes the control that opened it: focus returns there when the overlay is
   * dismissed (a menu item would already be unmounted).
   */
  /** Opens the editor for a new entry, optionally a house rule for an SRD entry. */
  create: (srdRef: string | null, trigger?: HTMLElement | null) => void
  edit: (entry: HomebrewEntry, trigger?: HTMLElement | null) => void
  /** Opens the delete confirmation. */
  remove: (entry: HomebrewEntry, trigger?: HTMLElement | null) => void
}

export type GlossaryContextValue = {
  language: GlossaryLanguage
  catalog: Catalog | null
  linker: Linker | null
  /** Entry bodies of the current language; null until first needed (lazy chunk). */
  bodies: EntryBodies | null
  bodiesError: boolean
  indexError: boolean
  requestBodies: () => void
  retry: () => void
  /** Opens the in-place reference sheet for an entry. */
  open: (id: string) => void
  /** Glossary page base path, or null when the module is hidden for this viewer. */
  pagePath: string | null
  campaignId: string | null
  /** Homebrew can be created/edited (live campaign with access to the module). */
  canEdit: boolean
  /** Homebrew actions, or null when the viewer cannot write (demo, module hidden). */
  manage: HomebrewManage | null
  recent: string[]
  remember: (id: string) => void
}

export const GlossaryContext = createContext<GlossaryContextValue | null>(null)
/** Null outside a glossary layer: terms then render as plain text. */
export const useGlossary = () => useContext(GlossaryContext)
