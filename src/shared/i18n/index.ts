import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { en } from './en'
import { es } from './es'

export const languageKey = 'rytta-language'
export function normalizeLanguage(value: string | null): 'es' | 'en' {
  return value === 'en' ? 'en' : 'es'
}
function savedLanguage() {
  try {
    return normalizeLanguage(localStorage.getItem(languageKey))
  } catch {
    return 'es'
  }
}
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, es: { translation: es } },
  lng: savedLanguage(),
  fallbackLng: 'es',
  supportedLngs: ['es', 'en'],
  keySeparator: false,
  initAsync: false,
  interpolation: { escapeValue: false },
})
function applyLanguage(language: string) {
  const selected = normalizeLanguage(language)
  if (typeof document !== 'undefined') document.documentElement.lang = selected
  try {
    localStorage.setItem(languageKey, selected)
  } catch {
    /* Preferences still work in memory. */
  }
}
i18n.on('languageChanged', applyLanguage)
applyLanguage(i18n.language)
export { i18n }
