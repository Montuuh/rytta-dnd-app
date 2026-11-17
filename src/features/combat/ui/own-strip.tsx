import { Hourglass } from 'lucide-react'
import { Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import type { Combatant, Effect } from '../domain/combat'
import { ConditionBadges, HpMeter } from './parts'

/**
 * RYT-126 J4-08 / J4-09: the Player's own character pinned in the turn banner, so hit points, armor
 * class, conditions (as glossary terms) and their own timed effects with the rounds left stay above
 * the fold whatever the initiative position. Only what the Player projection carries.
 */
export function OwnStrip({ combatant, effects }: { combatant: Combatant; effects: Effect[] }) {
  const { t } = useTranslation()
  const timed = effects.filter((effect) => effect.target_combatant === combatant.id)
  return (
    <section className="combat-own-strip" aria-label={t('combat.own.label')}>
      <div className="combat-own-head">
        <Text component="span" fw={700} className="combat-own-name">
          {combatant.name}
        </Text>
        {combatant.armor_class !== undefined && (
          <span className="combat-ac">{t('combat.ac', { value: combatant.armor_class })}</span>
        )}
      </div>
      <HpMeter combatant={combatant} large />
      <ConditionBadges combatant={combatant} terms />
      {timed.length > 0 && (
        <ul className="combat-own-effects" aria-label={t('combat.own.effects')}>
          {timed.map((effect) => (
            <li key={effect.id}>
              <Hourglass size={14} aria-hidden="true" />
              {effect.remaining_rounds === null || effect.remaining_rounds === undefined
                ? effect.label
                : t('combat.effect.line', {
                    label: effect.label,
                    rounds: t('combat.effect.rounds', { count: effect.remaining_rounds }),
                  })}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
