import { createClient } from '@supabase/supabase-js'
import { databaseSchema } from '@/shared/lib/database-environment'
import type { AppSupabaseClient, Database } from './database.types'

let client: AppSupabaseClient | undefined
export function getSupabase(url: string, publishableKey: string) {
  client ??= createClient<Database, 'public' | 'pre'>(url, publishableKey, {
    db: {
      schema: databaseSchema({
        development: import.meta.env.DEV,
        hostname: window.location.hostname,
      }),
    },
    auth: {
      flowType: 'pkce',
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  })
  return client
}
