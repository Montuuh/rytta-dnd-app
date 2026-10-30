import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database as GeneratedDatabase, Json } from './database.generated'
import type { CharacterFunctions } from './character-functions'

type Functions = GeneratedDatabase['public']['Functions']
type Tables = GeneratedDatabase['public']['Tables']
type ResourceTable = Tables['character_resources']
type GoldFields<T> = Omit<T, 'copper'> & { gold: number }

// PostgreSQL permits explicit NULL arguments, but generated RPC types omit that fact.
// NULL is the intentional membership-deactivation operation in this API.
type PublicDatabase = Omit<GeneratedDatabase, 'public'> & {
  public: Omit<GeneratedDatabase['public'], 'Functions' | 'Tables'> & {
    // Pending migration overlay; database.generated.ts remains the last actual CLI output.
    Tables: Omit<Tables, 'characters' | 'character_resources' | 'campaign_invitations'> & {
      characters: Omit<Tables['characters'], 'Row'> & {
        Row: Omit<Tables['characters']['Row'], 'user_id'> & { user_id: string | null }
      }
      character_resources: Omit<ResourceTable, 'Row' | 'Insert' | 'Update'> & {
        Row: GoldFields<ResourceTable['Row']>
        Insert: Omit<ResourceTable['Insert'], 'copper'> & { gold?: number }
        Update: Omit<ResourceTable['Update'], 'copper'> & { gold?: number }
      }
      campaign_invitations: Omit<Tables['campaign_invitations'], 'Row'> & {
        Row: Tables['campaign_invitations']['Row'] & { character_id: string | null }
      }
      campaign_revelations: {
        Row: {
          id: string
          campaign_id: string
          title: string
          category: string
          summary: string
          visibility: string
          created_by: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          campaign_id: string
          title: string
          category: string
          summary?: string
          visibility?: string
          created_by?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          visibility?: string
          updated_at?: string
        }
        Relationships: []
      }
      character_sheets: {
        Row: {
          character_id: string
          campaign_id: string
          status: string
          level: number
          max_hp: number
          armor_class: number
          build: Json
          revision: number
          updated_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      character_vitals: {
        Row: {
          character_id: string
          campaign_id: string
          current_hp: number
          temp_hp: number
          hit_dice_spent: number
          death_successes: number
          death_failures: number
          heroic_inspiration: boolean
          conditions: string[]
          slots_used: number[]
          tracker_uses: Json
          revision: number
        }
        Insert: never
        Update: never
        Relationships: []
      }
      character_events: {
        Row: {
          id: string
          campaign_id: string
          character_id: string
          actor_id: string | null
          kind: string
          before_value: Record<string, unknown> | null
          after_value: Record<string, unknown>
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
    }
    Functions: Omit<Functions, 'change_campaign_member' | 'list_my_invitations'> &
      CharacterFunctions & {
        list_my_invitations: Omit<Functions['list_my_invitations'], 'Returns'> & {
          Returns: (Functions['list_my_invitations']['Returns'][number] & {
            character_id: string
            character_name: string
          })[]
        }
        change_campaign_member: Omit<Functions['change_campaign_member'], 'Args'> & {
          Args: Omit<Functions['change_campaign_member']['Args'], 'new_role'> & {
            new_role: string | null
          }
        }
      }
  }
}

// PRE is a verified schema clone of the same application contract.
export type Database = PublicDatabase & { pre: PublicDatabase['public'] }
export type AppSupabaseClient = SupabaseClient<Database, 'public' | 'pre'>
