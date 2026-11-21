import type { legalEn } from '@/shared/i18n/legal-en'

export type LegalKey = keyof typeof legalEn

/**
 * RYT-115: true shows the draft notice and "Borrador del …"; false (the owner approved both texts
 * on 2026-11-17) shows the effective date. This is the only switch. The privacy policy changed on
 * 2026-11-21 (RYT-157: email sign-in, Brevo and Cloudflare Turnstile), so its date moved with it.
 */
export const LEGAL_DRAFT = false
/** The day both documents take effect (ISO date, shown in the visitor's language). */
export const LEGAL_EFFECTIVE_DATE = '2026-11-21'

export type LegalKind = 'privacy' | 'terms'
export type LegalBlock =
  | { type: 'p'; key: LegalKey }
  | { type: 'ul'; keys: LegalKey[] }
  /** Resolved at render time: depends on whether the build names the owner. */
  | { type: 'who' }
  /** The SRD attribution is the app's existing licence text, quoted as is. */
  | { type: 'quote'; key: 'glossary.license' }
export type LegalSection = { id: string; title: LegalKey; blocks: LegalBlock[] }
export type LegalDocument = { title: LegalKey; intro: LegalKey; sections: LegalSection[] }

/** The "Who runs the service" paragraph: names the person when the build supplies the name. */
export function legalWhoKey(owner: string | undefined): LegalKey {
  return owner?.trim() ? 'legal.privacy.who.p1' : 'legal.privacy.who.pending'
}

export type LegalSegment = { text: string; mailto?: string }
/** Splits translated text around the contact address so the page can link it; text is untouched. */
export function legalSegments(text: string, email: string | undefined): LegalSegment[] {
  if (!email) return [{ text }]
  const out: LegalSegment[] = []
  text.split(email).forEach((part, index) => {
    if (index > 0) out.push({ text: email, mailto: email })
    if (part) out.push({ text: part })
  })
  return out
}

const p = (key: LegalKey): LegalBlock => ({ type: 'p', key })
const ul = (...keys: LegalKey[]): LegalBlock => ({ type: 'ul', keys })

export const legalDocuments: Record<LegalKind, LegalDocument> = {
  privacy: {
    title: 'legal.privacy',
    intro: 'legal.privacy.intro',
    sections: [
      {
        id: 'who',
        title: 'legal.privacy.who.title',
        blocks: [{ type: 'who' }],
      },
      {
        id: 'collect',
        title: 'legal.privacy.collect.title',
        blocks: [
          p('legal.privacy.collect.p1'),
          ul(
            'legal.privacy.collect.l1',
            'legal.privacy.collect.l2',
            'legal.privacy.collect.l3',
            'legal.privacy.collect.l4',
          ),
          p('legal.privacy.collect.p2'),
        ],
      },
      {
        id: 'where',
        title: 'legal.privacy.where.title',
        blocks: [p('legal.privacy.where.p1'), p('legal.privacy.where.p2')],
      },
      {
        id: 'visibility',
        title: 'legal.privacy.visibility.title',
        blocks: [
          ul(
            'legal.privacy.visibility.l1',
            'legal.privacy.visibility.l2',
            'legal.privacy.visibility.l3',
          ),
        ],
      },
      {
        id: 'local',
        title: 'legal.privacy.local.title',
        blocks: [
          p('legal.privacy.local.p1'),
          ul('legal.privacy.local.l1', 'legal.privacy.local.l2', 'legal.privacy.local.l3'),
          p('legal.privacy.local.p2'),
        ],
      },
      {
        id: 'retention',
        title: 'legal.privacy.retention.title',
        blocks: [p('legal.privacy.retention.p1')],
      },
      { id: 'rights', title: 'legal.privacy.rights.title', blocks: [p('legal.privacy.rights.p1')] },
      { id: 'age', title: 'legal.privacy.age.title', blocks: [p('legal.privacy.age.p1')] },
      { id: 'third', title: 'legal.privacy.third.title', blocks: [p('legal.privacy.third.p1')] },
      {
        id: 'changes',
        title: 'legal.privacy.changes.title',
        blocks: [p('legal.privacy.changes.p1')],
      },
    ],
  },
  terms: {
    title: 'legal.terms',
    intro: 'legal.terms.intro',
    sections: [
      {
        id: 'service',
        title: 'legal.terms.service.title',
        blocks: [p('legal.terms.service.p1')],
      },
      { id: 'age', title: 'legal.terms.age.title', blocks: [p('legal.terms.age.p1')] },
      {
        id: 'use',
        title: 'legal.terms.use.title',
        blocks: [
          p('legal.terms.use.p1'),
          ul(
            'legal.terms.use.l1',
            'legal.terms.use.l2',
            'legal.terms.use.l3',
            'legal.terms.use.l4',
          ),
        ],
      },
      { id: 'content', title: 'legal.terms.content.title', blocks: [p('legal.terms.content.p1')] },
      {
        id: 'srd',
        title: 'legal.terms.srd.title',
        blocks: [p('legal.terms.srd.p1'), { type: 'quote', key: 'glossary.license' }],
      },
      { id: 'art', title: 'legal.terms.art.title', blocks: [p('legal.terms.art.p1')] },
      { id: 'end', title: 'legal.terms.end.title', blocks: [p('legal.terms.end.p1')] },
      {
        id: 'liability',
        title: 'legal.terms.liability.title',
        blocks: [p('legal.terms.liability.p1')],
      },
      { id: 'law', title: 'legal.terms.law.title', blocks: [p('legal.terms.law.p1')] },
      {
        id: 'changes',
        title: 'legal.terms.changes.title',
        blocks: [p('legal.terms.changes.p1')],
      },
    ],
  },
}
