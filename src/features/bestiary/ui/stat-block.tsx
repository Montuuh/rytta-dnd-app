import type { ReactNode } from 'react'
import { Footprints, Heart, Shield, Zap } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { RulesText } from '@/features/glossary'
import { signed } from '../domain/stats'
import { abilityKeys, detailKeys, type StatBlock } from '../domain/types'
import './bestiary.css'

type Level = 2 | 3 | 4

/**
 * A creature stat block (ADR 028), the same for SRD and homebrew creatures. The name heading is
 * the anchor (`headingId`); sections are headings one level below, so a screen reader can jump
 * between Traits, Actions and the rest. Rules terms and spells link to the glossary.
 */
export function StatBlockView({
  block,
  level = 2,
  headingId,
  media,
  badges,
  footnote,
  hideName = false,
}: {
  block: StatBlock
  level?: Level
  headingId?: string
  /** Token or image beside the name. */
  media?: ReactNode
  /** Source and status badges under the name. */
  badges?: ReactNode
  /** Attribution or provenance under the block. */
  footnote?: ReactNode
  hideName?: boolean
}) {
  const { t } = useTranslation()
  const Name = `h${level}` as const
  const Section = `h${Math.min(6, level + 1)}` as 'h3' | 'h4' | 'h5'
  const abilities = abilityKeys.filter((k) => block.abilities[k])
  return (
    <article className="sb" aria-labelledby={hideName ? undefined : headingId}>
      {!hideName && (
        <header className="sb-head">
          {media}
          <div className="sb-title">
            <Name id={headingId} className="sb-name" tabIndex={-1}>
              {block.name}
            </Name>
            {block.meta && <p className="sb-meta">{block.meta}</p>}
            {badges && <div className="sb-badges">{badges}</div>}
          </div>
        </header>
      )}
      <dl className="sb-core">
        <div>
          <dt>
            <Shield size={13} aria-hidden="true" className="sb-core-glyph" />
            {t('bestiary.ac')}
          </dt>
          <dd>{block.ac || '—'}</dd>
        </div>
        <div>
          <dt>
            <Heart size={13} aria-hidden="true" className="sb-core-glyph" />
            {t('bestiary.hp')}
          </dt>
          <dd>{block.hp || '—'}</dd>
        </div>
        <div>
          <dt>
            <Zap size={13} aria-hidden="true" className="sb-core-glyph" />
            {t('bestiary.initiative')}
          </dt>
          <dd>{block.initiative || '—'}</dd>
        </div>
        <div className="sb-core-wide">
          <dt>
            <Footprints size={13} aria-hidden="true" className="sb-core-glyph" />
            {t('bestiary.speed')}
          </dt>
          <dd>{block.speed || '—'}</dd>
        </div>
      </dl>
      {abilities.length > 0 && (
        <ul className="sb-abilities" aria-label={t('bestiary.abilities')}>
          {abilities.map((key) => {
            const a = block.abilities[key]!
            return (
              <li key={key} className="sb-ability">
                <span className="sb-ability-key" aria-hidden="true">
                  {t(`bestiary.abbr.${key}`)}
                </span>
                <span className="visually-hidden">
                  {t('bestiary.abilityFull', {
                    name: t(`bestiary.ability.${key}`),
                    score: a.score,
                    mod: signed(a.mod),
                    save: signed(a.save),
                  })}
                </span>
                <span className="sb-ability-score" aria-hidden="true">
                  {a.score}
                </span>
                <span className="sb-ability-mods" aria-hidden="true">
                  <span>{signed(a.mod)}</span>
                  <span className={a.save !== a.mod ? 'sb-save is-proficient' : 'sb-save'}>
                    {t('bestiary.saveShort')} {signed(a.save)}
                  </span>
                </span>
              </li>
            )
          })}
        </ul>
      )}
      <dl className="sb-details">
        {detailKeys
          .filter((key) => block.details[key])
          .map((key) => (
            <div key={key}>
              <dt>{t(`bestiary.detail.${key}`)}</dt>
              <dd>
                <RulesText text={block.details[key]!} />
              </dd>
            </div>
          ))}
        {block.cr && (
          <div>
            <dt>{t('bestiary.cr')}</dt>
            <dd>{block.cr}</dd>
          </div>
        )}
      </dl>
      {block.sections.map((section) => (
        <section key={section.kind} className="sb-section">
          <Section className="sb-section-title">{t(`bestiary.section.${section.kind}`)}</Section>
          {section.intro && (
            <p className="sb-intro">
              <RulesText text={section.intro} />
            </p>
          )}
          {section.entries.map((entry) => (
            <div key={entry.key} className="sb-entry" data-entry={entry.key}>
              {entry.text.length === 0 ? (
                <p>
                  <strong className="sb-entry-name">{entry.name}.</strong>
                </p>
              ) : (
                entry.text.map((paragraph, index) => (
                  <p key={index}>
                    {index === 0 && <strong className="sb-entry-name">{entry.name}. </strong>}
                    <RulesText text={paragraph} />
                  </p>
                ))
              )}
            </div>
          ))}
        </section>
      ))}
      {footnote && <p className="sb-footnote">{footnote}</p>}
    </article>
  )
}
