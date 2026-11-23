import { NextResponse } from "next/server"
import { parseCloudPaymentsWebhook, verifyCloudPaymentsHmac } from "@/lib/billing/cloudpayments"
import { BillingAdminConfigError, createAdminClient } from "@/utils/supabase/admin"

export const runtime = "nodejs"

export async function POST(request: Request) {
  const apiSecret = process.env.CLOUDPAYMENTS_API_SECRET?.trim()
  if (!apiSecret) {
    return NextResponse.json(
      { code: 13, message: "billing_unconfigured" },
      { status: 503 }
    )
  }

  let admin
  try {
    admin = createAdminClient()
  } catch (err) {
    if (err instanceof BillingAdminConfigError) {
      return NextResponse.json({ code: 13, message: "billing_unconfigured" }, { status: 503 })
    }
    return NextResponse.json({ code: 13, message: "internal_error" }, { status: 500 })
  }

  const rawBody = await request.text()
  const hmacHeader =
    request.headers.get("content-hmac") ?? request.headers.get("x-content-hmac")

  if (!verifyCloudPaymentsHmac(rawBody, hmacHeader, apiSecret)) {
    return NextResponse.json({ code: 13, message: "invalid_signature" }, { status: 403 })
  }

  let parsed
  try {
    const url = new URL(request.url)
    parsed = parseCloudPaymentsWebhook(rawBody, {
      explicitKind: url.searchParams.get("type"),
    })
  } catch {
    return NextResponse.json({ code: 13, message: "invalid_payload" }, { status: 400 })
  }

  const { error } = await admin.rpc("tlc_billing_apply_event", {
    p_provider: "cloudpayments_kz",
    p_event_id: parsed.eventId,
    p_event_type: parsed.eventType,
    p_payload: parsed.rawPayload,
    p_user_id: parsed.userId,
    p_plan: parsed.plan,
    p_status: parsed.status,
    p_external_id: parsed.externalId,
    p_amount_kzt: parsed.amountKzt,
    p_period_end: parsed.periodEnd,
    p_org_name: parsed.orgName,
  })

  if (error) {
    return NextResponse.json({ code: 13, message: "apply_failed" }, { status: 503 })
  }

  return NextResponse.json({ code: 0 })
}
