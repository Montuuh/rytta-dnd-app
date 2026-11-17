import { Text, Title } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import {
  finalAbilities,
  initiative,
  modifier,
  passivePerception,
  proficiencyBonus,
  signed,
} from '../../domain/rules'
import type { SheetDraft } from '../../domain/sheet'
import { abilityKeys } from '../../domain/srd'
import { useCharacterLabels } from '../labels'
import { useTrackerLabel } from '../resource-names'
import '../sheet/panel.css'

/** The abilities strip and the facts a new sheet starts with: the quick path's "what Rytta
 * prepared" and the full wizard's review read from the same widget. */
export function BuildSummary({
  draft,
  title,
  hint,
}: {
  draft: SheetDraft
  title: string
  hint?: string
}) {
  const { t } = useTranslation()
  const labels = useCharacterLabels()
  const trackerLabel = useTrackerLabel()
  const { build, level } = draft
  const scores = finalAbilities(build)
  return (
    <section className="quick-summary" aria-labelledby="quick-summary-title">
      <Title order={2} size="h4" id="quick-summary-title">
        {title}
      </Title>
      <ul className="ability-strip is-compact">
        {abilityKeys.map((key) => {
          const proficient = build.saves.includes(key)
          return (
            <li key={key} className="ability-medal" data-proficient={proficient || undefined}>
              <span className="ability-name">{t(`srd.abilityShort.${key}`)}</span>
              <span className="ability-mod">{signed(modifier(scores[key]))}</span>
              <span className="ability-score">{scores[key]}</span>
              {proficient && (
                <span className="visually-hidden">{t('panel.saveProficientShort')}</span>
              )}
            </li>
          )
        })}
      </ul>
      <dl className="quick-facts">
        <div>
          <dt>{t('creation.factOrigin')}</dt>
          <dd>
            {labels.speciesName(build)}, {labels.backgroundName(build)}
          </dd>
        </div>
        <div>
          <dt>{t('sheet.hp')}</dt>
          <dd>{draft.maxHp}</dd>
        </div>
        <div>
          <dt>{t('sheet.acLong')}</dt>
          <dd>{build.acOverride ?? draft.armorClass}</dd>
        </div>
        <div>
          <dt>{t('creation.factBasics')}</dt>
          <dd>
            {t('creation.basics', {
              init: signed(initiative(build)),
              speed: build.speed,
              prof: signed(proficiencyBonus(level)),
              pp: passivePerception(build, level),
            })}
          </dd>
        </div>
        <div>
          <dt>{t('sheet.skills')}</dt>
          <dd>
            {Object.keys(build.skills).length
              ? Object.keys(build.skills)
                  .map((skill) => t(`srd.skill.${skill as 'stealth'}`))
                  .join(', ')
              : t('creation.noSkillsYet')}
          </dd>
        </div>
        <div>
          <dt>{t('panel.resourcesTitle')}</dt>
          <dd>
            {build.trackers.length
              ? build.trackers
                  .map((tracker) => `${trackerLabel(tracker)} ${tracker.max}`)
                  .join(', ')
              : t('creation.noResourcesYet')}
          </dd>
        </div>
        {build.spells.length > 0 && (
          <div>
            <dt>{t('panel.block.spells')}</dt>
            <dd>{t('creation.spellCount', { count: build.spells.length })}</dd>
          </div>
        )}
        <div>
          <dt>{t('sheet.features')}</dt>
          <dd>
            {build.features.length
              ? build.features.map((feature) => feature.name).join(', ')
              : t('sheet.noFeatures')}
          </dd>
        </div>
      </dl>
      {hint && (
        <Text size="sm" c="dimmed">
          {hint}
        </Text>
      )}
    </section>
  )
}
