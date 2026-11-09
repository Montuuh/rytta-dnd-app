import { Accordion, Table, Title } from '@mantine/core'
import type { Ref } from 'react'
import { useTranslation } from 'react-i18next'
import type { GlossaryEntry } from '../domain/catalog'
import { homebrewParagraphs, type HomebrewEntry } from '../domain/homebrew'
import { factKeys, type Block, type EntryBody, type FactKey } from '../domain/types'
import { EntryActions } from './entry-actions'
import { useGlossary } from './glossary-context'
import { customFactIcon, factIcons } from './icon-maps'
import { CategoryIcon } from './icons'
import { GlossaryTerm, GlossaryText, RulesText } from './term'

const isFactKey = (key: string): key is FactKey => (factKeys as readonly string[]).includes(key)
const capitalize = (value: string) => value.charAt(0).toLocaleUpperCase() + value.slice(1)

function Blocks({ blocks, selfId }: { blocks: Block[]; selfId: string }) {
  return (
    <>
      {blocks.map((block, index) => {
        if (block.t === 'p')
          return (
            <p key={index}>
              {block.lead && (
                <strong className="gl-lead-in">
                  <RulesText text={block.lead} selfId={selfId} />{' '}
                </strong>
              )}
              <RulesText text={block.x} selfId={selfId} />
            </p>
          )
        if (block.t === 'ul')
          return (
            <ul key={index}>
              {block.items.map((item, i) => (
                <li key={i}>
                  <RulesText text={item} selfId={selfId} />
                </li>
              ))}
            </ul>
          )
        return (
          <div key={index} className="gl-table-wrap">
            <Table className="gl-table" withRowBorders verticalSpacing={6}>
              {block.caption && <caption>{block.caption}</caption>}
              {block.head && (
                <Table.Thead>
                  <Table.Tr>
                    {block.head.map((cell, i) => (
                      <Table.Th key={i} scope="col">
                        {cell}
                      </Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
              )}
              <Table.Tbody>
                {block.rows.map((row, r) => (
                  <Table.Tr key={r}>
                    {row.map((cell, c) => (
                      <Table.Td key={c}>
                        <RulesText text={cell} selfId={selfId} />
                      </Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </div>
        )
      })}
    </>
  )
}

function Facts({
  facts,
  selfId,
}: {
  facts: { key: string; label: string; value: string }[]
  selfId: string
}) {
  const { t } = useTranslation()
  if (!facts.length) return null
  return (
    <section className="gl-facts" aria-label={t('glossary.facts')}>
      <dl>
        {facts.map((fact, index) => {
          const Icon = isFactKey(fact.key) ? factIcons[fact.key] : customFactIcon
          return (
            <div key={index} className="gl-fact">
              <dt>
                <Icon size={16} aria-hidden="true" />
                {fact.label}
              </dt>
              <dd>
                <RulesText text={fact.value} selfId={selfId} />
              </dd>
            </div>
          )
        })}
      </dl>
    </section>
  )
}

function SpellBlock({ entry, body }: { entry: GlossaryEntry; body: EntryBody }) {
  const { t } = useTranslation()
  const glossary = useGlossary()
  const meta = entry.spell
  const stats = body.spell
  if (!meta || !stats) return null
  const school = t(`glossary.school.${meta.school}`)
  const line =
    meta.level === 0
      ? capitalize(t('glossary.spell.cantrip', { school }))
      : capitalize(t('glossary.spell.level', { school, level: meta.level }))
  const components = ['V', 'S', 'M'].filter((c) => stats.components.includes(c)).join(', ')
  const nameOf = (id: string) => glossary?.catalog?.byId.get(id)?.name ?? id
  return (
    <section className="gl-spell">
      <p className="gl-spell-line">{line}</p>
      <dl className="gl-statline">
        <div>
          <dt>{t('glossary.spell.time')}</dt>
          <dd>{stats.time}</dd>
        </div>
        <div>
          <dt>{t('glossary.spell.range')}</dt>
          <dd>{stats.range}</dd>
        </div>
        <div>
          <dt>{t('glossary.spell.components')}</dt>
          <dd>{components}</dd>
        </div>
        <div>
          <dt>{t('glossary.spell.duration')}</dt>
          <dd>
            {meta.concentration && stats.duration.match(/^(Concentration|Concentración)/) ? (
              <GlossaryTerm id="rule.concentration">{stats.duration}</GlossaryTerm>
            ) : (
              stats.duration
            )}
          </dd>
        </div>
      </dl>
      {stats.material && (
        <p className="gl-spell-material">
          {t('glossary.spell.material', { material: stats.material })}
        </p>
      )}
      <ul className="gl-spell-traits">
        {meta.ritual && (
          <li>
            <GlossaryTerm id="rule.ritual">{t('glossary.spell.ritual')}</GlossaryTerm>
          </li>
        )}
        {stats.attack && (
          <li>
            <GlossaryTerm id="rule.spell-attack">
              {t(stats.attack === 'melee' ? 'glossary.spell.melee' : 'glossary.spell.ranged')}
            </GlossaryTerm>
          </li>
        )}
        {stats.save && (
          <li>
            <GlossaryTerm id="rule.saving-throw">
              {t('glossary.spell.saveValue', { ability: nameOf(`ability.${stats.save}`) })}
            </GlossaryTerm>
          </li>
        )}
        {stats.damage?.map((type) => (
          <li key={type}>
            <GlossaryTerm id={`damage.${type}`}>{nameOf(`damage.${type}`)}</GlossaryTerm>
          </li>
        ))}
      </ul>
      <p className="gl-spell-classes">
        <span>{t('glossary.spell.classes')}: </span>
        {meta.classes.map((c) => t(`srd.class.${c}`)).join(', ')}
      </p>
    </section>
  )
}

function HouseRule({ rule }: { rule: HomebrewEntry }) {
  const { t } = useTranslation()
  return (
    <aside className="gl-house" aria-label={t('glossary.houseRule')}>
      <div className="gl-house-head">
        <p className="gl-house-title">
          <ScrollIcon /> {t('glossary.houseRule')}:{' '}
          <GlossaryTerm id={`homebrew.${rule.id}`}>{rule.name}</GlossaryTerm>
        </p>
        <EntryActions target={{ homebrew: rule }} />
      </div>
      {rule.summary && (
        <p>
          <GlossaryText text={rule.summary} />
        </p>
      )}
      {homebrewParagraphs(rule.body).map((paragraph, index) => (
        <p key={index} className="preserve-lines">
          <GlossaryText text={paragraph} />
        </p>
      ))}
    </aside>
  )
}
const ScrollIcon = () => <CategoryIcon category="lore" size={16} />

export type EntryArticleProps = {
  entry: GlossaryEntry
  body: EntryBody | undefined
  houseRules?: HomebrewEntry[]
  headingLevel: 1 | 2
  headingRef?: Ref<HTMLHeadingElement>
  compact?: boolean
  /** The reference sheet shows the headword as its dialog title instead. */
  hideHeadword?: boolean
}

/** One dictionary entry: headword, gloss, quick facts, rules text, house rules and 2014 rule. */
export function EntryArticle({
  entry,
  body,
  houseRules = [],
  headingLevel,
  headingRef,
  compact,
  hideHeadword,
}: EntryArticleProps) {
  const { t, i18n } = useTranslation()
  const glossary = useGlossary()
  const homebrew = entry.homebrew
  const facts = homebrew
    ? homebrew.facts.map((f) => ({ key: 'custom', label: f.label, value: f.value }))
    : (body?.facts ?? []).map(([key, value]) => ({
        key,
        label: t(`glossary.fact.${key}`),
        value,
      }))
  const otherLanguage = i18n.resolvedLanguage === 'en' ? 'es' : 'en'
  const lead = homebrew ? homebrew.summary : entry.category === 'condition' ? body?.summary : null
  const attached = homebrew?.srd_ref ? glossary?.catalog?.byId.get(homebrew.srd_ref) : undefined
  return (
    <article className="gl-entry" data-compact={compact || undefined} lang={i18n.resolvedLanguage}>
      <header className="gl-entry-head">
        <div className="gl-entry-kind">
          <CategoryIcon category={entry.category} />
          <span>{t(`glossary.cat.${entry.category}`)}</span>
          {entry.edition === '2014' && (
            <span className="gl-edition">{t('glossary.edition2014')}</span>
          )}
          {entry.edition === 'homebrew' && (
            <span className="gl-edition">{t('glossary.homebrewTag')}</span>
          )}
          <div className="gl-entry-actions">
            {homebrew ? (
              <EntryActions target={{ homebrew }} />
            ) : (
              // The reference sheet is for quick reading: house rules start from the page.
              !compact && <EntryActions target={{ srd: { id: entry.id, name: entry.name } }} />
            )}
          </div>
        </div>
        {!hideHeadword && (
          <Title order={headingLevel} className="gl-headword" ref={headingRef} tabIndex={-1}>
            {entry.name}
          </Title>
        )}
        {entry.otherName && entry.otherName !== entry.name && (
          <p className="gl-gloss">
            {t('glossary.otherName')} <span lang={otherLanguage}>{entry.otherName}</span>
          </p>
        )}
      </header>
      {lead && (
        <p className="gl-summary">
          <GlossaryText text={lead} selfId={entry.id} />
        </p>
      )}
      {attached && (
        <p className="gl-attached">
          {t('glossary.houseRuleFor')} <GlossaryTerm id={attached.id}>{attached.name}</GlossaryTerm>
        </p>
      )}
      {body && <SpellBlock entry={entry} body={body} />}
      {entry.feature && (
        <p className="gl-spell-line">
          {entry.feature.subclass
            ? t('glossary.feature.subclassLine', {
                subclass: t(`srd.subclass.${entry.feature.subclass}`),
                className: t(`srd.class.${entry.feature.classKey}`),
                level: entry.feature.level,
              })
            : t('glossary.feature.line', {
                className: t(`srd.class.${entry.feature.classKey}`),
                level: entry.feature.level,
              })}
        </p>
      )}
      <Facts facts={facts} selfId={entry.id} />
      <div className="gl-prose">
        {homebrew
          ? homebrewParagraphs(homebrew.body).map((paragraph, index) => (
              <p key={index} className="preserve-lines">
                <GlossaryText text={paragraph} selfId={entry.id} />
              </p>
            ))
          : body && <Blocks blocks={body.blocks} selfId={entry.id} />}
      </div>
      {houseRules.map((rule) => (
        <HouseRule key={rule.id} rule={rule} />
      ))}
      {body?.legacy && (
        <Accordion className="gl-legacy" chevronPosition="left" variant="default">
          <Accordion.Item value="legacy">
            <Accordion.Control>
              <span className="gl-legacy-title">{t('glossary.legacy')}</span>
              <span className="gl-legacy-hint">{t('glossary.legacyHint')}</span>
            </Accordion.Control>
            <Accordion.Panel>
              <div className="gl-prose">
                <Blocks blocks={body.legacy.blocks} selfId={entry.id} />
              </div>
              <p className="gl-source">{t('glossary.legacySource', { page: body.legacy.page })}</p>
            </Accordion.Panel>
          </Accordion.Item>
        </Accordion>
      )}
      {body && (
        <p className="gl-source">
          {entry.edition === '2014'
            ? t('glossary.legacySource', { page: body.page })
            : t('glossary.source', { page: body.page })}
        </p>
      )}
    </article>
  )
}
