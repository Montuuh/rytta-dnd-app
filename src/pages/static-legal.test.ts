import { describe, expect, it } from 'vitest'
import { legalEn } from '@/shared/i18n/legal-en'
import { legalEs } from '@/shared/i18n/legal-es'
import { legalDocuments } from './legal-content'
import { renderStaticLegal, staticLegalPages } from './static-legal'

const options = { base: '/', owner: 'Ada Example', contact: 'hello@example.com' }

describe('static legal pages', () => {
  it('writes both documents in both languages at real paths', () => {
    expect(staticLegalPages(options).map((page) => page.path)).toEqual([
      'privacy/index.html',
      'en/privacy/index.html',
      'terms/index.html',
      'en/terms/index.html',
    ])
  })

  it('renders every section of the document with no script and no unfilled placeholder', () => {
    for (const kind of ['privacy', 'terms'] as const)
      for (const [lang, texts] of [
        ['es', legalEs],
        ['en', legalEn],
      ] as const) {
        const html = renderStaticLegal(kind, lang, options)
        expect(html).toContain(`<html lang="${lang}">`)
        expect(html).not.toMatch(/<script/i)
        expect(html).not.toContain('{{')
        for (const section of legalDocuments[kind].sections)
          expect(html).toContain(`id="legal-${section.id}">`)
        expect(html).toContain(texts[legalDocuments[kind].title])
      }
  })

  it('names the owner, links the contact address and links the other document', () => {
    const html = renderStaticLegal('privacy', 'es', options)
    expect(html).toContain('Ada Example')
    expect(html).toContain('<a href="mailto:hello@example.com">hello@example.com</a>')
    expect(html).toContain('<a href="/terms/">Leer las condiciones de uso</a>')
    expect(html).toContain('href="/en/privacy/" hreflang="en"')
  })

  it('shows the pending wording when the build names no owner or contact', () => {
    const html = renderStaticLegal('privacy', 'en', { base: '/' })
    expect(html).toContain(legalEn['legal.contactPending'])
    expect(html).not.toContain('mailto:')
  })

  it('escapes text and adds canonical and alternate links with a site URL', () => {
    const html = renderStaticLegal('terms', 'en', {
      ...options,
      owner: 'A <b>"name"</b>',
      base: '/app/',
      siteUrl: 'https://rytta.example/',
    })
    expect(html).not.toContain('<b>')
    expect(html).toContain('<link rel="canonical" href="https://rytta.example/app/en/terms/" />')
    expect(html).toContain('hreflang="es" href="https://rytta.example/app/terms/"')
    expect(html).toContain('<a href="/app/">Go to Rytta</a>')
  })
})
