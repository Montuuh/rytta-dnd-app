import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  nextAnnouncement,
  sameTurn,
  turnAnnouncement,
  type Announcement,
  type TurnMark,
} from '../domain/table-order'

/**
 * The sentence for the table screen's live region: one per turn change, never for the first state
 * after the screen opens (what is already on screen is not news). `loaded` is false until the first
 * projection arrives. The region is emptied for a moment before each sentence, so two turns with the
 * same words (two creatures with one name) are both read out.
 */
export function useTurnAnnouncement(mark: TurnMark | null, loaded: boolean) {
  const { t } = useTranslation()
  const [seen, setSeen] = useState<{ mark: TurnMark | null } | null>(null)
  const [announcement, setAnnouncement] = useState<Announcement>({ text: '', seq: 0 })
  const [shown, setShown] = useState('')
  if (loaded && seen === null) setSeen({ mark })
  else if (seen !== null && !sameTurn(seen.mark, mark)) {
    setSeen({ mark })
    const next = turnAnnouncement(seen.mark, mark, (key, params) => t(key, params))
    if (next) setAnnouncement((previous) => nextAnnouncement(previous, next))
  }
  useEffect(() => {
    if (announcement.seq === 0) return
    const timer = window.setTimeout(() => setShown(announcement.text), 80)
    return () => window.clearTimeout(timer)
  }, [announcement])
  // Emptied as soon as a new sentence is queued (render-phase adjustment).
  const [queued, setQueued] = useState(announcement.seq)
  if (queued !== announcement.seq) {
    setQueued(announcement.seq)
    setShown('')
  }
  return shown
}
