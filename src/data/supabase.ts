import { createClient, type SupabaseClient } from '@supabase/supabase-js'

import type { Database } from './database.types'
import type { Env } from './env'

export type Client = SupabaseClient<Database>

let client: Client | undefined

// One client per page. Only src/data/ imports this; screens go through data hooks.
export const getClient = (env: Env): Client => {
  client ??= createClient<Database>(env.supabaseUrl, env.supabasePublishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  })
  return client
}
