import { useTranslation } from 'react-i18next'
import { packInUse, type ContentPack } from '../domain/content'
import { packParts } from './summary'

export const packSwitchId = (pack: ContentPack) => `content-pack-${pack.id}`

/** RYT-184: the one line of what a pack brings, in plain words ("330 criaturas, 12 clases, reglas"). */
export function usePackLine(pack: ContentPack) {
  const { t, i18n } = useTranslation()
  if (!pack.offered) return t('campaignContent.notOffered')
  const inUse = packInUse(pack)
  const { parts, partial } = packParts(pack, !inUse)
  if (parts.length === 0) return t('campaignContent.summary.empty')
  const words = parts.map((part) =>
    part.count === null
      ? t(`campaignContent.name.${part.category}`)
      : t(`campaignContent.part.${part.category}`, { count: part.count }),
  )
  // Only what is in use is named, without numbers: "Solo criaturas y conjuros".
  if (partial)
    return t('campaignContent.summary.only', {
      list: new Intl.ListFormat(i18n.language, { style: 'long', type: 'conjunction' }).format(
        parts.map((part) => t(`campaignContent.name.${part.category}`)),
      ),
    })
  return new Intl.ListFormat(i18n.language, { style: 'long', type: 'conjunction' }).format(words)
}
