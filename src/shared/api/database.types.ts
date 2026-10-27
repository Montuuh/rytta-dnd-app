import type { Database as GeneratedDatabase } from './database.generated'

type Functions = GeneratedDatabase['public']['Functions']

// PostgreSQL permits explicit NULL arguments, but generated RPC types omit that fact.
// NULL is the intentional membership-deactivation operation in this API.
export type Database = Omit<GeneratedDatabase, 'public'> & {
  public: Omit<GeneratedDatabase['public'], 'Functions'> & {
    Functions: Omit<Functions, 'change_campaign_member'> & {
      change_campaign_member: Omit<Functions['change_campaign_member'], 'Args'> & {
        Args: Omit<Functions['change_campaign_member']['Args'], 'new_role'> & {
          new_role: string | null
        }
      }
    }
  }
}
