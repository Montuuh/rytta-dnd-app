import { Text } from '@mantine/core'
import { useTranslation } from 'react-i18next'
import { encumbrance, formatPounds } from '../domain/encumbrance'

/** The "Balanza": carried weight on a track notched at STR×5, ×10 and ×15. */
export function Balance({ tenths, strength }: { tenths: number; strength: number }) {
  const { t, i18n } = useTranslation()
  const state = encumbrance(tenths, strength)
  const scale = state.thresholds.max * 1.1 || 1
  const at = (pounds: number) => `${Math.min(100, (pounds / scale) * 100)}%`
  const summary = t(`inventory.load.${state.status}`, {
    carried: formatPounds(state.pounds, i18n.language),
    max: state.thresholds.max,
    penalty: state.speedPenalty,
  })
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
        aria-valuemax={state.thresholds.max}
        aria-valuenow={Math.round(state.pounds)}
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
        <span className="balance-token" style={{ left: at(state.pounds) }} />
      </div>
      <div className="balance-legend" aria-hidden="true">
        <span style={{ left: at(state.thresholds.encumbered) }}>{state.thresholds.encumbered}</span>
        <span style={{ left: at(state.thresholds.heavy) }}>{state.thresholds.heavy}</span>
        <span style={{ left: at(state.thresholds.max) }}>{state.thresholds.max}</span>
      </div>
    </section>
  )
}
