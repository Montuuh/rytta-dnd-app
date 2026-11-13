import type { TFunction } from 'i18next'
import { isKnownKind, type ContentPack, type DraftRow } from '../domain/library'

export const kindLabel = (t: TFunction, kind: string) =>
  isKnownKind(kind) ? t(`library.kind.${kind}` as 'library.kind.creature') : kind

export const packLine = (t: TFunction, pack: ContentPack) =>
  [
    t(pack.visibility === 'public' ? 'library.public' : 'library.private'),
    pack.version > 0
      ? t('library.versionShort', { version: pack.version })
      : t('library.unpublished'),
    pack.license || null,
  ]
    .filter(Boolean)
    .join(' · ')

const text = (value: unknown) =>
  typeof value === 'string' || typeof value === 'number' ? String(value) : ''

/** A short second line for an entry row, from the listing metadata of the known kinds. */
export function entryMeta(t: TFunction, row: Pick<DraftRow, 'kind' | 'index' | 'key'>): string {
  const index = row.index ?? {}
  if (row.kind === 'creature' && index.cr !== undefined) {
    const type = text(index.type)
    return t('library.meta.creature', {
      cr: text(index.cr),
      type: type
        ? t(`bestiary.type.${type}` as 'bestiary.type.beast', { defaultValue: type })
        : '—',
    })
  }
  if (row.kind === 'spell' && typeof index.lv === 'number') {
    const school = text(index.sc)
    const name = school
      ? t(`glossary.school.${school}` as 'glossary.school.evocation', { defaultValue: school })
      : '—'
    // The same capitalised name as the editor's school select.
    const schoolName = name.charAt(0).toLocaleUpperCase() + name.slice(1)
    return index.lv === 0
      ? t('library.meta.cantrip', { school: schoolName })
      : t('library.meta.spell', { level: index.lv, school: schoolName })
  }
  if (row.kind === 'feature' && typeof index.fc === 'string' && typeof index.lv === 'number')
    return t('library.meta.feature', {
      class: t(`srd.class.${index.fc}` as 'srd.class.druid', { defaultValue: index.fc }),
      level: index.lv,
    })
  return row.key
}
