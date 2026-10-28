import type { Database as GeneratedDatabase } from './database.generated'
import type { CharacterFunctions } from './character-functions'

type Functions = GeneratedDatabase['public']['Functions']
type Tables = GeneratedDatabase['public']['Tables']
type ResourceTable = Tables['character_resources']
type GoldFields<T> = Omit<T, 'copper'> & { gold: number }

// PostgreSQL permits explicit NULL arguments, but generated RPC types omit that fact.
// NULL is the intentional membership-deactivation operation in this API.
export type Database = Omit<GeneratedDatabase, 'public'> & {
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
