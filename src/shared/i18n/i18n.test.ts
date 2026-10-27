import { describe, expect, it } from 'vitest'
import { createInstance } from 'i18next'
import { en } from './en'
import { es } from './es'
import { normalizeLanguage } from './index'

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
})
