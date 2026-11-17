import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { Ban, Check, Ellipsis, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { artUrl } from '@/shared/ui/art-url'
import { voteMark, type RestParticipant, type VoteMark } from '../domain/rest'
import { pickLayout, seatPoints } from '../domain/campfire-layout'
import { PersonToken } from './person-token'

const icons = { yes: Check, no: X, wait: Ellipsis, cannot: Ban }

/**
 * RYT-080 "Hoguera": everyone at the table sits around the fire; each portrait's ring carries the
 * vote. The list is real markup (names and votes are read out); the arc is only placement.
 */
export function Campfire({
  campaignId,
  participants,
  yes,
  total,
}: {
  campaignId: string
  participants: RestParticipant[]
  yes: number
  total: number
}) {
  const { t } = useTranslation()
  const count = participants.length
  const [largeText] = useState(() => {
    try {
      return parseFloat(getComputedStyle(document.documentElement).fontSize) > 18
    } catch {
      return false
    }
  })
  // The scene's width decides whether the seats fit; until it is measured the seats flow in rows.
  const fire = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const node = fire.current
    if (!node) return
    const measure = () => setWidth(Math.round(node.clientWidth))
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const layout = pickLayout(count, largeText, width)
  const size = layout === 'arc' ? 56 : 48
  const word: Record<VoteMark, string> = {
    yes: t('rest.vote.yes'),
    no: t('rest.vote.no'),
    wait: t('rest.vote.wait'),
    cannot: t('rest.vote.cannot'),
  }
  // Seat boxes are fixed-size (text clipped in CSS), so these pixel centres cannot overlap.
  const points =
    layout === 'rows'
      ? []
      : seatPoints(layout, count, { width, height: layout === 'ring' ? width : 250 })
  const place = (index: number) => {
    const point = layout === 'rows' ? undefined : points[index]
    return point && { left: `${point.x}px`, top: `${point.y}px` }
  }
  return (
    <div className="rest-camp">
      <div
        ref={fire}
        className="rest-fire"
        data-count={count}
        data-layout={layout}
        // The painted scene is the backdrop; a fixed dark scrim keeps the ink AA in every theme.
        style={{ '--fire-art': `url(${artUrl('scenes/campfire')})` } as CSSProperties}
      >
        <ul className="rest-seats" aria-label={t('rest.status', { yes, total })}>
          {participants.map((person, index) => {
            const mark = voteMark(person)
            const Icon = icons[mark]
            return (
              <li
                key={person.id}
                className="rest-seat"
                data-mark={mark}
                data-own={person.own || undefined}
                style={place(index)}
              >
                <span className="rest-seat-face">
                  <PersonToken
                    campaignId={campaignId}
                    characterId={person.id}
                    name={person.name}
                    size={size}
                    viewable
                  />
                  <span className="rest-seat-mark" aria-hidden="true">
                    <Icon size={12} strokeWidth={3} />
                  </span>
                </span>
                <span className="rest-seat-name user-copy">
                  {person.own ? t('rest.you') : person.name}
                </span>
                <span className="rest-seat-vote">{word[mark]}</span>
              </li>
            )
          })}
        </ul>
      </div>
      <p className="rest-hearth" aria-hidden="true">
        <span className="rest-hearth-count">{t('rest.tally', { yes, total })}</span>
        <span className="rest-hearth-hint">{t('rest.tallyHint')}</span>
      </p>
    </div>
  )
}
