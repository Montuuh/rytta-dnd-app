import { useTranslation } from 'react-i18next'
import { isEmptyRecovery, type RecoveryView } from './recovery-view'

/** Recovery lines: hit points with a bar (gain hatched), hit dice, resources and slots. */
export function RecoveryLines({ view }: { view: RecoveryView }) {
  const { t } = useTranslation()
  if (isEmptyRecovery(view)) return <p className="rest-none">{t('rest.nothing')}</p>
  return (
    <dl className="rest-lines">
      {view.hp && (
        <div className="rest-line rest-line-hp">
          <dt>{t('rest.hp')}</dt>
          <dd>
            <span className="rest-from">{view.hp.before}</span> → {view.hp.after}
            {view.hp.after > view.hp.before && (
              <span className="rest-gain">+{view.hp.after - view.hp.before}</span>
            )}
          </dd>
          <span className="rest-bar" aria-hidden="true">
            <span
              className="rest-bar-now"
              style={{ width: `${(Math.min(view.hp.before, view.hp.max) / view.hp.max) * 100}%` }}
            />
            <span
              className="rest-bar-gain"
              style={{
                width: `${(Math.max(0, Math.min(view.hp.after, view.hp.max) - view.hp.before) / view.hp.max) * 100}%`,
              }}
            />
          </span>
        </div>
      )}
      {view.dice && (
        <div className="rest-line">
          <dt>{t('rest.hitDice', { die: view.dice.die })}</dt>
          <dd>
            <span className="rest-from">{view.dice.before}</span> → {view.dice.after}
            {!view.dice.spend && view.dice.after > view.dice.before && (
              <span className="rest-gain">+{view.dice.after - view.dice.before}</span>
            )}
          </dd>
        </div>
      )}
      {view.healDice && (
        <div className="rest-line">
          <dt>{t('rest.hitDice', { die: view.healDice.die })}</dt>
          <dd>{t('rest.healDice', { left: view.healDice.left })}</dd>
        </div>
      )}
      {view.trackers.map((tracker) => (
        <div className="rest-line" key={tracker.id}>
          <dt className="user-copy">{tracker.label}</dt>
          <dd>
            <span className="rest-from">{tracker.before}</span> → {tracker.after}
            <span className="rest-gain">+{tracker.after - tracker.before}</span>
          </dd>
        </div>
      ))}
      {view.slots.length > 0 && (
        <div className="rest-line">
          <dt>{t('rest.slots')}</dt>
          <dd className="rest-slots">
            {view.slots.map((slot) => (
              <span key={slot.level}>{t('rest.slotLevel', slot)}</span>
            ))}
          </dd>
        </div>
      )}
    </dl>
  )
}
