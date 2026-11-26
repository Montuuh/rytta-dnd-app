import { useTranslation } from 'react-i18next'
import { categoryGender, type ContentCategory, type PackChanges } from '../domain/content'

type Counts = { new: number; changed: number; withdrawn: number }
const kinds = ['new', 'changed', 'withdrawn'] as const

/**
 * "3 nuevas, 34 cambiadas, 1 retirada": the counts of a category's digest, without the zeros, in
 * the gender of the category ("4 cambiados" for spells).
 */
export function useCounts() {
  const { t } = useTranslation()
  return (counts: Counts, category: ContentCategory) => {
    const gender = categoryGender(category)
    return kinds
      .filter((kind) => counts[kind] > 0)
      .map((kind) => t(`campaignContent.digest.${kind}.${gender}`, { count: counts[kind] }))
      .join(', ')
  }
}

/**
 * The pack-level counts, which mix categories: the first part names "entradas" so that no gender
 * is needed ("3 entradas nuevas, 34 cambiadas, 1 retirada").
 */
function usePackCounts() {
  const { t } = useTranslation()
  return (counts: Counts) =>
    kinds
      .filter((kind) => counts[kind] > 0)
      .map((kind, index) =>
        index === 0
          ? t(`campaignContent.digest.lead.${kind}`, { count: counts[kind] })
          : t(`campaignContent.digest.${kind}.f`, { count: counts[kind] }),
      )
      .join(', ')
}

/** The notice's line: the counts, then how many touch creatures the campaign has its own version of. */
export function useDigestLine() {
  const { t } = useTranslation()
  const counts = usePackCounts()
  return (digest: PackChanges) => {
    const line = counts(digest)
    const mine =
      digest.campaign_versions > 0
        ? t('campaignContent.digest.mine', { count: digest.campaign_versions })
        : null
    if (!line) return mine ?? t('campaignContent.digest.none')
    return mine ? `${line}. ${mine}` : `${line}.`
  }
}
