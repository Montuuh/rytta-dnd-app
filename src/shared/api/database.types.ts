import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database as GeneratedDatabase, Json } from './database.generated'
import type { CharacterFunctions } from './character-functions'
import type { ShopFunctions } from './shop-functions'
import type { ItemFunctions } from './item-functions'
import type { TradeFunctions } from './trade-functions'
import type { CombatFunctions } from './combat-functions'
import type { TabletopFunctions } from './tabletop-functions'
import type { ProfileFunctions } from './profile-functions'
import type { GlossaryEntriesTable, GlossaryFunctions } from './glossary-functions'

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
        Row: Omit<Tables['characters']['Row'], 'user_id'> & {
          user_id: string | null
          // RYT-044 roster: the Player's character in play, and archived characters.
          is_active: boolean
          archived_at: string | null
          // RYT-079: the DM marked the character as not coming to the session.
          absent: boolean
        }
      }
      character_resources: Omit<ResourceTable, 'Row' | 'Insert' | 'Update'> & {
        Row: GoldFields<ResourceTable['Row']>
        Insert: Omit<ResourceTable['Insert'], 'copper'> & { gold?: number }
        Update: Omit<ResourceTable['Update'], 'copper'> & { gold?: number }
      }
      campaign_invitations: Omit<Tables['campaign_invitations'], 'Row'> & {
        Row: Tables['campaign_invitations']['Row'] & { character_id: string | null }
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
          portrait_path: string | null
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
      item_definitions: {
        Row: {
          id: string
          campaign_id: string
          name: string
          category: string
          image_path: string | null
          icon: string
          rarity: string
          weight_tenths: number
          value_gp: number | null
          description: string
          slot_kind: string
          properties: Json
          origin: string
          archived: boolean
          created_by: string | null
          revision: number
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      inventory_items: {
        Row: {
          id: string
          campaign_id: string
          character_id: string
          definition_id: string
          quantity: number
          equipped_slot: string | null
          source: string
          notes: string
          revision: number
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      inventory_events: {
        Row: {
          id: string
          campaign_id: string
          character_id: string
          item_id: string
          actor_id: string | null
          kind: string
          quantity_delta: number
          before_value: Json | null
          after_value: Json
          request_id: string
          undo_of: string | null
          undone_by: string | null
          created_at: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      glossary_entries: GlossaryEntriesTable
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
      CharacterFunctions &
      ShopFunctions &
      ItemFunctions &
      TradeFunctions &
      CombatFunctions &
      TabletopFunctions &
      ProfileFunctions &
      GlossaryFunctions & {
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
