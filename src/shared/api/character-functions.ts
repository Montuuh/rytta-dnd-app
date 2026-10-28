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
}
