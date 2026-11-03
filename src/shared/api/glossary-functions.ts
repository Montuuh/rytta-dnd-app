import type { Json } from './database.generated'
// Reviewed SQL contract for the RYT-008 homebrew glossary migration. Results are JSON validated
// by the glossary adapter; regenerate from local Supabase when the stack is available.
export type GlossaryFunctions = {
  save_glossary_entry: {
    Args: {
      target_campaign: string
      entry_id: string
      expected_revision: number | null
      payload: Json
    }
    Returns: Json
  }
  delete_glossary_entry: {
    Args: { target_campaign: string; entry_id: string; expected_revision: number }
    Returns: Json
  }
}

export type GlossaryEntriesTable = {
  Row: {
    id: string
    campaign_id: string
    category: string
    name: string
    aliases: string[]
    summary: string
    body: string
    facts: Json
    srd_ref: string | null
    revision: number
    created_by: string | null
    updated_by: string | null
    created_at: string
    updated_at: string
  }
  Insert: never
  Update: never
  Relationships: []
}
