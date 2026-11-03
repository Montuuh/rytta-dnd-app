import { useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import type { Catalog } from '../domain/catalog'
import { homebrewEntryId, type HomebrewEntry } from '../domain/homebrew'
import type { HomebrewManage } from './glossary-context'
import { headwordFocus } from './headword-focus'
import { HomebrewDeleteDialog } from './homebrew-delete'
import { HomebrewEditor, type EditorTarget } from './homebrew-editor'

/** The entry id open on the glossary page (`<pagePath>/<id>`), or null on the index. */
function pageEntry(pathname: string, pagePath: string) {
  const rest = pathname.startsWith(`${pagePath}/`) ? pathname.slice(pagePath.length + 1) : ''
  return rest ? decodeURIComponent(rest) : null
}

/**
 * Owns the homebrew editor and delete confirmation for the whole glossary layer, so the page,
 * a house rule inside an SRD entry and the in-place reference sheet all edit through the same
 * overlays. `manage` is null when the viewer cannot write.
 */
export function useHomebrewManager({
  campaignId,
  pagePath,
  catalog,
  enabled,
  closeDefinition,
}: {
  campaignId: string | null
  pagePath: string | null
  catalog: Catalog | null
  enabled: boolean
  /** Drops an entry from the reference sheet's history (it was deleted or moved). */
  closeDefinition: (id?: string) => void
}) {
  const navigate = useNavigate()
  const location = useLocation()
  const [editor, setEditorState] = useState<EditorTarget | null>(null)
  const [deleting, setDeleting] = useState<HomebrewEntry | null>(null)
  // The control that opened the overlay. Mantine's own focus return would land on a menu item
  // that is already unmounted, so dismissing returns focus here instead.
  const trigger = useRef<HTMLElement | null>(null)
  const restoreFocus = () =>
    requestAnimationFrame(() => {
      if (trigger.current?.isConnected) return trigger.current.focus()
      // The opener is gone (its entry was deleted): the open definition or entry headword,
      // never <body>.
      const fallback =
        document.querySelector<HTMLElement>('.gl-sheet-headword') ??
        document.querySelector<HTMLElement>('.gl-headword') ??
        document.querySelector<HTMLElement>('main')
      fallback?.focus({ preventScroll: true })
    })
  const onGlossaryPage = Boolean(
    pagePath && (location.pathname === pagePath || location.pathname.startsWith(`${pagePath}/`)),
  )

  const manage = useMemo<HomebrewManage | null>(
    () =>
      enabled
        ? {
            create: (srdRef, from) => {
              trigger.current = from ?? null
              setEditorState({ entry: null, srdRef })
            },
            edit: (entry, from) => {
              trigger.current = from ?? null
              setEditorState({ entry, srdRef: null })
            },
            remove: (entry, from) => {
              trigger.current = from ?? null
              setDeleting(entry)
            },
          }
        : null,
    [enabled],
  )

  const element =
    enabled && campaignId && catalog ? (
      <>
        <HomebrewEditor
          target={editor}
          campaignId={campaignId}
          catalog={catalog}
          onClose={() => {
            setEditorState(null)
            restoreFocus()
          }}
          onDelete={(entry) => {
            // One overlay at a time: the confirmation replaces the form.
            setEditorState(null)
            setDeleting(entry)
          }}
          onSaved={(saved) => {
            // A deleted entry saved again gets a new id: that is a new entry, not an edit.
            const wasEdit = editor?.entry?.id === saved.id
            setEditorState(null)
            if (!onGlossaryPage || !pagePath) return restoreFocus()
            // The saved headword takes focus. Editing stays on the entry being read (a house
            // rule edited inside its SRD entry does not move away); a new entry opens itself,
            // and a new house rule opens inside its SRD entry.
            const open = pageEntry(location.pathname, pagePath)
            const target = wasEdit
              ? (open ?? homebrewEntryId(saved.id))
              : (saved.srd_ref ?? homebrewEntryId(saved.id))
            headwordFocus.id = target
            closeDefinition()
            if (target !== open)
              navigate({
                pathname: `${pagePath}/${encodeURIComponent(target)}`,
                search: location.search,
              })
          }}
        />
        <HomebrewDeleteDialog
          entry={deleting}
          campaignId={campaignId}
          onClose={() => {
            setDeleting(null)
            restoreFocus()
          }}
          onDeleted={(entry) => {
            setDeleting(null)
            const id = homebrewEntryId(entry.id)
            closeDefinition(id)
            if (!onGlossaryPage || !pagePath) return restoreFocus()
            if (location.pathname === `${pagePath}/${encodeURIComponent(id)}`)
              // The open entry is gone: back to the index, keeping the search and category.
              navigate({ pathname: pagePath, search: location.search })
            else {
              // A house rule inside an entry that stays open: focus lands on that headword.
              const open = pageEntry(location.pathname, pagePath)
              if (open) headwordFocus.id = open
            }
          }}
        />
      </>
    ) : null

  return { manage, element, busy: editor !== null || deleting !== null }
}
