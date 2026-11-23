import type { Json } from './database.generated'

// Reviewed SQL contract for the RYT-162 campaign content migration (20261218120000_campaign_content);
// regenerate from local Supabase when the stack is available.
export type CampaignContentFunctions = {
  get_campaign_content: { Args: { target_campaign: string }; Returns: Json }
  set_campaign_content: {
    Args: {
      target_campaign: string
      target_pack: string
      target_category: string
      enabled: boolean
    }
    Returns: Json
  }
  get_campaign_content_changes: {
    Args: { target_campaign: string; target_pack: string; target_category: string }
    Returns: Json
  }
  update_campaign_content: {
    Args: {
      target_campaign: string
      target_pack: string
      target_category: string
      expected_version: number
    }
    Returns: Json
  }
  list_campaign_content_entries: {
    Args: {
      target_campaign: string
      target_pack: string
      target_category: string
      search?: string | null
      page?: number
    }
    Returns: Json
  }
  set_campaign_content_hidden: {
    Args: {
      target_campaign: string
      target_pack: string
      target_kind: string
      target_key: string
      hidden: boolean
    }
    Returns: Json
  }
  // RYT-094 (20261219120000_pack_creatures)
  get_campaign_creature_packs: { Args: { target_campaign: string }; Returns: Json }
  get_campaign_creature_pack: {
    Args: { target_campaign: string; target_pack: string; at_version: number; part: string }
    Returns: Json
  }
  // RYT-164, RYT-165 (20261220120000_pack_rules)
  get_campaign_rule_packs: { Args: { target_campaign: string }; Returns: Json }
  get_campaign_rule_pack: {
    Args: {
      target_campaign: string
      target_pack: string
      target_category: string
      at_version: number
      part: string
    }
    Returns: Json
  }
  get_srd_rule_pack: { Args: { target_category: string; part: string }; Returns: Json }
  // 20261222120000_campaign_content_choice (RYT-167).
  get_content_choices: { Args: Record<string, never>; Returns: Json }
  create_campaign_with_content: {
    Args: { campaign_name: string; campaign_description: string; chosen: Json }
    Returns: string
  }
  get_srd_creature_pack: { Args: { part: string }; Returns: Json }
  // 20261221120000_pack_items_private_packs (RYT-166, RYT-163).
  get_campaign_item_packs: { Args: { target_campaign: string }; Returns: Json }
  get_campaign_item_pack: {
    Args: { target_campaign: string; target_pack: string; at_version: number }
    Returns: Json
  }
  get_content_pack_offers: { Args: { target_pack: string }; Returns: Json }
  set_content_pack_offer: {
    Args: { target_pack: string; target_campaign: string; offered: boolean }
    Returns: Json
  }
}
