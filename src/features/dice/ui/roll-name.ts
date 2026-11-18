import { useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import type { RollKind } from '@/features/campaigns'

/**
 * What a roll is called, in the viewer's language. Checks, saves, initiative and hit dice are
 * stored as stable keys (`skill` + `perception`), so a Spanish roll reads in English on an English
 * device; weapon names and anything else the database holds are shown as written.
 */
export function useRollName() {
  const { t, i18n } = useTranslation()
  return useCallback(
    (kind: RollKind, label: string) => {
      const known = (key: string) => i18n.exists(key)
      const translate = (key: string) => t(key as 'srd.skill.arcana')
      if (kind === 'skill')
        return known(`srd.skill.${label}`) ? translate(`srd.skill.${label}`) : label
      if (kind === 'ability' || kind === 'save') {
        if (!known(`srd.ability.${label}`)) return label
        return t(kind === 'ability' ? 'roll.name.ability' : 'roll.name.save', {
          ability: translate(`srd.ability.${label}`),
        })
      }
      if (kind === 'initiative') return t('roll.name.initiative')
      if (kind === 'hit_die') return t('roll.name.hitDie')
      if (kind === 'death_save') return t('roll.name.deathSave')
      if (kind === 'attack' && label) return t('roll.name.attack', { weapon: label })
      if (kind === 'damage' && label) return t('roll.name.damage', { weapon: label })
      return label || t(`roll.kind.${kind}`)
    },
    [t, i18n],
  )
}
