import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { ClassRow } from '../domain/packs'
import { useGlossary } from './glossary-context'

/**
 * RYT-168: the name of a class or subclass, of the SRD (translated) or of a pack (its entry's
 * name in the reader's language). An unknown reference shows as it is.
 */
export function classDisplayName(
  t: (key: string, options?: { defaultValue: string }) => string,
  rows: readonly ClassRow[] | null | undefined,
  language: string,
  cat: 'class' | 'subclass',
  key: string,
) {
  if (!key.includes('--')) return t(`srd.${cat}.${key}`, { defaultValue: key })
  const row = rows?.find((item) => item.cat === cat && item.key === key)
  if (!row) return key
  return language.startsWith('en') ? row.en : row.es
}

/** `classDisplayName` with the current language and the glossary's pack classes. */
export function useClassName() {
  const { t, i18n } = useTranslation()
  const rows = useGlossary()?.classRows
  const language = i18n.language
  return useCallback(
    (cat: 'class' | 'subclass', key: string) =>
      classDisplayName(
        t as (key: string, options?: { defaultValue: string }) => string,
        rows,
        language,
        cat,
        key,
      ),
    [t, rows, language],
  )
}
