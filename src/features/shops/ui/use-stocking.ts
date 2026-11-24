import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useAuth } from '@/features/auth'
import {
  campaignItemCatalogueQuery,
  toImportItem,
  useBasicImport,
  type BasicItem,
  type ImportResult,
} from '@/features/inventory'
import { newRequestId } from '@/shared/lib/request-id'
import { addListings, changeShop } from '../data/repository'
import { shopAdminQuery } from '../api'
import { draftOf, ShopError, type ShopDraft } from '../domain/shops'
import { chunks, importBatch, listingBatch, listingPlan, stockLanguage } from '../domain/stocking'

export type StockStep = 'shop' | 'items' | 'listings'

/** The inventory import's error codes, as shop errors. */
const importFailure = (failure: unknown) => {
  const code = failure instanceof Error ? failure.message : ''
  return new ShopError(
    code === 'forbidden' ? 'forbidden' : code === 'cents' ? 'cents' : 'unavailable',
  )
}
export type StockOutcome = { shopId: string; listed: number; unavailable: BasicItem[] }

/**
 * RYT-107: create a shop (optional) and stock it from catalogue items, step by step. Each step
 * keeps its request id for the same payload, and a created shop is remembered, so a retry after
 * a failure only finishes what is missing: the shop is never created twice and, because both
 * server calls skip what exists, stock is never duplicated.
 */
export function useShopStocking(campaignId: string) {
  const { i18n } = useTranslation()
  const { state, controller } = useAuth()
  const userId = state.user?.id
  const cache = useQueryClient()
  const importer = useBasicImport(campaignId)
  const [step, setStep] = useState<StockStep | null>(null)
  const [error, setError] = useState<ShopError | null>(null)
  const [shopId, setShopId] = useState<string | null>(null)
  const requests = useRef(new Map<string, string>())
  const created = useRef<string | null>(null)
  const requestFor = (scope: string, payload: unknown) => {
    const key = `${scope}:${JSON.stringify(payload)}`
    let id = requests.current.get(key)
    if (!id) {
      id = newRequestId()
      requests.current.set(key, id)
    }
    return id
  }
  const guard = () => {
    if (!navigator.onLine || !userId || controller?.getSnapshot().user?.id !== userId)
      throw new ShopError('unavailable')
  }

  /**
   * An existing shop stocked from a type takes that type as its kind. The save reads the shop
   * afresh and is revision-checked, so it never overwrites a change made meanwhile; when it
   * cannot be saved the stock stays and the kind can be set again from the shop panel.
   */
  const saveKind = async (shopId: string, kind: string) => {
    try {
      const admin = await cache.fetchQuery({ ...shopAdminQuery(userId!, campaignId), staleTime: 0 })
      const shop = admin.shops.find((entry) => entry.id === shopId)
      if (!shop || shop.kind === kind) return
      const draft = { ...draftOf(shop), kind }
      await changeShop(campaignId, {
        kind: 'saveShop',
        shopId,
        revision: shop.revision,
        draft,
        requestId: requestFor(`kind:${shopId}:${shop.revision}`, draft),
      })
    } catch {
      // The stock is what was asked for; the kind is a label the DM can still pick.
    }
  }

  const run = async (
    target: { create: ShopDraft } | { shopId: string; kind?: string },
    items: readonly BasicItem[],
  ): Promise<StockOutcome | null> => {
    setError(null)
    try {
      guard()
      let id = 'shopId' in target ? target.shopId : created.current
      if (!id && 'create' in target) {
        setStep('shop')
        const result = await changeShop(campaignId, {
          kind: 'saveShop',
          shopId: null,
          revision: null,
          draft: target.create,
          requestId: requestFor('shop', target.create),
        })
        if (!result.id) throw new ShopError('unavailable')
        id = result.id
        created.current = id
        setShopId(id)
      }
      if (!id) throw new ShopError('unavailable')
      let listed = 0
      let unavailable: BasicItem[] = []
      if (items.length > 0) {
        setStep('items')
        guard()
        const language = stockLanguage(i18n.language)
        const { descriptions } = await cache.fetchQuery(
          campaignItemCatalogueQuery(userId!, campaignId),
        )
        const results: ImportResult[] = []
        for (const batch of chunks(items, importBatch)) {
          const payload = batch.map((item) => toImportItem(item, language, descriptions))
          results.push(
            await importer
              .mutateAsync({ items: payload, requestId: requestFor('import', payload) })
              .catch((failure: unknown) => {
                throw importFailure(failure)
              }),
          )
        }
        const plan = listingPlan(items, results)
        unavailable = plan.unavailable
        setStep('listings')
        for (const batch of chunks(plan.listings, listingBatch)) {
          guard()
          const result = await addListings(
            campaignId,
            id,
            batch,
            requestFor(`listings:${id}`, batch),
          )
          listed += result.created_count
        }
      }
      if ('shopId' in target && target.kind) await saveKind(target.shopId, target.kind)
      created.current = null
      requests.current.clear()
      return { shopId: id, listed, unavailable }
    } catch (failure) {
      setError(failure instanceof ShopError ? failure : new ShopError('unavailable'))
      return null
    } finally {
      setStep(null)
      if (userId && controller?.getSnapshot().user?.id === userId)
        await cache.invalidateQueries({ queryKey: ['private', userId, 'campaign', campaignId] })
    }
  }
  /** The shop exists but its stock is not finished: a retry only stocks it. */
  return { run, step, error, createdShopId: shopId, busy: step !== null }
}
