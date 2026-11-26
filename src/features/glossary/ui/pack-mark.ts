import type { GlossaryEntry } from '../domain/catalog'
import type { GlossaryLanguage } from '../domain/types'
import type { PackMark } from './glossary-source'

/** The `<ref>` of an entry id of a pack other than the base one (`spell.<ref>--<key>`). */
export const packRefOf = (id: string) => /^[^.]+\.([0-9a-f]{8})--/.exec(id)?.[1] ?? null

/**
 * The short pack name for a list row, or null for homebrew and for a pack that is not loaded.
 * `baseLabel` names the base pack, whose entries carry no `<ref>--` prefix.
 */
export function packNameOf(
  entry: GlossaryEntry,
  packs: readonly PackMark[],
  language: GlossaryLanguage,
  baseLabel: string,
) {
  if (entry.source === 'homebrew') return null
  const ref = packRefOf(entry.id)
  if (!ref) return baseLabel
  const pack = packs.find((p) => p.ref === ref)
  if (!pack) return null
  return (
    (language === 'en' ? pack.title_en || pack.title_es : pack.title_es || pack.title_en) || null
  )
}
