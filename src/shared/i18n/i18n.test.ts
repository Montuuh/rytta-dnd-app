import { describe, expect, it } from 'vitest'
import { createInstance } from 'i18next'
import { en } from './en'
import { es } from './es'
import { loadCatalogue, normalizeLanguage, switchLanguageOn } from './index'

describe('localization contract', () => {
  it('has complete matching catalogs without empty or untranslated key values', () => {
    expect(Object.keys(es).sort()).toEqual(Object.keys(en).sort())
    for (const catalog of [es, en])
      for (const [key, value] of Object.entries(catalog)) {
        expect(value.trim().length).toBeGreaterThan(0)
        expect(value).not.toBe(key)
      }
  })
  it('uses Spanish for absent or unsupported preferences', () => {
    for (const value of [null, '', 'fr', 'es']) expect(normalizeLanguage(value)).toBe('es')
    expect(normalizeLanguage('en')).toBe('en')
  })
  it('interpolates localized status and changes language without translating campaign content', async () => {
    const instance = createInstance()
    await instance.init({
      resources: { en: { translation: en }, es: { translation: es } },
      lng: 'es',
      keySeparator: false,
    })
    expect(instance.t('settings.connection', { status: instance.t('settings.missing') })).toBe(
      'Configuración del backend: no disponible.',
    )
    await instance.changeLanguage('en')
    expect(instance.t('settings.connection', { status: instance.t('settings.missing') })).toBe(
      'Backend configuration: not provided.',
    )
  })
  const instance = async () => {
    const created = createInstance()
    await created.init({
      resources: { es: { translation: es } },
      lng: 'es',
      fallbackLng: false,
      keySeparator: false,
    })
    return created
  }
  const fast = { delayMs: 0, wait: () => Promise.resolve() }
  it('loads the other catalogue only when asked and retries a failing request', async () => {
    const created = await instance()
    expect(created.hasResourceBundle('en', 'translation')).toBe(false)
    let calls = 0
    const flaky = () => (++calls < 3 ? Promise.reject(new Error('network')) : Promise.resolve(en))
    expect(await switchLanguageOn(created, 'en', { ...fast, loader: flaky })).toBe(true)
    expect(calls).toBe(3)
    expect(created.language).toBe('en')
    expect(created.t('preferences.language')).toBe(en['preferences.language'])
  })
  it('keeps the current language, and loads nothing, when the catalogue cannot be fetched', async () => {
    const created = await instance()
    const broken = () => Promise.reject(new Error('network'))
    expect(await switchLanguageOn(created, 'en', { ...fast, loader: broken })).toBe(false)
    expect(created.language).toBe('es')
    expect(created.hasResourceBundle('en', 'translation')).toBe(false)
    await expect(loadCatalogue(created, 'en', { ...fast, loader: broken })).rejects.toThrow(
      'network',
    )
    expect(created.t('preferences.language')).toBe(es['preferences.language'])
  })
  it('waits longer after each failed attempt', async () => {
    const created = await instance()
    const waits: number[] = []
    const broken = () => Promise.reject(new Error('x'))
    await loadCatalogue(created, 'en', {
      loader: broken,
      attempts: 4,
      delayMs: 100,
      wait: (ms) => {
        waits.push(ms)
        return Promise.resolve()
      },
    }).catch(() => undefined)
    expect(waits).toEqual([100, 300, 900])
  })
  it('does not switch to a language that was superseded while it loaded', async () => {
    const created = await instance()
    let release: () => void = () => {}
    const slow = () =>
      new Promise<Record<string, string>>((resolve) => (release = () => resolve(en)))
    const pending = switchLanguageOn(created, 'en', { ...fast, loader: slow, current: () => false })
    release()
    expect(await pending).toBe(false)
    expect(created.language).toBe('es')
  })
  it('gives up on a request that never answers', async () => {
    const created = await instance()
    const hung = () => new Promise<Record<string, string>>(() => {})
    await expect(
      loadCatalogue(created, 'en', { ...fast, loader: hung, attempts: 2, timeoutMs: 20 }),
    ).rejects.toThrow('timed out')
  })
})
