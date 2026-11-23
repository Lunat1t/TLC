import { NextResponse } from "next/server"
import { cookies } from "next/headers"
import { createClient } from "@/utils/supabase/server"
import { isBillingAdminConfigured } from "@/utils/supabase/admin"
import {
  canUseTestBillingMode,
  EMPTY_ENTITLEMENTS,
  isMissingBillingMigrationError,
  parseEntitlementsPayload,
} from "@/lib/billing/entitlements"
import { noStoreHeaders } from "@/lib/instructions/access"

export async function GET() {
  const cloudPaymentsReady = Boolean(
    process.env.CLOUDPAYMENTS_PUBLIC_ID?.trim() &&
      process.env.CLOUDPAYMENTS_API_SECRET?.trim() &&
      isBillingAdminConfigured()
  )
  const testModeReady = canUseTestBillingMode() && isBillingAdminConfigured()
  const checkout = {
    cloudPaymentsReady,
    testModeReady,
    provider: cloudPaymentsReady ? "cloudpayments_kz" : testModeReady ? "test" : "unconfigured",
  }

  try {
    const client = createClient(await cookies())
    const { data: authData, error: authError } = await client.auth.getUser()
    if (authError || !authData.user) {
      return NextResponse.json(
        { authenticated: false, entitlements: EMPTY_ENTITLEMENTS, checkout, migrationPending: false },
        { headers: noStoreHeaders() }
      )
    }

    const { data, error } = await client.rpc("get_effective_entitlements")
    if (error) {
      if (isMissingBillingMigrationError(error)) {
        return NextResponse.json(
          {
            authenticated: true,
            entitlements: { ...EMPTY_ENTITLEMENTS, userId: authData.user.id },
            checkout,
            migrationPending: true,
          },
          { headers: noStoreHeaders() }
        )
      }
      return NextResponse.json(
        { error: { code: "billing_unavailable", message: "Не удалось получить статус подписки." } },
        { status: 503, headers: noStoreHeaders() }
      )
    }

    return NextResponse.json(
      {
        authenticated: true,
        entitlements: parseEntitlementsPayload(data),
        checkout,
        migrationPending: false,
      },
      { headers: noStoreHeaders() }
    )
  } catch {
    return NextResponse.json(
      { error: { code: "billing_unavailable", message: "Не удалось проверить статус подписки." } },
      { status: 503, headers: noStoreHeaders() }
    )
  }
}
