import i18n, { type i18n as I18n } from 'i18next'
import { initReactI18next } from 'react-i18next'

export const languageKey = 'rytta-language'
export type Language = 'es' | 'en'
export function normalizeLanguage(value: string | null): Language {
  return value === 'en' ? 'en' : 'es'
}
function savedLanguage(): Language {
  try {
    return normalizeLanguage(localStorage.getItem(languageKey))
  } catch {
    return 'es'
  }
}

/**
 * RYT-117: each language is its own chunk. A language is only ever selected after its catalogue is
 * in memory: the first render waits for the saved one (or shows a retry screen), and a switch
 * loads first and changes second, so a failed request never leaves the interface on raw keys or
 * on a language the user is not shown.
 */
type Loader = () => Promise<Record<string, string>>
const catalogues: Record<Language, Loader> = {
  es: () => import('./es').then((module) => module.es),
  en: () => import('./en').then((module) => module.en),
}
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** A request that never answers fails after `ms`, so the retry screen can take over. */
function withTimeout<T>(promise: Promise<T>, ms: number) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('catalogue request timed out')), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timer)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}

/** Loads a catalogue into the instance, retrying with growing waits; rejects when all attempts fail. */
export async function loadCatalogue(
  instance: Pick<I18n, 'addResourceBundle' | 'hasResourceBundle'>,
  language: Language,
  {
    loader = catalogues[language],
    attempts = 3,
    delayMs = 400,
    wait = sleep,
    timeoutMs = 15_000,
  } = {},
) {
  if (instance.hasResourceBundle(language, 'translation')) return
  let failure: unknown
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await wait(delayMs * 3 ** (attempt - 1))
    try {
      instance.addResourceBundle(
        language,
        'translation',
        await withTimeout(loader(), timeoutMs),
        true,
        true,
      )
      return
    } catch (error) {
      failure = error
    }
  }
  throw failure instanceof Error ? failure : new Error('catalogue failed to load')
}

/**
 * Loads the language first and changes to it only when that worked and nothing newer was asked
 * for meanwhile (`current` returns false for a superseded request); false keeps the language.
 */
export async function switchLanguageOn(
  instance: Pick<I18n, 'addResourceBundle' | 'hasResourceBundle' | 'changeLanguage'>,
  language: Language,
  options?: Parameters<typeof loadCatalogue>[2] & { current?: () => boolean },
) {
  try {
    await loadCatalogue(instance, language, options)
  } catch {
    return false
  }
  if (options?.current && !options.current()) return false
  await instance.changeLanguage(language)
  return true
}
let latestSwitch = 0
export function switchLanguage(language: Language) {
  const mine = ++latestSwitch
  return switchLanguageOn(i18n, language, { current: () => mine === latestSwitch })
}

function applyLanguage(language: string) {
  const selected = normalizeLanguage(language)
  if (typeof document !== 'undefined') document.documentElement.lang = selected
  try {
    localStorage.setItem(languageKey, selected)
  } catch {
    /* Preferences still work in memory. */
  }
}

let started: Promise<boolean> | null = null
let listening = false
/**
 * Prepares i18n with the saved language's catalogue. Resolves false (and can be called again to
 * retry) when it cannot be loaded: nothing may render with no catalogue.
 */
export function startI18n(): Promise<boolean> {
  started ??= (async () => {
    const language = savedLanguage()
    if (!i18n.isInitialized)
      await i18n.use(initReactI18next).init({
        resources: {},
        lng: language,
        fallbackLng: false,
        supportedLngs: ['es', 'en'],
        keySeparator: false,
        interpolation: { escapeValue: false },
      })
    try {
      await loadCatalogue(i18n, language, { attempts: 2 })
    } catch {
      return false
    }
    await i18n.changeLanguage(language)
    if (!listening) i18n.on('languageChanged', applyLanguage)
    listening = true
    applyLanguage(i18n.language)
    return true
  })().then((ok) => {
    if (!ok) started = null
    return ok
  })
  return started
}
export { i18n }
