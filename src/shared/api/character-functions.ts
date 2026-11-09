import type { Json } from './database.generated'
// Reviewed SQL contract for the pending RYT-003 migration. Regenerate from local
// Supabase when the stack is available; do not label this as generated output.
export type CharacterFunctions = {
  assign_character: {
    Args: { target_campaign: string; target_character: string; target_user: string }
    Returns: undefined
  }
  create_character: { Args: { target_campaign: string; character_name: string }; Returns: string }
  // RYT-044 Player roster: own characters (limit 4) and the active one.
  create_own_character: {
    Args: { target_campaign: string; character_name: string; request_id: string }
    Returns: string
  }
  set_active_character: {
    Args: { target_campaign: string; target_character: string }
    Returns: string
  }
  archive_character: {
    Args: { target_campaign: string; target_character: string }
    Returns: Json
  }
  restore_character: {
    Args: { target_campaign: string; target_character: string }
    Returns: Json
  }
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
  // RYT-070: the play lock during encounters and the read-only sheet history.
  list_character_portraits: { Args: { target_campaign: string }; Returns: Json }
  rename_character: {
    Args: { target_campaign: string; target_character: string; new_name: string }
    Returns: string
  }
  get_character_play_lock: {
    Args: { target_campaign: string; target_character: string }
    Returns: Json
  }
  get_character_history: {
    Args: {
      target_campaign: string
      target_character: string
      before_at: string | null
      page_size: number
    }
    Returns: Json
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
  save_item_definition: {
    Args: {
      target_campaign: string
      target_definition: string | null
      expected_revision: number | null
      item: Json
      request_id: string
    }
    Returns: Json
  }
  grant_item: {
    Args: {
      target_campaign: string
      target_character: string
      target_definition: string
      amount: number
      request_id: string
    }
    Returns: Json
  }
  use_item: {
    Args: {
      target_campaign: string
      target_item: string
      expected_revision: number
      amount: number
      request_id: string
    }
    Returns: Json
  }
  remove_item: {
    Args: {
      target_campaign: string
      target_item: string
      expected_revision: number
      amount: number
      request_id: string
    }
    Returns: Json
  }
  equip_item: {
    Args: {
      target_campaign: string
      target_item: string
      expected_revision: number
      target_slot: string
      request_id: string
    }
    Returns: Json
  }
  unequip_item: {
    Args: {
      target_campaign: string
      target_item: string
      expected_revision: number
      request_id: string
    }
    Returns: Json
  }
  undo_inventory_event: {
    Args: { target_campaign: string; target_event: string; request_id: string }
    Returns: Json
  }
  set_item_image: {
    Args: {
      target_campaign: string
      target_definition: string
      expected_revision: number
      new_path: string | null
      request_id: string
    }
    Returns: Json
  }
  set_character_portrait: {
    Args: { target_campaign: string; target_character: string; new_path: string | null }
    Returns: undefined
  }
  // RYT-031 party live sharing.
  set_character_live_sharing: {
    Args: { target_campaign: string; target_character: string; enabled: boolean }
    Returns: boolean
  }
  get_party_overview: {
    Args: { target_campaign: string }
    Returns: {
      id: string
      name: string
      is_own: boolean
      is_assigned: boolean
      shares_live: boolean
      sheet_status: string | null
      class_key: string | null
      class_label: string | null
      level: number | null
      current_hp: number | null
      max_hp: number | null
      temp_hp: number | null
      armor_class: number | null
      exhaustion: number | null
      conditions: string[] | null
    }[]
  }
}
