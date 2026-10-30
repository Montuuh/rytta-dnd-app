import type { Json } from './database.generated'
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
  save_character_sheet: {
    Args: {
      target_campaign: string
      target_character: string
      expected_revision: number
      new_level: number
      new_max_hp: number
      new_armor_class: number
      new_build: Json
      mark_complete: boolean
      request_id: string
    }
    Returns: number
  }
  set_character_vitals: {
    Args: {
      target_campaign: string
      target_character: string
      expected_revision: number
      new_current_hp: number
      new_temp_hp: number
      new_hit_dice_spent: number
      new_death_successes: number
      new_death_failures: number
      new_heroic_inspiration: boolean
      new_conditions: string[]
      new_slots_used: number[]
      new_tracker_uses: Json
      request_id: string
    }
    Returns: number
  }
}
