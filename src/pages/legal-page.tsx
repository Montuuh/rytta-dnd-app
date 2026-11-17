import { useEffect } from 'react'
import { ArrowLeft } from 'lucide-react'
import { Link, useLocation, useNavigate } from 'react-router'
import { useTranslation } from 'react-i18next'
import { config } from '@/shared/lib/config'
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
import './legal-page.css'

/** Links to both documents: the landing footer and the Settings panel. */
export function LegalLinks({ className = '' }: { className?: string }) {
  const { t } = useTranslation()
  return (
    <nav aria-label={t('legal.links')} className={`legal-links ${className}`}>
      <Link to="/privacy">{t('legal.privacy')}</Link>
      <Link to="/terms">{t('legal.terms')}</Link>
    </nav>
  )
}

/** RYT-115: the privacy policy and the terms of use. Public: reachable signed out and signed in. */
export function LegalPage({ kind }: { kind: LegalKind }) {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const location = useLocation()
  const doc = legalDocuments[kind]
  const other: LegalKind = kind === 'privacy' ? 'terms' : 'privacy'
  const target = (location.state as { section?: unknown } | null)?.section
  const email = config.VITE_CONTACT_EMAIL
  const owner = config.VITE_OWNER_NAME
  const contact = email ?? t('legal.contactPending')
  // The address is selectable text and a mail link; the pending wording stays plain text.
  const text = (key: LegalKey) =>
    legalSegments(t(key, { contact, owner }), email).map((segment, index) =>
      segment.mailto ? (
        <a key={index} href={`mailto:${segment.mailto}`}>
          {segment.text}
        </a>
      ) : (
        segment.text
      ),
    )
  const date = new Intl.DateTimeFormat(i18n.resolvedLanguage === 'en' ? 'en' : 'es', {
    dateStyle: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${LEGAL_EFFECTIVE_DATE}T00:00:00Z`))
  // A link that names a section ("Who runs the service") lands with that heading focused.
  useEffect(() => {
    if (typeof target !== 'string') return
    const heading = document.getElementById(`legal-${target}`)
    if (!heading) return
    // The layout moves focus to the page after navigating; this runs after it.
    const frame = requestAnimationFrame(() => {
      heading.focus()
      heading.scrollIntoView({ block: 'start' })
    })
    return () => cancelAnimationFrame(frame)
  }, [target])
  const renderBlock = (block: LegalBlock, index: number) => {
    if (block.type === 'who') return <p key={index}>{text(legalWhoKey(owner))}</p>
    if (block.type === 'p') return <p key={index}>{text(block.key)}</p>
    if (block.type === 'quote') return <blockquote key={index}>{t(block.key)}</blockquote>
    return (
      <ul key={index}>
        {block.keys.map((key) => (
          <li key={key}>{text(key)}</li>
        ))}
      </ul>
    )
  }
  return (
    <article className="legal">
      <Link
        to="/"
        className="legal-back"
        // Back to where the visitor came from; home when the page was opened directly.
        onClick={(event) => {
          if (location.key === 'default') return
          event.preventDefault()
          void navigate(-1)
        }}
      >
        <ArrowLeft size={18} aria-hidden="true" />
        {t('legal.back')}
      </Link>
      <header className="legal-head">
        <h1 tabIndex={-1}>{t(doc.title)}</h1>
        <p className="legal-date">
          <time dateTime={LEGAL_EFFECTIVE_DATE}>
            {t(LEGAL_DRAFT ? 'legal.draftDate' : 'legal.effective', { date })}
          </time>
        </p>
        {LEGAL_DRAFT && (
          <div className="legal-draft" role="note">
            <strong>{t('legal.draft')}</strong>
            <span>{t('legal.draftHelp')}</span>
          </div>
        )}
        <p className="legal-intro">{t(doc.intro)}</p>
      </header>
      {doc.sections.map((section) => (
        <section key={section.id} aria-labelledby={`legal-${section.id}`}>
          <h2 id={`legal-${section.id}`} tabIndex={-1}>
            {t(section.title)}
          </h2>
          {section.blocks.map(renderBlock)}
        </section>
      ))}
      <footer className="legal-foot">
        <Link to={`/${other}`}>{t(`legal.other.${other}`)}</Link>
      </footer>
    </article>
  )
}
