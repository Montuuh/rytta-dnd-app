import {
  LEGAL_DRAFT,
  LEGAL_EFFECTIVE_DATE,
  legalDocuments,
  legalSegments,
  legalWhoKey,
  type LegalBlock,
  type LegalKey,
  type LegalKind,
} from './legal-content'
import { glossaryEn } from '@/shared/i18n/glossary-en'
import { glossaryEs } from '@/shared/i18n/glossary-es'
import { legalEn } from '@/shared/i18n/legal-en'
import { legalEs } from '@/shared/i18n/legal-es'

/**
 * Build-time only (vite.config.ts loads it while writing the output); never imported by the app.
 * The privacy policy and the terms as static HTML at real paths (/privacy, /terms and their
 * English copies under /en/). The app routes them behind a hash, which crawlers such as Google's
 * brand verification never read; these pages need no JavaScript. Same texts as the in-app page.
 */

export type StaticLegalLanguage = 'es' | 'en'
export type StaticLegalOptions = {
  /** The site base path, ending in a slash ("/" in production). */
  base: string
  owner?: string
  contact?: string
  /** Public origin without a path, for canonical and alternate links. */
  siteUrl?: string
}

type CatalogueKey = LegalKey | 'glossary.license'
const catalogues: Record<StaticLegalLanguage, Record<CatalogueKey, string>> = {
  es: { ...legalEs, 'glossary.license': glossaryEs['glossary.license'] },
  en: { ...legalEn, 'glossary.license': glossaryEn['glossary.license'] },
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

const fill = (text: string, values: Record<string, string>) =>
  text.replace(/\{\{(\w+)\}\}/g, (match, name: string) => values[name] ?? match)

/** Where one document lives, relative to the site base. */
export const staticLegalPath = (kind: LegalKind, lang: StaticLegalLanguage) =>
  `${lang === 'en' ? 'en/' : ''}${kind}/`

const STYLE = `
:root{color-scheme:dark;--bg:#140f0b;--text:#f5ebd6;--muted:#cbb699;--accent:#eda145;--surface:#1e1610;--line:#3a2c20}
@media (prefers-color-scheme:light){:root{color-scheme:light;--bg:#f7efe2;--text:#2a1c11;--muted:#664f3a;--accent:#6e3410;--surface:#fffdf9;--line:#e0cfb6}}
*{box-sizing:border-box}
html{background:var(--bg);color:var(--text)}
body{margin:0;font:1rem/1.65 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;-webkit-text-size-adjust:100%}
.legal{max-width:70ch;margin:0 auto;padding:12px max(16px,env(safe-area-inset-left)) 40px max(16px,env(safe-area-inset-right));overflow-wrap:anywhere}
.legal-top{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:4px 16px;border-bottom:1px solid var(--line);margin-bottom:8px}
a{color:var(--accent);text-decoration:underline;text-underline-offset:3px}
a:focus-visible{outline:3px solid var(--accent);outline-offset:2px;border-radius:2px}
.legal-top a{display:inline-flex;align-items:center;min-height:44px;font-weight:600}
h1{margin:16px 0 4px;font:600 clamp(1.75rem,5vw,2.25rem)/1.15 Georgia,Cambria,"Times New Roman",serif}
h2{margin:0 0 8px;font:600 1.3rem/1.25 Georgia,Cambria,"Times New Roman",serif}
.legal-date{margin:0 0 16px;color:var(--muted);font-size:.9375rem}
.legal-draft{display:grid;gap:2px;margin-bottom:20px;padding:12px 14px;border:1px solid var(--accent);border-left-width:4px;border-radius:8px;background:var(--surface);font-size:.9375rem;line-height:1.45}
.legal-intro{margin:0;font-size:1.0625rem}
section{margin-top:32px}
p,ul{margin:0 0 12px}
ul{padding-left:1.25rem}
li+li{margin-top:6px}
blockquote{margin:0 0 12px;padding:10px 14px;border-left:3px solid var(--line);background:var(--surface);border-radius:0 8px 8px 0;color:var(--muted);font-size:.9375rem}
.legal-foot{margin-top:40px;padding-top:16px;border-top:1px solid var(--line);display:flex;flex-wrap:wrap;gap:4px 24px}
.legal-foot a{display:inline-flex;align-items:center;min-height:44px}
`.trim()

export function renderStaticLegal(
  kind: LegalKind,
  lang: StaticLegalLanguage,
  { base, owner, contact, siteUrl }: StaticLegalOptions,
): string {
  const t = (key: CatalogueKey) => catalogues[lang][key]
  const doc = legalDocuments[kind]
  const other: LegalKind = kind === 'privacy' ? 'terms' : 'privacy'
  const otherLang: StaticLegalLanguage = lang === 'es' ? 'en' : 'es'
  const email = contact?.trim() || undefined
  const values = { contact: email ?? t('legal.contactPending'), owner: owner?.trim() ?? '' }
  const text = (key: LegalKey) =>
    legalSegments(fill(t(key), values), email)
      .map((segment) =>
        segment.mailto
          ? `<a href="mailto:${escapeHtml(segment.mailto)}">${escapeHtml(segment.text)}</a>`
          : escapeHtml(segment.text),
      )
      .join('')
  const block = (item: LegalBlock) => {
    if (item.type === 'who') return `<p>${text(legalWhoKey(owner))}</p>`
    if (item.type === 'p') return `<p>${text(item.key)}</p>`
    if (item.type === 'quote') return `<blockquote>${escapeHtml(t(item.key))}</blockquote>`
    return `<ul>${item.keys.map((key) => `<li>${text(key)}</li>`).join('')}</ul>`
  }
  const date = new Intl.DateTimeFormat(lang, { dateStyle: 'long', timeZone: 'UTC' }).format(
    new Date(`${LEGAL_EFFECTIVE_DATE}T00:00:00Z`),
  )
  const href = (path: string) => `${base}${path}`
  const origin = siteUrl?.trim().replace(/\/+$/, '')
  const absolute = (path: string) => (origin ? `${origin}${base}${path}` : undefined)
  const alternates = (['es', 'en'] as const)
    .map((code) => {
      const url = absolute(staticLegalPath(kind, code))
      return url ? `<link rel="alternate" hreflang="${code}" href="${url}" />` : ''
    })
    .join('')
  const canonical = absolute(staticLegalPath(kind, lang))
  const title = `${t(doc.title)} · Rytta`
  const sections = doc.sections
    .map(
      (section) =>
        `<section aria-labelledby="legal-${section.id}"><h2 id="legal-${section.id}">${escapeHtml(t(section.title))}</h2>${section.blocks.map(block).join('')}</section>`,
    )
    .join('\n')
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(t(doc.intro))}" />
<link rel="icon" type="image/svg+xml" href="${href('favicon.svg')}" />
${canonical ? `<link rel="canonical" href="${canonical}" />` : ''}${alternates}
<style>${STYLE}</style>
</head>
<body>
<main class="legal">
<nav class="legal-top" aria-label="${escapeHtml(t('legal.links'))}">
<a href="${href('')}">${escapeHtml(t('legal.goToApp'))}</a>
<a href="${href(staticLegalPath(kind, otherLang))}" hreflang="${otherLang}" lang="${otherLang}">${escapeHtml(t('legal.otherLanguage'))}</a>
</nav>
<article>
<header>
<h1>${escapeHtml(t(doc.title))}</h1>
<p class="legal-date"><time datetime="${LEGAL_EFFECTIVE_DATE}">${escapeHtml(fill(t(LEGAL_DRAFT ? 'legal.draftDate' : 'legal.effective'), { date }))}</time></p>
${LEGAL_DRAFT ? `<div class="legal-draft" role="note"><strong>${escapeHtml(t('legal.draft'))}</strong><span>${escapeHtml(t('legal.draftHelp'))}</span></div>` : ''}
<p class="legal-intro">${escapeHtml(t(doc.intro))}</p>
</header>
${sections}
</article>
<footer class="legal-foot">
<a href="${href(staticLegalPath(other, lang))}">${escapeHtml(t(`legal.other.${other}`))}</a>
</footer>
</main>
</body>
</html>
`
}

/** Every static legal page: its path relative to the build output and its HTML. */
export function staticLegalPages(options: StaticLegalOptions) {
  return (['privacy', 'terms'] as const).flatMap((kind) =>
    (['es', 'en'] as const).map((lang) => ({
      path: `${staticLegalPath(kind, lang)}index.html`,
      html: renderStaticLegal(kind, lang, options),
    })),
  )
}
