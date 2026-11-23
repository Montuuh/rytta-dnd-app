import data from './classes.json'
import {
  buildClassCatalog,
  classDefFor,
  type ClassRowLike,
} from '../../../src/features/characters/domain/class-catalog'

/**
 * RYT-167: the SRD classes and subclasses as the library publishes them (loaded in production from
 * this same data), for unit tests that need a campaign's class catalog.
 */
const rows: ClassRowLike[] = [
  ...data.classes.map((row) => ({
    cat: 'class' as const,
    key: row.key,
    en: row.name_en,
    es: row.name_es,
    data: row.data.index as Record<string, unknown>,
  })),
  ...data.subclasses.map((row) => ({
    cat: 'subclass' as const,
    key: row.key,
    en: row.name_en,
    es: row.name_es,
    data: row.data.index as Record<string, unknown>,
  })),
]
export const srdClassRows = rows
export const srdClasses = buildClassCatalog(rows)
export const srdClass = (key: string) => {
  const def = classDefFor(srdClasses, key)
  if (!def) throw new Error(`Missing SRD class ${key}`)
  return def
}
/** The SRD subclass of each SRD class. */
export const subclassOf: Record<string, string> = Object.fromEntries(
  data.subclasses.map((row) => [row.data.index.class, row.key]),
)
