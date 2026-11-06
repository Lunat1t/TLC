import { createClient } from "@supabase/supabase-js"
import { getSupabaseConfig } from "./config"

// Only for published catalog data. Never attach a user's cookies to shared caches.
export function createPublicClient() {
  const { url, publishableKey } = getSupabaseConfig()
  return createClient(url, publishableKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
}
