import { z } from 'zod'
import { config } from '@/shared/lib/config'
import {
  accountSchema,
  adminAccessSchema,
  adminCampaignSchema,
  adminErrorCode,
  adminStatusSchema,
  adminSummarySchema,
  auditEntrySchema,
  usageRowSchema,
} from '../domain/admin'

/** RYT-153 admin RPCs. The server checks the role on every call; results are validated here. */
async function client() {
  if (config.VITE_DATA_MODE !== 'supabase') throw new Error('unavailable')
  const { getSupabase } = await import('@/shared/api/supabase')
  return getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
}
const uuid = (value: string) => z.uuid().parse(value)
function fail(error: { message: string }): never {
  throw new Error(adminErrorCode(error.message))
}

export async function loadStatus(signal: AbortSignal) {
  const db = await client()
  const result = await db.rpc('admin_status').abortSignal(signal)
  if (result.error) fail(result.error)
  return adminStatusSchema.parse(result.data)
}

export async function loadCampaigns(search: string, signal: AbortSignal) {
  const db = await client()
  const result = await db
    .rpc('admin_list_campaigns', { search: search.trim() || null })
    .abortSignal(signal)
  if (result.error) fail(result.error)
  return z.array(adminCampaignSchema).parse(result.data)
}

export async function loadSummary(campaignId: string, signal: AbortSignal) {
  const db = await client()
  const result = await db
    .rpc('admin_campaign_summary', { target_campaign: uuid(campaignId) })
    .abortSignal(signal)
  if (result.error) fail(result.error)
  return adminSummarySchema.parse(result.data)
}

export async function loadFavourites(signal: AbortSignal) {
  const db = await client()
  const result = await db.rpc('admin_favourite_campaigns').abortSignal(signal)
  if (result.error) fail(result.error)
  return z.array(adminCampaignSchema).parse(result.data)
}

export async function enterCampaign(campaignId: string) {
  const db = await client()
  const result = await db.rpc('admin_enter_campaign', { target_campaign: uuid(campaignId) })
  if (result.error) fail(result.error)
  return adminAccessSchema.parse(result.data)
}

export async function exitCampaign(campaignId: string) {
  const db = await client()
  const result = await db.rpc('admin_exit_campaign', { target_campaign: uuid(campaignId) })
  if (result.error) fail(result.error)
}

export async function setFavourite(campaignId: string, favourite: boolean) {
  const db = await client()
  const result = await db.rpc('admin_set_favourite', {
    target_campaign: uuid(campaignId),
    favourite,
  })
  if (result.error) fail(result.error)
}

export async function loadAudit(signal: AbortSignal) {
  const db = await client()
  const result = await db.rpc('admin_audit_log', { page_size: 100 }).abortSignal(signal)
  if (result.error) fail(result.error)
  return z.array(auditEntrySchema).parse(result.data)
}

export async function loadUsage(signal: AbortSignal) {
  const db = await client()
  const result = await db.rpc('admin_usage').abortSignal(signal)
  if (result.error) fail(result.error)
  return z.array(usageRowSchema).parse(result.data)
}

export async function findAccount(query: string) {
  const db = await client()
  const result = await db.rpc('admin_find_account', { query: query.trim() })
  if (result.error) fail(result.error)
  return result.data === null ? null : accountSchema.parse(result.data)
}
