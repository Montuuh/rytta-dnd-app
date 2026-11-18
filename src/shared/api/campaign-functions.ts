import type { Json } from './database.generated'
// Reviewed SQL contract for migration 20261130120000 (RYT-130 party level and level-up, RYT-133
// dice settings and roll log). Regenerate from local Supabase when the stack is available.
export type CampaignSettingsFunctions = {
  set_party_level: {
    Args: { target_campaign: string; new_level: number | null; request_id: string }
    Returns: number | null
  }
  set_dice_settings: {
    Args: {
      target_campaign: string
      new_dice_mode: string
      new_roll_visibility: string
      request_id: string
    }
    Returns: Json
  }
  apply_level_up: {
    Args: {
      target_campaign: string
      target_character: string
      expected_revision: number
      new_level: number
      new_max_hp: number
      new_build: Json
      request_id: string
    }
    Returns: number
  }
  log_roll: {
    Args: {
      target_campaign: string
      target_character: string | null
      roll_label: string
      roll_expression: string
      roll_kind: string
      roll_source: string
      recorded_dice: number[] | null
      recorded_total: number | null
      request_id: string
    }
    Returns: Json
  }
  /** RYT-137 (20261204120000): the one-roll state of the live fight and the open rest. */
  get_roll_context: { Args: { target_campaign: string }; Returns: Json }
  reset_hit_dice_roll: {
    Args: { target_campaign: string; target_character: string; request_id: string }
    Returns: Json
  }
}

export type CampaignRollsTable = {
  Row: {
    id: string
    campaign_id: string
    character_id: string | null
    roller_id: string
    label: string
    expression: string
    dice: number[]
    total: number
    kind: string
    source: string
    visibility: string
    created_at: string
    encounter_id: string | null
    rest_id: string | null
    superseded_at: string | null
  }
  Insert: never
  Update: never
  Relationships: []
}

export type CampaignRollSignalsTable = {
  Row: { campaign_id: string; revision: number; updated_at: string }
  Insert: never
  Update: never
  Relationships: []
}
