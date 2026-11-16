import { Text } from '@mantine/core'
import { Feather } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { localizedName } from '@/shared/lib/translations'
import { fromPounds } from '@/shared/lib/weight'
import { encumbrance, type CarriedLoad } from '../domain/encumbrance'
import type { ItemDefinition } from '../domain/item'
import { useWeightFormat } from './use-weight'
import './catalogue.css'

/**
 * The "Balanza": carried weight on a track notched at STR×5, ×10 and ×15, in the reader's unit.
 * A container that lightens the load says so under the track (RYT-104).
 */
export function Balance({
  load,
  strength,
  definitions,
}: {
  load: CarriedLoad
  strength: number
  definitions: Map<string, ItemDefinition>
}) {
  const { t, i18n } = useTranslation()
  const { unit, format } = useWeightFormat()
  const state = encumbrance(Math.round(load.pounds * 10), strength)
  const scale = state.thresholds.max * 1.1 || 1
  const at = (pounds: number) => `${Math.min(100, (pounds / scale) * 100)}%`
  const summary = t(`inventory.load.${state.status}`, {
    carried: format(load.pounds, 1),
    max: format(state.thresholds.max, 1),
    penalty: state.speedPenalty,
  })
  const shown = (pounds: number) =>
    fromPounds(pounds, unit).toLocaleString(i18n.language, { maximumFractionDigits: 1 })
  const reliefItem = load.relief ? definitions.get(load.relief.definitionId) : undefined
  return (
    <section className={`balance balance-${state.status}`} aria-labelledby="balance-title">
      <div className="balance-head">
        <Text fw={600} id="balance-title">
          {t('inventory.load.title')}
        </Text>
        <Text size="sm" className="balance-summary" aria-live="polite">
          {summary}
        </Text>
      </div>
      <div
        className="balance-track"
        role="meter"
        aria-label={t('inventory.load.title')}
        aria-valuemin={0}
        aria-valuemax={Math.round(fromPounds(state.thresholds.max, unit))}
        aria-valuenow={Math.round(fromPounds(load.pounds, unit))}
        aria-valuetext={summary}
      >
        <span
          className="balance-zone zone-light"
          style={{ width: at(state.thresholds.encumbered) }}
        />
        <span
          className="balance-zone zone-encumbered"
          style={{
            left: at(state.thresholds.encumbered),
            width: `calc(${at(state.thresholds.heavy)} - ${at(state.thresholds.encumbered)})`,
          }}
        />
        <span
          className="balance-zone zone-heavy"
          style={{
            left: at(state.thresholds.heavy),
            width: `calc(${at(state.thresholds.max)} - ${at(state.thresholds.heavy)})`,
          }}
        />
        {[state.thresholds.encumbered, state.thresholds.heavy, state.thresholds.max].map((mark) => (
          <span key={mark} className="balance-notch" style={{ left: at(mark) }} />
        ))}
        <span className="balance-token" style={{ left: at(load.pounds) }} />
      </div>
      <div className="balance-legend" aria-hidden="true">
        <span style={{ left: at(state.thresholds.encumbered) }}>
          {shown(state.thresholds.encumbered)}
        </span>
        <span style={{ left: at(state.thresholds.heavy) }}>{shown(state.thresholds.heavy)}</span>
        <span style={{ left: at(state.thresholds.max) }}>{shown(state.thresholds.max)}</span>
      </div>
      {load.relief && (
        <Text size="sm" className="balance-relief">
          <Feather size={16} aria-hidden="true" />
          <span>
            {t('items.container.relief', {
              name: reliefItem ? localizedName(reliefItem, i18n.language) : load.relief.name,
              percent: load.relief.percent,
              saved: format(load.relief.savedPounds, 1),
              capacity: format(load.relief.capacityLb, 1),
            })}
          </span>
        </Text>
      )}
    </section>
  )
}
