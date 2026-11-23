import { cookies } from "next/headers"
import { createClient } from "@/utils/supabase/server"
import {
  EMPTY_ENTITLEMENTS,
  isMissingBillingMigrationError,
  parseEntitlementsPayload,
  type EffectiveEntitlements,
} from "./entitlements"

export interface ServerEntitlementState {
  userId: string | null
  entitlements: EffectiveEntitlements
  migrationPending: boolean
}

export async function getServerEntitlements(): Promise<ServerEntitlementState> {
  const client = createClient(await cookies())
  const { data: authData, error: authError } = await client.auth.getUser()
  if (authError || !authData.user) {
    return {
      userId: null,
      entitlements: { ...EMPTY_ENTITLEMENTS },
      migrationPending: false,
    }
  }

  const userId = authData.user.id
  const { data, error } = await client.rpc("get_effective_entitlements")
  if (error) {
    if (isMissingBillingMigrationError(error)) {
      const adminRes = await client.rpc("is_instruction_admin")
      const isAdmin = !adminRes.error && adminRes.data === true
      return {
        userId,
        entitlements: {
          ...EMPTY_ENTITLEMENTS,
          userId,
          isAdmin,
          source: isAdmin ? "admin" : "none",
          status: isAdmin ? "active" : "none",
          canAccessLearning: isAdmin,
          canManageSchool: isAdmin,
        },
        migrationPending: true,
      }
    }
    throw new Error("Не удалось проверить статус подписки.")
  }

  return {
    userId,
    entitlements: parseEntitlementsPayload(data),
    migrationPending: false,
  }
}
