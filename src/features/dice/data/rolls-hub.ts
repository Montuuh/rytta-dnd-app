import { z } from 'zod'

type Channel = {
  on: (type: 'postgres_changes', filter: Record<string, string>, callback: () => void) => Channel
  subscribe: (callback: (status: string) => void) => Channel
}
export type RollsRealtime = {
  channel: (topic: string) => Channel
  removeChannel: (channel: Channel) => unknown
}
type Tracker = { set: (up: boolean) => void; release: () => void }

/**
 * One realtime subscription per campaign for every listener of the roll signal (the recent-rolls
 * strip, the one-roll state of each screen). The realtime client hands out the same channel for a
 * topic, and a channel that is already subscribed refuses new `postgres_changes` bindings, so a
 * second subscriber on its own would silently lose realtime. Here the first listener opens the
 * channel, the others share it, and the last one leaving removes it.
 */
export function createRollsHub(
  connect: () => Promise<{ db: RollsRealtime; schema: string }>,
  track: (campaignId: string) => Tracker,
) {
  type Entry = {
    listeners: Set<() => void>
    status: Tracker
    stop?: () => void
    closed: boolean
  }
  const entries = new Map<string, Entry>()

  function open(campaignId: string, entry: Entry) {
    void (async () => {
      try {
        const { db, schema } = await connect()
        const campaign = z.uuid().parse(campaignId)
        const notify = () => {
          for (const listener of [...entry.listeners]) listener()
        }
        const channel = db
          .channel(`rolls:${campaign}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema,
              table: 'campaign_roll_signals',
              filter: `campaign_id=eq.${campaign}`,
            },
            notify,
          )
          .subscribe((next) => {
            if (entry.closed) return
            // Up: a (re)connection may have missed rolls. Down: the fast poll must start at once.
            entry.status.set(next === 'SUBSCRIBED')
            notify()
          })
        entry.stop = () => void db.removeChannel(channel)
        if (entry.closed) entry.stop()
      } catch {
        // Polling keeps the screens fresh without realtime.
      }
    })()
  }

  return function subscribe(campaignId: string, onChange: () => void) {
    let entry = entries.get(campaignId)
    if (!entry) {
      entry = { listeners: new Set(), status: track(campaignId), closed: false }
      entries.set(campaignId, entry)
      entry.listeners.add(onChange)
      open(campaignId, entry)
    } else entry.listeners.add(onChange)
    const mine = entry
    return () => {
      if (!mine.listeners.delete(onChange) || mine.listeners.size > 0) return
      mine.closed = true
      mine.status.release()
      mine.stop?.()
      if (entries.get(campaignId) === mine) entries.delete(campaignId)
    }
  }
}
