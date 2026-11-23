import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useSrdLibrary } from '@/features/glossary'
import {
  buildClassCatalog,
  classDefName,
  type ClassDef,
  type SubclassDef,
} from '../domain/class-catalog'
import { originFeat, type OriginFeat } from '../domain/creation'
import {
  buildOriginCatalog,
  featDefFor,
  localName,
  type BackgroundDef,
  type Names,
  type OriginCatalog,
} from '../domain/origin-catalog'
import { isClassKey } from '../domain/rules'

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

/**
 * RYT-171: the species, backgrounds and feats of the campaign's packs. Null while the library
 * loads.
 */
export function useOriginCatalog() {
  const library = useSrdLibrary()
  return useMemo(() => (library ? buildOriginCatalog(library.classes) : null), [library])
}

/** Names of species, backgrounds and feats in the interface language, and the feat a
 * background grants (named with its spell list). */
export function useOriginNames() {
  const { t, i18n } = useTranslation()
  const language = i18n.language
  const listName = (list: string) =>
    isClassKey(list) ? t(`srd.class.${list}`).toLocaleLowerCase(language) : list
  return {
    language,
    name: (def: { name: Names }) => localName(def.name, language),
    feat: (origins: OriginCatalog | null, def: BackgroundDef): OriginFeat | null =>
      originFeat(def, featDefFor(origins, def.feat ?? ''), language, listName),
  }
}
