import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { sameTurn, turnAnnouncement, type TurnMark } from '../domain/table-order'

/**
 * The sentence for the table screen's live region: one per turn change, never for the first state
 * after the screen opens (what is already on screen is not news). `loaded` is false until the first
 * projection arrives.
 */
export function useTurnAnnouncement(mark: TurnMark | null, loaded: boolean) {
  const { t } = useTranslation()
  const [seen, setSeen] = useState<{ mark: TurnMark | null } | null>(null)
  const [text, setText] = useState('')
  if (loaded && seen === null) setSeen({ mark })
  else if (seen !== null && !sameTurn(seen.mark, mark)) {
    setSeen({ mark })
    const next = turnAnnouncement(seen.mark, mark, (key, params) => t(key, params))
    if (next) setText(next)
  }
  return text
}
