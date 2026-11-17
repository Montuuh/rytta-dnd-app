import { useEffect, useState } from 'react'
import { z } from 'zod'
import type { CartLine } from '../domain/shops'

export type StoredCart = {
  carts: Record<string, CartLine[]>
  notes: Record<string, string>
}

const lineSchema = z.object({
  listingId: z.string().min(1).max(64),
  quantity: z.number().int().min(1).max(999),
  offeredPrice: z.number().min(0).max(100_000_000).nullable(),
})
const storedSchema = z.object({
  carts: z.record(z.string(), z.array(lineSchema).max(100)),
  notes: z.record(z.string(), z.string().max(500)),
})

const empty = (): StoredCart => ({ carts: {}, notes: {} })

/** RYT-125: one cart per campaign and character, kept for the tab session (never in localStorage). */
const storageKey = (campaignId: string, characterId: string | null) =>
  `rytta-cart:${campaignId}:${characterId ?? ''}`

function read(key: string): StoredCart {
  try {
    const raw = window.sessionStorage.getItem(key)
    const parsed = raw ? storedSchema.safeParse(JSON.parse(raw)) : null
    return parsed?.success ? parsed.data : empty()
  } catch {
    return empty()
  }
}

function write(key: string, value: StoredCart) {
  try {
    const hasLines = Object.values(value.carts).some((lines) => lines.length > 0)
    if (hasLines) window.sessionStorage.setItem(key, JSON.stringify(value))
    else window.sessionStorage.removeItem(key)
  } catch {
    /* Private mode or a full quota: the cart still works in memory. */
  }
}

/**
 * The cart state of the storefront, restored after a reload and kept per character. What comes
 * back is only a candidate: the storefront reconciles every line against the current listing
 * (vanished items drop out, quantities clamp to the stock), so a stale cart never charges more.
 */
export function useStoredCart(campaignId: string, characterId: string | null) {
  const key = storageKey(campaignId, characterId)
  const [state, setState] = useState(() => ({ key, saved: read(key) }))
  let current = state
  if (state.key !== key) {
    current = { key, saved: read(key) }
    setState(current)
  }
  useEffect(() => {
    write(current.key, current.saved)
  }, [current.key, current.saved])
  const setCart = (shopId: string, lines: CartLine[]) =>
    setState((prior) => ({
      key: prior.key,
      saved: { ...prior.saved, carts: { ...prior.saved.carts, [shopId]: lines } },
    }))
  const setNote = (shopId: string, note: string) =>
    setState((prior) => ({
      key: prior.key,
      saved: { ...prior.saved, notes: { ...prior.saved.notes, [shopId]: note } },
    }))
  return { carts: current.saved.carts, notes: current.saved.notes, setCart, setNote }
}
