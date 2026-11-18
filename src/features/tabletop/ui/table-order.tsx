import { useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { ChevronRight, EyeOff, Skull } from 'lucide-react'
import { CombatantToken, type Combatant } from '@/features/combat'
import { nameOverflows, orderLayout } from '../domain/table-order'

type Props = {
  name: string
  status: 'initiative' | 'active'
  round: number
  /** The order to show: turn order while fighting, everyone who joined while initiative is collected. */
  order: readonly Combatant[]
  active: Combatant | null
  next: Combatant | null
  hiddenTurn: boolean
  ready: { ready: number; total: number }
  stale: boolean
  width: number
}

/**
 * The table screen without a map (RYT-131): no app chrome, the acting creature and the next one in
 * large type, then the whole order in two or three columns that read down and across. The acting
 * row carries a chevron, a heavier weight and a ruled bar as well as the accent, so it never rests
 * on colour alone, and it is scrolled into view when the order is longer than the screen.
 */
export function TableOrder({
  name,
  status,
  round,
  order,
  active,
  next,
  hiddenTurn,
  ready,
  stale,
  width,
}: Props) {
  const { t } = useTranslation()
  const { columns, rows } = orderLayout(order.length, width)
  const activeRow = useRef<HTMLLIElement>(null)
  const list = useRef<HTMLOListElement>(null)
  const names = order.map((c) => c.name).join('|')
  const activeId = active?.id ?? null
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    activeRow.current?.scrollIntoView({ block: 'nearest', behavior: reduced ? 'auto' : 'smooth' })
  }, [activeId])

  // A name takes the smaller type only when it does not fit at the normal size, in the row it has
  // now: measured with words kept whole, again whenever the list is resized. The attribute is set
  // here and not by React, so a re-render never undoes it.
  useLayoutEffect(() => {
    const root = list.current
    if (!root) return
    const measure = () => {
      for (const el of root.querySelectorAll<HTMLElement>('.tt-order-name')) {
        el.removeAttribute('data-long')
        el.setAttribute('data-measuring', '')
        const fit = {
          clientWidth: el.clientWidth,
          scrollWidth: el.scrollWidth,
          height: el.getBoundingClientRect().height,
          lineHeight: parseFloat(getComputedStyle(el).lineHeight),
        }
        if (nameOverflows(fit)) el.setAttribute('data-long', '')
        el.removeAttribute('data-measuring')
      }
    }
    // Row type is sized from the list's height, which settles over a few frames as the status bar
    // and the keys arrive: measure again once it has.
    let frame = 0
    const settle = () => {
      measure()
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        frame = requestAnimationFrame(measure)
      })
    }
    settle()
    const observer = new ResizeObserver(settle)
    observer.observe(root)
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [names, columns, rows])

  return (
    <section className={`tt-order${stale ? ' is-stale' : ''}`} aria-labelledby="tt-order-title">
      <header className="tt-order-head">
        <div className="tt-order-fight">
          <h1 id="tt-order-title">{name}</h1>
          <p>
            {status === 'initiative'
              ? t('combat.table.ready', { ready: ready.ready, total: ready.total })
              : t('tabletop.table.round', { round })}
          </p>
        </div>
        {status === 'initiative' ? (
          <div className="tt-order-now">
            <p className="tt-order-label">{t('combat.table.rolling')}</p>
          </div>
        ) : hiddenTurn ? (
          <div className="tt-order-now">
            <p className="tt-order-label">{t('combat.turn.now')}</p>
            <p className="tt-order-actor is-hidden-turn">
              <EyeOff aria-hidden="true" />
              {t('tabletop.table.hiddenTurn')}
            </p>
          </div>
        ) : (
          <>
            <div className="tt-order-now">
              {active && <CombatantToken combatant={active} showActive={false} />}
              <div>
                <p className="tt-order-label">{t('combat.turn.now')}</p>
                <p className="tt-order-actor">{active?.name ?? '—'}</p>
              </div>
            </div>
            {next && (
              <div className="tt-order-next">
                <CombatantToken combatant={next} showActive={false} />
                <div>
                  <p className="tt-order-label">{t('combat.turn.upNext')}</p>
                  <p className="tt-order-after">{next.name}</p>
                </div>
              </div>
            )}
          </>
        )}
      </header>
      <ol
        ref={list}
        className="tt-order-list"
        // A long order scrolls; the keyboard can reach it.
        tabIndex={0}
        aria-label={t('combat.order.title')}
        style={{ '--tt-cols': columns, '--tt-rows': rows } as CSSProperties}
      >
        {order.map((c) => {
          const isActive = c.id === activeId
          const down = c.defeated
          return (
            <li
              key={c.id}
              ref={isActive ? activeRow : undefined}
              className={`tt-order-row${isActive ? ' is-active' : ''}${down ? ' is-defeated' : ''}`}
              aria-current={isActive ? 'step' : undefined}
            >
              <span className="tt-order-mark" aria-hidden="true">
                {isActive && <ChevronRight strokeWidth={3} />}
              </span>
              <CombatantToken combatant={c} showActive={false} />
              <span className="tt-order-name" title={c.name}>
                {c.name}
              </span>
              {down && (
                <span className="tt-order-state">
                  <Skull aria-hidden="true" />
                  {t('combat.defeated')}
                </span>
              )}
              {c.initiative !== undefined && (
                <span className="tt-order-initiative">
                  <span className="visually-hidden">
                    {t('tabletop.table.initiativeValue', { count: c.initiative })}
                  </span>
                  <span aria-hidden="true">{c.initiative}</span>
                </span>
              )}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
