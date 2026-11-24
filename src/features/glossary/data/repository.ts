import { z } from 'zod'
import { config } from '@/shared/lib/config'
import {
  glossaryError,
  homebrewDraftSchema,
  homebrewEntrySchema,
  type HomebrewDraft,
  type HomebrewEntry,
} from '../domain/homebrew'
import { rulePacksSchema, type RuleCategory, type RulePack } from '../domain/packs'
import type { GlossaryLanguage } from '../domain/types'

async function client() {
  if (config.VITE_DATA_MODE !== 'supabase') throw glossaryError('Forbidden')
  const { getSupabase } = await import('@/shared/api/supabase')
  return getSupabase(config.VITE_SUPABASE_URL!, config.VITE_SUPABASE_PUBLISHABLE_KEY!)
}
const id = z.uuid()
const columns =
  'id,campaign_id,category,name,aliases,summary,body,facts,srd_ref,revision,created_by,updated_by,updated_at'

/** Campaign homebrew entries readable by the caller (RLS: DM, or Player with the module on). */
export async function listHomebrew(campaignId: string, signal: AbortSignal) {
  const { data, error } = await (
    await client()
  )
    .from('glossary_entries')
    .select(columns)
    .eq('campaign_id', id.parse(campaignId))
    .order('name')
    .abortSignal(signal)
  if (error) throw glossaryError(error.message)
  return homebrewEntrySchema.array().parse(data)
}

export async function saveHomebrew(
  campaignId: string,
  entryId: string,
  expectedRevision: number | null,
  draft: HomebrewDraft,
): Promise<HomebrewEntry> {
  const { data, error } = await (
    await client()
  ).rpc('save_glossary_entry', {
    target_campaign: id.parse(campaignId),
    entry_id: id.parse(entryId),
    expected_revision: expectedRevision,
    payload: homebrewDraftSchema.parse(draft),
  })
  if (error) throw glossaryError(error.message)
  return homebrewEntrySchema.parse(data)
}

export async function deleteHomebrew(campaignId: string, entryId: string, revision: number) {
  const { error } = await (
    await client()
  ).rpc('delete_glossary_entry', {
    target_campaign: id.parse(campaignId),
    entry_id: id.parse(entryId),
    expected_revision: revision,
  })
  if (error) throw glossaryError(error.message)
}

/** RYT-164, RYT-165: the spells, classes and rules packs a campaign has (every active member). */
export async function loadRulePacks(campaignId: string, signal: AbortSignal) {
  const { data, error } = await (
    await client()
  )
    .rpc('get_campaign_rule_packs', { target_campaign: id.parse(campaignId) })
    .abortSignal(signal)
  if (error) throw glossaryError(error.message)
  return rulePacksSchema.parse(data)
}

/** One pack category at the campaign's pinned version: index rows, or bodies in a language. */
export async function loadRulePack(
  campaignId: string,
  pack: RulePack,
  part: 'index' | GlossaryLanguage,
  signal: AbortSignal,
) {
  const { data, error } = await (
    await client()
  )
    .rpc('get_campaign_rule_pack', {
      target_campaign: id.parse(campaignId),
      target_pack: id.parse(pack.id),
      target_category: pack.category,
      at_version: pack.version,
      part,
    })
    .abortSignal(signal)
  if (error) throw glossaryError(error.message)
  return data
}

/** The published SRD's spells, class features or rules, for the glossary outside a campaign. */
export async function loadSrdRules(
  category: RuleCategory,
  part: 'index' | GlossaryLanguage,
  signal: AbortSignal,
) {
  const { data, error } = await (
    await client()
  )
    .rpc('get_srd_rule_pack', { target_category: category, part })
    .abortSignal(signal)
  if (error) throw glossaryError(error.message)
  return data
}
