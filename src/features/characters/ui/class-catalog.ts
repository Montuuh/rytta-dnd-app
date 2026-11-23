import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSrdLibrary } from '@/features/glossary'
import {
  buildClassCatalog,
  classDefName,
  type ClassDef,
  type SubclassDef,
} from '../domain/class-catalog'

/**
 * RYT-168: the classes and subclasses of the campaign's packs (the app's SRD classes where the
 * packs have none). Null while the library loads.
 */
export function useClassCatalog() {
  const library = useSrdLibrary()
  return useMemo(() => (library ? buildClassCatalog(library.classes) : null), [library])
}

/** Names of classes and subclasses in the interface language. */
export function useClassDefName() {
  const { t, i18n } = useTranslation()
  return (def: ClassDef | SubclassDef, cat: 'class' | 'subclass' = 'class') =>
    classDefName(t as (key: string) => string, def, i18n.language, cat)
}
