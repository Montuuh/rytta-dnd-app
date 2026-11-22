import type { Json } from './database.generated'

// Reviewed SQL contract for the RYT-006 quest journal migration (20261217120000_quest_journal);
// regenerate from local Supabase when the stack is available.
export type QuestFunctions = {
  list_quests: { Args: { target_campaign: string }; Returns: Json }
  save_quest: {
    Args: {
      target_campaign: string
      target_quest: string
      expected_revision: number | null
      payload: Json
    }
    Returns: Json
  }
  delete_quest: {
    Args: { target_campaign: string; target_quest: string; expected_revision: number }
    Returns: Json
  }
  mark_quest_seen: { Args: { target_campaign: string; target_quest: string }; Returns: string }
}
