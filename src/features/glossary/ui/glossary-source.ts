import { useMemo } from 'react'
import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ruleBodiesQuery,
  ruleIndexQuery,
  rulePacksQuery,
  srdRuleBodiesQuery,
  srdRuleIndexQuery,
} from '../api'
import { localizeIndexes, ruleCategories, unlistedIds, type ClassRow } from '../domain/packs'
import type { EntryBodies, GlossaryLanguage, IndexRow } from '../domain/types'

export type GlossarySource = {
  /** Undefined until every index part has loaded. */
  rows: IndexRow[] | undefined
  /** Ids the campaign no longer offers: readable, but left out of lists, search and links. */
  unlisted: ReadonlySet<string>
  /** RYT-168: the classes and subclasses of the packs; undefined until the index loads. */
  classRows: ClassRow[] | undefined
  bodies: EntryBodies | undefined
  indexError: boolean
  bodiesError: boolean
  retry: () => void
}

const none: ReadonlySet<string> = new Set()
const merge = (parts: (EntryBodies | undefined)[]) =>
  parts.every(Boolean) ? (Object.assign({}, ...parts) as EntryBodies) : undefined

/**
 * Where the glossary reads its SRD-side entries (RYT-164, RYT-165, RYT-167, ADR 051):
 * - a campaign: the spells, classes and rules packs it has, at its pinned versions;
 * - outside a campaign, with or without an account: the published SRD pack.
 * The SRD is not bundled any more: without the library (or without a backend) the glossary says so
 * and offers a retry.
 */
export function useGlossarySource(options: {
  live: boolean
  userId: string | undefined
  campaignId: string | null
  language: GlossaryLanguage
  wantBodies: boolean
}): GlossarySource {
  const { live, userId, campaignId, language, wantBodies } = options
  const cache = useQueryClient()
  const inCampaign = live && Boolean(userId) && Boolean(campaignId)
  // Without a backend (the offline preview build) there is no library to read.
  const standalone = live && !inCampaign
  const user = userId ?? ''
  const campaign = campaignId ?? ''

  const packs = useQuery({ ...rulePacksQuery(user, campaign), enabled: inCampaign })
  const packList = useMemo(() => packs.data ?? [], [packs.data])
  const indexes = useQueries({
    queries: packList.map((pack) => ({
      ...ruleIndexQuery(user, campaign, pack),
      enabled: inCampaign,
    })),
  })
  const packBodies = useQueries({
    queries: packList.map((pack) => ({
      ...ruleBodiesQuery(user, campaign, pack, language),
      enabled: inCampaign && wantBodies,
    })),
  })
  const srdIndexes = useQueries({
    queries: ruleCategories.map((category) => ({
      ...srdRuleIndexQuery(user, category),
      enabled: standalone,
    })),
  })
  const srdBodies = useQueries({
    queries: ruleCategories.map((category) => ({
      ...srdRuleBodiesQuery(user, category, language),
      enabled: standalone && wantBodies,
    })),
  })

  // useQueries returns new arrays on every render: memoize on what they hold.
  const indexData = indexes.map((q) => q.data)
  const indexKey = indexes.map((q) => q.dataUpdatedAt).join()
  const srdKey = srdIndexes.map((q) => q.dataUpdatedAt).join()
  const bodiesKey = packBodies.map((q) => q.dataUpdatedAt).join()
  const srdBodiesKey = srdBodies.map((q) => q.dataUpdatedAt).join()

  // Pack rows with each pack's own classes referenced as `<ref>--<key>` (RYT-168).
  const localized = useMemo(
    () => (inCampaign && packs.data ? localizeIndexes(packList, indexData) : []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inCampaign, packList, indexKey],
  )
  const rows = useMemo(() => {
    if (inCampaign) {
      if (!packs.data || localized.some((d) => !d)) return undefined
      return localized.flatMap((d) => d!.rows)
    }
    if (srdIndexes.some((q) => !q.data)) return undefined
    return srdIndexes.flatMap((q) => q.data!.rows)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inCampaign, packs.data, localized, srdKey])
  const classRows = useMemo(() => {
    if (inCampaign) {
      if (!packs.data || localized.some((d) => !d)) return undefined
      const hidden = unlistedIds(packList, indexData)
      return localized.flatMap((d, at) => {
        const pack = packList[at]!
        return d!.classRows.map((row) => ({
          ...row,
          ...(hidden.has(row.id) ? { hidden: true } : {}),
          ...(pack.srd ? {} : { pack: { title_en: pack.title_en, title_es: pack.title_es } }),
        }))
      })
    }
    if (srdIndexes.some((q) => !q.data)) return undefined
    return srdIndexes.flatMap((q) => q.data!.classRows)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inCampaign, packs.data, packList, localized, srdKey])
  const unlisted = useMemo(
    () => (inCampaign && packs.data ? unlistedIds(packList, indexData) : none),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [inCampaign, packList, indexKey],
  )
  const bodies = useMemo(() => {
    if (inCampaign) return packList.length ? merge(packBodies.map((q) => q.data)) : {}
    return merge(srdBodies.map((q) => q.data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inCampaign, packList, bodiesKey, srdBodiesKey])

  const indexError = inCampaign
    ? packs.isError || indexes.some((q) => q.isError)
    : srdIndexes.some((q) => q.isError)
  const bodiesError = (inCampaign ? packBodies : srdBodies).some((q) => q.isError)
  return {
    rows,
    unlisted,
    classRows,
    bodies,
    indexError,
    bodiesError,
    retry: () => {
      void cache.invalidateQueries({ queryKey: ['glossary'] })
      if (inCampaign && packs.isError) void packs.refetch()
      for (const q of [...indexes, ...packBodies, ...srdIndexes, ...srdBodies])
        if (q.isError) void q.refetch()
    },
  }
}
