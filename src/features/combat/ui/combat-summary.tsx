import { useId } from 'react'
import { Text, Title } from '@mantine/core'
import { HeartCrack, ShieldCheck, Skull, Swords } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { Combatant, Encounter, SummaryRow } from '../domain/combat'
import { Token } from './token'

const sides = ['party', 'ally', 'enemy'] as const
const stats = ['dealt', 'taken', 'healed'] as const
type Fate = 'standing' | 'downed' | 'defeated' | 'dead'

const fateOf = (row: SummaryRow): Fate =>
  row.defeated
    ? row.kind === 'character'
      ? 'dead'
      : 'defeated'
    : row.downed
      ? 'downed'
      : 'standing'

const FateIcon = ({ fate }: { fate: Fate }) => {
  const Icon = fate === 'standing' ? ShieldCheck : fate === 'downed' ? HeartCrack : Skull
  return <Icon size={18} aria-hidden="true" />
}

/**
 * End-of-combat recap (RYT-042): the rounds fought, who hit hardest, then each side as a ledger of
 * damage dealt, taken and healed with each combatant's fate. Shown in the table view to Players
 * and the DM, and in the DM console. Players and the table receive only visible combatants.
 */
export function CombatSummary({
  encounter,
  combatants,
  large = false,
}: {
  encounter: Encounter
  /** The projection's combatants: their tokens sit beside the names (RYT-043). */
  combatants: readonly Combatant[]
  large?: boolean
}) {
  const { t } = useTranslation()
  // Both views may be mounted at once (DM): ids stay unique per summary.
  const baseId = useId()
  const summary = encounter.summary
  if (!summary) return null
  const byId = new Map(combatants.map((c) => [c.id, c]))
  const rows = summary.combatants.filter((row) => row.kind !== 'lair')
  const top = rows
    .filter((row) => row.side !== 'enemy' && row.damage_dealt > 0)
    .reduce<SummaryRow | null>(
      (best, row) => (!best || row.damage_dealt > best.damage_dealt ? row : best),
      null,
    )
  return (
    <section
      className={`combat-recap${large ? ' is-large' : ''}`}
      aria-labelledby={`${baseId}-title`}
    >
      <header className="combat-recap-head">
        {/* Focus lands here when the fight ends while a dialog was open (RYT-042 R2-2). */}
        <Title order={2} id={`${baseId}-title`} className="combat-recap-title" tabIndex={-1}>
          {t('combat.summary.title')}
        </Title>
        <p className="combat-recap-rounds">
          <span className="combat-recap-count">{summary.rounds}</span>
          <span>{t('combat.summary.roundsLabel', { count: summary.rounds })}</span>
        </p>
      </header>
      {top && (
        <p className="combat-recap-top">
          <Swords size={20} aria-hidden="true" />
          <span>{t('combat.summary.top', { name: top.name, amount: top.damage_dealt })}</span>
        </p>
      )}
      {sides.map((side) => {
        const group = rows.filter((row) => row.side === side)
        if (group.length === 0) return null
        const titleId = `${baseId}-${side}`
        return (
          <section key={side} className="combat-recap-side" aria-labelledby={titleId}>
            <Title order={3} id={titleId} className="combat-recap-side-title">
              {t(`combat.summary.side.${side}`)}
            </Title>
            {/* From 40em the rows form a ledger with one header per side; each row keeps its own
                (visually hidden there) labels for assistive tech. */}
            <div className="combat-recap-cols" aria-hidden="true">
              <span />
              <span className="combat-recap-cols-stats">
                {stats.map((stat) => (
                  <span key={stat}>{t(`combat.summary.${stat}`)}</span>
                ))}
              </span>
            </div>
            <ul className="combat-recap-list">
              {group.map((row) => {
                const fate = fateOf(row)
                const combatant = byId.get(row.combatant_id)
                return (
                  <li key={row.combatant_id} className={`combat-recap-row is-${fate}`}>
                    <div className="combat-recap-who">
                      <Token
                        name={row.name}
                        side={side}
                        imageKind={row.kind === 'character' ? 'character' : 'creature'}
                        path={combatant?.image_path}
                        defeated={fate === 'dead' || fate === 'defeated'}
                        viewable
                      />
                      <div className="combat-recap-id">
                        <Text component="span" className="combat-recap-name">
                          {row.name}
                        </Text>
                        <span className="combat-recap-fate">
                          <FateIcon fate={fate} />
                          {t(`combat.summary.fate.${fate}`)}
                        </span>
                      </div>
                    </div>
                    <dl className="combat-recap-stats">
                      {stats.map((stat) => {
                        const amount =
                          stat === 'dealt'
                            ? row.damage_dealt
                            : stat === 'taken'
                              ? row.damage_taken
                              : row.healing
                        return (
                          <div key={stat} className={amount === 0 ? 'is-zero' : undefined}>
                            <dt>{t(`combat.summary.${stat}`)}</dt>
                            <dd>{amount}</dd>
                          </div>
                        )
                      })}
                    </dl>
                  </li>
                )
              })}
            </ul>
          </section>
        )
      })}
      <Text size="sm" c="dimmed">
        {t('combat.summary.attribution')}
      </Text>
    </section>
  )
}
