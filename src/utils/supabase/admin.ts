import { createClient } from "@supabase/supabase-js"
import { getSupabaseConfig } from "@/utils/supabase/config"

export class BillingAdminConfigError extends Error {
  readonly code = "billing_unconfigured"
  readonly status = 503
}

export function isBillingAdminConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY)
}

export function createAdminClient() {
  const { url } = getSupabaseConfig()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()

  if (!serviceRoleKey) {
    throw new BillingAdminConfigError(
      "Платёжный сервис временно не настроен (отсутствует SUPABASE_SERVICE_ROLE_KEY)."
    )
  }

  return createClient(url, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
