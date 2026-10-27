// Bootstrap contract matching 202610270001_foundation.sql.
// Replace with `npm run db:types` against local Supabase before schema expansion.
type Table<Row, Required extends keyof Row> = {
  Row: Row
  Insert: Pick<Row, Required> & Partial<Omit<Row, Required>>
  Update: Partial<Row>
  Relationships: []
}
export type Database = {
  public: {
    Tables: {
      campaigns: Table<
        {
          id: string
          owner_id: string
          name: string
          description: string
          created_at: string
        },
        'owner_id' | 'name'
      >
      campaign_members: Table<
        {
          campaign_id: string
          user_id: string
          role: 'dm' | 'player'
          joined_at: string
        },
        'campaign_id' | 'user_id' | 'role'
      >
      characters: Table<
        {
          id: string
          campaign_id: string
          user_id: string
          name: string
          created_at: string
        },
        'campaign_id' | 'user_id' | 'name'
      >
      character_resources: Table<
        {
          character_id: string
          campaign_id: string
          copper: number
          water_units: number
          rations: number
          exhaustion: number
          revision: number
        },
        'character_id' | 'campaign_id'
      >
    }
    Views: Record<string, never>
    Functions: {
      create_campaign: {
        Args: { campaign_name: string; campaign_description?: string }
        Returns: string
      }
    }
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
