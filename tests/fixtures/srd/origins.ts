import data from './origins.json'
import {
  backgroundDefFor,
  buildOriginCatalog,
  featDefFor,
  speciesDefFor,
  type OriginRowLike,
} from '../../../src/features/characters/domain/origin-catalog'

/**
 * RYT-171: the SRD species, backgrounds and feats as the library publishes them (loaded in
 * production from this same data), for unit tests that need a campaign's origin catalog.
 */
const rows = (
  cat: string,
  list: { key: string; name_en: string; name_es: string; data: { index: unknown } }[],
) =>
  list.map((row): OriginRowLike => ({
    cat,
    key: row.key,
    en: row.name_en,
    es: row.name_es,
    data: row.data.index as Record<string, unknown>,
  }))
export const srdOriginRows: OriginRowLike[] = [
  ...rows('species', data.species),
  ...rows('background', data.backgrounds),
  ...rows('feat', data.feats),
]
export const srdOrigins = buildOriginCatalog(srdOriginRows)
export const srdSpecies = (key: string) => speciesDefFor(srdOrigins, key)!
export const srdBackground = (key: string) => backgroundDefFor(srdOrigins, key)!
export const srdFeat = (key: string) => featDefFor(srdOrigins, key)!
