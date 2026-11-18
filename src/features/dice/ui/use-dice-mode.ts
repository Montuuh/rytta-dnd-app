import { useCallback, useSyncExternalStore } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useAuth } from '@/features/auth'
import { campaignsQuery, type DiceMode, type RollVisibility } from '@/features/campaigns'
import {
  diceBehaviour,
  diceChoiceKey,
  readDiceChoice,
  type DiceBehaviour,
  type DiceChoice,
} from '../domain/mode'

const listeners = new Set<() => void>()
const subscribe = (notify: () => void) => {
  listeners.add(notify)
  window.addEventListener('storage', notify)
  return () => {
    listeners.delete(notify)
    window.removeEventListener('storage', notify)
  }
}
// Where the browser blocks storage (private mode, a strict policy) the choice is kept here for the
// session, so the control still works until the page closes.
const session = new Map<string, string>()
const read = (key: string) => {
  try {
    return localStorage.getItem(key) ?? session.get(key) ?? ''
  } catch {
    return session.get(key) ?? ''
  }
}

/**
 * RYT-133: the one place that decides how this device rolls. The campaign's dice mode wins; when
 * the DM left it to each Player, the choice lives on this device (localStorage, per account and
 * campaign; in memory for the session where storage is blocked) and is physical dice until the Player chooses. Initiative, hit dice and the sheet all
 * read this, so a table never meets two dice behaviours.
 */
export function useDiceMode(campaignId: string): {
  mode: DiceMode
  visibility: RollVisibility
  behaviour: DiceBehaviour
  choice: DiceChoice
  setChoice: (next: DiceBehaviour) => void
} {
  const { state } = useAuth()
  const userId = state.user?.id ?? ''
  const campaigns = useQuery({ ...campaignsQuery(userId), enabled: Boolean(userId) })
  const campaign = campaigns.data?.find((item) => item.id === campaignId)
  const mode = campaign?.dice_mode ?? 'physical'
  const key = diceChoiceKey(userId, campaignId)
  const stored = useSyncExternalStore(subscribe, () => read(key))
  const choice = readDiceChoice(stored || null)
  const setChoice = useCallback(
    (next: DiceBehaviour) => {
      session.set(key, next)
      try {
        localStorage.setItem(key, next)
      } catch {
        // Blocked storage: the in-memory copy above carries the choice for this session.
      }
      for (const notify of listeners) notify()
    },
    [key],
  )
  return {
    mode,
    visibility: campaign?.roll_visibility ?? 'roller_dm',
    behaviour: diceBehaviour(mode, choice),
    choice,
    setChoice,
  }
}
