import { createContext, useContext } from 'react'
import { useTranslation } from 'react-i18next'
import { basePackLabel, noPackOrigins, type PackOrigins } from '@/shared/api/pack-origins'

/**
 * RYT-174: the origins of the base pack's entries for the open campaign, or for the published
 * pack outside one. Empty in the demo, signed out and before they load: everything then reads as
 * it did before (the SRD).
 */
export const PackOriginsContext = createContext<PackOrigins>(noPackOrigins)
export const usePackOrigins = () => useContext(PackOriginsContext)

/** The base pack's short name in the interface language where the app said "SRD". */
export function useBasePackLabel(fallback: string) {
  const origins = usePackOrigins()
  const { i18n } = useTranslation()
  return basePackLabel(origins, i18n.resolvedLanguage === 'en' ? 'en' : 'es', fallback)
}
