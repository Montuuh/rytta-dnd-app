import { z } from 'zod'
import { config } from '@/shared/lib/config'
import {
  campaignContentSchema,
  contentChangesSchema,
  contentChoicesSchema,
  contentEntriesSchema,
  contentError,
  packChangesSchema,
  type ContentCategory,
} from '../domain/content'

async function client() {
  if (config.VITE_DATA_MODE !== 'supabase') throw new Error('Demo is read-only')
  const { getSupabase } = await import('@/shared/api/supabase')
  return getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
}
const uuid = (value: string) => z.uuid().parse(value)

/** RYT-162: the packs offered to a campaign and what it uses of each, by category. */
export async function getCampaignContent(campaignId: string, signal: AbortSignal) {
  const { data, error } = await (
    await client()
  )
    .rpc('get_campaign_content', { target_campaign: uuid(campaignId) })
    .abortSignal(signal)
  if (error) throw new Error(contentError(error.message))
  return campaignContentSchema.parse(data)
}

export async function setCampaignContent(
  campaignId: string,
  packId: string,
  category: ContentCategory,
  enabled: boolean,
) {
  const { data, error } = await (
    await client()
  ).rpc('set_campaign_content', {
    target_campaign: uuid(campaignId),
    target_pack: uuid(packId),
    target_category: category,
    enabled,
  })
  if (error) throw new Error(contentError(error.message))
  return campaignContentSchema.parse(data)
}

export async function getContentChanges(
  campaignId: string,
  packId: string,
  category: ContentCategory,
  signal: AbortSignal,
) {
  const { data, error } = await (
    await client()
  )
    .rpc('get_campaign_content_changes', {
      target_campaign: uuid(campaignId),
      target_pack: uuid(packId),
      target_category: category,
    })
    .abortSignal(signal)
  if (error) throw new Error(contentError(error.message))
  return contentChangesSchema.parse(data)
}

export async function updateCampaignContent(
  campaignId: string,
  packId: string,
  category: ContentCategory,
  version: number,
) {
  const { data, error } = await (
    await client()
  ).rpc('update_campaign_content', {
    target_campaign: uuid(campaignId),
    target_pack: uuid(packId),
    target_category: category,
    expected_version: version,
  })
  if (error) throw new Error(contentError(error.message))
  return campaignContentSchema.parse(data)
}

export async function listContentEntries(
  campaignId: string,
  packId: string,
  category: ContentCategory,
  search: string,
  page: number,
  onlyHidden: boolean,
  signal: AbortSignal,
) {
  const { data, error } = await (
    await client()
  )
    .rpc('list_campaign_content_entries', {
      target_campaign: uuid(campaignId),
      target_pack: uuid(packId),
      target_category: category,
      search: search.trim() || null,
      page,
      only_hidden: onlyHidden,
    })
    .abortSignal(signal)
  if (error) throw new Error(contentError(error.message))
  return contentEntriesSchema.parse(data)
}

export async function setContentHidden(
  campaignId: string,
  packId: string,
  kind: string,
  key: string,
  hidden: boolean,
) {
  const { error } = await (
    await client()
  ).rpc('set_campaign_content_hidden', {
    target_campaign: uuid(campaignId),
    target_pack: uuid(packId),
    target_kind: kind,
    target_key: key,
    hidden,
  })
  if (error) throw new Error(contentError(error.message))
}

/** RYT-184: use a whole pack, or stop using it: every category it has at once. */
export async function setCampaignContentPack(campaignId: string, packId: string, enabled: boolean) {
  const { data, error } = await (
    await client()
  ).rpc('set_campaign_content_pack', {
    target_campaign: uuid(campaignId),
    target_pack: uuid(packId),
    enabled,
  })
  if (error) throw new Error(contentError(error.message))
  return campaignContentSchema.parse(data)
}

/** RYT-184: what the pack's newer version changes, across the categories in use. */
export async function getPackChanges(campaignId: string, packId: string, signal: AbortSignal) {
  const { data, error } = await (
    await client()
  )
    .rpc('get_campaign_content_pack_changes', {
      target_campaign: uuid(campaignId),
      target_pack: uuid(packId),
    })
    .abortSignal(signal)
  if (error) throw new Error(contentError(error.message))
  return packChangesSchema.parse(data)
}

/** RYT-184: move every category in use to the pack's current version. */
export async function updateCampaignContentPack(
  campaignId: string,
  packId: string,
  version: number,
) {
  const { data, error } = await (
    await client()
  ).rpc('update_campaign_content_pack', {
    target_campaign: uuid(campaignId),
    target_pack: uuid(packId),
    expected_version: version,
  })
  if (error) throw new Error(contentError(error.message))
  return campaignContentSchema.parse(data)
}

/** RYT-167: the packs a new campaign can use (public ones and the caller's own private ones). */
export async function getContentChoices(signal: AbortSignal) {
  const { data, error } = await (await client()).rpc('get_content_choices').abortSignal(signal)
  if (error) throw new Error(contentError(error.message))
  return contentChoicesSchema.parse(data)
}
