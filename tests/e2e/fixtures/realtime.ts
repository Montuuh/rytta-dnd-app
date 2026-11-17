import type { Page, WebSocketRoute } from '@playwright/test'

/**
 * Minimal Supabase Realtime (Phoenix, serializer 2.0.0) server for the browser contract tests.
 * Channels join successfully, so the app observes SUBSCRIBED; `drop()` closes every socket and
 * refuses new ones, which the app observes as a closed or errored channel.
 */
export async function realtimeFixture(page: Page, options: { up?: boolean } = {}) {
  let up = options.up !== false
  const sockets = new Set<WebSocketRoute>()
  const joins: string[] = []
  await page.routeWebSocket(/\/realtime\/v1\/websocket/, (ws) => {
    if (!up) {
      void ws.close({ code: 1013, reason: 'fixture realtime unavailable' })
      return
    }
    sockets.add(ws)
    const send = (frame: unknown[]) => ws.send(JSON.stringify(frame))
    ws.onClose(() => sockets.delete(ws))
    ws.onMessage((raw) => {
      const [joinRef, ref, topic, event, payload] = JSON.parse(String(raw)) as [
        string | null,
        string | null,
        string,
        string,
        { config?: { postgres_changes?: Record<string, unknown>[] } },
      ]
      if (event === 'phx_join') {
        joins.push(topic)
        const changes = (payload.config?.postgres_changes ?? []).map((filter, i) => ({
          id: i + 1,
          ...filter,
        }))
        send([
          joinRef,
          ref,
          topic,
          'phx_reply',
          { status: 'ok', response: { postgres_changes: changes } },
        ])
      } else if (event === 'heartbeat' || event === 'phx_leave') {
        send([joinRef, ref, topic, 'phx_reply', { status: 'ok', response: {} }])
      }
    })
  })
  return {
    joins,
    connected: () => sockets.size > 0,
    /** Realtime goes away: open sockets close and reconnection attempts are refused. */
    async drop() {
      up = false
      await Promise.all([...sockets].map((ws) => ws.close({ code: 1011, reason: 'fixture drop' })))
      sockets.clear()
    },
  }
}
