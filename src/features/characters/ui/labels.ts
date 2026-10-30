import { useTranslation } from 'react-i18next'
import { isBackgroundKey, isClassKey, isSpeciesKey } from '../domain/rules'
import type { Build } from '../domain/sheet'

/** SRD choices follow the interface language; homebrew labels are user content. */
export function useCharacterLabels() {
  const { t } = useTranslation()
  const unset = t('sheet.unset')
  return {
    className: (build: Pick<Build, 'classKey' | 'classLabel'>) =>
      isClassKey(build.classKey) ? t(`srd.class.${build.classKey}`) : build.classLabel || unset,
    speciesName: (build: Pick<Build, 'speciesKey' | 'speciesLabel'>) =>
      isSpeciesKey(build.speciesKey)
        ? t(`srd.species.${build.speciesKey}`)
        : build.speciesLabel || unset,
    backgroundName: (build: Pick<Build, 'backgroundKey' | 'backgroundLabel'>) =>
      isBackgroundKey(build.backgroundKey)
        ? t(`srd.background.${build.backgroundKey}`)
        : build.backgroundLabel || unset,
  }
}
