import { Checkbox } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { GlossaryTerm, glossaryIds } from '@/features/glossary'
import { finalAbilities, modifier, saveBonus, signed } from '../../domain/rules'
import { abilityKeys, type Ability } from '../../domain/srd'
import type { PanelProps } from './panel-types'
import { Stepper } from './widgets'

/** RYT-073 abilities with their saving throws, always visible (never behind a tile). Edit mode
 * changes the final score in place (the background bonus stays) and the save proficiency. */
export function AbilityStrip({ build, level, editing, change }: PanelProps) {
  const { t } = useTranslation()
  const scores = finalAbilities(build)
  const setScore = (key: Ability, score: number) =>
    change((draft) => ({
      ...draft,
      build: {
        ...draft.build,
        abilityMethod: 'manual',
        baseAbilities: {
          ...draft.build.baseAbilities,
          [key]: Math.min(30, Math.max(1, score - draft.build.bonuses[key])),
        },
      },
    }))
  const toggleSave = (key: Ability, on: boolean) =>
    change((draft) => ({
      ...draft,
      build: {
        ...draft.build,
        saves: abilityKeys.filter((item) => (item === key ? on : draft.build.saves.includes(item))),
      },
    }))
  return (
    <section className="panel-abilities" aria-labelledby="panel-abilities-title">
      <h2 id="panel-abilities-title" className="panel-section-title">
        {t('panel.abilitiesAndSaves')}
      </h2>
      <ul className="ability-strip" data-editing={editing || undefined}>
        {abilityKeys.map((key) => {
          const proficient = build.saves.includes(key)
          const save = signed(saveBonus(build, level, key))
          const name = t(`srd.ability.${key}`)
          return (
            <li key={key} className="ability-medal" data-proficient={proficient || undefined}>
              <span className="ability-name">
                <GlossaryTerm id={glossaryIds.ability(key)}>
                  <abbr title={name} aria-hidden="true">
                    {t(`srd.abilityShort.${key}`)}
                  </abbr>
                  <span className="visually-hidden">{name}</span>
                </GlossaryTerm>
              </span>
              <span className="ability-mod">
                <span aria-hidden="true">{signed(modifier(scores[key]))}</span>
                <span className="visually-hidden">
                  {t('panel.modifier', { value: signed(modifier(scores[key])) })}
                </span>
              </span>
              {editing ? (
                <>
                  <Stepper
                    label={t('panel.score', { ability: name })}
                    name={t('panel.scoreName', { ability: name })}
                    value={scores[key]}
                    min={1}
                    max={30}
                    onChange={(value) => setScore(key, value)}
                  />
                  <Checkbox
                    size="md"
                    className="ability-save-toggle"
                    label={t('panel.saveProficient', { value: save })}
                    aria-label={t('panel.saveProficientFor', { ability: name })}
                    checked={proficient}
                    onChange={(event) => toggleSave(key, event.currentTarget.checked)}
                  />
                </>
              ) : (
                <>
                  <span className="ability-score">{scores[key]}</span>
                  <span className="ability-save">
                    <span className="visually-hidden">
                      {t('sheet.saveLabel', { ability: name, value: save })}
                      {proficient ? `, ${t('sheet.proficient')}` : ''}
                    </span>
                    <span aria-hidden="true">
                      {t('sheet.saveShort')} {save}
                    </span>
                    {proficient && <span className="ability-save-dot" aria-hidden="true" />}
                  </span>
                </>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
