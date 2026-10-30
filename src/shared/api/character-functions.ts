// Reviewed SQL contract for the pending RYT-003 migration. Regenerate from local
// Supabase when the stack is available; do not label this as generated output.
export type CharacterFunctions = {
  assign_character: {
    Args: { target_campaign: string; target_character: string; target_user: string }
    Returns: undefined
  }
  create_character: { Args: { target_campaign: string; character_name: string }; Returns: string }
  unassign_character: {
    Args: { target_campaign: string; target_character: string; expected_user: string }
    Returns: undefined
  }
  invite_character_player: {
    Args: { target_campaign: string; target_character: string; invite_email: string }
    Returns: string
  }
  set_character_resources: {
    Args: {
      target_campaign: string
      target_character: string
      expected_revision: number
      new_gold: number
      new_water: number
      new_rations: number
      new_exhaustion: number
      request_id: string
    }
    Returns: number
  }
  set_campaign_modules: {
    Args: { target_campaign: string; modules: string[] }
    Returns: string[]
  }
  list_my_campaigns_with_modules: {
    Args: Record<PropertyKey, never>
    Returns: {
      id: string
      name: string
      description: string
      created_at: string
      role: string
      player_modules: string[]
    }[]
  }
  create_campaign_revelation: {
    Args: {
      target_campaign: string
      item_title: string
      item_category: string
      item_summary?: string
      item_visibility?: string
    }
    Returns: string
  }
  set_revelation_visibility: {
    Args: {
      target_campaign: string
      target_revelation: string
      new_visibility: string
    }
    Returns: undefined
  }
}
