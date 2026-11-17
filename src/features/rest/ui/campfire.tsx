import { useState, type CSSProperties } from 'react'
import { Ban, Check, Ellipsis, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { artUrl } from '@/shared/ui/art-url'
import { voteMark, type RestParticipant, type VoteMark } from '../domain/rest'
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
  const layout = count <= 4 ? 'arc' : count <= 8 && !largeText ? 'ring' : ('rows' as const)
  const size = layout === 'arc' ? 56 : 48
  const word: Record<VoteMark, string> = {
    yes: t('rest.vote.yes'),
    no: t('rest.vote.no'),
    wait: t('rest.vote.wait'),
    cannot: t('rest.vote.cannot'),
  }
  // Arc: the upper half, left to right. Ring: the whole circle from the top. Rows: no placement.
  const place = (index: number) => {
    if (layout === 'rows') return undefined
    const angle =
      layout === 'ring'
        ? -Math.PI / 2 + (2 * Math.PI * index) / count
        : Math.PI * (count === 1 ? 1.5 : 1.08 + (0.84 * index) / (count - 1))
    const [cx, cy, rx, ry] = layout === 'ring' ? [50, 55, 37, 33] : [50, 72, 38, 50]
    return { left: `${cx + rx * Math.cos(angle)}%`, top: `${cy + ry * Math.sin(angle)}%` }
  }
  return (
    <div className="rest-camp">
      <div
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
