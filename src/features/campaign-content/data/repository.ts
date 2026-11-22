import { z } from 'zod'
import { config } from '@/shared/lib/config'
import {
  campaignContentSchema,
  contentChangesSchema,
  contentEntriesSchema,
  contentError,
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
