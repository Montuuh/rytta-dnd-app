import { describe, expect, it } from 'vitest'
import { legalEn } from '@/shared/i18n/legal-en'
import { legalEs } from '@/shared/i18n/legal-es'
import {
  LEGAL_DRAFT,
  LEGAL_EFFECTIVE_DATE,
  legalDocuments,
  legalSegments,
  legalWhoKey,
  type LegalKey,
} from './legal-content'

const fill = (template: string, values: Record<string, string>) =>
  template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => values[name] ?? '')

const owner = 'Nombre Apellido'
const email = 'contact@example.test'

describe('legal content', () => {
  it('names the responsible person when both owner and contact are configured', () => {
    const key = legalWhoKey(owner)
    expect(fill(legalEs[key], { owner, contact: email })).toBe(
      `${owner}, persona física, es responsable del tratamiento de los datos de Rytta. Contacto: ${email}.`,
    )
    expect(fill(legalEn[key], { owner, contact: email })).toBe(
      `${owner}, a natural person, is responsible for the processing of Rytta data. Contact: ${email}.`,
    )
  })

  it('falls back to the pending wording without a name', () => {
    for (const missing of [undefined, '', '   ']) {
      const key = legalWhoKey(missing)
      expect(key).toBe('legal.privacy.who.pending')
      expect(legalEs[key]).toContain('El responsable se identificará antes del lanzamiento')
      expect(legalEn[key]).toContain('will be identified before launch')
    }
  })

  it('links the contact address as a mailto while keeping it as selectable text', () => {
    const text = fill(legalEs[legalWhoKey(owner)], { owner, contact: email })
    const parts = legalSegments(text, email)
    expect(parts.map((part) => part.text).join('')).toBe(text)
    expect(parts.filter((part) => part.mailto)).toEqual([{ text: email, mailto: email }])
  })

  it('leaves text untouched when there is no address to link', () => {
    expect(legalSegments('dirección pendiente', undefined)).toEqual([
      { text: 'dirección pendiente' },
    ])
  })

  it('states the minimum age of 14 and Spanish law in both documents and languages', () => {
    const keys = Object.values(legalDocuments)
      .flatMap((doc) => doc.sections)
      .flatMap((section) => section.blocks)
      .flatMap((block) => (block.type === 'p' ? [block.key] : []))
    for (const key of ['legal.privacy.age.p1', 'legal.terms.age.p1'] as LegalKey[]) {
      expect(keys).toContain(key)
      expect(legalEs[key]).toContain('14')
      expect(legalEn[key]).toContain('14')
    }
    expect(legalEs['legal.terms.law.p1']).toContain('ley española')
    expect(legalEn['legal.terms.law.p1']).toContain('Spanish law')
    expect(legalEs['legal.terms.law.p1']).not.toContain('pendiente')
  })

  it('is published, effective 2026-11-26 after the RYT-147 and RYT-128 privacy update', () => {
    expect(LEGAL_DRAFT).toBe(false)
    expect(LEGAL_EFFECTIVE_DATE).toBe('2026-11-26')
    expect(fill(legalEs['legal.effective'], { date: '17 de noviembre de 2026' })).toBe(
      'En vigor desde el 17 de noviembre de 2026',
    )
    expect(fill(legalEn['legal.effective'], { date: 'November 17, 2026' })).toBe(
      'In force since November 17, 2026',
    )
  })

  it('keeps the draft wording ready behind the one switch, and nowhere else', () => {
    expect(legalEs['legal.draftDate']).toContain('Borrador')
    expect(legalEn['legal.draftDate']).toContain('Draft')
    for (const key of Object.keys(legalEs) as LegalKey[]) {
      if (key === 'legal.draft' || key === 'legal.draftHelp' || key === 'legal.draftDate') continue
      expect(legalEs[key], key).not.toMatch(/borrador/i)
      expect(legalEn[key], key).not.toMatch(/draft/i)
    }
  })

  it('keeps both languages complete', () => {
    expect(Object.keys(legalEs).sort()).toEqual(Object.keys(legalEn).sort())
  })
  it('names every service that handles sign-in data (RYT-157)', () => {
    for (const name of ['Google', 'Supabase', 'Brevo', 'Cloudflare', 'Turnstile']) {
      expect(legalEs['legal.privacy.third.p1']).toContain(name)
      expect(legalEn['legal.privacy.third.p1']).toContain(name)
    }
    expect(legalEs['legal.privacy.collect.l1']).toContain('contraseña')
    expect(legalEn['legal.privacy.collect.l1']).toContain('password')
  })

  it('states the aggregate counts (RYT-147) and the offline files (RYT-128) the owner approved', () => {
    expect(legalEs['legal.privacy.collect.p3']).toBe(
      'El titular también cuenta, de forma agregada, cuántas campañas empiezan a jugar y vuelven a usarse cada semana, para saber si Rytta resulta útil. Esos recuentos no identifican a nadie ni a ninguna campaña.',
    )
    expect(legalEn['legal.privacy.collect.p3']).toContain('in aggregate')
    expect(legalEs['legal.privacy.local.l4']).toBe(
      'los archivos de la propia aplicación, para que abra sin conexión; no contienen datos tuyos.',
    )
    expect(legalEn['legal.privacy.local.l4']).toContain('opens without a connection')
  })
})
