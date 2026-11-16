import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { formatWeightValue, useWeightUnit } from '@/shared/lib/weight'

/** Formats pounds in the reader's unit ("2,5 kg", "5 lb"); a no-break space keeps them together. */
export function useWeightFormat() {
  const { t, i18n } = useTranslation()
  const unit = useWeightUnit(i18n.language)
  const format = useCallback(
    (pounds: number, digits = 2) =>
      t('weight.value', {
        value: formatWeightValue(pounds, unit, i18n.language, digits),
        unit: t(unit === 'kg' ? 'weight.kg' : 'weight.lb'),
      }),
    [t, unit, i18n.language],
  )
  return { unit, format }
}
